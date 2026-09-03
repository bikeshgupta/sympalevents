import { announcements as allAnnouncements, type Announcement } from "@/data/announcements";
import { getEventDays, toEventZoneTimestamp } from "@/features/dashboard/dashboard-utils";
import type { AppEvent } from "@/lib/event-data";

export type ResolvedAnnouncement = Announcement & {
  resolvedDate?: string;
};

/**
 * Turns a notice's "Day 3" into the event's real calendar date, so notices stay
 * correct when event dates move. A notice naming a day the event does not have
 * simply loses its date rather than breaking.
 */
export function resolveAnnouncements(event: AppEvent | undefined): ResolvedAnnouncement[] {
  if (!event) return [];
  const days = getEventDays(event);
  const dateFor = (day?: string, date?: string) => date ?? days.find((item) => item.key === day)?.date;

  return allAnnouncements
    .filter((item) => !item.eventId || item.eventId === event.id)
    .map((item) => ({
      ...item,
      resolvedDate: dateFor(item.day, item.date),
    }));
}

/** "2 days 4 hr" / "3 hr 20 min" / "5 min" - the gap, without any prefix.
 *  Exported for reuse by auction countdowns (`closesInLabel` in
 *  src/lib/auctions.ts) - same "how far away is this" formatting either way. */
export function gapLabel(diffMs: number) {
  const totalMinutes = Math.floor(diffMs / 60000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) return `${days} day${days > 1 ? "s" : ""}${hours ? ` ${hours} hr` : ""}`;
  if (hours > 0) return `${hours} hr${minutes ? ` ${minutes} min` : ""}`;
  return `${Math.max(minutes, 1)} min`;
}

/** "in 2 days 4 hr" / "in 3 hr 20 min" / "Happening now" / "Completed". */
export function leadTimeLabel(announcement: ResolvedAnnouncement, now: Date) {
  if (!announcement.resolvedDate) return null;

  const startMs = toEventZoneTimestamp(announcement.resolvedDate, announcement.time || "00:00");
  const diffMs = startMs - now.getTime();

  if (diffMs <= 0) {
    // A timed notice reads as live for two hours, then as finished.
    return diffMs > -2 * 60 * 60 * 1000 ? "Happening now" : "Completed";
  }

  return `in ${gapLabel(diffMs)}`;
}

/** Notices that have not finished yet - what the header bell counts. */
export function activeAnnouncements(items: ResolvedAnnouncement[], now: Date) {
  return items.filter((item) => leadTimeLabel(item, now) !== "Completed");
}
