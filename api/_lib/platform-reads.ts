import { eventEndInstant, eventStartInstant, getEventStatus } from "../../shared/event-status.js";
import {
  activePeople,
  activePeopleByDay,
  cleanSearch,
  compare,
  countByDay,
  daysIn,
  inWindow,
  isUuid,
  readChoice,
  readPage,
  societyFacts,
  tallyStatuses,
  type EventStatus,
  type SocietyFacts,
  type VisitRow,
  type Window,
} from "../../shared/platform-metrics.js";
import { platformWindow, readPlatformRange, type PlatformWindow } from "../../shared/platform-range.js";
import { selectDegrading } from "./schema-compat.js";
import type { assertServiceSupabase } from "./server.js";

/**
 * The Control Center's Phase 2 reads: overview, users, societies, events, and one record of each.
 *
 * Only ever called by handlePlatform (api/_lib/platform.ts), after the platform-owner check. Same rules as that
 * file: read-only, named columns, nothing private, every query under the request's 5-second signal, and a missing
 * table is reported as unavailable rather than counted as zero.
 *
 * Volumes are small today, so lists are read in pages of 1,000 up to a cap. A read that hits its cap says so
 * (`truncated`) and the page shows it as partial; that is the signal to move that aggregate into a database view.
 */

type Supabase = ReturnType<typeof assertServiceSupabase>;
export type ReadContext = { supabase: Supabase; userId: string; signal: AbortSignal; query: Record<string, unknown> };
export type DbError = { code?: string; message?: string } | null;
export type Row = Record<string, unknown>;

const pageSize = 1000;
export const listPageSize = 25;
const lastVisitCap = 2000;
const dayMs = 24 * 60 * 60 * 1000;

export const isMissing = (error: DbError) => Boolean(error && ["42P01", "PGRST205", "42703", "PGRST204"].includes(error.code ?? ""));

export function notFound(): never {
  throw Object.assign(new Error("Not found"), { statusCode: 404 });
}

/** Reads every row a query returns, a page at a time, up to `cap` rows. */
export async function readAll(
  build: (from: number, to: number) => PromiseLike<{ data: unknown; error: DbError }>,
  cap: number,
): Promise<{ rows: Row[]; truncated: boolean; missing: boolean }> {
  const rows: Row[] = [];
  for (let offset = 0; offset < cap; offset += pageSize) {
    const { data, error } = await build(offset, offset + pageSize - 1);
    if (error) {
      if (isMissing(error) && offset === 0) return { rows: [], truncated: false, missing: true };
      throw error;
    }
    const page = (data as Row[] | null) ?? [];
    rows.push(...page);
    if (page.length < pageSize) return { rows, truncated: false, missing: false };
  }
  return { rows, truncated: true, missing: false };
}

export const str = (value: unknown) => (value === null || value === undefined ? null : String(value));

/* ---------------------------------------------------------------------------------------------------------- */
/* Shared loaders                                                                                               */
/* ---------------------------------------------------------------------------------------------------------- */

const eventColumns = ["id", "organization_id", "name", "slug", "start_date", "end_date", "start_time", "end_time", "status_override", "created_at", "event_type", "location"];

type EventRecord = {
  id: string;
  societyId: string;
  name: string;
  slug: string | null;
  startDate: string;
  endDate: string;
  startTime: string | null;
  endTime: string | null;
  createdAt: string | null;
  type: string | null;
  location: string | null;
  status: EventStatus;
  startsAt: number | null;
  endsAt: number | null;
};

function toEvent(row: Row, closed: Set<string>, now: number): EventRecord {
  const startDate = String(row.start_date ?? "");
  const endDate = String(row.end_date ?? startDate);
  const startTime = str(row.start_time);
  const endTime = str(row.end_time);
  const statusOverride = (row.status_override as "draft" | "cancelled" | null) ?? null;
  const status = getEventStatus({ startDate, endDate, startTime, endTime, statusOverride, isClosed: closed.has(String(row.id)) }, new Date(now));
  const startsAt = startDate ? eventStartInstant(startDate, startTime) : null;
  const endsAt = endDate ? eventEndInstant(endDate, endTime) : null;
  return {
    id: String(row.id),
    societyId: String(row.organization_id ?? ""),
    name: String(row.name ?? "Untitled event"),
    slug: str(row.slug),
    startDate,
    endDate,
    startTime,
    endTime,
    createdAt: str(row.created_at),
    type: str(row.event_type),
    location: str(row.location),
    status,
    startsAt: Number.isFinite(startsAt) ? startsAt : null,
    endsAt: Number.isFinite(endsAt) ? endsAt : null,
  };
}

/** Per-request memoised reads, so a part that needs the same table twice reads it once. */
export function loaders({ supabase, signal }: ReadContext) {
  const memo = new Map<string, Promise<unknown>>();
  const once = <T>(key: string, load: () => Promise<T>) => {
    if (!memo.has(key)) memo.set(key, load());
    return memo.get(key) as Promise<T>;
  };

  const societies = () =>
    once("societies", () =>
      readAll((a, b) => supabase.from("organizations").select("id,name,slug,city,created_at").order("created_at").order("id").range(a, b).abortSignal(signal), 2000),
    );

  const memberships = () =>
    once("memberships", () =>
      readAll(
        (a, b) => supabase.from("organization_members").select("organization_id,user_id,role,created_at").order("created_at").order("user_id").range(a, b).abortSignal(signal),
        50_000,
      ),
    );

  const closedIds = () =>
    once("closed", async () => {
      const result = await readAll((a, b) => supabase.from("event_closing").select("event_id").eq("is_closed", true).order("event_id").range(a, b).abortSignal(signal), 10_000);
      return new Set(result.rows.map((row) => String(row.event_id)));
    });

  const events = (now: number) =>
    once("events", async () => {
      let truncated = false;
      const result = await selectDegrading("events", eventColumns, ["id", "organization_id", "name", "start_date", "end_date", "created_at"], async (select) => {
        try {
          const read = await readAll((a, b) => supabase.from("events").select(select).order("created_at").order("id").range(a, b).abortSignal(signal), 5000);
          truncated = read.truncated;
          return { data: read.rows, error: null };
        } catch (error) {
          return { data: null, error: error as DbError };
        }
      });
      if (result.error) throw result.error;
      const closed = await closedIds();
      return { rows: ((result.data as Row[]) ?? []).map((row) => toEvent(row, closed, now)), truncated };
    });

  /** Visits that overlap `[from, now]`. Guests included; `user_id` is null for them. */
  const visits = (from: string) =>
    once(`visits:${from}`, async () => {
      const result = await readAll(
        (a, b) =>
          supabase.from("event_visits").select("id,event_id,user_id,started_at,last_seen_at").gte("last_seen_at", from).order("started_at").order("id").range(a, b).abortSignal(signal),
        40_000,
      );
      return { rows: result.rows as unknown as VisitRow[], truncated: result.truncated, missing: result.missing };
    });

  const visitsSince = () =>
    once("visitsSince", async () => {
      const { data, error } = await supabase.from("event_visits").select("started_at").order("started_at").limit(1).abortSignal(signal);
      if (error) return null;
      return str((data as Row[] | null)?.[0]?.started_at);
    });

  /** Whether audit_log exists (migration 030), and since when it has rows. */
  const audit = () =>
    once("audit", async () => {
      const { data, error } = await supabase.from("audit_log").select("occurred_at").order("occurred_at").limit(1).abortSignal(signal);
      if (error) {
        if (isMissing(error)) return { available: false as const, since: null };
        throw error;
      }
      return { available: true as const, since: str((data as Row[] | null)?.[0]?.occurred_at) };
    });

  return { societies, memberships, events, visits, visitsSince, audit };
}

export type Loaders = ReturnType<typeof loaders>;

export function windowFrom(ctx: ReadContext) {
  return platformWindow(readPlatformRange(ctx.query.range));
}

export function windowJson(window: PlatformWindow) {
  return { preset: window.preset, days: window.days, from: window.from, to: window.to, firstDay: window.firstDay, lastDay: window.lastDay, previous: window.previous };
}

/** Visits are read from the earlier of the previous window and 90 days back, so "last activity" can see them. */
function visitsFromFor(window: PlatformWindow) {
  const ninety = new Date(Date.parse(window.to) - 90 * dayMs).toISOString();
  return window.previous.from < ninety ? window.previous.from : ninety;
}

export async function headCount(build: () => PromiseLike<{ count: number | null; error: DbError }>) {
  const { count, error } = await build();
  if (error) throw error;
  return count ?? 0;
}

function factsFor(load: { societies: Row[]; events: EventRecord[]; memberships: Row[]; visits: VisitRow[] }, window: Window, now: number) {
  return societyFacts(
    load.societies.map((row) => ({ id: String(row.id), created_at: String(row.created_at) })),
    load.events.map((event) => ({
      id: event.id,
      organization_id: event.societyId,
      created_at: event.createdAt,
      startsAt: event.startsAt,
      endsAt: event.endsAt,
      countsAsOn: event.status !== "draft" && event.status !== "cancelled",
    })),
    load.memberships.map((row) => ({ organization_id: String(row.organization_id), user_id: String(row.user_id), created_at: str(row.created_at) })),
    load.visits,
    window,
    now,
  );
}

async function recentAudit(ctx: ReadContext, l: Loaders, filter: { column: "actor_user_id" | "organization_id" | "event_id"; value: string } | null, limit: number) {
  const audit = await l.audit();
  if (!audit.available) return null;
  let query = ctx.supabase.from("audit_log").select("id,occurred_at,actor_user_id,actor_email,action,entity_type,summary,organization_id,event_id,request_id");
  if (filter) query = query.eq(filter.column, filter.value);
  const { data, error } = await query.order("occurred_at", { ascending: false }).limit(limit).abortSignal(ctx.signal);
  if (error) throw error;
  return ((data as Row[] | null) ?? []).map((row) => ({
    id: String(row.id),
    at: str(row.occurred_at),
    actorId: str(row.actor_user_id),
    actorEmail: str(row.actor_email),
    action: String(row.action ?? ""),
    entityType: String(row.entity_type ?? ""),
    summary: str(row.summary),
    societyId: str(row.organization_id),
    eventId: str(row.event_id),
  }));
}

export async function namesOfUsers(ctx: ReadContext, ids: string[]) {
  const unique = [...new Set(ids.filter(isUuid))].slice(0, 200);
  if (!unique.length) return new Map<string, string>();
  const { data, error } = await ctx.supabase.from("app_users").select("id,full_name").in("id", unique).abortSignal(ctx.signal);
  if (error) throw error;
  return new Map(((data as Row[] | null) ?? []).map((row) => [String(row.id), String(row.full_name ?? "")]));
}

/* ---------------------------------------------------------------------------------------------------------- */
/* Overview                                                                                                     */
/* ---------------------------------------------------------------------------------------------------------- */

export async function readOverview(ctx: ReadContext) {
  const now = Date.now();
  const window = windowFrom(ctx);
  const l = loaders(ctx);
  const { supabase, signal } = ctx;

  const [usersTotal, usersNew, usersNewBefore, signupRows, societies, memberships, events, visits, visitsSince, audit] = await Promise.all([
    headCount(() => supabase.from("app_users").select("id", { count: "exact", head: true }).abortSignal(signal)),
    headCount(() => supabase.from("app_users").select("id", { count: "exact", head: true }).gte("created_at", window.from).lt("created_at", window.to).abortSignal(signal)),
    headCount(() => supabase.from("app_users").select("id", { count: "exact", head: true }).gte("created_at", window.previous.from).lt("created_at", window.previous.to).abortSignal(signal)),
    readAll((a, b) => supabase.from("app_users").select("created_at").gte("created_at", window.previous.from).lt("created_at", window.to).order("created_at").range(a, b).abortSignal(signal), 50_000),
    l.societies(),
    l.memberships(),
    l.events(now),
    l.visits(visitsFromFor(window)),
    l.visitsSince(),
    l.audit(),
  ]);

  const load = { societies: societies.rows, events: events.rows, memberships: memberships.rows, visits: visits.rows };
  const facts = factsFor(load, window, now);
  const factsBefore = factsFor(load, window.previous, Date.parse(window.previous.to));
  const activeNow = [...facts.values()].filter((fact) => fact.active).length;
  const activeBefore = [...factsBefore.values()].filter((fact) => fact.active).length;

  const signups = signupRows.rows.map((row) => str(row.created_at));
  const created = events.rows.map((event) => event.createdAt);
  const series = (values: { current: { day: string; value: number }[]; previous: { day: string; value: number }[] }) => ({
    current: values.current.map((point) => point.value),
    previous: values.previous.map((point) => point.value),
  });

  let published: { current: number[]; previous: number[] } | null = null;
  if (audit.available) {
    const rows = await readAll(
      (a, b) =>
        supabase.from("audit_log").select("occurred_at").eq("action", "publish").eq("entity_type", "event").gte("occurred_at", window.previous.from).lt("occurred_at", window.to).order("occurred_at").range(a, b).abortSignal(signal),
      20_000,
    );
    const at = rows.rows.map((row) => str(row.occurred_at));
    published = series({ current: countByDay(at, window), previous: countByDay(at, window.previous) });
  }

  const societyName = new Map(societies.rows.map((row) => [String(row.id), String(row.name ?? "")]));
  const ranked = [...facts.entries()]
    .filter(([, fact]) => fact.active)
    .sort((a, b) => b[1].visits - a[1].visits || b[1].eventsOn - a[1].eventsOn || b[1].joined - a[1].joined)
    .slice(0, 6)
    .map(([id, fact]) => ({ id, name: societyName.get(id) ?? "", visits: fact.visits, signedInVisitors: fact.signedInVisitors, eventsOn: fact.eventsOn, joined: fact.joined }));

  const draftsSoon = events.rows
    .filter((event) => event.status === "draft" && event.startsAt !== null && event.startsAt > now && event.startsAt - now <= 14 * dayMs)
    .sort((a, b) => (a.startsAt ?? 0) - (b.startsAt ?? 0))
    .map((event) => ({ id: event.id, name: event.name, society: societyName.get(event.societyId) ?? "", startDate: event.startDate }));

  const recent = await recentAudit(ctx, l, null, 8);
  const actorNames = recent ? await namesOfUsers(ctx, recent.map((item) => item.actorId ?? "")) : new Map();

  return {
    observedAt: new Date().toISOString(),
    window: windowJson(window),
    days: daysIn(window),
    coverage: {
      visitsAvailable: !visits.missing,
      visitsSince,
      visitsPartial: visits.truncated,
      auditAvailable: audit.available,
      auditSince: audit.since,
      eventsPartial: events.truncated,
    },
    metrics: {
      users: { total: usersTotal, joined: compare(usersNew, usersNewBefore) },
      societies: { total: societies.rows.length, active: compare(activeNow, activeBefore), new: [...facts.values()].filter((fact) => fact.label === "new").length },
      events: { total: events.rows.length, created: compare(created.filter((at) => inWindow(at, window)).length, created.filter((at) => inWindow(at, window.previous)).length), status: tallyStatuses(events.rows.map((event) => event.status)) },
      activePeople: visits.missing ? null : compare(activePeople(visits.rows, window).size, activePeople(visits.rows, window.previous).size),
    },
    series: {
      signups: series({ current: countByDay(signups, window), previous: countByDay(signups, window.previous) }),
      visits: visits.missing ? null : series({ current: countByDay(visits.rows.map((visit) => visit.started_at), window), previous: countByDay(visits.rows.map((visit) => visit.started_at), window.previous) }),
      activePeople: visits.missing ? null : series({ current: activePeopleByDay(visits.rows, window), previous: activePeopleByDay(visits.rows, window.previous) }),
      eventsCreated: series({ current: countByDay(created, window), previous: countByDay(created, window.previous) }),
      eventsPublished: published,
    },
    societies: ranked,
    attention: {
      dormant: [...facts.entries()].filter(([, fact]) => fact.label === "dormant").map(([id]) => ({ id, name: societyName.get(id) ?? "" })),
      empty: [...facts.entries()].filter(([, fact]) => fact.label === "empty").length,
      draftsSoon,
    },
    recent: recent?.map((item) => ({ ...item, actorName: item.actorId ? actorNames.get(item.actorId) ?? null : null, society: item.societyId ? societyName.get(item.societyId) ?? null : null })) ?? null,
  };
}

/* ---------------------------------------------------------------------------------------------------------- */
/* Users                                                                                                        */
/* ---------------------------------------------------------------------------------------------------------- */

export async function readUsers(ctx: ReadContext) {
  const now = Date.now();
  const window = windowFrom(ctx);
  const l = loaders(ctx);
  const { supabase, signal } = ctx;
  const q = cleanSearch(ctx.query.q);
  const joined = readChoice(ctx.query.joined, ["any", "period", "active"] as const, "any");
  const page = readPage(ctx.query.page);
  const start = (page - 1) * listPageSize;
  const userColumns = "id,full_name,email,photo_url,created_at";

  const [usersTotal, usersNew, usersNewBefore, memberships, visits, visitsSince] = await Promise.all([
    headCount(() => supabase.from("app_users").select("id", { count: "exact", head: true }).abortSignal(signal)),
    headCount(() => supabase.from("app_users").select("id", { count: "exact", head: true }).gte("created_at", window.from).lt("created_at", window.to).abortSignal(signal)),
    headCount(() => supabase.from("app_users").select("id", { count: "exact", head: true }).gte("created_at", window.previous.from).lt("created_at", window.previous.to).abortSignal(signal)),
    l.memberships(),
    l.visits(window.previous.from),
    l.visitsSince(),
  ]);
  const active = visits.missing ? new Set<string>() : activePeople(visits.rows, window);

  let rows: Row[];
  let total: number;
  if (joined === "active") {
    // The people active in the window, read by id in chunks, then searched and paged here. Bounded by the
    // number of active people, which the visits read already caps.
    const ids = [...active].slice(0, 5000);
    const chunks: string[][] = [];
    for (let index = 0; index < ids.length; index += 100) chunks.push(ids.slice(index, index + 100));
    const read = await Promise.all(chunks.map((chunk) => supabase.from("app_users").select(userColumns).in("id", chunk).abortSignal(signal)));
    const people: Row[] = [];
    for (const result of read) {
      if (result.error) throw result.error;
      people.push(...(((result.data as Row[] | null) ?? []) as Row[]));
    }
    const needle = q.toLowerCase();
    const matched = people
      .filter((row) => !needle || String(row.full_name ?? "").toLowerCase().includes(needle) || String(row.email ?? "").toLowerCase().includes(needle))
      .sort((a, b) => String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")) || String(a.id).localeCompare(String(b.id)));
    total = matched.length;
    rows = matched.slice(start, start + listPageSize);
  } else {
    let list = supabase.from("app_users").select(userColumns, { count: "exact" });
    if (q) list = list.or(`full_name.ilike.*${q}*,email.ilike.*${q}*`);
    if (joined === "period") list = list.gte("created_at", window.from).lt("created_at", window.to);
    const listed = await list.order("created_at", { ascending: false }).order("id").range(start, start + listPageSize - 1).abortSignal(signal);
    if (listed.error) throw listed.error;
    rows = (listed.data as Row[] | null) ?? [];
    total = listed.count ?? rows.length;
  }
  const ids = rows.map((row) => String(row.id));

  const societiesOf = new Map<string, number>();
  for (const row of memberships.rows) societiesOf.set(String(row.user_id), (societiesOf.get(String(row.user_id)) ?? 0) + 1);

  // One query each for the whole page of people, not one per person: this page used to make about 75 small queries.
  // Newest first, so the first row seen for a person is their latest visit. If the cap is reached, a person with
  // no row may still have an older visit; they show as "no recorded visit", which already means unknown.
  const [roles, lastVisitRows] = await Promise.all([
    ids.length ? supabase.from("event_members").select("user_id").in("user_id", ids).abortSignal(signal) : Promise.resolve({ data: [], error: null }),
    ids.length && !visits.missing
      ? supabase.from("event_visits").select("user_id,last_seen_at").in("user_id", ids).order("last_seen_at", { ascending: false }).limit(lastVisitCap).abortSignal(signal)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (roles.error) throw roles.error;
  if (lastVisitRows.error) throw lastVisitRows.error;
  const lastVisits: (readonly [string, string | null])[] = [];
  const seenUsers = new Set<string>();
  for (const row of (lastVisitRows.data as Row[] | null) ?? []) {
    const id = String(row.user_id);
    if (seenUsers.has(id)) continue;
    seenUsers.add(id);
    lastVisits.push([id, str(row.last_seen_at)] as const);
  }
  const rolesOf = new Map<string, number>();
  for (const row of (roles.data as Row[] | null) ?? []) rolesOf.set(String(row.user_id), (rolesOf.get(String(row.user_id)) ?? 0) + 1);
  const lastVisitOf = new Map(lastVisits);

  return {
    observedAt: new Date(now).toISOString(),
    window: windowJson(window),
    coverage: { visitsAvailable: !visits.missing, visitsSince, visitsPartial: visits.truncated },
    summary: {
      total: usersTotal,
      joined: compare(usersNew, usersNewBefore),
      active: visits.missing ? null : compare(active.size, activePeople(visits.rows, window.previous).size),
      inSociety: societiesOf.size,
    },
    filters: { q, joined },
    page,
    pageSize: listPageSize,
    total,
    users: rows.map((row) => ({
      id: String(row.id),
      name: str(row.full_name),
      email: str(row.email),
      photoUrl: str(row.photo_url),
      joinedAt: str(row.created_at),
      societies: societiesOf.get(String(row.id)) ?? 0,
      eventRoles: rolesOf.get(String(row.id)) ?? 0,
      lastVisitAt: lastVisitOf.get(String(row.id)) ?? null,
    })),
  };
}

export async function readUser(ctx: ReadContext) {
  const id = ctx.query.id;
  if (!isUuid(id)) notFound();
  const now = Date.now();
  const window = windowFrom(ctx);
  const l = loaders(ctx);
  const { supabase, signal } = ctx;

  const person = await supabase.from("app_users").select("id,full_name,email,photo_url,created_at").eq("id", id).abortSignal(signal).maybeSingle();
  if (person.error) throw person.error;
  if (!person.data) notFound();

  const [memberships, roles, recentVisits, visitsInWindow, bookings, audit] = await Promise.all([
    supabase.from("organization_members").select("organization_id,role,created_at").eq("user_id", id).abortSignal(signal),
    supabase.from("event_members").select("event_id,role,created_at").eq("user_id", id).abortSignal(signal),
    supabase.from("event_visits").select("event_id,started_at,last_seen_at,page_views,device,browser").eq("user_id", id).order("started_at", { ascending: false }).limit(30).abortSignal(signal),
    supabase.from("event_visits").select("id", { count: "exact", head: true }).eq("user_id", id).gte("last_seen_at", window.from).lt("started_at", window.to).abortSignal(signal),
    supabase.from("event_registrations").select("id", { count: "exact", head: true }).eq("booked_by", id).abortSignal(signal),
    recentAudit(ctx, l, { column: "actor_user_id", value: id }, 30),
  ]);
  if (memberships.error) throw memberships.error;
  if (roles.error) throw roles.error;
  const visitsMissing = Boolean(recentVisits.error && isMissing(recentVisits.error));
  if (recentVisits.error && !visitsMissing) throw recentVisits.error;
  if (bookings.error && !isMissing(bookings.error)) throw bookings.error;

  const [societies, events] = await Promise.all([l.societies(), l.events(now)]);
  const societyById = new Map(societies.rows.map((row) => [String(row.id), row]));
  const eventById = new Map(events.rows.map((event) => [event.id, event]));

  return {
    observedAt: new Date(now).toISOString(),
    window: windowJson(window),
    user: {
      id: String(person.data.id),
      name: str(person.data.full_name),
      email: str(person.data.email),
      photoUrl: str(person.data.photo_url),
      joinedAt: str(person.data.created_at),
    },
    memberships: ((memberships.data as Row[] | null) ?? []).map((row) => ({
      societyId: String(row.organization_id),
      society: String(societyById.get(String(row.organization_id))?.name ?? "Unknown society"),
      role: String(row.role ?? ""),
      since: str(row.created_at),
    })),
    eventRoles: ((roles.data as Row[] | null) ?? []).map((row) => {
      const event = eventById.get(String(row.event_id));
      return {
        eventId: String(row.event_id),
        event: event?.name ?? "Unknown event",
        society: event ? String(societyById.get(event.societyId)?.name ?? "") : "",
        status: event?.status ?? null,
        role: String(row.role ?? ""),
        since: str(row.created_at),
      };
    }),
    visits: visitsMissing
      ? null
      : {
          inWindow: visitsInWindow.count ?? 0,
          recent: ((recentVisits.data as Row[] | null) ?? []).map((row) => ({
            eventId: str(row.event_id),
            event: eventById.get(String(row.event_id))?.name ?? null,
            startedAt: str(row.started_at),
            lastSeenAt: str(row.last_seen_at),
            pages: Number(row.page_views ?? 0),
            device: str(row.device),
            browser: str(row.browser),
          })),
        },
    bookingsMade: bookings.error ? null : bookings.count ?? 0,
    actions: audit,
  };
}

/* ---------------------------------------------------------------------------------------------------------- */
/* Societies                                                                                                    */
/* ---------------------------------------------------------------------------------------------------------- */

function monthOf(value: string | null) {
  if (!value) return null;
  const time = Date.parse(value);
  return Number.isNaN(time) ? null : new Date(time + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 7);
}

function countByMonth(values: (string | null)[]) {
  const counts = new Map<string, number>();
  for (const value of values) {
    const month = monthOf(value);
    if (month) counts.set(month, (counts.get(month) ?? 0) + 1);
  }
  return [...counts].sort((a, b) => a[0].localeCompare(b[0])).map(([month, value]) => ({ month, value }));
}

const factJson = (fact: SocietyFacts) => ({
  label: fact.label,
  active: fact.active,
  members: fact.members,
  events: fact.events,
  eventsCreated: fact.eventsCreated,
  eventsOn: fact.eventsOn,
  joined: fact.joined,
  visits: fact.visits,
  signedInVisitors: fact.signedInVisitors,
  lastActivityAt: fact.lastActivityAt,
});

export async function readSocieties(ctx: ReadContext) {
  const now = Date.now();
  const window = windowFrom(ctx);
  const l = loaders(ctx);
  const [societies, memberships, events, visits, visitsSince] = await Promise.all([l.societies(), l.memberships(), l.events(now), l.visits(visitsFromFor(window)), l.visitsSince()]);
  const load = { societies: societies.rows, events: events.rows, memberships: memberships.rows, visits: visits.rows };
  const facts = factsFor(load, window, now);
  const factsBefore = factsFor(load, window.previous, Date.parse(window.previous.to));
  const joinedAt = memberships.rows.map((row) => str(row.created_at));

  return {
    observedAt: new Date(now).toISOString(),
    window: windowJson(window),
    days: daysIn(window),
    coverage: { visitsAvailable: !visits.missing, visitsSince, partial: societies.truncated || memberships.truncated || events.truncated || visits.truncated, firstMembershipAt: joinedAt.filter(Boolean).sort()[0] ?? null },
    summary: {
      total: societies.rows.length,
      active: compare([...facts.values()].filter((fact) => fact.active).length, [...factsBefore.values()].filter((fact) => fact.active).length),
      new: compare(
        societies.rows.filter((row) => inWindow(str(row.created_at), window)).length,
        societies.rows.filter((row) => inWindow(str(row.created_at), window.previous)).length,
      ),
      withEvents: [...facts.values()].filter((fact) => fact.events > 0).length,
      labels: {
        new: [...facts.values()].filter((fact) => fact.label === "new").length,
        active: [...facts.values()].filter((fact) => fact.label === "active").length,
        quiet: [...facts.values()].filter((fact) => fact.label === "quiet").length,
        dormant: [...facts.values()].filter((fact) => fact.label === "dormant").length,
        empty: [...facts.values()].filter((fact) => fact.label === "empty").length,
      },
    },
    series: {
      createdByMonth: countByMonth(societies.rows.map((row) => str(row.created_at))),
      joined: { current: countByDay(joinedAt, window).map((point) => point.value), previous: countByDay(joinedAt, window.previous).map((point) => point.value) },
    },
    societies: societies.rows.map((row) => ({
      id: String(row.id),
      name: String(row.name ?? ""),
      slug: str(row.slug),
      city: str(row.city),
      createdAt: str(row.created_at),
      ...factJson(facts.get(String(row.id))!),
    })),
  };
}

export async function readSociety(ctx: ReadContext) {
  const id = ctx.query.id;
  if (!isUuid(id)) notFound();
  const now = Date.now();
  const window = windowFrom(ctx);
  const l = loaders(ctx);
  const [societies, memberships, events, visits] = await Promise.all([l.societies(), l.memberships(), l.events(now), l.visits(visitsFromFor(window))]);
  const row = societies.rows.find((item) => String(item.id) === id);
  if (!row) notFound();
  const facts = factsFor({ societies: [row], events: events.rows, memberships: memberships.rows, visits: visits.rows }, window, now).get(id)!;
  const members = memberships.rows.filter((item) => String(item.organization_id) === id);
  const own = events.rows.filter((event) => event.societyId === id);
  const ownIds = new Set(own.map((event) => event.id));
  const visitsByEvent = new Map<string, { visits: number; people: Set<string> }>();
  for (const visit of visits.rows) {
    if (!visit.event_id || !ownIds.has(visit.event_id)) continue;
    if (!(visit.started_at < window.to && (visit.last_seen_at ?? visit.started_at) >= window.from)) continue;
    const entry = visitsByEvent.get(visit.event_id) ?? { visits: 0, people: new Set<string>() };
    entry.visits += 1;
    if (visit.user_id) entry.people.add(visit.user_id);
    visitsByEvent.set(visit.event_id, entry);
  }
  const actions = await recentAudit(ctx, l, { column: "organization_id", value: id }, 20);
  const actorNames = actions ? await namesOfUsers(ctx, actions.map((item) => item.actorId ?? "")) : new Map();
  const roles = { admin: 0, committee: 0, read_only: 0 } as Record<string, number>;
  for (const member of members) roles[String(member.role)] = (roles[String(member.role)] ?? 0) + 1;

  return {
    observedAt: new Date(now).toISOString(),
    window: windowJson(window),
    coverage: { visitsAvailable: !visits.missing, partial: visits.truncated || events.truncated },
    society: { id, name: String(row.name ?? ""), slug: str(row.slug), city: str(row.city), createdAt: str(row.created_at), ...factJson(facts) },
    roles: { admin: roles.admin ?? 0, committee: roles.committee ?? 0, resident: roles.read_only ?? 0 },
    joinsByMonth: countByMonth(members.map((member) => str(member.created_at))),
    events: own
      .sort((a, b) => b.startDate.localeCompare(a.startDate))
      .map((event) => ({
        id: event.id,
        name: event.name,
        status: event.status,
        startDate: event.startDate,
        endDate: event.endDate,
        visits: visitsByEvent.get(event.id)?.visits ?? 0,
        signedInVisitors: visitsByEvent.get(event.id)?.people.size ?? 0,
      })),
    actions: actions?.map((item) => ({ ...item, actorName: item.actorId ? actorNames.get(item.actorId) ?? null : null })) ?? null,
  };
}

/* ---------------------------------------------------------------------------------------------------------- */
/* Events                                                                                                       */
/* ---------------------------------------------------------------------------------------------------------- */

const statusFilters = ["all", "draft", "upcoming", "live", "completed", "cancelled"] as const;

export async function readEvents(ctx: ReadContext) {
  const now = Date.now();
  const window = windowFrom(ctx);
  const l = loaders(ctx);
  const { supabase, signal } = ctx;
  const q = cleanSearch(ctx.query.q).toLowerCase();
  const status = readChoice(ctx.query.status, statusFilters, "all");
  const societyFilter = isUuid(ctx.query.society) ? String(ctx.query.society) : null;
  const page = readPage(ctx.query.page);

  const [events, societies, audit] = await Promise.all([l.events(now), l.societies(), l.audit()]);
  const societyName = new Map(societies.rows.map((row) => [String(row.id), String(row.name ?? "")]));
  const created = events.rows.map((event) => event.createdAt);

  const filtered = events.rows
    .filter((event) => status === "all" || event.status === status)
    .filter((event) => !societyFilter || event.societyId === societyFilter)
    .filter((event) => !q || event.name.toLowerCase().includes(q) || (societyName.get(event.societyId) ?? "").toLowerCase().includes(q))
    .sort((a, b) => b.startDate.localeCompare(a.startDate) || a.name.localeCompare(b.name));
  const start = (page - 1) * listPageSize;
  const slice = filtered.slice(start, start + listPageSize);

  // Two queries for the whole page of events, not two per event (about 50 before). A read that hits its cap, or a
  // table that does not exist, shows a dash for that column rather than a number that may be too low.
  const sliceIds = slice.map((event) => event.id);
  const none = { rows: [] as Row[], truncated: false, missing: false };
  const [bookingRows, visitRows] = sliceIds.length
    ? await Promise.all([
        readAll((a, b) => supabase.from("event_registrations").select("event_id").in("event_id", sliceIds).eq("status", "active").order("id").range(a, b).abortSignal(signal), 20_000),
        readAll((a, b) => supabase.from("event_visits").select("event_id").in("event_id", sliceIds).gte("last_seen_at", window.from).lt("started_at", window.to).order("id").range(a, b).abortSignal(signal), 20_000),
      ])
    : [none, none];
  const tallyBy = (rows: Row[]) => {
    const counts = new Map<string, number>();
    for (const row of rows) counts.set(String(row.event_id), (counts.get(String(row.event_id)) ?? 0) + 1);
    return counts;
  };
  const bookingCounts = tallyBy(bookingRows.rows);
  const visitCounts = tallyBy(visitRows.rows);
  const counts = new Map(
    sliceIds.map((id) => [
      id,
      {
        bookings: bookingRows.missing || bookingRows.truncated ? null : bookingCounts.get(id) ?? 0,
        visits: visitRows.missing || visitRows.truncated ? null : visitCounts.get(id) ?? 0,
      },
    ]),
  );

  let published: { current: number[]; previous: number[] } | null = null;
  if (audit.available) {
    const rows = await readAll(
      (a, b) =>
        supabase.from("audit_log").select("occurred_at").eq("action", "publish").eq("entity_type", "event").gte("occurred_at", window.previous.from).lt("occurred_at", window.to).order("occurred_at").range(a, b).abortSignal(signal),
      20_000,
    );
    const at = rows.rows.map((row) => str(row.occurred_at));
    published = { current: countByDay(at, window).map((point) => point.value), previous: countByDay(at, window.previous).map((point) => point.value) };
  }

  return {
    observedAt: new Date(now).toISOString(),
    window: windowJson(window),
    days: daysIn(window),
    coverage: { auditAvailable: audit.available, auditSince: audit.since, partial: events.truncated },
    summary: {
      total: events.rows.length,
      status: tallyStatuses(events.rows.map((event) => event.status)),
      created: compare(created.filter((at) => inWindow(at, window)).length, created.filter((at) => inWindow(at, window.previous)).length),
    },
    series: {
      created: { current: countByDay(created, window).map((point) => point.value), previous: countByDay(created, window.previous).map((point) => point.value) },
      published,
    },
    filters: { q, status, society: societyFilter },
    societies: societies.rows.map((row) => ({ id: String(row.id), name: String(row.name ?? "") })).sort((a, b) => a.name.localeCompare(b.name)),
    page,
    pageSize: listPageSize,
    total: filtered.length,
    events: slice.map((event) => ({
      id: event.id,
      name: event.name,
      societyId: event.societyId,
      society: societyName.get(event.societyId) ?? "",
      status: event.status,
      startDate: event.startDate,
      endDate: event.endDate,
      createdAt: event.createdAt,
      type: event.type,
      bookings: counts.get(event.id)?.bookings ?? null,
      visits: counts.get(event.id)?.visits ?? null,
    })),
  };
}

export async function readEvent(ctx: ReadContext) {
  const id = ctx.query.id;
  if (!isUuid(id)) notFound();
  const now = Date.now();
  const window = windowFrom(ctx);
  const l = loaders(ctx);
  const { supabase, signal } = ctx;
  const [events, societies] = await Promise.all([l.events(now), l.societies()]);
  const event = events.rows.find((item) => item.id === id);
  if (!event) notFound();

  const [bookings, visits, actions] = await Promise.all([
    readAll((a, b) => supabase.from("event_registrations").select("id,status,payment_status,adults,children,created_at").eq("event_id", id).order("created_at").order("id").range(a, b).abortSignal(signal), 10_000),
    readAll((a, b) => supabase.from("event_visits").select("id,user_id,started_at,last_seen_at,device").eq("event_id", id).gte("last_seen_at", window.from).lt("started_at", window.to).order("started_at").order("id").range(a, b).abortSignal(signal), 20_000),
    recentAudit(ctx, l, { column: "event_id", value: id }, 20),
  ]);
  const actorNames = actions ? await namesOfUsers(ctx, actions.map((item) => item.actorId ?? "")) : new Map();
  const active = bookings.rows.filter((row) => row.status === "active");
  const payments: Record<string, number> = {};
  for (const row of active) payments[String(row.payment_status)] = (payments[String(row.payment_status)] ?? 0) + 1;
  const devices: Record<string, number> = {};
  for (const row of visits.rows) devices[String(row.device ?? "Unknown")] = (devices[String(row.device ?? "Unknown")] ?? 0) + 1;
  const visitRows = visits.rows as unknown as VisitRow[];

  return {
    observedAt: new Date(now).toISOString(),
    window: windowJson(window),
    days: daysIn(window),
    event: {
      id: event.id,
      name: event.name,
      societyId: event.societyId,
      society: String(societies.rows.find((row) => String(row.id) === event.societyId)?.name ?? ""),
      status: event.status,
      startDate: event.startDate,
      endDate: event.endDate,
      startTime: event.startTime,
      endTime: event.endTime,
      type: event.type,
      location: event.location,
      createdAt: event.createdAt,
    },
    bookings: bookings.missing
      ? null
      : {
          active: active.length,
          cancelled: bookings.rows.length - active.length,
          people: active.reduce((sum, row) => sum + Number(row.adults ?? 0) + Number(row.children ?? 0), 0),
          payments,
          partial: bookings.truncated,
        },
    visits: visits.missing
      ? null
      : {
          total: visitRows.length,
          signedInPeople: activePeople(visitRows, window).size,
          guests: visitRows.filter((visit) => !visit.user_id).length,
          byDay: countByDay(visitRows.map((visit) => visit.started_at), window).map((point) => point.value),
          devices,
          partial: visits.truncated,
        },
    actions: actions?.map((item) => ({ ...item, actorName: item.actorId ? actorNames.get(item.actorId) ?? null : null })) ?? null,
  };
}
