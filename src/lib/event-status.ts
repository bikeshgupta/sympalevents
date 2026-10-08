/**
 * What state an event is in - the single authority, for every surface.
 *
 * Before this, the only answer was `getEventPhase()` in dashboard-utils, which
 * returned `before | during | after` from the dates alone. That is still what
 * the dashboard widgets want, and it still exists; it now delegates here, so
 * there is exactly one place that compares a date to the clock.
 *
 * The event's own timezone primitives live here too, for the same reason: they
 * are what the comparison is made of, and splitting them from it is how two
 * answers to the same question start to drift. `dashboard-utils` re-exports
 * them, so every existing import keeps working.
 *
 * ## Precedence, in order
 *
 * 1. `statusOverride === "draft"`     -> **draft**      (not announced yet)
 * 2. `statusOverride === "cancelled"` -> **cancelled**  (called off)
 * 3. `isClosed === true`              -> **completed**  (see below)
 * 4. `now > end`                      -> **completed**
 * 5. `now < start`                    -> **upcoming**
 * 6. otherwise                        -> **live**
 *
 * ## Start and end are an instant, not just a day
 *
 * `start` is the start date at the start time, and `end` is the end date at
 * the end time - both read on the event's own clock (Asia/Kolkata). An event
 * with no times set means the whole of its days: it starts at 00:00 on the
 * first and ends at 23:59:59 on the last, which is exactly what this file did
 * before times existed, so no event made without them changes state. A 6 pm
 * event is therefore upcoming until 6 pm on the day, live until it ends, and
 * completed after - not "live" from midnight.
 *
 * ## Why `isClosed` outranks the dates
 *
 * `event_closing.is_closed` is not "the end date has passed" - that is what
 * rule 4 is for. It is the committee's own switch, flipped on `/closing`, and
 * it means "we have wrapped this up": the thank-you note is written and the
 * closing page is ready to take over the dashboard. It is deliberately
 * independent of the calendar in both directions - a committee is often still
 * collecting photographs a week after the end date and does not want the
 * closing page taking over yet, and may equally wrap up early.
 *
 * So it is an OR with rule 4, never a replacement for it: an event past its
 * end date reads as completed whether or not anybody flipped the switch, and
 * an event the committee has closed reads as completed whether or not the
 * dates agree. Nothing here changes what `is_closed` does on the dashboard -
 * it still drives the hero badge and the closed layout exactly as before.
 */

const KOLKATA_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** A date column ("2026-09-14") plus an optional "HH:MM[:SS]", as a UTC
 *  timestamp read in the event's zone. */
export function toEventZoneTimestamp(date: string, time = "00:00") {
  const [year, month, day] = date.split("-").map(Number);
  const [hours = 0, minutes = 0, seconds = 0] = time.split(":").map(Number);
  return Date.UTC(year, month - 1, day, hours, minutes, seconds) - KOLKATA_OFFSET_MS;
}

/** Today, in the event's zone. `toISOString().slice(0, 10)` on an IST-midnight
 *  timestamp hands anyone west of India the previous day. */
export function getDateInEventZone(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

/** The dashboard's three-way view of the same question. */
export type EventPhase = "before" | "during" | "after";

/** The optional hours of an event, `HH:MM` (or `HH:MM:SS`) in the event's zone.
 *  Null or blank means "the whole day". */
export type EventTimes = {
  startTime?: string | null;
  endTime?: string | null;
};

/** The instant an event opens: its first day at its start time, else midnight. */
export function eventStartInstant(startDate: string, startTime?: string | null) {
  return toEventZoneTimestamp(startDate, startTime?.trim() || "00:00");
}

/** The instant an event ends: its last day at its end time, else the last
 *  second of that day. */
export function eventEndInstant(endDate: string, endTime?: string | null) {
  const clock = endTime?.trim();
  if (!clock) return toEventZoneTimestamp(endDate, "23:59:59");
  // "21:00" ends at 21:00:00 sharp, not at the end of that minute.
  return toEventZoneTimestamp(endDate, clock.split(":").length < 3 ? `${clock}:00` : clock);
}

/** Dates and hours against the clock, and nothing else. The one comparison in
 *  the app. */
export function datePhase(startDate: string, endDate: string, now = new Date(), times: EventTimes = {}): EventPhase {
  const currentMs = now.getTime();
  if (currentMs < eventStartInstant(startDate, times.startTime)) return "before";
  if (currentMs > eventEndInstant(endDate, times.endTime)) return "after";
  return "during";
}

export type EventStatus = "draft" | "upcoming" | "live" | "completed" | "cancelled";

/** The only two states a date cannot express, so the only two that are stored.
 *  `events.status_override`; null means "ask the calendar". */
export type EventStatusOverride = "draft" | "cancelled" | null;

/**
 * Just enough of an event to place it. Structural rather than `AppEvent`, so
 * the society list's lightweight summary rows can be passed straight in
 * without being inflated into whole events first.
 */
export type EventStatusInput = {
  startDate: string;
  endDate: string;
  /** Hours of the first and last day; absent or null means the whole day. */
  startTime?: string | null;
  endTime?: string | null;
  statusOverride?: EventStatusOverride;
  /** `event_closing.is_closed` - the committee's wrapped-up switch. */
  isClosed?: boolean | null;
};

export function getEventStatus(event: EventStatusInput, now = new Date()): EventStatus {
  if (event.statusOverride === "draft") return "draft";
  if (event.statusOverride === "cancelled") return "cancelled";
  if (event.isClosed) return "completed";

  const phase = datePhase(event.startDate, event.endDate, now, event);
  if (phase === "after") return "completed";
  if (phase === "before") return "upcoming";
  return "live";
}

/** What a resident sees on a badge. */
export const statusLabels: Record<EventStatus, string> = {
  draft: "Draft",
  upcoming: "Upcoming",
  live: "Live now",
  completed: "Completed",
  cancelled: "Cancelled",
};

/**
 * A draft is the committee's own working copy and is never shown to anybody
 * else - see `visibleToResidents` below. Cancelled is shown, struck through
 * rather than deleted: an event people were told about and then called off is
 * worse than useless if it simply vanishes, because they go on expecting it.
 */
export function visibleToResidents(status: EventStatus, canManage: boolean) {
  if (status === "draft") return canManage;
  return true;
}

/** Society Home's three groups. Cancelled sits with its dates, so a called-off
 *  event stays where people expect to find it rather than moving to Past. */
export type EventGroup = "ongoing" | "upcoming" | "past";

export function groupForStatus(status: EventStatus, event: EventStatusInput, now = new Date()): EventGroup {
  if (status === "live") return "ongoing";
  if (status === "completed") return "past";
  if (status === "upcoming") return "upcoming";
  // draft and cancelled follow their dates.
  const phase = datePhase(event.startDate, event.endDate, now, event);
  return phase === "after" ? "past" : phase === "before" ? "upcoming" : "ongoing";
}
