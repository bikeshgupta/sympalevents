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

/**
 * Compared as instants, not as text: the database writes `…18:30:00+00:00` and the windows are `…18:30:00.000Z`, and
 * as text those order wrongly for a row exactly on an IST midnight.
 */
export const inWindow = (value: string | null | undefined, window: Window) => {
  if (!value) return false;
  const time = Date.parse(value);
  return Number.isFinite(time) && time >= Date.parse(window.from) && time < Date.parse(window.to);
};

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
  Date.parse(visit.started_at) < Date.parse(window.to) && Date.parse(visit.last_seen_at ?? visit.started_at) >= Date.parse(window.from);

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
/* Activity levels, retention and small groups (Phase 3)                                                        */
/* ---------------------------------------------------------------------------------------------------------- */

/**
 * DAU, WAU and MAU: distinct signed-in people with a visit overlapping the last 1, 7 and 30 IST days ending at
 * `to`, each against the span of the same length before it. Counted from the visit records, never estimated from
 * visit totals, so a person who visits ten times is one person. Event pages only (that is all that is recorded).
 */
export function activityLevels(visits: VisitRow[], to: string) {
  const span = (days: number) => {
    const end = Date.parse(to);
    const current = { from: new Date(end - days * dayMs).toISOString(), to };
    const previous = { from: new Date(end - 2 * days * dayMs).toISOString(), to: current.from };
    return compare(activePeople(visits, current).size, activePeople(visits, previous).size);
  };
  const dau = span(1);
  const wau = span(7);
  const mau = span(30);
  return { dau, wau, mau, stickiness: mau.current > 0 ? dau.current / mau.current : null };
}

/** Sign-up months (IST) with how many of that month's sign-ups are in `active`, oldest first, last `months` only. */
export function signupCohorts(users: { id: string; created_at: string | null }[], active: Set<string>, months = 12) {
  const cohorts = new Map<string, { people: number; active: number }>();
  for (const user of users) {
    const day = istDayOf(user.created_at);
    if (!day) continue;
    const month = day.slice(0, 7);
    const cohort = cohorts.get(month) ?? { people: 0, active: 0 };
    cohort.people += 1;
    if (active.has(user.id)) cohort.active += 1;
    cohorts.set(month, cohort);
  }
  return [...cohorts]
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-months)
    .map(([month, cohort]) => ({ month, people: cohort.people, active: cohort.active, share: cohort.people ? cohort.active / cohort.people : null }));
}

export function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/**
 * The median length of the visits that lasted at least a second, with how many that was out of all of them. A
 * visit with a single heartbeat has no measurable length (there is no close-out beat), so it is left out of the
 * median and said so, rather than pulling the figure towards zero.
 */
export function visitLength(visits: { started_at: string; last_seen_at: string | null }[]) {
  const seconds = visits
    .map((visit) => (Date.parse(visit.last_seen_at ?? visit.started_at) - Date.parse(visit.started_at)) / 1000)
    .filter((value) => Number.isFinite(value) && value >= 1);
  return { medianSeconds: median(seconds), measured: seconds.length, total: visits.length };
}

/** Counts of labels; an empty or missing label is "Unknown". */
export function tallyLabels(values: (string | null | undefined)[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const value of values) {
    const label = String(value ?? "").trim() || "Unknown";
    counts[label] = (counts[label] ?? 0) + 1;
  }
  return counts;
}

/**
 * Groups smaller than `min` are folded into "Other", so a group of one or two (a single person's phone or town)
 * is never shown by itself. Sorted largest first, "Other" last.
 */
export function mergeSmall(counts: Record<string, number>, min = 5): { label: string; count: number }[] {
  const kept: { label: string; count: number }[] = [];
  let other = 0;
  for (const [label, count] of Object.entries(counts)) {
    if (count >= min) kept.push({ label, count });
    else other += count;
  }
  kept.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  if (other > 0) kept.push({ label: "Other", count: other });
  return kept;
}

/* ---------------------------------------------------------------------------------------------------------- */
/* Audit values                                                                                                 */
/* ---------------------------------------------------------------------------------------------------------- */

/** Field names whose values are never shown: contact details, flats, payment references, credentials, addresses. */
const hiddenField = /(^|_)(phone|mobile|whatsapp|flat|flat_no|unit|contact|reference|utr|upi|token|secret|password|email|address)(_|$)/i;
const emailPattern = /[^\s@]+@[^\s@]+\.[^\s@]+/g;
const phonePattern = /(?:\+?\d[\s-]?){9,}\d/g;
const hiddenText = "[hidden]";

/** Masks an email address or phone-number-like run inside free text. */
export function maskPersonal(text: string): string {
  return text.replace(emailPattern, hiddenText).replace(phonePattern, hiddenText);
}

/**
 * Makes an audit entry's before-and-after values safe to show the platform owner: values under contact, flat,
 * payment-reference, token, email or address fields are replaced, emails and phone-like numbers inside any text
 * are masked, long text is cut, and depth and length are bounded. `hidden` says how many values were withheld so
 * the page can say so instead of silently dropping them.
 */
export function scrubChanges(value: unknown): { value: unknown; hidden: number } {
  let hidden = 0;
  const walk = (node: unknown, depth: number): unknown => {
    if (node === null || typeof node === "number" || typeof node === "boolean") return node;
    if (typeof node === "string") {
      const masked = maskPersonal(node);
      if (masked !== node) hidden += 1;
      return masked.length > 200 ? `${masked.slice(0, 200)}…` : masked;
    }
    if (depth >= 4) return "…";
    if (Array.isArray(node)) return node.slice(0, 20).map((item) => walk(item, depth + 1));
    if (typeof node === "object") {
      const out: Record<string, unknown> = {};
      for (const [key, inner] of Object.entries(node as Record<string, unknown>).slice(0, 40)) {
        if (hiddenField.test(key)) {
          hidden += 1;
          out[key] = hiddenText;
        } else out[key] = walk(inner, depth + 1);
      }
      return out;
    }
    return String(node);
  };
  return { value: walk(value, 0), hidden };
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
