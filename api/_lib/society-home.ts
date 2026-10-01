import {
  defaultVisibilityFor,
  normalizeVisibility,
  type PageVisibility,
} from "./page-visibility.js";
import { assertServiceSupabase, optionalAppUser, sendJson } from "./server.js";

/**
 * Everything Society Home needs, in one request.
 *
 *   GET /api/events?resource=society-home&slug=<societySlug>
 *   GET /api/events?resource=society-home            (the viewer's own society)
 *
 * ## Why this exists at all
 *
 * A card shows a rating, a review count, a photo count, a contributor count.
 * Asking for those per card is an N+1 that grows with the society's history,
 * and asking for them on the client means shipping every contribution row to
 * draw one number. So every aggregate here is **one batched query across all
 * of the society's events at once** - `.in("event_id", ids)` selecting the
 * narrowest column that answers the question, tallied server-side.
 *
 * The cost is a fixed ~8 queries whatever the society's size, and the response
 * carries counts rather than datasets.
 *
 * ## Access is decided here, not in React
 *
 * - A signed-in member sees their society's events.
 * - A signed-out visitor sees only events whose `dashboard` is public, which
 *   is the same rule that decides whether they could open one at all.
 * - **Draft events are returned only to a manager** of that society.
 * - No money, no names, no contact details - only counts.
 */

type ApiRequest = {
  method?: string;
  query?: Record<string, unknown>;
  headers: Record<string, unknown> & { authorization?: string };
};

type ApiResponse = {
  setHeader?: (name: string, value: string) => void;
  status: (statusCode: number) => { json: (body: unknown) => void };
};

type Supabase = ReturnType<typeof assertServiceSupabase>;

function fail(message: string, statusCode: number) {
  const error = new Error(message);
  Object.assign(error, { statusCode });
  return error;
}

function queryValue(req: ApiRequest, key: string) {
  const raw = req.query?.[key];
  return String(Array.isArray(raw) ? raw[0] ?? "" : raw ?? "");
}

/** A table or column this migration has not reached yet. */
function isMissingSchema(error: { code?: string; message?: string } | null) {
  return Boolean(error && ["42P01", "PGRST205", "42703", "PGRST204"].includes(error.code ?? ""));
}

/**
 * One batched read, tolerant of its table not existing yet. Returns [] rather
 * than throwing, so a society whose events predate a migration still lists -
 * the card simply shows one fewer number.
 */
async function tally<T extends Record<string, unknown>>(
  supabase: Supabase,
  table: string,
  columns: string,
  eventIds: string[],
): Promise<T[]> {
  if (!eventIds.length) return [];
  const { data, error } = await supabase.from(table).select(columns).in("event_id", eventIds);
  if (error) {
    if (isMissingSchema(error)) return [];
    console.warn(`Society home: could not read ${table}:`, error);
    return [];
  }
  return (data ?? []) as unknown as T[];
}

function countBy<T extends { event_id?: unknown }>(rows: T[]) {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const key = String(row.event_id ?? "");
    if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

/** Distinct values per event - how many *people* contributed, not how many
 *  payments arrived. A family paying in three instalments is one contributor. */
function distinctCountBy<T extends Record<string, unknown>>(rows: T[], valueKey: string) {
  const seen = new Map<string, Set<string>>();
  for (const row of rows) {
    const eventId = String(row.event_id ?? "");
    const value = String(row[valueKey] ?? "").trim().toLowerCase();
    if (!eventId || !value) continue;
    if (!seen.has(eventId)) seen.set(eventId, new Set());
    seen.get(eventId)!.add(value);
  }
  return new Map([...seen].map(([eventId, values]) => [eventId, values.size]));
}

export async function handleSocietyHome(req: ApiRequest, res: ApiResponse) {
  if (String(req.method) !== "GET") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  const supabase = assertServiceSupabase();
  const viewer = await optionalAppUser(req);
  const slug = queryValue(req, "slug").trim().toLowerCase();

  // ---- the society -------------------------------------------------------
  //
  // Named by slug, or - with no slug - *this viewer's own*. Resolving "no
  // slug" to `limit(1)` would hand whoever asked the first society in the
  // table, which on a shared deployment is a stranger's. A request with no
  // slug and no session has no society to mean, so it is refused.
  const societyColumns = "id,name,slug,city,logo_url";
  let societyResult;

  if (slug) {
    societyResult = await supabase.from("organizations").select(societyColumns).eq("slug", slug).maybeSingle();
  } else {
    if (!viewer) throw fail("Sign in, or open a society by its address", 401);

    const mySocieties = await supabase
      .from("organization_members")
      .select("organization_id")
      .eq("user_id", viewer.id)
      .limit(1);

    if (mySocieties.error && !isMissingSchema(mySocieties.error)) throw mySocieties.error;
    const mine = mySocieties.data?.[0]?.organization_id;
    if (!mine) throw fail("You are not a member of any society yet", 404);

    societyResult = await supabase.from("organizations").select(societyColumns).eq("id", mine).maybeSingle();
  }

  // Before 023/029 the society columns do not exist. Say so rather than
  // failing: the page shows its own banner naming the migration.
  if (societyResult.error && isMissingSchema(societyResult.error)) {
    sendJson(res, 200, {
      ready: false,
      migration: "supabase/migrations/023_societies.sql and 029_society_home.sql",
      society: null,
      events: [],
    });
    return;
  }
  if (societyResult.error) throw societyResult.error;

  const society = societyResult.data as
    | { id: string; name: string; slug: string | null; city: string | null; logo_url: string | null }
    | null;

  if (!society) throw fail("That society does not exist", 404);

  // ---- may this viewer see it, and may they manage it? -------------------
  let canManage = false;
  if (viewer) {
    const { data: membership, error } = await supabase
      .from("organization_members")
      .select("role")
      .eq("organization_id", society.id)
      .eq("user_id", viewer.id)
      .maybeSingle();
    if (error && !isMissingSchema(error)) throw error;
    canManage = membership?.role === "admin" || membership?.role === "committee";
  }

  // ---- its events --------------------------------------------------------
  const eventColumns =
    "id,name,slug,start_date,end_date,location,event_type,status_override,hero_image_url,organization_id";
  let eventsResult = await supabase
    .from("events")
    .select(eventColumns)
    .eq("organization_id", society.id)
    .order("start_date", { ascending: false });

  // Pre-029 the new columns are absent; fall back to what has always existed
  // so the list still renders rather than the page breaking.
  if (eventsResult.error && isMissingSchema(eventsResult.error)) {
    eventsResult = await supabase
      .from("events")
      .select("id,name,start_date,end_date,location,organization_id")
      .eq("organization_id", society.id)
      .order("start_date", { ascending: false });
  }
  if (eventsResult.error) throw eventsResult.error;

  const rows = (eventsResult.data ?? []) as Record<string, unknown>[];
  const allIds = rows.map((row) => String(row.id));

  // ---- module visibility, one query for every event ----------------------
  const visibilityRows = await tally<{ event_id: string; page_key: string; visibility: string; is_enabled?: boolean }>(
    supabase,
    "event_page_visibility",
    "event_id,page_key,visibility,is_enabled",
    allIds,
  );

  const modulesByEvent = new Map<string, Map<string, { visibility: PageVisibility; enabled: boolean }>>();
  for (const row of visibilityRows) {
    const eventId = String(row.event_id);
    if (!modulesByEvent.has(eventId)) modulesByEvent.set(eventId, new Map());
    modulesByEvent.get(eventId)!.set(row.page_key, {
      visibility: normalizeVisibility(row.visibility, row.page_key),
      // `is_enabled` arrives with 024; absent, every module is on, which is
      // exactly what every event looked like before that migration.
      enabled: row.is_enabled !== false,
    });
  }

  /** The modules a given viewer may actually open, for one event. */
  function visibleModules(eventId: string) {
    const stored = modulesByEvent.get(eventId);
    const keys: string[] = [];
    const candidates = stored ? [...stored.keys()] : [];
    for (const pageKey of candidates) {
      const entry = stored!.get(pageKey)!;
      if (!entry.enabled) continue;
      if (entry.visibility === "public") keys.push(pageKey);
      else if (viewer) keys.push(pageKey);
    }
    return keys;
  }

  function dashboardIsPublic(eventId: string) {
    const stored = modulesByEvent.get(eventId);
    const entry = stored?.get("dashboard");
    if (!entry) return defaultVisibilityFor("dashboard") === "public";
    return entry.enabled && entry.visibility === "public";
  }

  // A signed-out visitor sees only what they could open; a member sees their
  // society's events. Drafts are the committee's working copy either way.
  const visibleRows = rows.filter((row) => {
    const eventId = String(row.id);
    const isDraft = String(row.status_override ?? "") === "draft";
    if (isDraft && !canManage) return false;
    if (!viewer) return dashboardIsPublic(eventId);
    return true;
  });

  const ids = visibleRows.map((row) => String(row.id));

  // ---- the aggregates: one batched query each ----------------------------
  const [closingRows, feedbackRows, photoRows, contributionRows, sponsorRows, teamRows] = await Promise.all([
    tally<{ event_id: string; is_closed: boolean | null }>(supabase, "event_closing", "event_id,is_closed", ids),
    tally<{ event_id: string; rating: number | null; comment: string | null }>(
      supabase,
      "event_feedback",
      "event_id,rating,comment",
      ids,
    ),
    tally<{ event_id: string }>(supabase, "event_gallery_photos", "event_id", ids),
    tally<{ event_id: string; contributor_name: string | null }>(
      supabase,
      "contributions",
      "event_id,contributor_name",
      ids,
    ),
    tally<{ event_id: string }>(supabase, "sponsors", "event_id", ids),
    tally<{ event_id: string }>(supabase, "event_teams", "event_id", ids),
  ]);

  const closedByEvent = new Map(closingRows.map((row) => [String(row.event_id), Boolean(row.is_closed)]));
  const photoCounts = countBy(photoRows);
  const sponsorCounts = countBy(sponsorRows);
  const teamCounts = countBy(teamRows);
  const contributorCounts = distinctCountBy(contributionRows, "contributor_name");

  const ratingByEvent = new Map<string, { count: number; total: number; written: number }>();
  for (const row of feedbackRows) {
    const eventId = String(row.event_id);
    const entry = ratingByEvent.get(eventId) ?? { count: 0, total: 0, written: 0 };
    entry.count += 1;
    entry.total += Number(row.rating ?? 0);
    if (String(row.comment ?? "").trim()) entry.written += 1;
    ratingByEvent.set(eventId, entry);
  }

  const events = visibleRows.map((row) => {
    const id = String(row.id);
    const rating = ratingByEvent.get(id);
    return {
      id,
      name: String(row.name ?? ""),
      slug: (row.slug as string | null) ?? null,
      startDate: String(row.start_date ?? ""),
      endDate: String(row.end_date ?? ""),
      location: (row.location as string | null) ?? null,
      eventType: (row.event_type as string | null) ?? "festival",
      // Fed straight into getEventStatus() on the client - the one helper.
      statusOverride: (row.status_override as "draft" | "cancelled" | null) ?? null,
      isClosed: closedByEvent.get(id) ?? false,
      heroImageUrl: (row.hero_image_url as string | null) ?? null,
      modules: visibleModules(id),
      metrics: {
        reviewCount: rating?.count ?? 0,
        writtenReviewCount: rating?.written ?? 0,
        averageRating: rating?.count ? Math.round((rating.total / rating.count) * 10) / 10 : null,
        photoCount: photoCounts.get(id) ?? 0,
        contributorCount: contributorCounts.get(id) ?? 0,
        sponsorCount: sponsorCounts.get(id) ?? 0,
        teamCount: teamCounts.get(id) ?? 0,
      },
    };
  });

  sendJson(res, 200, {
    ready: true,
    canManage,
    society: {
      id: society.id,
      name: society.name,
      slug: society.slug,
      city: society.city,
      logoUrl: society.logo_url,
    },
    events,
  });
}

/**
 * A readable address resolved to the id everything else works by.
 *
 *   GET /api/events?resource=resolve&society=<slug>&event=<slug>
 *
 * **Public, deliberately** - the same reasoning as `/s/<token>`: an address
 * that needs an account is not one you can hand out. Like that route it returns
 * an id and a name and nothing else, and what the visitor may then *see* is
 * decided page by page by the admin's visibility settings, exactly as before.
 *
 * Answers 404 for an unknown pair rather than anything more specific: whether a
 * given slug exists is not worth confirming to somebody guessing.
 */
export async function handleResolveEventSlug(req: ApiRequest, res: ApiResponse) {
  if (String(req.method) !== "GET") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  const societySlug = queryValue(req, "society").trim().toLowerCase();
  const eventSlug = queryValue(req, "event").trim().toLowerCase();
  if (!societySlug || !eventSlug) throw fail("A society and an event are required", 400);

  const supabase = assertServiceSupabase();

  const society = await supabase
    .from("organizations")
    .select("id,name,slug")
    .eq("slug", societySlug)
    .maybeSingle();

  // Before 029 these columns do not exist. Say so rather than 500ing, so the
  // client can fall back to the id form instead of showing an error.
  if (society.error && isMissingSchema(society.error)) {
    sendJson(res, 200, { ready: false, migration: "supabase/migrations/029_society_home.sql" });
    return;
  }
  if (society.error) throw society.error;
  if (!society.data) throw fail("That address does not match any event", 404);

  const event = await supabase
    .from("events")
    .select("id,name,slug")
    .eq("organization_id", society.data.id)
    .eq("slug", eventSlug)
    .maybeSingle();

  if (event.error && isMissingSchema(event.error)) {
    sendJson(res, 200, { ready: false, migration: "supabase/migrations/029_society_home.sql" });
    return;
  }
  if (event.error) throw event.error;
  if (!event.data) throw fail("That address does not match any event", 404);

  sendJson(res, 200, {
    ready: true,
    eventId: event.data.id,
    eventName: event.data.name,
    eventSlug: event.data.slug,
    societyName: society.data.name,
    societySlug: society.data.slug,
  });
}
