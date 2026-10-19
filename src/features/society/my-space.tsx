import { useMemo } from "react";
import { Link } from "react-router-dom";
import { CodeBox, CreateEventCard } from "@/features/society/home-cards";
import { formatPersonalDate, useMyPersonalEvents, type MinePersonal } from "@/lib/personal-events";
import { themeByKey } from "@/lib/themes";
import { kindOf } from "../../../shared/personal-events";
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
 * And the person's **personal events** (migration 049; src/features/personal/): the ones they host, and the
 * ones they have replied to while signed in. Before 049 is applied the server says so (`ready: false`) and
 * the card says they are coming rather than offering a button that would only fail.
 */
const roleLabel: Record<NonNullable<EventOption["role"]>, string> = {
  admin: "Organising",
  committee: "Organising",
  read_only: "Member",
};

export function MySpace({ canCreateSocietyEvent }: { canCreateSocietyEvent: boolean }) {
  const { events, isLoading } = useEventContext();
  const personal = useMyPersonalEvents();
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
      {personal.data?.ready ? <PersonalLists data={personal.data} today={today} motion={motion} /> : null}
      {organising.length ? <EventList title="You're organising" events={organising} today={today} motion={motion} /> : null}
      {member.length ? <EventList title="Your events" events={member} today={today} motion={motion} /> : null}
      {!organising.length && !member.length && !personal.data?.hosting.length && !personal.data?.invited.length ? (
        <p className="mt-6 text-[15px] text-muted-foreground">
          Nothing here yet. Events you organise or are part of, in any society, will show up here.
        </p>
      ) : null}

      <CreateEventCard ready={Boolean(personal.data?.ready)} canCreateSocietyEvent={canCreateSocietyEvent} />

      <CodeBox />
    </div>
  );
}

/** What the person hosts, and what they have replied to - upcoming first, then a short list of past ones. */
function PersonalLists({ data, today, motion }: { data: MinePersonal; today: string; motion: boolean }) {
  const hosting = data.hosting.filter((event) => event.startsOn >= today);
  const invited = data.invited.filter((event) => event.startsOn >= today);
  const past = [
    ...data.hosting.map((event) => ({ ...event, to: `/my/e/${event.id}` })),
    ...data.invited.map((event) => ({ ...event, to: `/i/${event.code}` })),
  ]
    .filter((event) => event.startsOn < today)
    .sort((a, b) => b.startsOn.localeCompare(a.startsOn))
    .slice(0, 3);
  const replyLabel = { going: "You're going", maybe: "You said maybe", declined: "Can't come" } as const;
  const row = (
    key: string,
    to: string,
    title: string,
    kind: string,
    color: string,
    line: string,
    chip: string,
    index: number,
  ) => (
    <li key={key} className={motion ? "dfx-row" : undefined} style={motion ? { animationDelay: `${Math.min(index, 11) * 70}ms` } : undefined}>
      <Link
        to={to}
        className="group -mx-2 flex items-center gap-3.5 rounded-lg px-2 py-3 transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span aria-hidden="true" className="flex h-14 w-12 shrink-0 items-center justify-center rounded-lg text-2xl" style={{ background: `hsl(${themeByKey(color).primary} / 0.14)` }}>
          {kindOf(kind).emoji}
        </span>
        <span className="min-w-0 flex-1">
          <span className="font-display block truncate text-lg font-semibold leading-snug">{title}</span>
          <span className="block truncate text-sm text-muted-foreground tabular-nums">{line}</span>
        </span>
        <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">{chip}</span>
      </Link>
    </li>
  );
  return (
    <>
      {hosting.length ? (
        <section className="mt-6" aria-label="You're hosting">
          <h2 className="font-display text-xl font-semibold">You're hosting</h2>
          <ul className="mt-1 divide-y">
            {hosting.map((event, index) =>
              row(event.id, `/my/e/${event.id}`, event.title, event.kind, event.color, `${formatPersonalDate(event.startsOn)} · ${event.counts.goingPeople} going`, event.status === "cancelled" ? "Cancelled" : "Hosting", index),
            )}
          </ul>
        </section>
      ) : null}
      {invited.length ? (
        <section className="mt-6" aria-label="Invitations">
          <h2 className="font-display text-xl font-semibold">Invitations</h2>
          <ul className="mt-1 divide-y">
            {invited.map((event, index) =>
              row(event.id, `/i/${event.code}`, event.title, event.kind, event.color, formatPersonalDate(event.startsOn), event.myStatus ? replyLabel[event.myStatus] : "Invited", index),
            )}
          </ul>
        </section>
      ) : null}
      {past.length ? (
        <section className="mt-6" aria-label="Past celebrations">
          <h2 className="font-display text-xl font-semibold">Past celebrations</h2>
          <ul className="mt-1 divide-y">
            {past.map((event, index) => row(`past-${event.id}`, event.to, event.title, event.kind, event.color, formatPersonalDate(event.startsOn), "Done", index))}
          </ul>
        </section>
      ) : null}
    </>
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
