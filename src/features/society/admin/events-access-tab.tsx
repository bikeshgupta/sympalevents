import { ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";
import { formatEventDate } from "@/features/dashboard/dashboard-utils";
import { eventBasePath } from "@/lib/event-slug";
import { useSocietyEventAccess } from "@/lib/society-admin";
import { cn } from "@/lib/utils";
import { statusLabels, type EventStatus } from "../../../../shared/event-status";
import type { EventFilter } from "../../../../shared/society-members";

/**
 * Every event of the society, and who runs it. Not a second Settings: each row
 * links to the event's own management, where modules, members and access are
 * edited with the controls that already exist.
 */

const tone: Record<EventStatus, string> = {
  draft: "bg-amber-100 text-amber-900",
  upcoming: "bg-sky-100 text-sky-900",
  live: "bg-emerald-100 text-emerald-900",
  completed: "bg-muted text-muted-foreground",
  cancelled: "bg-rose-100 text-rose-900",
};

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

const eventFilters: { key: EventFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "upcoming", label: "Upcoming" },
  { key: "live", label: "Live" },
  { key: "completed", label: "Completed" },
  { key: "draft", label: "Drafts" },
  { key: "cancelled", label: "Cancelled" },
];

export function EventsAccessTab({
  societyId,
  filter,
  onFilter,
}: {
  societyId: string;
  filter: EventFilter;
  onFilter: (next: EventFilter) => void;
}) {
  const { data, isLoading, error } = useSocietyEventAccess(societyId);

  if (error) {
    return (
      <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
        {error instanceof Error ? error.message : "Could not load the events."}
      </p>
    );
  }
  if (isLoading) return <p className="text-sm text-muted-foreground">Loading events...</p>;

  const events = data?.events ?? [];
  if (!events.length) {
    return (
      <p className="rounded-md border border-dashed p-5 text-sm text-muted-foreground">
        This society has no events yet. Create one from the society page.
      </p>
    );
  }

  const counts = (key: EventFilter) => (key === "all" ? events.length : events.filter((event) => event.status === key).length);
  // Drafts and Cancelled only get a chip when there is something behind it.
  const chips = eventFilters.filter((item) => item.key === filter || item.key === "all" || counts(item.key) > 0 || ["upcoming", "live", "completed"].includes(item.key));
  const visible = filter === "all" ? events : events.filter((event) => event.status === filter);

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Society admins are admins of every event below. These counts are the people given a role on each event.
      </p>
      <div role="group" aria-label="Filter events" className="flex flex-wrap gap-1.5">
        {chips.map((item) => (
          <button
            key={item.key}
            type="button"
            aria-pressed={filter === item.key}
            onClick={() => onFilter(item.key)}
            className={cn(
              "min-h-10 rounded-full border px-3 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              filter === item.key ? "border-primary bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:text-foreground",
            )}
          >
            {item.label} <span className="tabular-nums opacity-80">{counts(item.key)}</span>
          </button>
        ))}
      </div>
      {!visible.length ? (
        <p className="rounded-md border border-dashed p-5 text-sm text-muted-foreground">No events match this filter.</p>
      ) : null}
      <ul className={cn("divide-y rounded-lg border bg-card", !visible.length && "hidden")}>
        {visible.map((event) => {
          const to = `${eventBasePath({ id: event.id, slug: event.slug, societySlug: data?.societySlug })}/settings`;
          return (
            <li key={event.id}>
              <Link
                to={to}
                className="flex items-center gap-3 p-3 hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium leading-snug">{event.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {plural(event.admins, "admin")} · {event.committee} committee ·{" "}
                    {event.pages === null ? "default pages" : plural(event.pages, "page")}
                    {" · "}
                    {formatEventDate(event.startDate)}
                  </p>
                </div>
                <span className={cn("shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium", tone[event.status])}>
                  {statusLabels[event.status]}
                </span>
                <span className="inline-flex shrink-0 items-center gap-0.5 text-sm font-medium text-primary">
                  Manage
                  <ChevronRight className="h-4 w-4" aria-hidden="true" />
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
