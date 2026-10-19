import { AlertTriangle, CalendarDays } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useLocation, useParams, useSearchParams } from "react-router-dom";
import { buildCommunityFeed } from "@/features/society/community-feed";
import { CommunitySection } from "@/features/society/community-section";
import { EventCard } from "@/features/society/event-card";
import { groupByMonth, pickFeaturedEvent, residentVisibleEvents } from "@/features/society/event-presentation";
import { FeaturedEvent } from "@/features/society/featured-event";
import { FestivalIdeas } from "@/features/society/festival-ideas";
import { HomeTabs } from "@/features/society/home-tabs";
import { homeView, showsSocietyChooser, societyTabLabel, SPACE_PARAM, SPACE_VALUE } from "@/features/society/home-view";
import { MySpace } from "@/features/society/my-space";
import { SocietyChooser } from "@/features/society/society-chooser";
import { firstNameOf, greetingFor } from "@/features/society/greeting";
import { SocietyAccount } from "@/features/society/society-account";
import { SocietyHeader } from "@/features/society/society-header";
import { PassesShelf } from "@/features/society/society-shelves";
import { useSession } from "@/lib/auth";
import {
  eventEndInstant,
  eventStartInstant,
  getEventStatus,
  groupForStatus,
  type EventGroup,
} from "@/lib/event-status";
import { useEventContext } from "@/lib/event-context";
import { useSocietyHome, type SocietyEvent } from "@/lib/society";
import { cn } from "@/lib/utils";
import { useDashboardMotion } from "@/lib/dashboard-motion";
import { ScrollProgressBar } from "@/components/shared/dashboard-fx";

/**
 * A society's front door - "a society's digital community space", not an event-management dashboard.
 *
 * The question this page answers is "what is happening in my community", and the shape follows from that:
 * who you are, a greeting, one event shown large, a short scannable list, then what the community left
 * behind. It is built from type, spacing, imagery and hairlines rather than from boxes: the first version put
 * almost every element in a bordered, rounded container, which read as a SaaS template. Rounded shapes remain
 * only where they mean something - the hero, thumbnails, the role badge.
 *
 * Nothing here changes what is allowed or what is true. Permissions (`canManage`, the viewer's society role),
 * event status (`getEventStatus`), routing and the single read behind the page (src/lib/society.ts) are the
 * ones that were already here; this file only decides how they are drawn. Managing an event happens inside it.
 */

const tabs: { key: EventGroup; label: string }[] = [
  { key: "upcoming", label: "Upcoming" },
  { key: "ongoing", label: "Live" },
  { key: "past", label: "Past" },
];

export function SocietyHomePage() {
  const { societySlug } = useParams();
  const [search] = useSearchParams();
  const location = useLocation();
  const { data: session, isLoading: sessionLoading } = useSession();
  const { societies, isLoading: contextLoading } = useEventContext();
  const signedIn = Boolean(session);
  // My space, or the society - see home-view.ts. A signed-out visitor gets no tabs.
  // Decided in two steps: the society tab is the default, but an empty society hands over to My space, and
  // that is only known once its events have arrived.
  const viewOptions = { signedIn, societyCount: societies.length, hasSlug: Boolean(societySlug) };
  const firstView = homeView(search.get(SPACE_PARAM), { ...viewOptions, societyEmpty: null });
  // Somebody signed in with no society, and no society in the address, has nothing to read.
  const hasSociety = Boolean(societySlug) || societies.length > 0;
  // Signed out with no society in the address: there is no society to mean (the server would refuse), so the
  // page asks the person to sign in instead of showing that refusal as an error.
  const signedOutNowhere = !signedIn && !societySlug;
  const { data, isLoading, error } = useSocietyHome(societySlug, { enabled: firstView === "society" && hasSociety && !sessionLoading && !(signedIn && contextLoading) });
  // One clock for the whole page, so every row and the featured pick agree.
  const now = useMemo(() => new Date(), []);
  const [managing, setManaging] = useState(false);
  // Decoration only (src/lib/dashboard-motion.ts): a scroll bar along the top,
  // a tab underline that slides, and event rows that rise in when a tab opens.
  const motion = useDashboardMotion();

  // Drafts never reach this page's lists, and a cancelled event only stays while its
  // date is still ahead - see residentVisibleEvents for why.
  const events = useMemo(() => residentVisibleEvents(data?.events ?? [], now), [data?.events, now]);
  const view = homeView(search.get(SPACE_PARAM), { ...viewOptions, societyEmpty: data ? events.length === 0 : null });
  const featured = useMemo(() => pickFeaturedEvent(events, now), [events, now]);
  const grouped = useMemo(() => {
    const groups: Record<EventGroup, SocietyEvent[]> = { ongoing: [], upcoming: [], past: [] };
    for (const event of events) {
      // The featured event is listed here too, in the tab it belongs to. Hiding it left an Upcoming tab that
      // said "nothing planned" directly under an upcoming event.
      groups[groupForStatus(getEventStatus(event, now), event, now)].push(event);
    }
    groups.upcoming.sort((a, b) => eventStartInstant(a.startDate, a.startTime) - eventStartInstant(b.startDate, b.startTime));
    groups.ongoing.sort((a, b) => eventEndInstant(a.endDate, a.endTime) - eventEndInstant(b.endDate, b.endTime));
    groups.past.sort((a, b) => eventEndInstant(b.endDate, b.endTime) - eventEndInstant(a.endDate, a.endTime));
    return groups;
  }, [events, now]);

  // Open on a tab that has something in it rather than on an empty one.
  const firstPopulated = tabs.find((tab) => grouped[tab.key].length)?.key ?? "upcoming";
  const [chosen, setChosen] = useState<EventGroup | null>(null);
  const current = chosen ?? firstPopulated;

  // "From your community" never repeats an event the person is already looking at: not the featured one, and
  // not any row in the tab that is open. Switching tab can therefore bring an entry in or take it out - which
  // is the honest result of the only real entries today being finished events (see community-feed.ts).
  const community = useMemo(() => {
    const onScreen = new Set<string>(grouped[current].map((event) => event.id));
    if (featured) onScreen.add(featured.id);
    return buildCommunityFeed(
      events.filter((event) => !onScreen.has(event.id)),
      now,
      getEventStatus,
    );
  }, [events, featured, grouped, current, now]);

  // Which tab opens depends on how many societies the person has, so wait for that rather than flashing one.
  if (sessionLoading || (signedIn && contextLoading) || isLoading) return <SocietyHomeSkeleton />;
  if (signedOutNowhere) return <SignedOutHome />;

  if (error && view === "society") {
    return (
      <main className="mx-auto w-full max-w-3xl px-4 py-6">
        <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {error instanceof Error ? error.message : "Could not load this society."}
        </p>
      </main>
    );
  }

  const society = data?.society;
  const canManage = Boolean(data?.canManage);
  const hasAnything = events.length > 0;
  // The viewer's role in THIS society. Society management is for society admins; the page itself asks the server.
  const memberRole = contextLoading ? null : (societies.find((item) => item.slug === society?.slug)?.role ?? null);
  const isSocietyAdmin = memberRole === "admin";
  const drafts = data?.events.filter((event) => event.statusOverride === "draft") ?? [];

  const firstName = firstNameOf(session?.user.name);
  const greeting = session && firstName ? `${greetingFor(new Date().getHours())}, ${firstName}` : null;
  const canCreateSocietyEvent = societies.some((item) => item.role === "admin" || item.role === "committee");
  const currentSlug = societySlug ?? society?.slug ?? societies[0]?.slug ?? null;
  const spaceTo = `${location.pathname}?${SPACE_PARAM}=${SPACE_VALUE}`;
  const societyTo = currentSlug ? `/society/${currentSlug}` : "/society";

  return (
    <main className="mx-auto w-full max-w-3xl px-4 pb-12 pt-4 sm:pt-6">
      {motion ? <ScrollProgressBar /> : null}
      {/* Signed in: a compact greeting, then the two tabs. Signed out: the society's own header, as before. */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {signedIn ? (
            <header>
              <h1 className="font-display text-2xl font-semibold leading-tight sm:text-[28px]">{greeting ?? "Welcome back"}</h1>
              <p className="mt-0.5 text-sm text-muted-foreground">Here&rsquo;s what&rsquo;s coming up for you.</p>
            </header>
          ) : society ? (
            <SocietyHeader society={society} greeting={null} />
          ) : null}
        </div>
        <SocietyAccount
          role={memberRole}
          canManage={canManage}
          isSocietyAdmin={isSocietyAdmin}
          societySlug={society?.slug}
          draftCount={drafts.length}
          onShowDrafts={() => setManaging(true)}
        />
      </div>

      {signedIn ? (
        <HomeTabs
          view={view}
          spaceTo={spaceTo}
          societyTo={societyTo}
          societyLabel={societyTabLabel(societies)}
          societyLogoUrl={societies.length === 1 ? societies[0].logoUrl : null}
          action={
            view === "society" && canManage ? (
              <Link
                to="/new-event"
                className="inline-flex h-9 items-center rounded-lg border bg-card px-3 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                + Create event
              </Link>
            ) : null
          }
        />
      ) : null}

      {view === "space" ? (
        <MySpace canCreateSocietyEvent={canCreateSocietyEvent} />
      ) : !hasSociety ? (
        <NoSociety />
      ) : (
      <>
      {signedIn && showsSocietyChooser(societies.length) ? <SocietyChooser societies={societies} currentSlug={society?.slug ?? null} /> : null}

      {data?.ready === false ? (
        <p className="mt-4 flex items-start gap-2 rounded-md bg-amber-100 p-3 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>Society events are being set up. Please check back shortly.</span>
        </p>
      ) : null}

      {managing && canManage && drafts.length ? (
        <section className="mt-3" aria-label="Draft events">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Draft events</h2>
            <button
              type="button"
              onClick={() => setManaging(false)}
              className="min-h-10 rounded-md px-2 text-sm font-medium text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Hide
            </button>
          </div>
          <ul className="mt-1 divide-y">
            {drafts.map((event) => (
              <li key={event.id}>
                <Link
                  className="-mx-2 flex min-h-12 items-center justify-between gap-3 rounded-lg px-2 py-3 text-[15px] font-medium hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  to={eventPath(event)}
                >
                  <span className="min-w-0 truncate">{event.name}</span>
                  <span className="shrink-0 text-sm text-primary">Continue setup &rarr;</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {data?.myPasses?.length ? <PassesShelf events={events} passes={data.myPasses} now={now} /> : null}

      {featured ? (
        // Edge to edge on a phone: the main column's own 16px gutters are pulled back.
        <section className="-mx-4 mt-4 sm:mx-0" aria-label="Featured event">
          <FeaturedEvent event={featured} to={eventPath(featured)} now={now} />
        </section>
      ) : null}

      {hasAnything ? (
        <>
          <h2 className="font-display mt-7 text-2xl font-semibold">Events</h2>

          {/* Text tabs, equal thirds, with an underline under the chosen one: filled pills competed with
              the hero for weight, and a dimmed tab read as disabled. A tab with nothing in it looks like
              every other - it is as selectable as any - and says so when chosen. */}
          <div role="tablist" aria-label="Events by when they happen" className="relative mt-1 grid grid-cols-3 border-b">
            {/* One underline that slides to the chosen tab. The tabs are equal thirds, so its place is
                the tab's index - nothing to measure. */}
            {motion ? (
              <span
                aria-hidden
                className="pointer-events-none absolute -bottom-px left-0 h-0.5 w-1/3 px-3 transition-transform duration-500 ease-[cubic-bezier(0.3,1.3,0.5,1)]"
                style={{ transform: `translateX(${tabs.findIndex((tab) => tab.key === current) * 100}%)` }}
              >
                <span className="block h-full rounded-full bg-primary" />
              </span>
            ) : null}
            {tabs.map((tab) => {
              const count = grouped[tab.key].length;
              const selected = tab.key === current;
              return (
                <button
                  key={tab.key}
                  role="tab"
                  type="button"
                  aria-selected={selected}
                  aria-controls={`panel-${tab.key}`}
                  id={`tab-${tab.key}`}
                  onClick={() => setChosen(tab.key)}
                  className={cn(
                    "font-display relative min-h-11 px-2 text-base font-medium transition-colors",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
                    selected ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {tab.label}
                  {count ? <span className="ml-1.5 font-sans text-xs tabular-nums text-muted-foreground">{count}</span> : null}
                  {selected && !motion ? <span aria-hidden className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-primary" /> : null}
                </button>
              );
            })}
          </div>

          <section key={current} role="tabpanel" id={`panel-${current}`} aria-labelledby={`tab-${current}`} className="mt-1">
            {grouped[current].length ? (
              // Months only once there is enough to scan - see groupByMonth.
              groupByMonth(grouped[current], now).map((group) => (
                <div key={group.key || "all"}>
                  {group.heading ? (
                    <h3 className="pt-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {group.heading}
                    </h3>
                  ) : null}
                  <ul className="divide-y">
                    {group.events.map((event, index) => (
                      <li
                        key={event.id}
                        className={motion ? "dfx-row" : undefined}
                        style={motion ? { animationDelay: `${Math.min(index, 11) * 70}ms` } : undefined}
                      >
                        <EventCard event={event} to={eventPath(event)} now={now} />
                      </li>
                    ))}
                  </ul>
                </div>
              ))
            ) : (
              <EmptyGroup group={current} canCreate={canManage} />
            )}
          </section>
        </>
      ) : data?.ready !== false ? (
        <EmptySociety canCreate={canManage} />
      ) : null}

      {canManage && data?.ready !== false ? <FestivalIdeas events={data?.events ?? []} now={now} eventPath={eventPath} /> : null}

      <CommunitySection entries={community} />
      </>
      )}
    </main>
  );
}

/**
 * Where a card points.
 *
 * The id form is the address that has always worked and still does, so every
 * existing link, bookmark and share token keeps resolving. The slug route is
 * additive and can take over later without this page changing.
 */
function eventPath(event: SocietyEvent) {
  return `/e/${event.id}/dashboard`;
}

/** A lightweight note, not a dashed box. Somebody who may create an event is offered to, only where "nothing
 *  planned" is the thing they would want to fix. */
function EmptyGroup({ group, canCreate }: { group: EventGroup; canCreate: boolean }) {
  const copy: Record<EventGroup, string> = {
    upcoming: "Nothing planned yet. When the committee adds an event, it will show up here.",
    ongoing: "Nothing happening right now.",
    past: "No events have finished yet.",
  };
  return (
    <div className="py-5">
      <p className="text-[15px] text-muted-foreground">{copy[group]}</p>
      {group === "upcoming" && canCreate ? (
        <Link
          to="/new-event"
          className="mt-2 inline-flex min-h-10 items-center rounded-md text-sm font-medium text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Create event &rarr;
        </Link>
      ) : null}
    </div>
  );
}

function EmptySociety({ canCreate }: { canCreate: boolean }) {
  return (
    <div className="mt-8 flex flex-col items-center gap-2 py-4 text-center">
      <CalendarDays className="h-8 w-8 text-muted-foreground" aria-hidden />
      <p className="font-display text-2xl font-semibold">No events yet</p>
      <p className="max-w-sm text-[15px] text-muted-foreground">
        This society has not published an event. Once one is created it will appear here for everybody.
      </p>
      {canCreate ? (
        <Link
          to="/new-event"
          className="mt-1 inline-flex min-h-10 items-center rounded-md text-sm font-medium text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Create event &rarr;
        </Link>
      ) : null}
    </div>
  );
}

/** Signed out, at the bare home address (an installed app icon, an old bookmark): an invitation to sign in. */
function SignedOutHome() {
  return (
    <main className="mx-auto flex min-h-[70vh] w-full max-w-md flex-col items-center justify-center px-4 py-10 text-center">
      <img src="/icon-192.png" alt="" aria-hidden className="h-16 w-16 rounded-2xl shadow-sm" />
      <h1 className="font-display mt-5 text-3xl font-semibold">Welcome to SymPal</h1>
      <p className="mt-2 text-[15px] text-muted-foreground">
        Sign in to see your society&rsquo;s events, your passes and the celebrations you host.
      </p>
      <Link
        to="/login"
        state={{ from: "/" }}
        className="mt-6 inline-flex h-11 items-center rounded-lg bg-primary px-6 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        Sign in
      </Link>
      <p className="mt-4 text-xs text-muted-foreground">Got an invitation link? Open it directly; no account is needed to reply.</p>
    </main>
  );
}

/** Signed in, with no society yet and none in the address. */
function NoSociety() {
  return (
    <div className="mt-8 flex flex-col items-center gap-2 py-4 text-center">
      <CalendarDays className="h-8 w-8 text-muted-foreground" aria-hidden />
      <p className="font-display text-2xl font-semibold">You haven&rsquo;t joined a society yet</p>
      <p className="max-w-sm text-[15px] text-muted-foreground">
        Your committee shares a link for each event. Open it and sign in, and your society&rsquo;s events will show
        up here.
      </p>
    </div>
  );
}

/** Never a `0` while the counts are still in flight - a zero that is really
 *  "unknown" is a lie, and this page is made almost entirely of counts. */
function SocietyHomeSkeleton() {
  return (
    <main className="mx-auto w-full max-w-3xl animate-pulse px-4 pb-12 pt-4 sm:pt-6" aria-hidden>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <div className="h-3 w-44 rounded bg-muted" />
          <div className="mt-2 h-7 w-64 rounded-md bg-muted" />
          <div className="mt-2 h-4 w-52 rounded bg-muted" />
        </div>
        <div className="h-10 w-10 rounded-full bg-muted" />
      </div>
      <div className="-mx-4 mt-4 aspect-[16/10] bg-muted sm:mx-0 sm:aspect-[16/6] sm:rounded-2xl" />
      <div className="mt-7 h-7 w-28 rounded bg-muted" />
      <div className="mt-4 space-y-4">
        {[0, 1].map((key) => (
          <div key={key} className="flex gap-4">
            <div className="h-24 w-[84px] shrink-0 rounded-lg bg-muted" />
            <div className="flex-1 space-y-2 pt-2">
              <div className="h-3 w-28 rounded bg-muted" />
              <div className="h-5 w-48 rounded bg-muted" />
              <div className="h-3 w-24 rounded bg-muted" />
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
