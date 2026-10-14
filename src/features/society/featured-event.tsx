import { MapPin, Users } from "lucide-react";
import { Link } from "react-router-dom";
import { EventArtwork } from "@/features/society/event-artwork";
import { callToAction, eventEyebrow } from "@/features/society/event-presentation";
import { getEventStatus } from "@/lib/event-status";
import { hasModule, type SocietyEvent } from "@/lib/society";
import { cn } from "@/lib/utils";

/**
 * The strongest thing on the page: what is on now, or what is next.
 *
 * An editorial hero rather than a card - on a phone it runs edge to edge (the page's own gutters are pulled
 * back with `-mx-4`) and is tall, with the event written across the foot of the picture. From `sm` up it is
 * a wide, gently rounded frame so it does not swallow a desktop viewport.
 *
 * ## What it draws, and where it comes from
 *
 *   the event's own photograph when it has one;
 *   else the artwork its template or type already has (`EventArtwork`) - the same system the dashboard hero
 *   uses, not a per-type implementation here. An event with no template falls back to its TYPE's artwork, so
 *   a sports league and a cultural evening still look different, and the deep tones give the white copy
 *   something to sit on (the pale list-tile wash would not).
 *
 * Everything on it is real: date and kind, name, venue and, when the event has one, a single count. There is
 * no tag line like "Music · Dance · Community": events carry no such descriptor today, and one is not
 * invented here.
 */
export function FeaturedEvent({ event, to, now }: { event: SocietyEvent; to: string; now?: Date }) {
  const status = getEventStatus(event, now);
  const metric = headlineMetric(event);

  return (
    <Link
      to={to}
      className={cn(
        "group relative block overflow-hidden sm:rounded-2xl",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
      )}
    >
      {/* Tall on a phone, capped so a large phone is not all picture; wide from `sm`. */}
      <div className="relative aspect-[4/5] max-h-[640px] w-full sm:aspect-[16/9]">
        <EventArtwork
          eventType={event.eventType}
          imageUrl={event.heroImageUrl}
          templateKey={event.templateKey ?? event.eventType}
          focus={event.heroFocus}
          dim={status === "completed"}
          artworkPosition="80% center"
          className="absolute inset-0 h-full w-full transition-transform duration-500 group-hover:scale-[1.02]"
        />

        {/* Dark at the foot, clear through the middle: the copy has to clear 4.5:1 without dimming the whole
            picture, which is content. */}
        <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-transparent" />

        {status === "live" ? (
          <span className="absolute left-5 top-5 inline-flex items-center gap-1.5 rounded-full bg-white/95 px-2.5 py-1 text-xs font-semibold text-emerald-800 shadow-sm">
            <span aria-hidden className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-600" />
            </span>
            Happening now
          </span>
        ) : null}

        <div className="absolute inset-x-0 bottom-0 p-5 sm:p-7">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-white/90">{eventEyebrow(event)}</p>

          <h2 className="font-display mt-2 text-[34px] font-semibold leading-[1.1] text-white drop-shadow-sm sm:text-5xl">
            {event.name}
          </h2>

          {event.location || metric ? (
            <ul className="mt-3 space-y-1 text-[15px] text-white/90">
              {event.location ? (
                <li className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span className="min-w-0 truncate">{event.location}</span>
                </li>
              ) : null}
              {metric ? (
                <li className="flex items-center gap-2">
                  <Users className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span className="min-w-0 truncate tabular-nums">{metric}</span>
                </li>
              ) : null}
            </ul>
          ) : null}

          <span
            className={cn(
              "mt-5 inline-flex h-11 items-center rounded-lg bg-white px-5 text-[15px] font-semibold text-foreground",
              "shadow-sm transition-transform group-hover:translate-x-0.5",
            )}
          >
            {callToAction(event, status)}
            <span aria-hidden className="ml-1.5">&rarr;</span>
          </span>
        </div>
      </div>
    </Link>
  );
}

/** One number, chosen for what this event is - never a row of tiles. */
function headlineMetric(event: SocietyEvent) {
  const { metrics } = event;
  if (hasModule(event, "closing") && metrics.averageRating !== null) {
    return `★ ${metrics.averageRating.toFixed(1)} from ${metrics.reviewCount} ${
      metrics.reviewCount === 1 ? "review" : "reviews"
    }`;
  }
  if (hasModule(event, "teams") && metrics.teamCount > 0) {
    return `${metrics.teamCount} ${metrics.teamCount === 1 ? "team" : "teams"} entered`;
  }
  if (hasModule(event, "contributions") && metrics.contributorCount > 0) {
    return `${metrics.contributorCount} contributors`;
  }
  return "";
}
