import {
  bearerToken,
  checkPlatformAccess,
  parsePlatformAdminIds,
  platformNotFoundBody,
} from "../../shared/platform-access.js";
import { assertServiceSupabase, sendJson, verifyFirebaseIdToken } from "./server.js";
import { readEvent, readEvents, readOverview, readSocieties, readSociety, readUser, readUsers } from "./platform-reads.js";

/**
 * The owner-only Platform Control Center - `/api/events?resource=platform&part=<part>`.
 *
 * Rules, all of them load-bearing:
 *
 * - **Every request is checked here, on the server.** The page at `/platform/analytics` only draws what this
 *   returns. The check is `checkPlatformAccess` (shared/platform-access.ts): a verified Firebase token whose
 *   `app_users.id` is listed in `PLATFORM_ADMIN_USER_IDS`. No society or event role counts.
 * - **Everybody else gets the same 404**, whatever the reason, so a refusal says nothing about why. The reason
 *   goes to the server log as one JSON line, without the token or any IP address. The resource name is visible
 *   in the app's JavaScript; it was never meant to be a secret.
 * - **Read-only.** Nothing in this file inserts, updates, upserts, deletes or calls an rpc (tests/platform-boundaries
 *   checks). In particular it never calls `requireAppUser`, which upserts `app_users` on every request; the
 *   owner's visits here must not touch the operational tables.
 * - **Minimum data.** Every select names its columns. Phone, flat, tokens, contact names and payment references
 *   are never selected. The Phase 2 reads live in platform-reads.ts under the same rules.
 * - **Honest answers.** Every response carries `observedAt`. A source that does not exist is reported as missing,
 *   never as zero.
 * - **Bounded.** Every query shares one 5-second limit; a request that hits it answers 500 and the page says so.
 *
 * It lives in api/events.ts as a resource because the project is at the Vercel plan's 12-function cap.
 */

type ApiRequest = {
  method?: string;
  query?: Record<string, unknown>;
  headers?: { authorization?: string };
};

type ApiResponse = {
  setHeader?: (name: string, value: string) => void;
  status: (statusCode: number) => { json: (body: unknown) => void };
};

type Supabase = ReturnType<typeof assertServiceSupabase>;
type PartContext = { supabase: Supabase; userId: string; signal: AbortSignal; query: Record<string, unknown> };

const queryLimitMs = 5000;

const isMissing = (error: { code?: string } | null) =>
  Boolean(error && ["42P01", "PGRST205", "42703", "PGRST204"].includes(error.code ?? ""));

function log(event: string, detail: Record<string, unknown>) {
  console.warn(JSON.stringify({ event, ...detail, at: new Date().toISOString() }));
}

/** A read of `app_users` by Firebase uid. Never creates or updates the row. */
async function findUserId(firebaseUid: string) {
  const supabase = assertServiceSupabase();
  const { data, error } = await supabase.from("app_users").select("id").eq("firebase_uid", firebaseUid).maybeSingle();
  if (error) throw error;
  return (data?.id as string | undefined) ?? null;
}

/* ------------------------------------------------------------------------------------------------------------ */
/* Parts                                                                                                         */
/* ------------------------------------------------------------------------------------------------------------ */

/** Who is looking. The page asks this first and draws nothing until it answers. */
async function readSession({ supabase, userId, signal }: PartContext) {
  const { data, error } = await supabase
    .from("app_users")
    .select("id,full_name,email")
    .eq("id", userId)
    .abortSignal(signal)
    .maybeSingle();
  if (error) throw error;
  return {
    user: { id: userId, name: (data?.full_name as string | null) ?? null, email: (data?.email as string | null) ?? null },
    observedAt: new Date().toISOString(),
  };
}

type TableSource = {
  key: string;
  label: string;
  table: string;
  timeColumn: string;
  migration: string;
};

/**
 * Every table the Control Center reads, with the column that says when a row happened. Probed on every request
 * rather than written down, because which migrations production has applied is exactly what drifts.
 */
const tableSources: TableSource[] = [
  { key: "people", label: "People", table: "app_users", timeColumn: "created_at", migration: "003" },
  { key: "societies", label: "Societies", table: "organizations", timeColumn: "created_at", migration: "001" },
  { key: "memberships", label: "Society memberships", table: "organization_members", timeColumn: "created_at", migration: "023" },
  { key: "events", label: "Events", table: "events", timeColumn: "created_at", migration: "001" },
  { key: "event_roles", label: "Event roles", table: "event_members", timeColumn: "created_at", migration: "003" },
  { key: "bookings", label: "Bookings", table: "event_registrations", timeColumn: "created_at", migration: "032" },
  { key: "contributions", label: "Contributions", table: "contributions", timeColumn: "created_at", migration: "001" },
  { key: "visits", label: "Visits to event pages", table: "event_visits", timeColumn: "started_at", migration: "028" },
  { key: "page_views", label: "Page views", table: "event_page_views", timeColumn: "opened_at", migration: "030" },
  { key: "audit", label: "Audit log", table: "audit_log", timeColumn: "occurred_at", migration: "030" },
  { key: "proposals", label: "Event proposals", table: "event_proposals", timeColumn: "submitted_at", migration: "043" },
  { key: "role_history", label: "Role history", table: "event_role_history", timeColumn: "ended_at", migration: "046" },
];

/** Columns that arrive with a migration on a table that already exists. */
const columnSources = [
  { key: "visit_surfaces", label: "Visits beyond event pages", table: "event_visits", column: "surface", migration: "045" },
  { key: "last_seen", label: "Last seen per person", table: "app_users", column: "last_seen_at", migration: "045" },
];

type SourceStatus = "available" | "missing" | "error";

async function probeTable(supabase: Supabase, source: TableSource, signal: AbortSignal) {
  const base = { key: source.key, label: source.label, table: source.table, migration: source.migration, kind: "table" as const };
  const counted = await supabase.from(source.table).select(source.timeColumn, { count: "exact", head: true }).abortSignal(signal);
  if (counted.error) {
    return { ...base, status: (isMissing(counted.error) ? "missing" : "error") as SourceStatus, rows: null, firstAt: null, lastAt: null };
  }
  const rows = counted.count ?? 0;
  if (!rows) return { ...base, status: "available" as SourceStatus, rows, firstAt: null, lastAt: null };

  const edge = (ascending: boolean) =>
    supabase.from(source.table).select(source.timeColumn).order(source.timeColumn, { ascending, nullsFirst: false }).limit(1).abortSignal(signal);
  const [first, last] = await Promise.all([edge(true), edge(false)]);
  if (first.error || last.error) {
    return { ...base, status: "error" as SourceStatus, rows, firstAt: null, lastAt: null };
  }
  const at = (result: { data: unknown }) => {
    const row = (result.data as Record<string, unknown>[] | null)?.[0];
    return (row?.[source.timeColumn] as string | null | undefined) ?? null;
  };
  return { ...base, status: "available" as SourceStatus, rows, firstAt: at(first), lastAt: at(last) };
}

async function probeColumn(supabase: Supabase, source: (typeof columnSources)[number], signal: AbortSignal) {
  const result = await supabase.from(source.table).select(source.column).limit(1).abortSignal(signal);
  const status: SourceStatus = !result.error ? "available" : isMissing(result.error) ? "missing" : "error";
  return { key: source.key, label: source.label, table: `${source.table}.${source.column}`, migration: source.migration, kind: "column" as const, status };
}

/**
 * What data exists right now: every source with its row count and first and last timestamp, how long one read of
 * the database took from here, and which deployment answered. All of it observed at request time.
 */
async function readSources({ supabase, signal }: PartContext) {
  const started = Date.now();
  const ping = await supabase.from("app_users").select("id", { count: "exact", head: true }).abortSignal(signal);
  const roundTripMs = Date.now() - started;

  const [tables, columns] = await Promise.all([
    Promise.all(tableSources.map((source) => probeTable(supabase, source, signal))),
    Promise.all(columnSources.map((source) => probeColumn(supabase, source, signal))),
  ]);

  return {
    observedAt: new Date().toISOString(),
    database: { reachable: !ping.error, roundTripMs: ping.error ? null : roundTripMs },
    deployment: {
      environment: process.env.VERCEL_ENV ?? null,
      commit: process.env.VERCEL_GIT_COMMIT_SHA ? process.env.VERCEL_GIT_COMMIT_SHA.slice(0, 7) : null,
      region: process.env.VERCEL_REGION ?? null,
    },
    tables,
    columns,
  };
}

const parts: Record<string, (context: PartContext) => Promise<unknown>> = {
  session: readSession,
  sources: readSources,
  overview: readOverview,
  users: readUsers,
  user: readUser,
  societies: readSocieties,
  society: readSociety,
  events: readEvents,
  event: readEvent,
};

/* ------------------------------------------------------------------------------------------------------------ */
/* The route                                                                                                     */
/* ------------------------------------------------------------------------------------------------------------ */

export async function handlePlatform(req: ApiRequest, res: ApiResponse) {
  res.setHeader?.("X-Robots-Tag", "noindex");
  const part = String(req.query?.part ?? "");

  let userId: string;
  try {
    // Read-only area: anything but GET is refused exactly like a stranger.
    if (req.method !== "GET") {
      log("platform_access_denied", { reason: "method", method: req.method ?? null, part });
      return sendJson(res, 404, platformNotFoundBody);
    }

    const access = await checkPlatformAccess({
      token: bearerToken(req.headers?.authorization),
      admins: parsePlatformAdminIds(process.env.PLATFORM_ADMIN_USER_IDS),
      verify: verifyFirebaseIdToken,
      findUserId,
    });
    if (!access.ok) {
      log("platform_access_denied", { reason: access.reason, part, userId: access.userId ?? null });
      return sendJson(res, 404, platformNotFoundBody);
    }
    userId = access.userId;
  } catch {
    // Nothing before the check may reveal that this resource exists.
    return sendJson(res, 404, platformNotFoundBody);
  }

  if (!Object.prototype.hasOwnProperty.call(parts, part)) return sendJson(res, 404, platformNotFoundBody);

  try {
    const supabase = assertServiceSupabase();
    const body = await parts[part]({ supabase, userId, signal: AbortSignal.timeout(queryLimitMs), query: req.query ?? {} });
    return sendJson(res, 200, body);
  } catch (error) {
    const item = error as { name?: string; message?: string; code?: string; statusCode?: number };
    // A record that does not exist (or an id that is not one) is a plain 404, like everything else unknown.
    if (item?.statusCode === 404) return sendJson(res, 404, platformNotFoundBody);
    const timedOut = item?.name === "AbortError" || item?.name === "TimeoutError";
    log("platform_part_failed", { part, timedOut, code: item?.code ?? null, message: item?.message ?? null });
    return sendJson(res, 500, {
      error: timedOut ? "The query took longer than 5 seconds and was stopped." : "The query failed.",
      observedAt: new Date().toISOString(),
    });
  }
}
