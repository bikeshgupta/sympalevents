import { Link } from "react-router-dom";
import { EventArtwork } from "@/features/society/event-artwork";
import { callToAction, eventEyebrow } from "@/features/society/event-presentation";
import { getEventStatus } from "@/lib/event-status";
import { hasModule, type SocietyEvent } from "@/lib/society";
import { cn } from "@/lib/utils";

/**
 * The visual anchor of the page: what is on now, or what is next.
 *
 * It is a picture with the event written on it, at a cinematic ratio, rather
 * than a header band above a block of text. The first version put a pale
 * gradient across the top of a white card and left it empty when there was no
 * photograph, which read as a loading state that never finished.
 *
 * Everything sits inside the frame: eyebrow, title, where and when, one metric
 * and one call to action. One of each - this card exists to draw somebody in,
 * not to report, and the numbers are all one tap away.
 */
export function FeaturedEvent({ event, to, now }: { event: SocietyEvent; to: string; now?: Date }) {
  const status = getEventStatus(event, now);

  return (
    <Link
      to={to}
      className={cn(
        "group relative block overflow-hidden rounded-2xl",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
      )}
    >
      {/* 16:10 on a phone, shallower above it so the card does not eat a
          desktop viewport. */}
      <div className="relative aspect-[16/10] w-full sm:aspect-[21/9]">
        {/* Without a photograph the type icon becomes a watermark in the far
            corner rather than sitting centred - centred, it lands directly
            behind the title, which is the one thing on this card that has to
            stay legible. */}
        <EventArtwork
          eventType={event.eventType}
          imageUrl={event.heroImageUrl}
          templateKey={event.templateKey}
          focus={event.heroFocus}
          dim={status === "completed"}
          className="absolute inset-0 h-full w-full transition-transform duration-500 group-hover:scale-[1.02]"
          iconClassName="absolute right-5 top-5 h-16 w-16 opacity-60 sm:right-7 sm:top-7 sm:h-20 sm:w-20"
        />

        {/* Dark at the foot, clear through the middle: the copy has to clear
            4.5:1 without dimming the whole photograph, which is content. */}
        <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/35 to-transparent" />

        {status === "live" ? (
          <span className="absolute left-4 top-4 inline-flex items-center gap-1.5 rounded-full bg-white/95 px-2.5 py-1 text-xs font-semibold text-emerald-800 shadow-sm">
            <span aria-hidden className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-600" />
            </span>
            Happening now
          </span>
        ) : null}

        <div className="absolute inset-x-0 bottom-0 p-4 sm:p-5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-white/85">{eventEyebrow(event)}</p>

          <h2 className="mt-1 text-xl font-semibold leading-tight text-white drop-shadow-sm sm:text-3xl">
            {event.name}
          </h2>

          <p className="mt-1 text-sm text-white/85">
            {[event.location, headlineMetric(event)].filter(Boolean).join(" · ")}
          </p>

          <span
            className={cn(
              "mt-3 inline-flex h-10 items-center rounded-lg bg-white px-4 text-sm font-semibold text-foreground",
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
