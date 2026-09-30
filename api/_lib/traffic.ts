import { resolvePageAccess } from "./page-visibility.js";
import {
  assertServiceSupabase,
  getRequestBody,
  optionalAppUser,
  requireAppUser,
  requireEventAdmin,
  sendJson,
} from "./server.js";

/**
 * Who is on this event's pages, and who has been.
 *
 *   POST ?resource=traffic   public  - one visitor's heartbeat
 *   GET  ?resource=traffic   admin   - the Settings panel's read
 *
 * WHY THIS LIVES ON api/event-access.ts AND NOT api/events.ts, which is where
 * the last five resources went: the heartbeat is the hottest path in the app.
 * Every visitor sends one every minute, on every page, signed in or not.
 * api/events.ts statically imports closing, event-data, appearance, share,
 * layout and societies - a large cold start to pay for a single-row upsert.
 * api/event-access.ts imports page-visibility and server, and nothing else.
 * Please do not tidy this into events.ts later.
 *
 * The project is also at the Vercel function cap of 12, so a file of its own
 * under api/ was never an option. See CLAUDE.md.
 */

type ApiRequest = {
  method?: string;
  body?: unknown;
  query?: Record<string, unknown>;
  headers: Record<string, unknown> & { authorization?: string };
};

type ApiResponse = {
  setHeader?: (name: string, value: string) => void;
  status: (statusCode: number) => { json: (body: unknown) => void };
};

/** Seen this recently and we call them here. There is no socket in this app,
 *  so this is an approximation - and the panel says so in those words rather
 *  than claiming to know who is on the page this instant. */
const LIVE_WINDOW_SECONDS = 120;

/** A runaway tab cannot spin its row faster than this. */
const MIN_BEAT_SECONDS = 20;

const RETENTION_DAYS = 90;

/** Enough history to compare one festival with the last one. */
const HISTORY_LIMIT = 100;

function fail(message: string, statusCode: number) {
  const error = new Error(message);
  Object.assign(error, { statusCode });
  return error;
}

function isMissingTable(error: { code?: string; message?: string } | null) {
  return Boolean(
    error &&
      (["42P01", "PGRST205"].includes(error.code ?? "") || error.message?.includes("event_visits")),
  );
}

function header(req: ApiRequest, name: string) {
  const raw = req.headers?.[name];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return typeof value === "string" ? value : "";
}

/**
 * Coarse on purpose. A full user agent string is a fingerprint; "iPhone" and
 * "Safari" are what a committee actually wants to know and tell nobody apart.
 * Order matters - Edge and Chrome both claim to be Safari, Chrome claims to
 * be Safari too, so the most specific match has to come first.
 */
function readDevice(userAgent: string) {
  if (/iPad/i.test(userAgent)) return "iPad";
  if (/iPhone|iPod/i.test(userAgent)) return "iPhone";
  if (/Android/i.test(userAgent)) return "Android";
  if (/Macintosh|Mac OS X/i.test(userAgent)) return "Mac";
  if (/Windows/i.test(userAgent)) return "Windows";
  if (/Linux|X11/i.test(userAgent)) return "Linux";
  return null;
}

function readBrowser(userAgent: string) {
  if (/Edg\//i.test(userAgent)) return "Edge";
  if (/OPR\/|Opera/i.test(userAgent)) return "Opera";
  if (/Firefox\//i.test(userAgent)) return "Firefox";
  if (/Chrome\/|CriOS/i.test(userAgent)) return "Chrome";
  if (/Safari\//i.test(userAgent)) return "Safari";
  return null;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

/**
 * One visitor, still here.
 *
 * Open to everyone, because a signed-out visitor is exactly who this has to
 * count. It answers { ok: true } whatever happens: it must never leak a count
 * to somebody who is not an admin, and never put an error in front of a
 * resident who only asked to read a page.
 */
async function recordBeat(req: ApiRequest, res: ApiResponse) {
  const body = (await getRequestBody(req)) as Record<string, unknown>;

  const eventId = String(body.eventId ?? "");
  const visitId = String(body.visitId ?? "");
  const visitorKey = String(body.visitorKey ?? "").slice(0, 64);
  const pageKey = String(body.pageKey ?? "").slice(0, 64);

  // The visit id becomes a primary key, so a client that sends nonsense must
  // not reach the insert at all.
  if (!isUuid(eventId) || !isUuid(visitId) || !visitorKey || !pageKey) {
    sendJson(res, 200, { ok: true });
    return;
  }

  const appUser = await optionalAppUser(req);

  // Authorise the write against the same rule the route guard uses. Without
  // this, anyone could write rows into any event's table, and a visitor could
  // claim to be reading a page they cannot open.
  const access = await resolvePageAccess(eventId, appUser?.id ?? null, pageKey);
  if (!access.canView) {
    sendJson(res, 200, { ok: true });
    return;
  }

  const supabase = assertServiceSupabase();
  const userAgent = header(req, "user-agent");

  const { data: existing, error: readError } = await supabase
    .from("event_visits")
    .select("id,last_seen_at,page_views")
    .eq("id", visitId)
    .maybeSingle();

  // Nothing to do until 028 is run. Silent, deliberately: the person who
  // triggered this asked for nothing and should see nothing.
  if (readError) {
    if (!isMissingTable(readError)) console.warn("Could not read a visit:", readError);
    sendJson(res, 200, { ok: true });
    return;
  }

  if (!existing) {
    const { error } = await supabase.from("event_visits").insert({
      id: visitId,
      event_id: eventId,
      visitor_key: visitorKey,
      user_id: appUser?.id ?? null,
      page_key: pageKey,
      device: readDevice(userAgent),
      browser: readBrowser(userAgent),
      // Vercel's own geo headers, absent in local development. The address
      // they were derived from is never written down - see migration 028.
      country: header(req, "x-vercel-ip-country") || null,
      city: decodeURIComponent(header(req, "x-vercel-ip-city") || "") || null,
    });
    if (error && !isMissingTable(error)) console.warn("Could not record a visit:", error);
    sendJson(res, 200, { ok: true });
    return;
  }

  // A move to a different page is a real page view and always counts, however
  // soon it arrives - otherwise somebody skimming four screens in a minute
  // would register as having read one. The throttle below is only about a tab
  // beating on the *same* page, which is the runaway case it exists for.
  const movedPage = existing.page_key !== pageKey;
  const secondsSince = (Date.now() - new Date(existing.last_seen_at).getTime()) / 1000;
  if (!movedPage && secondsSince < MIN_BEAT_SECONDS) {
    sendJson(res, 200, { ok: true });
    return;
  }

  const { error } = await supabase
    .from("event_visits")
    .update({
      last_seen_at: new Date().toISOString(),
      page_key: pageKey,
      // Counts pages reached, not beats sent: a minute spent reading one page
      // is one view, which is what makes "6 pages" mean six screens.
      page_views: (existing.page_views ?? 1) + (movedPage ? 1 : 0),
      // Somebody who signs in part-way through a visit becomes themselves for
      // the rest of it. It never goes the other way: signing out does not
      // erase who was reading, it just ends the visit at the next beat.
      ...(appUser ? { user_id: appUser.id } : {}),
    })
    .eq("id", visitId);

  if (error && !isMissingTable(error)) console.warn("Could not update a visit:", error);
  sendJson(res, 200, { ok: true });
}

type VisitRow = {
  id: string;
  visitor_key: string;
  user_id: string | null;
  started_at: string;
  last_seen_at: string;
  page_key: string | null;
  page_views: number | null;
  device: string | null;
  browser: string | null;
  country: string | null;
  city: string | null;
};

/**
 * The Settings panel's read. Admin only - this is the one table that says who
 * was reading what, and `settings` is admin-only in any case.
 */
async function readTraffic(req: ApiRequest, res: ApiResponse) {
  const eventId = String(req.query?.eventId ?? "");
  if (!eventId) throw fail("eventId is required", 400);

  const { appUser } = await requireAppUser(req);
  await requireEventAdmin(eventId, appUser.id);

  const supabase = assertServiceSupabase();
  const since = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("event_visits")
    .select(
      "id,visitor_key,user_id,started_at,last_seen_at,page_key,page_views,device,browser,country,city",
    )
    .eq("event_id", eventId)
    .gte("last_seen_at", since)
    .order("last_seen_at", { ascending: false })
    .limit(HISTORY_LIMIT);

  if (error) {
    if (isMissingTable(error)) {
      sendJson(res, 200, {
        ready: false,
        migration: "supabase/migrations/028_event_traffic.sql",
        visits: [],
        byPage: [],
        liveWindowSeconds: LIVE_WINDOW_SECONDS,
      });
      return;
    }
    throw error;
  }

  const rows = (data ?? []) as VisitRow[];

  // Names only, the same rule the closing page's credits follow: no email, no
  // photograph, no role. This panel answers "is anybody reading this", not
  // "here is a directory of everyone who did".
  const userIds = [...new Set(rows.map((row) => row.user_id).filter(Boolean))] as string[];
  const names = new Map<string, string>();
  if (userIds.length) {
    const { data: users } = await supabase.from("app_users").select("id,full_name").in("id", userIds);
    for (const user of users ?? []) {
      if (user.full_name) names.set(user.id, user.full_name);
    }
  }

  // How many separate visits each visitor has made, so a returning guest
  // reads as one. Counted over the window we already hold rather than with a
  // second query - a hundred rows is not worth a round trip.
  const visitCounts = new Map<string, number>();
  for (const row of rows) {
    visitCounts.set(row.visitor_key, (visitCounts.get(row.visitor_key) ?? 0) + 1);
  }

  const visits = rows.map((row) => ({
    id: row.id,
    name: row.user_id ? names.get(row.user_id) ?? null : null,
    signedIn: Boolean(row.user_id),
    startedAt: row.started_at,
    lastSeenAt: row.last_seen_at,
    seconds: Math.max(
      0,
      Math.round((new Date(row.last_seen_at).getTime() - new Date(row.started_at).getTime()) / 1000),
    ),
    pageKey: row.page_key,
    pageViews: row.page_views ?? 1,
    device: row.device,
    browser: row.browser,
    country: row.country,
    city: row.city,
    visitNumber: visitCounts.get(row.visitor_key) ?? 1,
  }));

  const byPage = [...
    visits.reduce((totals, visit) => {
      if (!visit.pageKey) return totals;
      totals.set(visit.pageKey, (totals.get(visit.pageKey) ?? 0) + 1);
      return totals;
    }, new Map<string, number>()),
  ]
    .map(([pageKey, visitCount]) => ({ pageKey, visits: visitCount }))
    .sort((a, b) => b.visits - a.visits);

  sendJson(res, 200, { ready: true, visits, byPage, liveWindowSeconds: LIVE_WINDOW_SECONDS });

  // Retention, on an already-authorised request rather than in a cron this
  // project does not have. After the response, and failures are ignored:
  // tidying is never worth failing a read the admin did get.
  void supabase
    .from("event_visits")
    .delete()
    .lt("last_seen_at", since)
    .then(undefined, () => undefined);
}

export async function handleEventTraffic(req: ApiRequest, res: ApiResponse) {
  if (String(req.method) === "POST") {
    await recordBeat(req, res);
    return;
  }
  if (String(req.method) === "GET") {
    await readTraffic(req, res);
    return;
  }
  sendJson(res, 405, { error: "Method not allowed" });
}
