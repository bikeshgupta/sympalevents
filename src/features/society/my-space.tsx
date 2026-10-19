import { CalendarHeart, LogIn, Sparkles } from "lucide-react";
import { useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { FilterTabs } from "@/components/shared/filter-tabs";
import { CreateEventBanner, JoinEventCard } from "@/features/society/home-cards";
import { RisingWords } from "@/components/shared/dashboard-fx";
import { PersonalEventCard, type CardChip } from "@/features/personal/personal-event-card";
import { useSession } from "@/lib/auth";
import { useDashboardMotion, useScrollReveal } from "@/lib/dashboard-motion";
import { getDateInEventZone } from "@/lib/event-status";
import { useMyPersonalEvents, type MinePersonal } from "@/lib/personal-events";
import { firstFilledList, myEventLists } from "../../../shared/personal-events";

/**
 * My space: the person's own private events - the ones they host and the invitations they have answered.
 * Nothing here comes from a society, and nothing here reaches one (migration 049 keeps personal events in
 * tables of their own; only api/_lib/personal-events.ts reads them). Society events are the other tab.
 *
 * Order: a greeting, one compact call to create (the kind is chosen on the next page), then My events (Hosting,
 * Invited, Joined, Past). From `lg` the join box and quick actions sit in a column beside them; on a phone they
 * follow. The greeting rises in a word at a time and each section below the first screen slides up as it is
 * scrolled to (`useScrollReveal`, the dashboard's), all off for reduced motion.
 *
 * Signed out it is the same page with nothing of theirs in it yet: creating asks for sign-in at that moment,
 * and a code opens an invitation without an account. Before 049 is applied the server answers `ready: false`
 * and the page says personal events are coming rather than offering a button that would only fail.
 */
export function MySpace({ greeting, canCreateSocietyEvent }: { greeting: string; canCreateSocietyEvent: boolean }) {
  const { data: session } = useSession();
  const personal = useMyPersonalEvents();
  const motion = useDashboardMotion();
  // Signed out, whether personal events are switched on is only known after sign-in; creating asks for it.
  const ready = session ? Boolean(personal.data?.ready) : true;
  const mainRef = useRef<HTMLDivElement>(null);
  const asideRef = useRef<HTMLElement>(null);
  useScrollReveal(mainRef, motion);
  useScrollReveal(asideRef, motion);

  return (
    <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-8">
      <div ref={mainRef} className="min-w-0">
        <header className="mt-5">
          <h1 className="font-display text-2xl font-semibold leading-tight sm:text-3xl" aria-label={motion ? greeting : undefined}>
            {motion ? <RisingWords text={greeting} /> : greeting}
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground sm:text-[15px]">Your celebrations, invitations and memories</p>
        </header>
        <CreateEventBanner ready={ready} motion={motion} />
        <MyEvents signedIn={Boolean(session)} query={personal} motion={motion} />
      </div>

      <aside ref={asideRef} className="mt-7 space-y-3 lg:mt-5" aria-label="Join and quick actions">
        <JoinEventCard />
        {canCreateSocietyEvent ? (
          <Link
            to="/new-event"
            className="glass-card glass-press flex min-h-14 items-center gap-3 rounded-full py-2 pl-2 pr-5 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span aria-hidden="true" className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Sparkles className="h-[18px] w-[18px]" strokeWidth={1.75} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block">Create a society event</span>
              <span className="block text-xs font-normal text-muted-foreground">For your committee, not a private one</span>
            </span>
            <span aria-hidden="true" className="text-primary">
              &rarr;
            </span>
          </Link>
        ) : null}
      </aside>
    </div>
  );
}

type ListKey = "hosting" | "invited" | "joined" | "past";
type Lists = ReturnType<typeof myEventLists<MinePersonal["hosting"][number], MinePersonal["invited"][number]>>;

const replyChip: Record<"going" | "maybe" | "declined", CardChip> = {
  going: { label: "Going", tone: "primary" },
  maybe: { label: "Maybe", tone: "warning" },
  declined: { label: "Can't come", tone: "muted" },
};

/**
 * My events is one panel: its heading, the Hosting / Invited / Joined / Past filter and the events under it sit
 * in a single glass card, because they are one thing - the filter belongs to the list it filters. Every state
 * (signed out, loading, error, nothing yet) draws inside the same panel, so the page keeps its shape.
 */
function EventsPanel({ children, busy }: { children: ReactNode; busy?: boolean }) {
  return (
    <section aria-labelledby="my-events" aria-busy={busy || undefined} className="glass-card mt-6 rounded-[30px] p-3 sm:p-4">
      <h2 id="my-events" className="font-display px-1 text-xl font-semibold">
        My events
      </h2>
      {children}
    </section>
  );
}

function MyEvents({ signedIn, query, motion }: { signedIn: boolean; query: ReturnType<typeof useMyPersonalEvents>; motion: boolean }) {
  const location = useLocation();
  const today = getDateInEventZone(new Date());
  const lists = useMemo(() => (query.data?.ready ? myEventLists(query.data.hosting, query.data.invited, today) : null), [query.data, today]);
  const [chosen, setChosen] = useState<ListKey | null>(null);

  if (!signedIn) {
    return (
      <EventsPanel>
        <div className="mt-2 flex items-center gap-3 px-1">
          <p className="min-w-0 flex-1 text-sm text-muted-foreground">Sign in to see what you host and the invitations you&rsquo;ve answered.</p>
          <Button asChild className="h-10 shrink-0 rounded-full px-4">
            <Link to="/login" state={{ from: `${location.pathname}${location.search}` }}>
              <LogIn className="h-4 w-4" aria-hidden="true" />
              Sign in
            </Link>
          </Button>
        </div>
      </EventsPanel>
    );
  }

  if (query.isLoading) {
    return (
      <EventsPanel busy>
        <div className="mt-3 h-11 animate-pulse rounded-full bg-white/60" />
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {[0, 1].map((key) => (
            <div key={key} className="flex animate-pulse gap-3.5 rounded-[22px] bg-white/50 p-2">
              <div className="h-[84px] w-[84px] rounded-[18px] bg-muted" />
              <div className="flex-1 space-y-2 pt-2">
                <div className="h-4 w-3/4 rounded bg-muted" />
                <div className="h-3 w-1/2 rounded bg-muted" />
                <div className="h-4 w-16 rounded-full bg-muted" />
              </div>
            </div>
          ))}
        </div>
      </EventsPanel>
    );
  }

  if (query.error) {
    return (
      <EventsPanel>
        <p className="mt-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {query.error instanceof Error ? query.error.message : "Could not load your events."}
        </p>
      </EventsPanel>
    );
  }

  if (!lists) return null;

  const total = lists.hosting.length + lists.invited.length + lists.joined.length + lists.past.length;
  if (!total) {
    return (
      <EventsPanel>
        <div className="mt-2 flex flex-col gap-3 px-1 sm:flex-row sm:items-center">
          <span aria-hidden="true" className="hidden h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary sm:flex">
            <CalendarHeart className="h-5 w-5" strokeWidth={1.75} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-semibold">Nothing planned yet</p>
            <p className="text-sm text-muted-foreground">Host a celebration, or open an invitation you were sent.</p>
          </div>
          <div className="flex gap-2">
            <Button asChild className="h-10 rounded-full px-4">
              <Link to="/my/new">Create event</Link>
            </Button>
            <Button type="button" variant="outline" className="h-10 rounded-full bg-white/60 px-4" onClick={() => document.getElementById("join-event-code")?.focus()}>
              Join with a code
            </Button>
          </div>
        </div>
      </EventsPanel>
    );
  }

  const current = chosen ?? firstFilledList(lists);
  return (
    <EventsPanel>
      <div className="mt-2">
        <FilterTabs
          label="My events"
          idPrefix="my-events"
          motion={motion}
          value={current}
          onChange={setChosen}
          tabs={[
            { key: "hosting", label: "Hosting", count: lists.hosting.length },
            { key: "invited", label: "Invited", count: lists.invited.length },
            { key: "joined", label: "Joined", count: lists.joined.length },
            { key: "past", label: "Past", count: lists.past.length },
          ]}
        />
      </div>
      <div key={current} role="tabpanel" id="my-events-panel" aria-labelledby={`my-events-tab-${current}`} className="mt-3">
        <EventGrid lists={lists} current={current} motion={motion} />
      </div>
    </EventsPanel>
  );
}

const emptyLine: Record<ListKey, string> = {
  hosting: "You're not hosting anything coming up. Create an event to start one.",
  invited: "No invitations waiting on you. One you open and answer maybe shows up here.",
  joined: "Invitations you've said yes to will show up here.",
  past: "Events you hosted or went to stay here once their day has passed.",
};

const cancelled: CardChip = { label: "Cancelled", tone: "danger" };

function EventGrid({ lists, current, motion }: { lists: Lists; current: ListKey; motion: boolean }) {
  const cards =
    current === "hosting"
      ? lists.hosting.map((event) => ({
          key: event.id,
          event,
          to: `/my/e/${event.id}`,
          chip: event.status === "cancelled" ? cancelled : ({ label: "Hosting", tone: "primary" } satisfies CardChip),
          going: event.counts.goingPeople as number | null,
        }))
      : current === "past"
        ? lists.past.map(({ row, hosted }) => ({
            key: `${hosted ? "h" : "i"}-${row.id}`,
            event: row,
            to: hosted ? `/my/e/${row.id}` : `/i/${row.code}`,
            chip: { label: hosted ? "Hosted" : "myStatus" in row && row.myStatus === "going" ? "Went" : "Invited", tone: "muted" } satisfies CardChip,
            going: hosted ? row.counts.goingPeople : null,
          }))
        : lists[current].map((event) => ({
            key: event.id,
            event,
            to: `/i/${event.code}`,
            chip: event.status === "cancelled" ? cancelled : event.myStatus ? replyChip[event.myStatus] : ({ label: "Invited", tone: "primary" } satisfies CardChip),
            going: event.counts.goingPeople as number | null,
          }));

  if (!cards.length) return <p className="rounded-[22px] bg-white/50 px-4 py-3 text-sm text-muted-foreground">{emptyLine[current]}</p>;

  return (
    <ul className="grid grid-cols-[minmax(0,1fr)] gap-2 sm:grid-cols-2">
      {cards.map((card, index) => (
        <li key={card.key} className={motion ? "dfx-row" : undefined} style={motion ? { animationDelay: `${Math.min(index, 11) * 60}ms` } : undefined}>
          <PersonalEventCard event={card.event} to={card.to} chip={card.chip} going={card.going} past={current === "past"} />
        </li>
      ))}
    </ul>
  );
}
