import {
  activePeople,
  activePeopleByDay,
  activityLevels,
  compare,
  countByDay,
  daysIn,
  inWindow,
  median,
  mergeSmall,
  signupCohorts,
  tallyLabels,
  visitLength,
} from "../../shared/platform-metrics.js";
import { loaders, readAll, str, windowFrom, windowJson, type ReadContext } from "./platform-reads.js";

/**
 * Analytics - traffic, devices, pages, retention, and event activity, each measured separately and labelled with
 * what it actually counts. Same rules as the other reads (owner check first, read-only, named columns, one
 * 5-second signal, a missing table is "unavailable" rather than zero).
 *
 * Definitions that are easy to get wrong, so they are written down here and on the page:
 * - **Visits** are visits to event pages that began in the period. A visit is one browser session on one event.
 * - **Active people** (DAU, WAU, MAU) are distinct signed-in people with a visit overlapping the last 1, 7 and 30
 *   IST days, counted from the visit records, never estimated from visit totals.
 * - **Devices, browsers and places** merge any group under five people-visits into "Other", so no group of one or
 *   two is ever shown on its own. No IP address is stored anywhere, so none is used.
 * - **Event money** is what societies record against their own events. It is not Sympal revenue and is never
 *   labelled so. Only totals by status and by event are returned: no names, flats or references.
 */

const dayMs = 24 * 60 * 60 * 1000;
const minGroup = 5;

export async function readAnalytics(ctx: ReadContext) {
  const now = Date.now();
  const window = windowFrom(ctx);
  const l = loaders(ctx);
  const { supabase, signal } = ctx;

  // MAU needs 30 days and the 30 before them; a short range still gets that, a long range already reaches further.
  const sixty = new Date(Date.parse(window.to) - 60 * dayMs).toISOString();
  const visitsFrom = window.previous.from < sixty ? window.previous.from : sixty;

  const [visits, visitsSince, dims, pageViews, bookings, contributions, users, events, societies] = await Promise.all([
    l.visits(visitsFrom),
    l.visitsSince(),
    readAll(
      (a, b) =>
        supabase
          .from("event_visits")
          .select("started_at,user_id,device,browser,country,city,page_views")
          .gte("started_at", window.previous.from)
          .lt("started_at", window.to)
          .order("started_at")
          .order("id")
          .range(a, b)
          .abortSignal(signal),
      40_000,
    ),
    readAll(
      (a, b) =>
        supabase.from("event_page_views").select("page_key,seconds,opened_at").gte("opened_at", window.from).lt("opened_at", window.to).order("opened_at").order("id").range(a, b).abortSignal(signal),
      40_000,
    ),
    readAll(
      (a, b) =>
        supabase
          .from("event_registrations")
          .select("event_id,status,payment_status,adults,children,created_at")
          .gte("created_at", window.previous.from)
          .lt("created_at", window.to)
          .order("created_at")
          .order("id")
          .range(a, b)
          .abortSignal(signal),
      50_000,
    ),
    readAll(
      (a, b) =>
        supabase
          .from("contributions")
          .select("event_id,status,received_amount,created_at")
          .gte("created_at", window.from)
          .lt("created_at", window.to)
          .order("created_at")
          .order("id")
          .range(a, b)
          .abortSignal(signal),
      50_000,
    ),
    readAll((a, b) => supabase.from("app_users").select("id,created_at").order("created_at").order("id").range(a, b).abortSignal(signal), 50_000),
    l.events(now),
    l.societies(),
  ]);

  const eventOf = new Map(events.rows.map((event) => [event.id, event]));
  const societyName = new Map(societies.rows.map((row) => [String(row.id), String(row.name ?? "")]));
  const labelEvent = (id: string) => {
    const event = eventOf.get(id);
    return { id, name: event?.name ?? "Deleted event", society: event ? societyName.get(event.societyId) ?? "" : "" };
  };

  /* ---- Visits and people ---------------------------------------------------------------------------- */
  let traffic = null as null | Record<string, unknown>;
  let levels = null as null | ReturnType<typeof activityLevels>;
  let cohorts: ReturnType<typeof signupCohorts> | null = null;
  let devices = null as null | { label: string; count: number }[];
  let browsers = null as null | { label: string; count: number }[];
  let cities = null as null | { label: string; count: number }[];
  let countries = null as null | { label: string; count: number }[];

  if (!visits.missing) {
    const rows = visits.rows;
    const started = rows.filter((visit) => inWindow(visit.started_at, window));
    const startedBefore = rows.filter((visit) => inWindow(visit.started_at, window.previous));
    levels = activityLevels(rows, window.to);
    const lastThirty = { from: new Date(Date.parse(window.to) - 30 * dayMs).toISOString(), to: window.to };
    cohorts = signupCohorts(
      users.rows.map((row) => ({ id: String(row.id), created_at: str(row.created_at) })),
      activePeople(rows, lastThirty),
    );
    traffic = {
      visits: compare(started.length, startedBefore.length),
      people: compare(activePeople(rows, window).size, activePeople(rows, window.previous).size),
      guests: started.filter((visit) => !visit.user_id).length,
      length: visitLength(started),
      series: {
        visits: {
          current: countByDay(started.map((visit) => visit.started_at), window).map((point) => point.value),
          previous: countByDay(startedBefore.map((visit) => visit.started_at), window.previous).map((point) => point.value),
        },
        people: {
          current: activePeopleByDay(rows, window).map((point) => point.value),
          previous: activePeopleByDay(rows, window.previous).map((point) => point.value),
        },
      },
    };
    const inThis = dims.rows.filter((row) => inWindow(str(row.started_at), window));
    devices = mergeSmall(tallyLabels(inThis.map((row) => str(row.device))), minGroup);
    browsers = mergeSmall(tallyLabels(inThis.map((row) => str(row.browser))), minGroup);
    cities = mergeSmall(tallyLabels(inThis.map((row) => str(row.city))), minGroup);
    countries = mergeSmall(tallyLabels(inThis.map((row) => str(row.country))), minGroup);
  }

  /* ---- Pages ---------------------------------------------------------------------------------------- */
  let pages = null as null | { page: string; views: number; medianSeconds: number | null }[];
  if (!pageViews.missing) {
    const byPage = new Map<string, { views: number; seconds: number[] }>();
    for (const row of pageViews.rows) {
      const key = String(row.page_key ?? "unknown");
      const entry = byPage.get(key) ?? { views: 0, seconds: [] };
      entry.views += 1;
      const seconds = Number(row.seconds);
      if (row.seconds !== null && row.seconds !== undefined && Number.isFinite(seconds) && seconds >= 1) entry.seconds.push(seconds);
      byPage.set(key, entry);
    }
    pages = [...byPage]
      .map(([page, entry]) => ({ page, views: entry.views, medianSeconds: median(entry.seconds) }))
      .sort((a, b) => b.views - a.views || a.page.localeCompare(b.page))
      .slice(0, 12);
  }

  /* ---- Bookings ------------------------------------------------------------------------------------- */
  let bookingsOut = null as null | Record<string, unknown>;
  if (!bookings.missing) {
    const active = bookings.rows.filter((row) => row.status === "active");
    const now_ = active.filter((row) => inWindow(str(row.created_at), window));
    const before = active.filter((row) => inWindow(str(row.created_at), window.previous));
    const perEvent = new Map<string, { bookings: number; people: number }>();
    const payments: Record<string, number> = {};
    for (const row of now_) {
      const id = String(row.event_id);
      const entry = perEvent.get(id) ?? { bookings: 0, people: 0 };
      entry.bookings += 1;
      entry.people += Number(row.adults ?? 0) + Number(row.children ?? 0);
      perEvent.set(id, entry);
      payments[String(row.payment_status)] = (payments[String(row.payment_status)] ?? 0) + 1;
    }
    bookingsOut = {
      bookings: compare(now_.length, before.length),
      people: compare(
        now_.reduce((sum, row) => sum + Number(row.adults ?? 0) + Number(row.children ?? 0), 0),
        before.reduce((sum, row) => sum + Number(row.adults ?? 0) + Number(row.children ?? 0), 0),
      ),
      payments,
      series: {
        current: countByDay(now_.map((row) => str(row.created_at)), window).map((point) => point.value),
        previous: countByDay(before.map((row) => str(row.created_at)), window.previous).map((point) => point.value),
      },
      top: [...perEvent]
        .sort((a, b) => b[1].bookings - a[1].bookings || b[1].people - a[1].people)
        .slice(0, 8)
        .map(([id, entry]) => ({ ...labelEvent(id), bookings: entry.bookings, people: entry.people })),
      partial: bookings.truncated,
    };
  }

  /* ---- Event money (never revenue) ------------------------------------------------------------------ */
  let money = null as null | Record<string, unknown>;
  if (!contributions.missing) {
    const byStatus = new Map<string, { count: number; received: number }>();
    const perEvent = new Map<string, { count: number; received: number }>();
    for (const row of contributions.rows) {
      const status = String(row.status ?? "Unknown");
      const received = Number(row.received_amount ?? 0) || 0;
      const entry = byStatus.get(status) ?? { count: 0, received: 0 };
      entry.count += 1;
      entry.received += received;
      byStatus.set(status, entry);
      const id = String(row.event_id);
      const own = perEvent.get(id) ?? { count: 0, received: 0 };
      own.count += 1;
      own.received += received;
      perEvent.set(id, own);
    }
    money = {
      byStatus: [...byStatus].map(([status, entry]) => ({ status, ...entry })).sort((a, b) => b.count - a.count),
      top: [...perEvent]
        .sort((a, b) => b[1].received - a[1].received || b[1].count - a[1].count)
        .slice(0, 8)
        .map(([id, entry]) => ({ ...labelEvent(id), ...entry })),
      partial: contributions.truncated,
    };
  }

  return {
    observedAt: new Date(now).toISOString(),
    window: windowJson(window),
    days: daysIn(window),
    coverage: {
      visitsAvailable: !visits.missing,
      visitsSince,
      visitsPartial: visits.truncated || dims.truncated,
      pagesAvailable: !pageViews.missing,
      bookingsAvailable: !bookings.missing,
      moneyAvailable: !contributions.missing,
    },
    levels,
    traffic,
    devices,
    browsers,
    countries,
    cities,
    pages,
    retention: cohorts ? { cohorts, activeDays: 30 } : null,
    bookings: bookingsOut,
    money,
  };
}
