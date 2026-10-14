import { ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";
import { formatEventDate } from "@/features/dashboard/dashboard-utils";
import { eventBasePath } from "@/lib/event-slug";
import { useSocietyEventAccess } from "@/lib/society-admin";
import { cn } from "@/lib/utils";
import { statusLabels, type EventStatus } from "../../../../shared/event-status";

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

export function EventsAccessTab({ societyId }: { societyId: string }) {
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

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Society admins are admins of every event below. These counts are the people given a role on each event.
      </p>
      <ul className="divide-y rounded-lg border bg-card">
        {events.map((event) => {
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
