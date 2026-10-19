import { CalendarDays, MapPin } from "lucide-react";
import { HeroEmbers, RisingWords } from "@/components/shared/dashboard-fx";
import { useDashboardMotion } from "@/lib/dashboard-motion";
import { whenLine, type PersonalEvent } from "@/lib/personal-events";
import { cn } from "@/lib/utils";
import { IconTile } from "@/components/shared/icon-tile";
import { kindOf } from "../../../shared/personal-events";

/**
 * The top of a personal event, for host and guest alike. It is drawn in the event's own colour (the page
 * wraps it in `themeVariables(event.color)`), so `bg-primary` here is the host's choice and the rest of the
 * app stays as it is. White text on every preset clears 4.5:1 - that is what the presets are for.
 */
export function PersonalCover({ event, eyebrow, className }: { event: PersonalEvent; eyebrow: string; className?: string }) {
  const motion = useDashboardMotion();
  const kind = kindOf(event.kind);
  const cancelled = event.status === "cancelled";
  return (
    <section
      aria-label={event.title}
      className={cn("relative overflow-hidden rounded-2xl bg-primary p-5 text-primary-foreground shadow-sm sm:p-7", className)}
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full bg-white/15 blur-3xl"
      />
      {motion && !cancelled ? <HeroEmbers /> : null}
      <IconTile name={kind.key} size="lg" tone="inverse" className="pointer-events-none absolute right-5 top-5 sm:right-8" />
      <div className="relative pr-20">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary-foreground/85">{eyebrow}</p>
        <h1 className="font-display mt-2 text-3xl font-semibold leading-tight sm:text-4xl" aria-label={motion ? event.title : undefined}>
          {motion ? <RisingWords text={event.title} /> : event.title}
        </h1>
        <p className="mt-3 flex items-center gap-2 text-sm text-primary-foreground/90">
          <CalendarDays className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="tabular-nums">{whenLine(event)}</span>
        </p>
        {event.venue ? (
          <p className="mt-1 flex items-center gap-2 text-sm text-primary-foreground/90">
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
