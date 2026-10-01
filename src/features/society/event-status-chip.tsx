import { statusLabels, type EventStatus } from "@/lib/event-status";
import { cn } from "@/lib/utils";

/**
 * Where an event is in its life, as a chip.
 *
 * Separate from `StatusBadge` in components/shared deliberately: that one is
 * about a *record's* workflow state (a contribution Received, a task Blocked)
 * and is used across every table in the app. This one is about an event's
 * place in time, has its own five values, and gives "live" a pulsing dot.
 * Folding them together would mean one shared component with two unrelated
 * vocabularies - the blast-radius rule in CLAUDE.md cuts the other way here.
 */

const toneByStatus: Record<EventStatus, string> = {
  draft: "bg-muted text-muted-foreground",
  upcoming: "bg-primary/10 text-primary",
  live: "bg-emerald-100 text-emerald-800",
  completed: "bg-muted text-muted-foreground",
  cancelled: "bg-destructive/10 text-destructive",
};

export function EventStatusChip({ status, className }: { status: EventStatus; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium",
        toneByStatus[status],
        className,
      )}
    >
      {status === "live" ? (
        // Colour is never the only signal - the word "Live now" sits beside it.
        <span aria-hidden className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-600" />
        </span>
      ) : null}
      {statusLabels[status]}
    </span>
  );
}
