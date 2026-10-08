import { formatEventDate } from "@/features/dashboard/dashboard-utils";
import { eventTypeLabel } from "@/features/society/event-type-style";
import { eventEndInstant, eventStartInstant, getEventStatus, type EventStatus } from "@/lib/event-status";
import { hasModule, type SocietyEvent } from "@/lib/society";

/**
 * The pure decisions behind a society's event cards - what a card is called to
 * do, how its dates read, which event leads the page, and which events belong
 * in front of a resident at all.
 *
 * A plain `.ts` module rather than living beside the components, for the
 * reason `src/lib/event-path.ts` gives: a file exporting both components and
 * helpers trips react-refresh. It also means all of this is checkable without
 * rendering anything.
 */

/** What the card invites you to do. Depends on where the event is in its life
 *  and what it has - never a flat "View Event" on everything. */
export function callToAction(event: SocietyEvent, status: EventStatus) {
  if (status === "cancelled") return "See details";
  if (status === "completed") return "Relive the event";
  if (status === "live") return "See what's happening";
  if (event.eventType === "sports" && hasModule(event, "teams")) return "View tournament";
  return "Explore";
}

export function dateRange(event: { startDate: string; endDate: string }) {
  const start = formatEventDate(event.startDate);
  if (!event.endDate || event.endDate === event.startDate) return start;
  return `${start} – ${formatEventDate(event.endDate)}`;
}

/** "08–09 NOV · SPORTS" - the card's eyebrow. The type goes here rather than
 *  in a status badge: inside the Upcoming tab, "Upcoming" on every card is a
 *  word repeated for no information, while the kind of event is the thing
 *  somebody is actually scanning for. */
export function eventEyebrow(event: SocietyEvent) {
  return `${compactDateRange(event).toUpperCase()} · ${eventTypeLabel(event.eventType).toUpperCase()}`;
}

/** "8–9 Nov", "24 Oct", "31 Dec – 1 Jan" - shorter than `dateRange`, because
 *  an eyebrow sits above a title and must not compete with it. */
export function compactDateRange(event: { startDate: string; endDate: string }) {
  const start = parse(event.startDate);
  const end = parse(event.endDate);
  if (!start) return "";
  if (!end || event.startDate === event.endDate) return `${start.day} ${start.month}`;
  if (start.month === end.month) return `${start.day}–${end.day} ${start.month}`;
  return `${start.day} ${start.month} – ${end.day} ${end.month}`;
}

function parse(date: string) {
  if (!date) return null;
  const [, month, day] = date.split("-");
  if (!month || !day) return null;
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return { day: String(Number(day)), month: months[Number(month) - 1] ?? "" };
}

/**
 * The one event worth leading with, chosen from the data rather than named.
 *
 *   1. an event happening now - what somebody opening the app is most likely here for
 *   2. the nearest upcoming one
 *   3. failing both, the most recently completed, so a society between events
 *      still leads with something rather than an empty frame
 *
 * Draft and cancelled are never featured: one is not announced, the other is
 * not happening.
 */
export function pickFeaturedEvent(events: SocietyEvent[], now = new Date()): SocietyEvent | null {
  const withStatus = events
    .map((event) => ({ event, status: getEventStatus(event, now) }))
    .filter(({ status }) => status !== "draft" && status !== "cancelled");

  const byStatus = (wanted: EventStatus) => withStatus.filter(({ status }) => status === wanted);

  const live = byStatus("live");
  // Several at once: the one that ends soonest, because it stops being
  // relevant first.
  if (live.length) {
    return live.sort((a, b) => eventEndInstant(a.event.endDate, a.event.endTime) - eventEndInstant(b.event.endDate, b.event.endTime))[0].event;
  }

  const upcoming = byStatus("upcoming");
  if (upcoming.length) {
    return upcoming.sort(
      (a, b) => eventStartInstant(a.event.startDate, a.event.startTime) - eventStartInstant(b.event.startDate, b.event.startTime),
    )[0].event;
  }

  const completed = byStatus("completed");
  if (completed.length) {
    return completed.sort(
      (a, b) => eventEndInstant(b.event.endDate, b.event.endTime) - eventEndInstant(a.event.endDate, a.event.endTime),
    )[0].event;
  }

  return null;
}

/**
 * Which events belong in front of a resident browsing their society.
 *
 * **Drafts never appear here, for anybody.** A draft is the committee's own
 * working copy; showing it on the discovery page - even to the admin who made
 * it - puts an unannounced event among the real ones. It belongs to organizer
 * management, which is a separate surface.
 *
 * **A cancelled event appears only while its dates are still ahead.** People
 * were told it was happening and need to know it is not, so removing it
 * outright would leave them expecting it. Once its date has passed there is
 * nothing left to correct, so it drops out rather than sitting in Past
 * forever as an administrative record of something that never happened.
 */
export function residentVisibleEvents(events: SocietyEvent[], now = new Date()) {
  return events.filter((event) => {
    const status = getEventStatus(event, now);
    if (status === "draft") return false;
    if (status === "cancelled") return eventEndInstant(event.endDate, event.endTime) >= now.getTime();
    return true;
  });
}

/** "November 2026" - the heading above a month's events. The year is included
 *  only when it is not the current one, which is what stops every heading
 *  carrying a year nobody needed. */
export function monthHeading(date: string, now = new Date()) {
  const [year, month] = date.split("-").map(Number);
  if (!year || !month) return "";
  const names = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  const name = names[month - 1] ?? "";
  return year === now.getFullYear() ? name : `${name} ${year}`;
}

/**
 * Upcoming events under month headings.
 *
 * Only worth it once there is enough to scan: below the threshold a heading
 * per event is more furniture than help, so the list stays flat.
 */
export function groupByMonth(events: SocietyEvent[], now = new Date()) {
  if (events.length < 4) return [{ key: "", heading: "", events }];

  const groups: { key: string; heading: string; events: SocietyEvent[] }[] = [];
  for (const event of events) {
    const key = event.startDate.slice(0, 7);
    const last = groups.at(-1);
    if (last?.key === key) last.events.push(event);
    else groups.push({ key, heading: monthHeading(event.startDate, now), events: [event] });
  }
  return groups;
}
