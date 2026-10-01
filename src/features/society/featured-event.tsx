import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { callToAction, dateRange } from "@/features/society/event-presentation";
import { EventStatusChip } from "@/features/society/event-status-chip";
import { getEventStatus } from "@/lib/event-status";
import { hasModule, type SocietyEvent } from "@/lib/society";
import { cn } from "@/lib/utils";

/**
 * Stronger hierarchy than an `EventCard`: a real image area, the event's name
 * at display size, and one unmistakable call to action. It is the only element
 * on this page with that weight, which is what makes it read as the lead
 * rather than as the first of a list.
 */
export function FeaturedEvent({ event, to, now }: { event: SocietyEvent; to: string; now?: Date }) {
  const status = getEventStatus(event, now);

  return (
    <Card className="overflow-hidden">
      <Link to={to} className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <div className="relative">
          {event.heroImageUrl ? (
            <img src={event.heroImageUrl} alt="" aria-hidden className="h-40 w-full object-cover sm:h-56" />
          ) : (
            <div aria-hidden className="h-24 w-full bg-gradient-to-br from-primary/20 to-primary/5 sm:h-32" />
          )}
          <span className="absolute left-3 top-3">
            <EventStatusChip status={status} className="shadow-sm backdrop-blur" />
          </span>
        </div>

        <div className="p-4 sm:p-5">
          <h2 className="text-xl font-semibold leading-tight sm:text-2xl">{event.name}</h2>

          <p className="mt-1 text-sm text-muted-foreground sm:text-base">
            {dateRange(event)}
            {event.location ? ` · ${event.location}` : ""}
          </p>

          <FeaturedMetric event={event} />

          <span
            className={cn(
              "mt-4 inline-flex h-10 items-center justify-center rounded-md bg-primary px-4",
              "text-sm font-medium text-primary-foreground",
            )}
          >
            {callToAction(event, status)}
          </span>
        </div>
      </Link>
    </Card>
  );
}

/** One number, not a tile row. The lead card is for drawing somebody in, not
 *  for reporting - the statistics live inside the event. */
function FeaturedMetric({ event }: { event: SocietyEvent }) {
  const { metrics } = event;

  if (hasModule(event, "closing") && metrics.averageRating !== null) {
    return (
      <p className="mt-2 text-sm text-muted-foreground">
        <span className="font-medium text-foreground tabular-nums">{metrics.averageRating.toFixed(1)} ★</span>{" "}
        from {metrics.reviewCount} {metrics.reviewCount === 1 ? "review" : "reviews"}
      </p>
    );
  }
  if (hasModule(event, "teams") && metrics.teamCount > 0) {
    return (
      <p className="mt-2 text-sm text-muted-foreground">
        <span className="font-medium text-foreground tabular-nums">{metrics.teamCount}</span>{" "}
        {metrics.teamCount === 1 ? "team" : "teams"} entered
      </p>
    );
  }
  if (hasModule(event, "contributions") && metrics.contributorCount > 0) {
    return (
      <p className="mt-2 text-sm text-muted-foreground">
        <span className="font-medium text-foreground tabular-nums">{metrics.contributorCount}</span> residents have
        contributed
      </p>
    );
  }
  return null;
}
