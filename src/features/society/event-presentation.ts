import { formatEventDate } from "@/features/dashboard/dashboard-utils";
import { getEventStatus, toEventZoneTimestamp, type EventStatus } from "@/lib/event-status";
import { hasModule, type SocietyEvent } from "@/lib/society";

/**
 * The pure decisions behind a society's event cards - what a card is called
 * to do, how its dates read, and which event leads the page.
 *
 * A plain `.ts` module rather than living beside the components that use it,
 * for the reason `src/lib/event-path.ts` gives: a file that exports both
 * components and helpers trips react-refresh, and the fix is to separate
 * them. It also means these can be checked without rendering anything.
 */

/** What the card invites you to do. It depends on where the event is in its
 *  life and what it has - never a flat "View Event" on everything. */
export function callToAction(event: SocietyEvent, status: EventStatus) {
  if (status === "cancelled") return "See details";
  if (status === "draft") return "Continue setting up";
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

/**
 * The one event worth leading with, chosen from the data rather than named.
 *
 * Priority, and it is only ever this:
 *   1. an event happening now - what somebody opening the app is most likely here for
 *   2. the nearest upcoming one
 *   3. failing both, the most recently completed - so a society between events
 *      still leads with something rather than an empty frame
 *
 * Draft and cancelled are never featured: one is not announced, the other is
 * not happening.
 */
export function pickFeaturedEvent(events: SocietyEvent[], now = new Date()): SocietyEvent | null {
  const withStatus = events
    .map((event) => ({ event, status: getEventStatus(event, now) }))
    .filter(({ status }) => status !== "draft" && status !== "cancelled");

  const live = withStatus.filter(({ status }) => status === "live");
  if (live.length) {
    // Several at once: the one that ends soonest, because it is the one that
    // stops being relevant first.
    return live.sort((a, b) => toEventZoneTimestamp(a.event.endDate) - toEventZoneTimestamp(b.event.endDate))[0].event;
  }

  const upcoming = withStatus.filter(({ status }) => status === "upcoming");
  if (upcoming.length) {
    return upcoming.sort(
      (a, b) => toEventZoneTimestamp(a.event.startDate) - toEventZoneTimestamp(b.event.startDate),
    )[0].event;
  }

  const completed = withStatus.filter(({ status }) => status === "completed");
  if (completed.length) {
    return completed.sort(
      (a, b) => toEventZoneTimestamp(b.event.endDate) - toEventZoneTimestamp(a.event.endDate),
    )[0].event;
  }

  return null;
}
