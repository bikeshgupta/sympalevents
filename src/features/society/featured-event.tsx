import { MapPin, Users } from "lucide-react";
import { Link } from "react-router-dom";
import { EventArtwork } from "@/features/society/event-artwork";
import { callToAction, eventEyebrow } from "@/features/society/event-presentation";
import { getEventStatus } from "@/lib/event-status";
import { hasModule, type SocietyEvent } from "@/lib/society";
import { cn } from "@/lib/utils";
import { useCallback, useRef } from "react";
import { clamp01, useDashboardMotion, useScrollFrame } from "@/lib/dashboard-motion";
import { HeroAurora, HeroEmbers, RisingWords } from "@/components/shared/dashboard-fx";

/**
 * The strongest thing on the page: what is on now, or what is next.
 *
 * An editorial hero rather than a card - on a phone it runs edge to edge (the page's own gutters are pulled
 * back with `-mx-4`) and landscape, with the event written across the foot of the picture. From `sm` up it is
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

  // The same motion as the event hero (src/lib/dashboard-motion.ts): the name
  // rises in, embers drift up the picture, and as it scrolls away the picture
  // sinks and grows while the words fade. At rest nothing is set.
  const motion = useDashboardMotion();
  const frameRef = useRef<HTMLDivElement>(null);
  const pictureRef = useRef<HTMLDivElement>(null);
  const copyRef = useRef<HTMLDivElement>(null);
  const onFrame = useCallback((box: DOMRect) => {
    const progress = clamp01(-box.top / box.height);
    const picture = pictureRef.current;
    const copy = copyRef.current;
    if (!picture || !copy) return;
    if (progress === 0) {
      picture.style.transform = "";
      copy.style.transform = "";
      copy.style.opacity = "";
      return;
    }
    picture.style.transform = `translateY(${progress * 24}px) scale(${1 + progress * 0.18})`;
    copy.style.transform = `translateY(${progress * 16}px)`;
    copy.style.opacity = String(1 - progress * 0.8);
  }, []);
  useScrollFrame(frameRef, motion, onFrame);

  return (
    <Link
      to={to}
      className={cn(
        "group relative block overflow-hidden rounded-[30px] shadow-[0_24px_50px_-28px_hsl(var(--foreground)/0.6)] ring-1 ring-white/40",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
      )}
    >
      
      <div ref={frameRef} className="relative aspect-[16/10] w-full overflow-hidden bg-primary/90 sm:aspect-[16/6] xl:aspect-[16/5]">
        <div ref={pictureRef} className="absolute inset-0">
        <EventArtwork
          eventType={event.eventType}
          imageUrl={event.heroImageUrl}
          templateKey={event.templateKey ?? event.eventType}
          focus={event.heroFocus}
          dim={status === "completed"}
          artworkPosition="80% center"
          eager
          className="absolute inset-0 h-full w-full transition-transform duration-500 group-hover:scale-[1.02]"
        />
        </div>
        {motion && !event.heroImageUrl ? <HeroAurora /> : null}
        {motion ? <HeroEmbers /> : null}

        {/* Dark at the foot, clear through the middle: the copy has to clear 4.5:1 without dimming the whole
            picture, which is content. */}
        <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-transparent" />

        {status === "live" ? (
          <span className="absolute left-4 top-4 inline-flex items-center gap-1.5 rounded-full bg-white/95 px-2.5 py-1 text-xs font-semibold text-emerald-800 shadow-sm">
            <span aria-hidden className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-600" />
            </span>
            Happening now
          </span>
        ) : null}

        <div ref={copyRef} className="absolute inset-x-0 bottom-0 p-4 sm:p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-white/90">{eventEyebrow(event)}</p>

          <h2
            aria-label={motion ? event.name : undefined}
            className="font-display mt-1.5 text-2xl font-semibold leading-[1.15] text-white drop-shadow-sm sm:text-4xl">
            {motion ? <RisingWords text={event.name} /> : event.name}
          </h2>

          {event.location || metric ? (
            <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-white/90">
              {event.location ? (
                <span className="inline-flex min-w-0 items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span className="truncate">{event.location}</span>
                </span>
              ) : null}
              {metric ? (
                <span className="inline-flex items-center gap-1.5 tabular-nums">
                  <Users className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  {metric}
                </span>
              ) : null}
            </p>
          ) : null}

          <span
            className={cn(
              "mt-2.5 inline-flex h-10 items-center rounded-full border border-white/70 bg-white/90 px-4 shadow-lg backdrop-blur-md text-sm font-semibold text-foreground",
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
