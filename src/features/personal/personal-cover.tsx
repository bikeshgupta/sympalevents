import { CalendarDays, MapPin } from "lucide-react";
import { HeroEmbers, RisingWords } from "@/components/shared/dashboard-fx";
import { IconTile } from "@/components/shared/icon-tile";
import { PersonalEventImage } from "@/features/personal/personal-event-card";
import { useDashboardMotion } from "@/lib/dashboard-motion";
import { whenLine, type PersonalEvent } from "@/lib/personal-events";
import { cn } from "@/lib/utils";
import { kindOf } from "../../../shared/personal-events";

/**
 * The top of a personal event, for host and guest alike: the host's photograph (or the artwork for its kind)
 * with the title, day and place over its foot.
 *
 * The words sit on a scrim weighted to the bottom, where they are; the rest of the picture stays clear. The
 * page around it is drawn in the event's own colour (`themeVariables(event.color)`), which tints the icon
 * tile's ring and the buttons below - the picture carries the rest.
 */
export function PersonalCover({ event, eyebrow, className }: { event: PersonalEvent; eyebrow: string; className?: string }) {
  const motion = useDashboardMotion();
  const kind = kindOf(event.kind);
  const cancelled = event.status === "cancelled";
  return (
    <section
      aria-label={event.title}
      className={cn("relative isolate flex min-h-64 flex-col justify-end overflow-hidden rounded-3xl bg-primary text-white shadow-sm sm:min-h-80", className)}
    >
      <PersonalEventImage event={event} className={cn("absolute inset-0 -z-10", cancelled && "grayscale")} />
      <span aria-hidden="true" className="absolute inset-0 -z-10 bg-gradient-to-t from-black/80 via-black/40 to-black/0" />
      {motion && !cancelled ? <HeroEmbers /> : null}
      <IconTile name={kind.key} size="sm" tone="inverse" className="absolute left-4 top-4 sm:left-6 sm:top-6" />
      <div className="relative p-5 sm:p-7">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-white/85">
          {eyebrow} · {kind.name}
        </p>
        <h1 className="font-display mt-1.5 text-3xl font-semibold leading-tight sm:text-4xl" aria-label={motion ? event.title : undefined}>
          {motion ? <RisingWords text={event.title} /> : event.title}
        </h1>
        <p className="mt-2.5 flex items-center gap-2 text-sm text-white/90">
          <CalendarDays className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="tabular-nums">{whenLine(event)}</span>
        </p>
        {event.venue ? (
          <p className="mt-1 flex items-center gap-2 text-sm text-white/90">
            <MapPin className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{event.venue}</span>
          </p>
        ) : null}
        {cancelled ? (
          <p className="mt-3 inline-flex rounded-full bg-white/95 px-2.5 py-1 text-xs font-semibold text-destructive">Cancelled</p>
        ) : null}
      </div>
    </section>
  );
}
