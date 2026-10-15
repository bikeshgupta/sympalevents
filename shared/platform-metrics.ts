/**
 * The Platform Control Center's counting rules, as pure functions over rows already read from the database.
 * Everything here is tested (tests/platform-metrics.test.mjs) and has no imports, so the API and the tests run
 * the same code. Event status is NOT decided here: the API passes in the status `getEventStatus()` gave.
 *
 * Definitions that matter (docs/platform-control-center.md, section 3):
 * - A day is an IST calendar day.
 * - An active person in a window is a signed-in user with at least one visit that overlaps it
 *   (`started_at < to` and `last_seen_at >= from`). Visits only exist for event pages today, so this is
 *   "active on event pages"; nothing is estimated from visit counts.
 * - A society is active in a window if one of its events was created, or was on (between its start and end, and
 *   neither draft nor cancelled), or somebody joined it, or somebody visited its event pages, inside the window.
 */

const istOffsetMs = 5.5 * 60 * 60 * 1000;
const dayMs = 24 * 60 * 60 * 1000;

export type Window = { from: string; to: string };

/** The IST calendar day of an ISO instant, as YYYY-MM-DD; null for anything unreadable. */
export function istDayOf(value: string | null | undefined): string | null {
  if (!value) return null;
  const time = Date.parse(value);
  if (Number.isNaN(time)) return null;
  return new Date(time + istOffsetMs).toISOString().slice(0, 10);
}

/** Every IST day in `[from, to)`, in order. */
export function daysIn(window: Window): string[] {
  const days: string[] = [];
  for (let time = Date.parse(window.from); time < Date.parse(window.to); time += dayMs) {
    days.push(new Date(time + istOffsetMs).toISOString().slice(0, 10));
  }
  return days;
}

export const inWindow = (value: string | null | undefined, window: Window) =>
  Boolean(value) && value! >= window.from && value! < window.to;

/** How many instants fall on each IST day of the window. Days with none are 0: a counted absence, not a gap. */
export function countByDay(values: (string | null | undefined)[], window: Window): { day: string; value: number }[] {
  const counts = new Map(daysIn(window).map((day) => [day, 0]));
  for (const value of values) {
    if (!inWindow(value, window)) continue;
    const day = istDayOf(value)!;
    if (counts.has(day)) counts.set(day, counts.get(day)! + 1);
  }
  return [...counts].map(([day, value]) => ({ day, value }));
}

export type VisitRow = { event_id: string | null; user_id: string | null; started_at: string; last_seen_at: string | null };

const overlaps = (visit: VisitRow, window: Window) =>
  visit.started_at < window.to && (visit.last_seen_at ?? visit.started_at) >= window.from;

/** Distinct signed-in people with a visit overlapping the window. */
export function activePeople(visits: VisitRow[], window: Window): Set<string> {
  const people = new Set<string>();
  for (const visit of visits) if (visit.user_id && overlaps(visit, window)) people.add(visit.user_id);
  return people;
}

/** Distinct signed-in people per IST day: a visit counts on every day it touches. */
export function activePeopleByDay(visits: VisitRow[], window: Window): { day: string; value: number }[] {
  const days = new Map(daysIn(window).map((day) => [day, new Set<string>()]));
  for (const visit of visits) {
    if (!visit.user_id || !overlaps(visit, window)) continue;
    const first = istDayOf(visit.started_at > window.from ? visit.started_at : window.from)!;
    const lastInstant = visit.last_seen_at && visit.last_seen_at < window.to ? visit.last_seen_at : new Date(Date.parse(window.to) - 1).toISOString();
    const last = istDayOf(lastInstant)!;
    for (const [day, set] of days) if (day >= first && day <= last) set.add(visit.user_id);
  }
  return [...days].map(([day, set]) => ({ day, value: set.size }));
}

/** A figure against the same-length window before it. `change` is null when there is nothing to compare with. */
export function compare(current: number, previous: number) {
  return { current, previous, change: previous > 0 ? (current - previous) / previous : null };
}

export type EventStatus = "draft" | "upcoming" | "live" | "completed" | "cancelled";

export function tallyStatuses(statuses: EventStatus[]) {
  const tally: Record<EventStatus, number> = { draft: 0, upcoming: 0, live: 0, completed: 0, cancelled: 0 };
  for (const status of statuses) tally[status] += 1;
  return tally;
}

/* ---------------------------------------------------------------------------------------------------------- */
/* Societies                                                                                                    */
/* ---------------------------------------------------------------------------------------------------------- */

export type SocietyLabel = "new" | "active" | "quiet" | "dormant" | "empty";

export type SocietyInput = { id: string; created_at: string };
export type SocietyEventInput = {
  id: string;
  organization_id: string;
  created_at: string | null;
  /** The event's first and last instant (from event-status.ts), or null if its dates are unreadable. */
  startsAt: number | null;
  endsAt: number | null;
  /** Draft or cancelled events never count as "on". */
  countsAsOn: boolean;
};
export type MembershipInput = { organization_id: string; user_id: string; created_at: string | null };

export type SocietyFacts = {
  members: number;
  events: number;
  eventsCreated: number;
  eventsOn: number;
  joined: number;
  visits: number;
  signedInVisitors: number;
  lastActivityAt: string | null;
  active: boolean;
  label: SocietyLabel;
};

/** Ninety days without anything is dormant. */
export const dormantAfterDays = 90;

/**
 * Facts and a label for every society. `visits` should cover at least the window and the 90 days before its end,
 * so "last activity" can see them; the API reads that much.
 */
export function societyFacts(
  societies: SocietyInput[],
  events: SocietyEventInput[],
  memberships: MembershipInput[],
  visits: VisitRow[],
  window: Window,
  now: number,
): Map<string, SocietyFacts> {
  const from = Date.parse(window.from);
  const to = Date.parse(window.to);
  const eventSociety = new Map(events.map((event) => [event.id, event.organization_id]));
  const facts = new Map<string, SocietyFacts>();
  const last = new Map<string, number>();
  const bump = (id: string, at: number | null) => {
    if (at === null || Number.isNaN(at) || at > now) return;
    last.set(id, Math.max(last.get(id) ?? -Infinity, at));
  };
  const visitors = new Map<string, Set<string>>();

  for (const society of societies) {
    facts.set(society.id, { members: 0, events: 0, eventsCreated: 0, eventsOn: 0, joined: 0, visits: 0, signedInVisitors: 0, lastActivityAt: null, active: false, label: "empty" });
    bump(society.id, Date.parse(society.created_at));
  }
  for (const event of events) {
    const fact = facts.get(event.organization_id);
    if (!fact) continue;
    fact.events += 1;
    if (inWindow(event.created_at, window)) fact.eventsCreated += 1;
    if (event.countsAsOn && event.startsAt !== null && event.endsAt !== null && event.startsAt < to && event.endsAt >= from) fact.eventsOn += 1;
    bump(event.organization_id, event.created_at ? Date.parse(event.created_at) : null);
    if (event.countsAsOn && event.endsAt !== null) bump(event.organization_id, Math.min(event.endsAt, now));
  }
  for (const membership of memberships) {
    const fact = facts.get(membership.organization_id);
    if (!fact) continue;
    fact.members += 1;
    if (inWindow(membership.created_at, window)) fact.joined += 1;
    bump(membership.organization_id, membership.created_at ? Date.parse(membership.created_at) : null);
  }
  for (const visit of visits) {
    const societyId = visit.event_id ? eventSociety.get(visit.event_id) : undefined;
    const fact = societyId ? facts.get(societyId) : undefined;
    if (!fact || !societyId) continue;
    if (overlaps(visit, window)) {
      fact.visits += 1;
      if (visit.user_id) {
        const set = visitors.get(societyId) ?? new Set<string>();
        set.add(visit.user_id);
        visitors.set(societyId, set);
      }
    }
    bump(societyId, Date.parse(visit.last_seen_at ?? visit.started_at));
  }

  for (const society of societies) {
    const fact = facts.get(society.id)!;
    fact.signedInVisitors = visitors.get(society.id)?.size ?? 0;
    const lastAt = last.get(society.id);
    fact.lastActivityAt = lastAt === undefined || !Number.isFinite(lastAt) ? null : new Date(lastAt).toISOString();
    fact.active = fact.eventsCreated > 0 || fact.eventsOn > 0 || fact.joined > 0 || fact.visits > 0;
    const created = Date.parse(society.created_at);
    if (created >= from && created < to) fact.label = "new";
    else if (fact.events === 0 && fact.members <= 1) fact.label = "empty";
    else if (fact.active) fact.label = "active";
    else if (lastAt !== undefined && now - lastAt < dormantAfterDays * dayMs) fact.label = "quiet";
    else fact.label = "dormant";
  }
  return facts;
}

/* ---------------------------------------------------------------------------------------------------------- */
/* Request parameters                                                                                           */
/* ---------------------------------------------------------------------------------------------------------- */

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (value: unknown): value is string => typeof value === "string" && uuidPattern.test(value);

/** A search term safe to put in a PostgREST filter: letters (with their marks, so Devanagari survives), digits, spaces and @ . _ - only, at most 60. */
export function cleanSearch(value: unknown): string {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/[^\p{L}\p{M}\p{N}@._\- ]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
}

/** A 1-based page number between 1 and 1000. */
export function readPage(value: unknown): number {
  const page = Number.parseInt(String(value ?? "1"), 10);
  return Number.isFinite(page) ? Math.min(Math.max(page, 1), 1000) : 1;
}

export function readChoice<T extends string>(value: unknown, choices: readonly T[], fallback: T): T {
  return typeof value === "string" && (choices as readonly string[]).includes(value) ? (value as T) : fallback;
}
