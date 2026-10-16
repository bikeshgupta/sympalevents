import {
  activePeople,
  cleanSearch,
  compare,
  countByDay,
  daysIn,
  inWindow,
  isUuid,
  maskPersonal,
  readChoice,
  readPage,
  scrubChanges,
  tallyLabels,
  visitLength,
} from "../../shared/platform-metrics.js";
import { isMissing, listPageSize, loaders, namesOfUsers, notFound, readAll, str, windowFrom, windowJson, type ReadContext, type Row } from "./platform-reads.js";

/**
 * Activity & Audit - what people changed, what they opened, and who tried the owner's area. Three views, kept
 * apart on purpose because they are different kinds of record:
 *
 * - **actions**: `audit_log` (migration 030). Every write the app makes, with the field-by-field change.
 * - **visits**: `event_visits` (028). Who opened event pages and for how long. Not actions; nothing was changed.
 * - **access**: `platform_access_log` (047, prepared). Signed-in people who opened or were refused at this area.
 *
 * Same rules as the other reads: only called after the owner check, read-only, named columns, one 5-second
 * signal, and a table that does not exist is reported as unavailable, never as zero. Before/after values pass
 * through `scrubChanges` (shared/platform-metrics.ts) so contact details, flats, payment references, tokens and
 * addresses are never sent, and free text has emails and phone numbers masked.
 */

const token = /^[a-z][a-z_]{0,39}$/;
const readToken = (value: unknown) => (typeof value === "string" && token.test(value) ? value : "");

const base = (ctx: ReadContext, view: "actions" | "visits" | "access") => {
  const window = windowFrom(ctx);
  return { view, observedAt: new Date().toISOString(), window: windowJson(window), days: daysIn(window) };
};

export async function readActivity(ctx: ReadContext) {
  const view = readChoice(ctx.query.view, ["actions", "visits", "access"] as const, "actions");
  if (view === "visits") return readVisitsView(ctx);
  if (view === "access") return readAccessView(ctx);
  return readActionsView(ctx);
}

/* ---------------------------------------------------------------------------------------------------------- */
/* Actions                                                                                                      */
/* ---------------------------------------------------------------------------------------------------------- */

const facetCap = 30_000;

async function readActionsView(ctx: ReadContext) {
  const window = windowFrom(ctx);
  const l = loaders(ctx);
  const { supabase, signal } = ctx;
  const head = base(ctx, "actions");

  const audit = await l.audit();
  if (!audit.available) return { ...head, available: false as const, since: null };

  const action = readToken(ctx.query.action);
  const entity = readToken(ctx.query.entity);
  const societyId = isUuid(ctx.query.society) ? String(ctx.query.society) : null;
  const eventId = isUuid(ctx.query.event) ? String(ctx.query.event) : null;
  const q = cleanSearch(ctx.query.q);
  const page = readPage(ctx.query.page);
  const start = (page - 1) * listPageSize;

  let list = supabase
    .from("audit_log")
    .select("id,occurred_at,actor_user_id,actor_email,action,entity_type,summary,organization_id,event_id", { count: "exact" })
    .gte("occurred_at", window.from)
    .lt("occurred_at", window.to);
  if (action) list = list.eq("action", action);
  if (entity) list = list.eq("entity_type", entity);
  if (societyId) list = list.eq("organization_id", societyId);
  if (eventId) list = list.eq("event_id", eventId);
  if (q) list = list.ilike("summary", `%${q}%`);

  const [facets, listed, societies] = await Promise.all([
    readAll(
      (a, b) =>
        supabase
          .from("audit_log")
          .select("occurred_at,actor_user_id,action,entity_type")
          .gte("occurred_at", window.previous.from)
          .lt("occurred_at", window.to)
          .order("occurred_at")
          .order("id")
          .range(a, b)
          .abortSignal(signal),
      facetCap,
    ),
    list.order("occurred_at", { ascending: false }).order("id", { ascending: false }).range(start, start + listPageSize - 1).abortSignal(signal),
    l.societies(),
  ]);
  if (listed.error) throw listed.error;

  const current = facets.rows.filter((row) => inWindow(str(row.occurred_at), window));
  const before = facets.rows.filter((row) => inWindow(str(row.occurred_at), window.previous));
  const peopleOf = (rows: Row[]) => new Set(rows.map((row) => str(row.actor_user_id)).filter(Boolean) as string[]);
  const sorted = (counts: Record<string, number>) =>
    Object.entries(counts)
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));

  const perActor = new Map<string, number>();
  for (const row of current) {
    const id = str(row.actor_user_id);
    if (id) perActor.set(id, (perActor.get(id) ?? 0) + 1);
  }
  const topActors = [...perActor].sort((a, b) => b[1] - a[1]).slice(0, 5);

  const rows = ((listed.data as Row[] | null) ?? []).slice(0, listPageSize);
  const eventIds = [...new Set(rows.map((row) => str(row.event_id)).filter((id): id is string => Boolean(id)))];
  const [names, events] = await Promise.all([
    namesOfUsers(ctx, [...rows.map((row) => str(row.actor_user_id) ?? ""), ...topActors.map(([id]) => id)]),
    eventIds.length ? supabase.from("events").select("id,name").in("id", eventIds).abortSignal(signal) : Promise.resolve({ data: [] as Row[], error: null }),
  ]);
  if (events.error) throw events.error;
  const eventName = new Map(((events.data as Row[] | null) ?? []).map((row) => [String(row.id), String(row.name ?? "")]));
  const societyName = new Map(societies.rows.map((row) => [String(row.id), String(row.name ?? "")]));

  return {
    ...head,
    available: true as const,
    since: audit.since,
    partial: facets.truncated,
    summary: {
      total: compare(current.length, before.length),
      people: compare(peopleOf(current).size, peopleOf(before).size),
      byAction: sorted(tallyLabels(current.map((row) => str(row.action)))),
      byEntity: sorted(tallyLabels(current.map((row) => str(row.entity_type)))),
      topActors: topActors.map(([id, count]) => ({ id, name: names.get(id) || null, count })),
    },
    series: {
      current: countByDay(current.map((row) => str(row.occurred_at)), window).map((point) => point.value),
      previous: countByDay(before.map((row) => str(row.occurred_at)), window.previous).map((point) => point.value),
    },
    societies: societies.rows.map((row) => ({ id: String(row.id), name: String(row.name ?? "") })).sort((a, b) => a.name.localeCompare(b.name)),
    filters: { action, entity, society: societyId, event: eventId, q },
    page,
    pageSize: listPageSize,
    total: listed.count ?? rows.length,
    entries: rows.map((row) => {
      const actorId = str(row.actor_user_id);
      return {
        id: String(row.id),
        at: str(row.occurred_at),
        actorId,
        actorName: actorId ? names.get(actorId) || null : null,
        actorEmail: str(row.actor_email),
        action: String(row.action ?? ""),
        entityType: String(row.entity_type ?? ""),
        summary: row.summary ? maskPersonal(String(row.summary)) : null,
        societyId: str(row.organization_id),
        society: societyName.get(String(row.organization_id)) ?? null,
        eventId: str(row.event_id),
        event: eventName.get(String(row.event_id)) ?? null,
      };
    }),
  };
}

/** One audit entry in full, read-only: who, what, where, and the before and after values, scrubbed. */
export async function readAuditEntry(ctx: ReadContext) {
  const id = String(ctx.query.id ?? "");
  if (!/^\d{1,18}$/.test(id)) notFound();
  const { supabase, signal } = ctx;
  const l = loaders(ctx);
  const audit = await l.audit();
  if (!audit.available) notFound();

  const { data, error } = await supabase
    .from("audit_log")
    .select("id,occurred_at,actor_user_id,actor_email,action,entity_type,entity_id,summary,changes,organization_id,event_id,request_id")
    .eq("id", id)
    .abortSignal(signal)
    .maybeSingle();
  if (error) throw error;
  if (!data) notFound();
  const row = data as Row;

  const requestId = str(row.request_id);
  const [related, societies] = await Promise.all([
    requestId
      ? supabase.from("audit_log").select("id,occurred_at,action,entity_type,summary").eq("request_id", requestId).neq("id", id).order("occurred_at").order("id").limit(20).abortSignal(signal)
      : Promise.resolve({ data: [] as Row[], error: null }),
    l.societies(),
  ]);
  if (related.error) throw related.error;

  const actorId = str(row.actor_user_id);
  const eventId = str(row.event_id);
  const [names, event] = await Promise.all([
    namesOfUsers(ctx, [actorId ?? ""]),
    eventId ? supabase.from("events").select("name").eq("id", eventId).abortSignal(signal).maybeSingle() : Promise.resolve({ data: null, error: null }),
  ]);
  const scrubbed = scrubChanges(row.changes ?? null);

  return {
    observedAt: new Date().toISOString(),
    entry: {
      id: String(row.id),
      at: str(row.occurred_at),
      actorId,
      actorName: actorId ? names.get(actorId) || null : null,
      actorEmail: str(row.actor_email),
      action: String(row.action ?? ""),
      entityType: String(row.entity_type ?? ""),
      entityId: row.entity_id ? maskPersonal(String(row.entity_id)) : null,
      summary: row.summary ? maskPersonal(String(row.summary)) : null,
      societyId: str(row.organization_id),
      society: societies.rows.find((society) => String(society.id) === str(row.organization_id))?.name ?? null,
      eventId,
      event: ((event.data as Row | null)?.name as string | undefined) ?? null,
      requestId,
    },
    changes: scrubbed.value,
    hiddenValues: scrubbed.hidden,
    sameRequest: ((related.data as Row[] | null) ?? []).map((item) => ({
      id: String(item.id),
      at: str(item.occurred_at),
      action: String(item.action ?? ""),
      entityType: String(item.entity_type ?? ""),
      summary: item.summary ? maskPersonal(String(item.summary)) : null,
    })),
  };
}

/* ---------------------------------------------------------------------------------------------------------- */
/* Visits                                                                                                       */
/* ---------------------------------------------------------------------------------------------------------- */

async function readVisitsView(ctx: ReadContext) {
  const now = Date.now();
  const window = windowFrom(ctx);
  const l = loaders(ctx);
  const { supabase, signal } = ctx;
  const head = base(ctx, "visits");

  const who = readChoice(ctx.query.who, ["all", "signed_in", "guests"] as const, "all");
  const eventId = isUuid(ctx.query.event) ? String(ctx.query.event) : null;
  const page = readPage(ctx.query.page);
  const start = (page - 1) * listPageSize;

  const [visits, since] = await Promise.all([l.visits(window.previous.from), l.visitsSince()]);
  if (visits.missing) return { ...head, available: false as const, since: null };

  let list = supabase
    .from("event_visits")
    .select("id,event_id,user_id,started_at,last_seen_at,page_views,device,browser", { count: "exact" })
    .gte("started_at", window.from)
    .lt("started_at", window.to);
  if (who === "signed_in") list = list.not("user_id", "is", null);
  if (who === "guests") list = list.is("user_id", null);
  if (eventId) list = list.eq("event_id", eventId);
  const [listed, events, societies] = await Promise.all([
    list.order("started_at", { ascending: false }).order("id", { ascending: false }).range(start, start + listPageSize - 1).abortSignal(signal),
    l.events(now),
    l.societies(),
  ]);
  if (listed.error) throw listed.error;

  const started = visits.rows.filter((visit) => inWindow(visit.started_at, window));
  const startedBefore = visits.rows.filter((visit) => inWindow(visit.started_at, window.previous));
  const people = activePeople(visits.rows, window).size;
  const rows = (listed.data as Row[] | null) ?? [];
  const names = await namesOfUsers(ctx, rows.map((row) => str(row.user_id) ?? ""));
  const eventOf = new Map(events.rows.map((event) => [event.id, event]));
  const societyName = new Map(societies.rows.map((row) => [String(row.id), String(row.name ?? "")]));

  return {
    ...head,
    available: true as const,
    since,
    partial: visits.truncated,
    summary: {
      visits: compare(started.length, startedBefore.length),
      people,
      guests: started.filter((visit) => !visit.user_id).length,
      length: visitLength(started),
    },
    series: {
      current: countByDay(started.map((visit) => visit.started_at), window).map((point) => point.value),
      previous: countByDay(startedBefore.map((visit) => visit.started_at), window.previous).map((point) => point.value),
    },
    events: events.rows.map((event) => ({ id: event.id, name: event.name })).sort((a, b) => a.name.localeCompare(b.name)),
    filters: { who, event: eventId },
    page,
    pageSize: listPageSize,
    total: listed.count ?? rows.length,
    visits: rows.map((row) => {
      const event = eventOf.get(String(row.event_id));
      const seconds = (Date.parse(str(row.last_seen_at) ?? str(row.started_at) ?? "") - Date.parse(str(row.started_at) ?? "")) / 1000;
      const userId = str(row.user_id);
      return {
        id: String(row.id),
        eventId: str(row.event_id),
        event: event?.name ?? null,
        society: event ? societyName.get(event.societyId) ?? null : null,
        person: userId ? names.get(userId) || "Signed-in person" : null,
        startedAt: str(row.started_at),
        seconds: Number.isFinite(seconds) && seconds >= 1 ? Math.round(seconds) : null,
        pages: Number(row.page_views ?? 0) || null,
        device: str(row.device),
        browser: str(row.browser),
      };
    }),
  };
}

/* ---------------------------------------------------------------------------------------------------------- */
/* Attempts to open this area                                                                                   */
/* ---------------------------------------------------------------------------------------------------------- */

async function readAccessView(ctx: ReadContext) {
  const window = windowFrom(ctx);
  const { supabase, signal } = ctx;
  const head = base(ctx, "access");

  const outcome = readChoice(ctx.query.outcome, ["all", "allowed", "refused"] as const, "all");
  const page = readPage(ctx.query.page);
  const start = (page - 1) * listPageSize;

  let list = supabase
    .from("platform_access_log")
    .select("id,occurred_at,outcome,reason,part,user_id", { count: "exact" })
    .gte("occurred_at", window.from)
    .lt("occurred_at", window.to);
  if (outcome !== "all") list = list.eq("outcome", outcome);
  const listed = await list.order("occurred_at", { ascending: false }).order("id", { ascending: false }).range(start, start + listPageSize - 1).abortSignal(signal);
  if (listed.error) {
    if (isMissing(listed.error)) return { ...head, available: false as const, since: null };
    throw listed.error;
  }

  const countOf = async (kind: "allowed" | "refused") => {
    const { count, error } = await supabase
      .from("platform_access_log")
      .select("id", { count: "exact", head: true })
      .eq("outcome", kind)
      .gte("occurred_at", window.from)
      .lt("occurred_at", window.to)
      .abortSignal(signal);
    if (error) throw error;
    return count ?? 0;
  };
  const refusedRead = await readAll(
    (a, b) => supabase.from("platform_access_log").select("user_id").eq("outcome", "refused").gte("occurred_at", window.from).lt("occurred_at", window.to).order("id").range(a, b).abortSignal(signal),
    5000,
  );
  const [allowed, refused, firstRow] = await Promise.all([
    countOf("allowed"),
    countOf("refused"),
    supabase.from("platform_access_log").select("occurred_at").order("occurred_at").limit(1).abortSignal(signal),
  ]);
  const rows = (listed.data as Row[] | null) ?? [];
  const names = await namesOfUsers(ctx, rows.map((row) => str(row.user_id) ?? ""));

  return {
    ...head,
    available: true as const,
    since: str(((firstRow.data as Row[] | null) ?? [])[0]?.occurred_at),
    summary: {
      allowed,
      refused,
      refusedPeople: new Set(refusedRead.rows.map((row) => str(row.user_id)).filter(Boolean)).size,
    },
    filters: { outcome },
    page,
    pageSize: listPageSize,
    total: listed.count ?? rows.length,
    attempts: rows.map((row) => {
      const userId = str(row.user_id);
      return {
        id: String(row.id),
        at: str(row.occurred_at),
        outcome: String(row.outcome ?? ""),
        reason: String(row.reason ?? ""),
        part: str(row.part),
        person: userId ? names.get(userId) || "Signed-in person" : null,
      };
    }),
  };
}
