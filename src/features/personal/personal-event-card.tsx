import { ChevronRight, Users } from "lucide-react";
import { Link } from "react-router-dom";
import { formatPersonalTime, type PersonalEvent } from "@/lib/personal-events";
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
 * The whole card is the link; nothing inside it is a second control.
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
  return (
    <Link
      to={to}
      className={cn(
        "group flex items-center gap-3.5 rounded-2xl border bg-card p-2.5 pr-3 shadow-sm transition",
        "[@media(hover:hover)]:hover:-translate-y-0.5 [@media(hover:hover)]:hover:shadow-md active:scale-[0.99]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transform-none motion-reduce:transition-none",
      )}
    >
      <span className={cn("relative h-[88px] w-[88px] shrink-0 overflow-hidden rounded-xl bg-muted", past && "grayscale-[35%]")}>
        <PersonalEventImage event={event} className="transition-transform duration-500 [@media(hover:hover)]:group-hover:scale-105 motion-reduce:transition-none" />
        <span className="absolute left-1.5 top-1.5 flex flex-col items-center rounded-lg bg-white/95 px-1.5 py-1 leading-none text-foreground shadow-sm">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{when.weekday}</span>
          <span className="font-display text-lg font-semibold tabular-nums">{when.day}</span>
          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{when.month}</span>
        </span>
      </span>
      <span className="min-w-0 flex-1">
        <span className="font-display block truncate text-lg font-semibold leading-snug">{event.title}</span>
        <span className="mt-0.5 block truncate text-sm text-muted-foreground">
          {[time, event.venue].filter(Boolean).join(" · ") || "Time and place to follow"}
        </span>
        <span className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", chipTone[chip.tone])}>{chip.label}</span>
          {typeof going === "number" ? (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground tabular-nums">
              <Users className="h-3.5 w-3.5" aria-hidden="true" />
              {going} going
            </span>
          ) : null}
        </span>
      </span>
      <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground transition-transform [@media(hover:hover)]:group-hover:translate-x-0.5" aria-hidden="true" />
    </Link>
  );
}
