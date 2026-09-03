import { announcements as allAnnouncements, type Announcement } from "@/data/announcements";
import { getEventDays, toEventZoneTimestamp } from "@/features/dashboard/dashboard-utils";
import type { AppEvent } from "@/lib/event-data";

export type AuctionStatus = "upcoming" | "live" | "closed";

export type ResolvedAnnouncement = Announcement & {
  resolvedDate?: string;
  /** Resolved bidding window, present only when the notice defines one. */
  auctionWindow?: {
    opensDate: string;
    opensTime: string;
    opensAt: number;
    closesDate: string;
    closesTime: string;
    closesAt: number;
  };
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
    .map((item) => {
      const opensDate = item.auction ? dateFor(item.auction.opensDay, item.auction.opensDate) : undefined;
      const closesDate = item.auction ? dateFor(item.auction.closesDay, item.auction.closesDate) : undefined;

      return {
        ...item,
        resolvedDate: dateFor(item.day, item.date),
        auctionWindow:
          item.auction && opensDate && closesDate
            ? {
                opensDate,
                opensTime: item.auction.opensTime,
                opensAt: toEventZoneTimestamp(opensDate, item.auction.opensTime),
                closesDate,
                closesTime: item.auction.closesTime,
                closesAt: toEventZoneTimestamp(closesDate, item.auction.closesTime),
              }
            : undefined,
      };
    });
}

/** "2 days 4 hr" / "3 hr 20 min" / "5 min" - the gap, without any prefix. */
function gapLabel(diffMs: number) {
  const totalMinutes = Math.floor(diffMs / 60000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) return `${days} day${days > 1 ? "s" : ""}${hours ? ` ${hours} hr` : ""}`;
  if (hours > 0) return `${hours} hr${minutes ? ` ${minutes} min` : ""}`;
  return `${Math.max(minutes, 1)} min`;
}

export function auctionStatus(announcement: ResolvedAnnouncement, now: Date): AuctionStatus | null {
  const window = announcement.auctionWindow;
  if (!window) return null;
  const current = now.getTime();
  if (current < window.opensAt) return "upcoming";
  if (current <= window.closesAt) return "live";
  return "closed";
}

/** "in 2 days 4 hr" / "in 3 hr 20 min" / "Happening now" / "Completed". */
export function leadTimeLabel(announcement: ResolvedAnnouncement, now: Date) {
  const window = announcement.auctionWindow;

  // A notice with a bidding window is driven by that window, not by its own
  // start time - bidding stays "live" for its whole run, not just two hours.
  if (window) {
    const status = auctionStatus(announcement, now);
    if (status === "upcoming") return `in ${gapLabel(window.opensAt - now.getTime())}`;
    if (status === "live") return "Happening now";
    return "Completed";
  }

  if (!announcement.resolvedDate) return null;

  const startMs = toEventZoneTimestamp(announcement.resolvedDate, announcement.time || "00:00");
  const diffMs = startMs - now.getTime();

  if (diffMs <= 0) {
    // A timed notice reads as live for two hours, then as finished.
    return diffMs > -2 * 60 * 60 * 1000 ? "Happening now" : "Completed";
  }

  return `in ${gapLabel(diffMs)}`;
}

/** How long until bidding closes, for the live state. */
export function closesInLabel(announcement: ResolvedAnnouncement, now: Date) {
  const window = announcement.auctionWindow;
  if (!window) return null;
  const remaining = window.closesAt - now.getTime();
  return remaining > 0 ? gapLabel(remaining) : null;
}

/** Notices that have not finished yet - what the header bell counts. */
export function activeAnnouncements(items: ResolvedAnnouncement[], now: Date) {
  return items.filter((item) => leadTimeLabel(item, now) !== "Completed");
}
