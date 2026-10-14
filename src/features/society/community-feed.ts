import type { EventStatus, EventStatusInput } from "../../../shared/event-status";

/**
 * "From your community" - what the society's front door can say about life between events.
 *
 * ## What is real today, and what is not
 *
 * The one read behind Society Home (`?resource=society-home`) carries each event's counts and, where the
 * viewer may open the album, a cover photograph. From that, ONE kind of entry can be told honestly:
 *
 *   memory   a finished event that left photographs or reviews behind
 *
 * The others the design calls for - an announcement, "event details were updated", "new photos were
 * added 2 days ago", "event published" - need data the payload does not carry: announcements are per event
 * and are not in it, and no timestamp for publishing, editing or adding a photograph is. They are listed in
 * `futureKinds` so the shape is ready, and NOTHING here invents them. Enabling them means adding those
 * fields to the society-home read (never reading `audit_log`, which records who did what and must not reach
 * a resident).
 */

export type CommunityEntry = {
  kind: "memory";
  /** Stable React key. */
  key: string;
  eventId: string;
  title: string;
  /** At most two real facts, e.g. "1 photo", "★ 5.0 from 4 reviews". */
  facts: string[];
  imageUrl: string | null;
  to: string;
  /** For ordering only (the event's last day, YYYY-MM-DD). */
  sortDate: string;
};

/** Not built, and not produced. Documented so the data they need is a decision rather than a surprise. */
export const futureKinds = {
  announcement: "needs published announcements for the society's events in the society-home payload",
  event_updated: "needs events.updated_at (or a published-edit timestamp) in the payload",
  photos_added: "needs the time photographs were added, per event",
  event_published: "needs the time an event was published",
} as const;

export type FeedEvent = EventStatusInput & {
  id: string;
  name: string;
  modules: string[];
  coverPhotoUrl?: string | null;
  metrics: { photoCount: number; reviewCount: number; averageRating: number | null };
};

const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? "" : "s"}`;

/** Memories first-hand: only events that are over, whose closing page this viewer may open, and that really
 *  have a photograph, a rating or a review. Most recent first. */
export function buildCommunityFeed(
  events: FeedEvent[],
  now: Date,
  /** `getEventStatus`, handed in so this file stays import-free (checkable without the app's build) and the
   *  status authority is still the one function the whole app uses. */
  statusOf: (event: FeedEvent, now: Date) => EventStatus,
  limit = 3,
): CommunityEntry[] {
  return events
    .filter((event) => statusOf(event, now) === "completed")
    .filter((event) => event.modules.includes("closing"))
    .filter((event) => event.coverPhotoUrl || event.metrics.photoCount > 0 || event.metrics.reviewCount > 0)
    .sort((a, b) => (a.endDate < b.endDate ? 1 : -1))
    .slice(0, limit)
    .map((event) => {
      const facts: string[] = [];
      if (event.metrics.photoCount > 0) facts.push(plural(event.metrics.photoCount, "photo"));
      if (event.metrics.averageRating !== null && event.metrics.reviewCount > 0) {
        facts.push(`★ ${event.metrics.averageRating.toFixed(1)} from ${plural(event.metrics.reviewCount, "review")}`);
      } else if (event.metrics.reviewCount > 0) {
        facts.push(plural(event.metrics.reviewCount, "review"));
      }
      return {
        kind: "memory" as const,
        key: `memory-${event.id}`,
        eventId: event.id,
        title: event.name,
        facts: facts.slice(0, 2),
        imageUrl: event.coverPhotoUrl ?? null,
        to: `/e/${event.id}/closing`,
        sortDate: event.endDate,
      };
    });
}
