import {
  defaultVisibilityFor,
  normalizeVisibility,
  type PageVisibility,
} from "./page-visibility.js";
import { cleanHeroOptions } from "./hero-options.js";
import { selectDegrading } from "./schema-compat.js";
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

/** A table that a later migration creates, and this database has not got yet. */
function isMissingTable(error: { code?: string } | null) {
  return Boolean(error && ["42P01", "PGRST205"].includes(error.code ?? ""));
}

/**
 * One batched read, tolerant of its TABLE not existing yet. Returns [] rather
 * than throwing, so a society whose events predate a migration still lists -
 * the card simply shows one fewer number.
 *
 * It is deliberately NOT tolerant of a missing column in `core`. This used to
 * swallow every schema error as "migration not run", which is exactly how the
 * contributor count read a column that never existed (`contributor_name`) and
 * answered 0 for every event, for ever, without a line in any log. A column
 * that has always existed and cannot be read is a bug, so it is logged as
 * one. Columns a later migration adds go in `columns` but not `core`, and are
 * dropped on their own if absent - see api/_lib/schema-compat.ts.
 */
async function tally<T extends Record<string, unknown>>(
  supabase: Supabase,
  table: string,
  columns: string[],
  eventIds: string[],
  core: string[] = columns,
): Promise<T[]> {
  if (!eventIds.length) return [];
  const { data, error } = await selectDegrading(table, columns, core, (select) =>
    supabase.from(table).select(select).in("event_id", eventIds),
  );
  if (error) {
    if (!isMissingTable(error)) console.error(`Society home: could not read ${table}:`, error);
    return [];
  }
  return (data ?? []) as unknown as T[];
}

/** `18:00:00` from a Postgres `time` column -> `18:00`; null stays null. */
/** The focal point out of an event's hero options, or null for "centre". */
function heroFocus(value: unknown): { x: number; y: number } | null {
  const options = cleanHeroOptions(value);
  return options?.focusX !== undefined && options.focusY !== undefined
    ? { x: options.focusX, y: options.focusY }
    : null;
}

function clock(value: unknown): string | null {
  const match = String(value ?? "").trim().match(/^(\d{1,2}):(\d{2})/);
  return match ? `${match[1].padStart(2, "0")}:${match[2]}` : null;
}

function countBy<T extends { event_id?: unknown }>(rows: T[]) {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const key = String(row.event_id ?? "");
    if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

/**
 * How many *people* contributed to each event, not how many payments arrived.
 *
 * A contributor is a distinct resident who has actually paid something: a
 * family paying in three instalments is one, and a row for somebody who has
 * not paid yet (or whose payment was declined, leaving zero) is nobody. This
 * is the same definition the dashboard's counts-only mode uses, so the two
 * numbers a resident can see never disagree.
 */
function contributorCountsByEvent(rows: { event_id?: unknown; resident_id?: unknown; received_amount?: unknown }[]) {
  const seen = new Map<string, Set<string>>();
  for (const row of rows) {
    const eventId = String(row.event_id ?? "");
    const residentId = String(row.resident_id ?? "");
    if (!eventId || !residentId || !(Number(row.received_amount ?? 0) > 0)) continue;
    if (!seen.has(eventId)) seen.set(eventId, new Set());
    seen.get(eventId)!.add(residentId);
  }
  return new Map([...seen].map(([eventId, residents]) => [eventId, residents.size]));
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
  //
  // Each optional column stands on its own: a database that has 029 but not 027
  // still gets slugs and statuses, just no hero photo - the old all-or-nothing
  // fallback threw the whole lot away for one absent column.
  const eventsResult = await selectDegrading(
    "events",
    [
      "id",
      "name",
      "start_date",
      "end_date",
      "location",
      "organization_id",
      "slug",
      "event_type",
      "template_key",
      "status_override",
      "hero_image_url",
      "hero_options",
      "start_time",
      "end_time",
    ],
    ["id", "name", "start_date", "end_date", "location", "organization_id"],
    (select) =>
      supabase
        .from("events")
        .select(select)
        .eq("organization_id", society.id)
        .order("start_date", { ascending: false }),
  );
  if (eventsResult.error) throw eventsResult.error;

  const rows = (eventsResult.data ?? []) as Record<string, unknown>[];
  const allIds = rows.map((row) => String(row.id));

  // ---- module visibility, one query for every event ----------------------
  const visibilityRows = await tally<{ event_id: string; page_key: string; visibility: string; is_enabled?: boolean }>(
    supabase,
    "event_page_visibility",
    // `is_enabled` is 024's. Without it every module reads as on, which is what
    // every event looked like before that migration - but the visibility the
    // admin DID set is still read, where this used to return nothing at all.
    ["event_id", "page_key", "visibility", "is_enabled"],
    allIds,
    ["event_id", "page_key", "visibility"],
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
    tally<{ event_id: string; is_closed: boolean | null }>(supabase, "event_closing", ["event_id", "is_closed"], ids),
    tally<{ event_id: string; rating: number | null; comment: string | null }>(
      supabase,
      "event_feedback",
      ["event_id", "rating", "comment"],
      ids,
    ),
    // The cover for "Memories" rides on the same read that counts them.
    tally<{ event_id: string; image_url?: string | null; sort_order?: number | null }>(
      supabase,
      "event_gallery_photos",
      ["event_id", "image_url", "sort_order"],
      ids,
    ),
    tally<{ event_id: string; resident_id: string | null; received_amount: number | null }>(
      supabase,
      "contributions",
      ["event_id", "resident_id", "received_amount"],
      ids,
    ),
    tally<{ event_id: string }>(supabase, "sponsors", ["event_id"], ids),
    tally<{ event_id: string }>(supabase, "event_teams", ["event_id"], ids),
  ]);

  const closedByEvent = new Map(closingRows.map((row) => [String(row.event_id), Boolean(row.is_closed)]));
  const photoCounts = countBy(photoRows);
  const coverByEvent = new Map<string, { url: string; order: number }>();
  for (const row of photoRows) {
    const url = String(row.image_url ?? "");
    if (!/^https:\/\//.test(url)) continue;
    const eventId = String(row.event_id);
    const order = Number(row.sort_order ?? 0);
    const held = coverByEvent.get(eventId);
    if (!held || order < held.order) coverByEvent.set(eventId, { url, order });
  }

  // The viewer's own bookings, so the front door can say "you have a pass for
  // this" - their rows only, never anybody else's. Quietly absent before 032.
  const passes: { eventId: string; people: number; paymentStatus: string }[] = [];
  if (viewer && ids.length) {
    const mine = await supabase
      .from("event_registrations")
      .select("event_id,adults,children,payment_status")
      .eq("user_id", viewer.id)
      .eq("status", "active")
      .in("event_id", ids);
    if (!mine.error) {
      for (const row of (mine.data ?? []) as Record<string, unknown>[]) {
        passes.push({
          eventId: String(row.event_id),
          people: Number(row.adults ?? 0) + Number(row.children ?? 0),
          paymentStatus: String(row.payment_status ?? "unpaid"),
        });
      }
    }
  }
  const sponsorCounts = countBy(sponsorRows);
  const teamCounts = countBy(teamRows);
  const contributorCounts = contributorCountsByEvent(contributionRows);

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
      // Hours of the first and last day, so a card is grouped by the same
      // instant the dashboard uses. Null (or no column yet) means the whole day.
      startTime: clock(row.start_time),
      endTime: clock(row.end_time),
      location: (row.location as string | null) ?? null,
      eventType: (row.event_type as string | null) ?? "festival",
      templateKey: (row.template_key as string | null) ?? null,
      // Fed straight into getEventStatus() on the client - the one helper.
      statusOverride: (row.status_override as "draft" | "cancelled" | null) ?? null,
      isClosed: closedByEvent.get(id) ?? false,
      heroImageUrl: (row.hero_image_url as string | null) ?? null,
      // Where the photograph is anchored, so a card crops it around the part
      // the organiser chose. Only the focal point: the title and subtitle
      // are the dashboard hero's business, not a card's.
      heroFocus: heroFocus(row.hero_options),
      modules: visibleModules(id),
      // A cover for the Memories shelf - only where this viewer may open the
      // album, since the picture is the album's.
      coverPhotoUrl: visibleModules(id).includes("closing") ? coverByEvent.get(id)?.url ?? null : null,
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
    myPasses: passes,
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
