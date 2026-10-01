import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { callToAction, dateRange } from "@/features/society/event-presentation";
import { EventStatusChip } from "@/features/society/event-status-chip";
import { getEventStatus, type EventStatus } from "@/lib/event-status";
import { hasModule, type SocietyEvent } from "@/lib/society";
import { cn } from "@/lib/utils";

/**
 * One card, every kind of event.
 *
 * There is deliberately no SportsEventCard or FestivalEventCard. What a card
 * says is decided by three things it is given, never by the event's name:
 *
 *   - `eventType`      - what kind of thing this is
 *   - `getEventStatus` - where it is in its life
 *   - `modules`        - what this event actually has, for this viewer
 *
 * and then by whether the number in question is non-zero. A completed festival
 * leads with its rating and its photographs; a sports event leads with its
 * teams; an event with neither says nothing about either rather than printing
 * a row of zeros.
 */

export function EventCard({ event, to, now }: { event: SocietyEvent; to: string; now?: Date }) {
  const status = getEventStatus(event, now);

  return (
    <Card
      className={cn(
        "overflow-hidden transition-shadow hover:shadow-md focus-within:ring-2 focus-within:ring-ring",
        status === "cancelled" && "opacity-75",
      )}
    >
      <Link to={to} className="flex gap-3 p-3 focus:outline-none sm:gap-4 sm:p-4">
        <Thumbnail event={event} status={status} />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
            <h3
              className={cn(
                "text-base font-semibold leading-tight sm:text-lg",
                status === "cancelled" && "line-through",
              )}
            >
              {event.name}
            </h3>
            <EventStatusChip status={status} />
          </div>

          <p className="mt-1 text-sm text-muted-foreground">
            {dateRange(event)}
            {event.location ? <span className="hidden sm:inline"> · {event.location}</span> : null}
          </p>

          <MetricLine event={event} status={status} />

          <p className="mt-2 text-sm font-medium text-primary">{callToAction(event, status)} →</p>
        </div>
      </Link>
    </Card>
  );
}

/**
 * The event's own photograph when it has one. Without one, a tinted block
 * carrying the event type's initial - no placeholder illustration, and nothing
 * festival-specific, since this card has to sit above a badminton tournament
 * as readily as a Ganesh Chaturthi.
 */
function Thumbnail({ event, status }: { event: SocietyEvent; status: EventStatus }) {
  if (event.heroImageUrl) {
    return (
      <img
        src={event.heroImageUrl}
        alt=""
        aria-hidden
        className={cn(
          "h-16 w-16 shrink-0 rounded-md object-cover sm:h-20 sm:w-20",
          status === "completed" && "saturate-[0.85]",
        )}
      />
    );
  }
  return (
    <span
      aria-hidden
      className="flex h-16 w-16 shrink-0 items-center justify-center rounded-md bg-primary/10 text-xl font-semibold text-primary sm:h-20 sm:w-20"
    >
      {event.name.trim().charAt(0).toUpperCase() || "?"}
    </span>
  );
}

/**
 * The two or three numbers worth knowing about this event, and no others.
 *
 * Each is gated on both the module being open to this viewer *and* the number
 * being non-zero, so a card never advertises an empty gallery or claims nought
 * contributors. An event with nothing to show gets no line at all rather than
 * a row of dashes.
 */
function MetricLine({ event, status }: { event: SocietyEvent; status: EventStatus }) {
  const { metrics } = event;
  const parts: string[] = [];

  if (status === "completed") {
    if (hasModule(event, "closing") && metrics.averageRating !== null) {
      parts.push(`${metrics.averageRating.toFixed(1)} ★ · ${plural(metrics.reviewCount, "review")}`);
    }
    if (hasModule(event, "contributions") && metrics.contributorCount > 0) {
      parts.push(plural(metrics.contributorCount, "contributor"));
    }
    if (hasModule(event, "closing") && metrics.photoCount > 0) {
      parts.push(plural(metrics.photoCount, "photo"));
    }
  } else {
    if (hasModule(event, "teams") && metrics.teamCount > 0) {
      parts.push(plural(metrics.teamCount, "team"));
    }
    if (hasModule(event, "contributions") && metrics.contributorCount > 0) {
      parts.push(plural(metrics.contributorCount, "contributor"));
    }
    if (hasModule(event, "sponsors") && metrics.sponsorCount > 0) {
      parts.push(plural(metrics.sponsorCount, "sponsor"));
    }
  }

  if (!parts.length) return null;

  return (
    <p className="mt-1.5 text-sm text-muted-foreground">
      {parts.map((part, index) => (
        <span key={part}>
          {index > 0 ? <span aria-hidden className="px-1.5 text-muted-foreground/50">·</span> : null}
          <span className="tabular-nums">{part}</span>
        </span>
      ))}
    </p>
  );
}


function plural(count: number, noun: string) {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}
