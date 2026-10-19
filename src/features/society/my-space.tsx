import { CalendarHeart, Sparkles } from "lucide-react";
import { useMemo } from "react";
import { Link } from "react-router-dom";
import { formatEventDate } from "@/features/dashboard/dashboard-utils";
import { getDateInEventZone } from "@/lib/event-status";
import { useEventContext, type EventOption } from "@/lib/event-context";
import { useDashboardMotion } from "@/lib/dashboard-motion";

/**
 * My space: what is the person's own, across every society.
 *
 * Today that is the events they have a role on (organising, or a member of), from the same `my-events`
 * read the event switcher uses - so this tab costs no request of its own. Finished events are left out;
 * they are each society's memories.
 *
 * Personal events (a birthday, an anniversary, a get-together, private and invite-only) belong here too,
 * but they need their own storage and are the next step. Until then the card says they are coming rather
 * than offering a button that does nothing; an organiser is pointed at the society event they can create
 * today.
 */
const roleLabel: Record<NonNullable<EventOption["role"]>, string> = {
  admin: "Organising",
  committee: "Organising",
  read_only: "Member",
};

export function MySpace({ canCreateSocietyEvent }: { canCreateSocietyEvent: boolean }) {
  const { events, isLoading } = useEventContext();
  const motion = useDashboardMotion();
  const today = getDateInEventZone(new Date());

  const { organising, member } = useMemo(() => {
    const current = events
      .filter((event) => event.end_date >= today)
      .sort((a, b) => a.start_date.localeCompare(b.start_date));
    return {
      organising: current.filter((event) => event.role === "admin" || event.role === "committee"),
      member: current.filter((event) => event.role !== "admin" && event.role !== "committee"),
    };
  }, [events, today]);

  if (isLoading) {
    return (
      <div className="mt-6 animate-pulse space-y-4" aria-hidden>
        {[0, 1].map((key) => (
          <div key={key} className="flex gap-4">
            <div className="h-16 w-14 rounded-lg bg-muted" />
            <div className="flex-1 space-y-2 pt-2">
              <div className="h-4 w-48 rounded bg-muted" />
              <div className="h-3 w-32 rounded bg-muted" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div>
      {organising.length ? <EventList title="You're organising" events={organising} today={today} motion={motion} /> : null}
      {member.length ? <EventList title="Your events" events={member} today={today} motion={motion} /> : null}
      {!organising.length && !member.length ? (
        <p className="mt-6 text-[15px] text-muted-foreground">
          Nothing here yet. Events you organise or are part of, in any society, will show up here.
        </p>
      ) : null}

      <section aria-labelledby="host-own" className="mt-8 border-t pt-6">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <CalendarHeart className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 id="host-own" className="font-display text-xl font-semibold">
              Host your own celebration
            </h2>
            <p className="mt-1 max-w-prose text-[15px] text-muted-foreground">
              Birthdays, anniversaries, baby showers and get-togethers: private and invite-only, free, with
              replies, wishes and photos in one place. Coming soon to My space.
            </p>
            {canCreateSocietyEvent ? (
              <Link
                to="/new-event"
                className="mt-2 inline-flex min-h-10 items-center gap-1.5 rounded-md text-sm font-medium text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Sparkles className="h-4 w-4" aria-hidden="true" />
                Create a society event &rarr;
              </Link>
            ) : null}
          </div>
        </div>
      </section>
    </div>
  );
}

function EventList({ title, events, today, motion }: { title: string; events: EventOption[]; today: string; motion: boolean }) {
  return (
    <section className="mt-6" aria-label={title}>
      <h2 className="font-display text-xl font-semibold">{title}</h2>
      <ul className="mt-1 divide-y">
        {events.map((event, index) => {
          const live = event.start_date <= today;
          const [, month, day] = event.start_date.split("-");
          const monthName = new Date(Date.UTC(2000, Number(month) - 1, 1)).toLocaleString("en-IN", { month: "short", timeZone: "UTC" });
          return (
            <li
              key={event.id}
              className={motion ? "dfx-row" : undefined}
              style={motion ? { animationDelay: `${Math.min(index, 11) * 70}ms` } : undefined}
            >
              <Link
                to={`/e/${event.id}`}
                className="group -mx-2 flex items-center gap-3.5 rounded-lg px-2 py-3 transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="flex h-14 w-12 shrink-0 flex-col items-center justify-center rounded-lg border bg-card leading-none">
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{monthName}</span>
                  <span className="font-display mt-1 text-xl font-semibold tabular-nums">{Number(day)}</span>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="font-display block truncate text-lg font-semibold leading-snug">{event.name}</span>
                  <span className="block truncate text-sm text-muted-foreground">
                    {[event.societyName, live ? "Happening now" : formatEventDate(event.start_date)].filter(Boolean).join(" · ")}
                  </span>
                </span>
                <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                  {roleLabel[event.role ?? "read_only"]}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
