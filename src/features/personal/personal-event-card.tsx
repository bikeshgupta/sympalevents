import { ChevronRight, Clock, Users } from "lucide-react";
import { Link } from "react-router-dom";
import { daysToGo, formatPersonalTime, type PersonalEvent } from "@/lib/personal-events";
import { tiltHandlers, useDashboardMotion } from "@/lib/dashboard-motion";
import { getDateInEventZone } from "@/lib/event-status";
import { personalArtworkUrl } from "@/lib/personal-artwork";
import { cn } from "@/lib/utils";

/** The event's picture: the host's photograph if there is one, else the artwork for its kind. */
export function PersonalEventImage({ event, className }: { event: Pick<PersonalEvent, "kind" | "coverUrl">; className?: string }) {
  return (
    <img
      src={event.coverUrl || personalArtworkUrl(event.kind)}
      alt=""
      aria-hidden="true"
      loading="lazy"
      decoding="async"
      className={cn("h-full w-full object-cover", className)}
    />
  );
}

const day = (iso: string) => {
  const date = new Date(`${iso}T00:00:00+05:30`);
  const part = (options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-IN", { ...options, timeZone: "Asia/Kolkata" }).format(date);
  return { weekday: part({ weekday: "short" }), day: part({ day: "numeric" }), month: part({ month: "short" }) };
};

export type CardChip = { label: string; tone: "primary" | "muted" | "warning" | "danger" };

const chipTone: Record<CardChip["tone"], string> = {
  primary: "bg-primary/10 text-primary",
  muted: "bg-muted text-muted-foreground",
  warning: "bg-amber-100 text-amber-900",
  danger: "bg-destructive/10 text-destructive",
};

/**
 * One personal event in a list: its picture with the date on it, the title, when and where, what it means
 * for you (Hosting, Going, Maybe...) and how many are coming. A row on a phone, a card in a grid from `sm`.
 * The whole card is the link; nothing inside it is a second control. With a mouse it leans towards the cursor
 * with a soft light under it (`tiltHandlers`, `.dfx-spot`); upcoming ones say how far away they are.
 */
export function PersonalEventCard({
  event,
  to,
  chip,
  going,
  past,
}: {
  event: PersonalEvent;
  to: string;
  chip: CardChip;
  /** People coming, when the viewer may know it. */
  going?: number | null;
  past?: boolean;
}) {
  const when = day(event.startsOn);
  const time = formatPersonalTime(event.startTime);
  const motion = useDashboardMotion();
  const togo = past ? null : daysToGo(event.startsOn, getDateInEventZone(new Date()));
  return (
    <Link
      to={to}
      {...tiltHandlers(motion, 0.6)}
      className={cn(
        "dfx-spot group relative flex items-center gap-3.5 overflow-hidden rounded-[22px] bg-white/55 p-2 pr-3 ring-1 ring-black/[0.04] transition duration-300 [@media(hover:hover)]:hover:bg-white/85",
        "[@media(hover:hover)]:hover:-translate-y-0.5 [@media(hover:hover)]:hover:shadow-md active:scale-[0.99]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transform-none motion-reduce:transition-none",
      )}
    >
      <span className={cn("relative h-[84px] w-[84px] shrink-0 overflow-hidden rounded-[18px] bg-muted sm:h-[104px] sm:w-[104px] sm:rounded-[20px]", past && "grayscale-[35%]")}>
        <PersonalEventImage event={event} className="transition-transform duration-500 [@media(hover:hover)]:group-hover:scale-105 motion-reduce:transition-none" />
        <span className="absolute left-1.5 top-1.5 flex flex-col items-center rounded-xl border border-white/70 bg-white/75 px-1.5 py-1 leading-none text-foreground shadow-sm backdrop-blur-md">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{when.weekday}</span>
          <span className="font-display text-lg font-semibold tabular-nums">{when.day}</span>
          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{when.month}</span>
        </span>
      </span>
      <span className="min-w-0 flex-1">
        <span className="font-display block truncate text-lg font-semibold leading-snug sm:text-xl">{event.title}</span>
        <span className="mt-0.5 block truncate text-sm text-muted-foreground">
          {[time, event.venue].filter(Boolean).join(" · ") || "Time and place to follow"}
        </span>
        <span className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold", chipTone[chip.tone])}>{chip.label}</span>
          {togo ? (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-primary">
              <Clock className="h-3.5 w-3.5" aria-hidden="true" />
              {togo}
            </span>
          ) : null}
          {typeof going === "number" ? (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground tabular-nums">
              <Users className="h-3.5 w-3.5" aria-hidden="true" />
              {going} going
            </span>
          ) : null}
        </span>
      </span>
      <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/70 text-muted-foreground shadow-sm ring-1 ring-black/5 transition-transform [@media(hover:hover)]:group-hover:translate-x-0.5">
        <ChevronRight className="h-4 w-4" />
      </span>
    </Link>
  );
}
