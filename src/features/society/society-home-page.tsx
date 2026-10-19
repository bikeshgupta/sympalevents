import { AlertTriangle, CalendarDays, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useLocation, useParams, useSearchParams } from "react-router-dom";
import { buildCommunityFeed } from "@/features/society/community-feed";
import { CommunitySection } from "@/features/society/community-section";
import { EventCard } from "@/features/society/event-card";
import { groupByMonth, pickFeaturedEvent, residentVisibleEvents } from "@/features/society/event-presentation";
import { FeaturedEvent } from "@/features/society/featured-event";
import { FestivalIdeas } from "@/features/society/festival-ideas";
import { HomeTabs } from "@/features/society/home-tabs";
import { homeView, showsSocietyChooser, SOCIETY_VALUE, societyTabLabel, SPACE_PARAM, SPACE_VALUE } from "@/features/society/home-view";
import { MySpace } from "@/features/society/my-space";
import { HomeAmbient } from "@/features/society/home-ambient";
import { JoinEventCard } from "@/features/society/home-cards";
import { FilterTabs } from "@/components/shared/filter-tabs";
import { Button } from "@/components/ui/button";
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
  // My space, or the society - see home-view.ts. The same page for everybody, signed in or not.
  // Decided in two steps: the society tab is the default, but an empty society hands over to My space, and
  // that is only known once its events have arrived.
  const viewOptions = { societyCount: societies.length, hasSlug: Boolean(societySlug) };
  const firstView = homeView(search.get(SPACE_PARAM), { ...viewOptions, societyEmpty: null });
  // With no society, and none in the address, the society tab has nothing to read (the server would refuse).
  const hasSociety = Boolean(societySlug) || societies.length > 0;
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
  const societyTo = currentSlug ? `/society/${currentSlug}` : `/society?${SPACE_PARAM}=${SOCIETY_VALUE}`;
  const showTabs = signedIn || !societySlug;

  return (
    <main className="mx-auto w-full max-w-3xl px-4 pb-12 pt-3 sm:pt-5 lg:max-w-6xl lg:px-8">
      {motion ? <ScrollProgressBar /> : null}
      <HomeAmbient />
      {/* The brand and the account on one floating glass bar that stays at the top as the page scrolls. Its
          menu opens in a portal, so nothing fixed sits inside the bar's backdrop filter. */}
      <div className="glass sticky top-2 z-30 -mx-1 flex items-center justify-between gap-3 rounded-full py-1.5 pl-1.5 pr-1.5 sm:top-3">
        <Link
          to="/"
          className="flex min-h-11 items-center gap-2.5 rounded-full pr-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {/* The app's own icon, the same file as the tab icon and the event header's way home. */}
          <img src="/favicon.svg" alt="" width={40} height={40} className="h-10 w-10 shrink-0 rounded-full shadow-sm ring-2 ring-white/80" />
          <span className="leading-tight">
            <span className="font-display block text-lg font-semibold">SymPal</span>
            <span className="block text-xs text-muted-foreground">Celebrate your way</span>
          </span>
        </Link>
        <SocietyAccount
          role={memberRole}
          canManage={canManage}
          isSocietyAdmin={isSocietyAdmin}
          societySlug={society?.slug}
          draftCount={drafts.length}
          onShowDrafts={() => setManaging(true)}
        />
      </div>

      {showTabs ? (
        <HomeTabs
          view={view}
          spaceTo={spaceTo}
          societyTo={societyTo}
          societyLabel={societyTabLabel(societies)}
          societyLogoUrl={societies.length === 1 ? societies[0].logoUrl : null}
        />
      ) : null}

      {/* Keyed on the view, so switching halves slides the new content in from that half's side. */}
      <div key={view} className={motion && showTabs ? (view === "space" ? "dfx-from-left" : "dfx-from-right") : undefined}>
      {view === "space" ? (
        <MySpace greeting={greeting ?? (signedIn ? "Welcome back" : "Welcome to SymPal")} canCreateSocietyEvent={canCreateSocietyEvent} />
      ) : !hasSociety ? (
        <NoSociety signedIn={signedIn} />
      ) : (
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-8">
      <div className="min-w-0">
      <div className="mt-5 flex items-end justify-between gap-3">
        <div className="min-w-0">{society ? <SocietyHeader society={society} greeting={signedIn ? greeting : null} /> : null}</div>
        {canManage ? (
          <Button asChild variant="outline" className="hidden shrink-0 rounded-full bg-white/60 shadow-sm backdrop-blur sm:inline-flex">
            <Link to="/new-event">
              <Plus className="h-4 w-4" aria-hidden="true" />
              Create event
            </Link>
          </Button>
        ) : null}
      </div>

      {signedIn && showsSocietyChooser(societies.length) ? (
        <section aria-labelledby="your-societies" className="mt-5">
          <h2 id="your-societies" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Your societies
          </h2>
          <SocietyChooser societies={societies} currentSlug={society?.slug ?? null} />
        </section>
      ) : null}

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
        // A rounded glass-edged frame at every width, like every other card on the home.
        <section className="mt-4" aria-label="Featured event">
          <FeaturedEvent event={featured} to={eventPath(featured)} now={now} />
        </section>
      ) : null}

      {hasAnything ? (
        <>
          <h2 className="font-display mt-7 text-2xl font-semibold">Events</h2>
          <div className="mt-1">
            <FilterTabs
              label="Events by when they happen"
              idPrefix="society-events"
              motion={motion}
              value={current}
              onChange={setChosen}
              tabs={tabs.map((tab) => ({ key: tab.key, label: tab.label, count: grouped[tab.key].length }))}
            />
          </div>

          <section key={current} role="tabpanel" id="society-events-panel" aria-labelledby={`society-events-tab-${current}`} className="glass-card mt-3 rounded-[28px] px-4 py-1">
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


      <CommunitySection entries={community} />
      </div>

      <aside className="mt-8 space-y-6 lg:mt-5" aria-label="Plan and join">
        {canManage && data?.ready !== false ? (
          <div className="glass-card rounded-[28px] px-4 pb-2 pt-1 empty:hidden [&>section]:mt-3">
            <FestivalIdeas events={data?.events ?? []} now={now} eventPath={eventPath} />
          </div>
        ) : null}
        {signedIn ? <JoinEventCard variant="society" /> : null}
      </aside>
      </div>
      )}
      </div>
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

/**
 * No society yet, and none in the address. Signed out, the society may simply be behind the sign-in; either
 * way the code box is right here, because a code from the committee is how somebody joins one.
 */
function NoSociety({ signedIn }: { signedIn: boolean }) {
  const location = useLocation();
  return (
    <div className="mx-auto mt-8 max-w-md">
      <div className="flex flex-col items-center gap-2 py-2 text-center">
        <span aria-hidden="true" className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <CalendarDays className="h-6 w-6" strokeWidth={1.75} />
        </span>
        <p className="font-display text-2xl font-semibold">{signedIn ? "You haven\u2019t joined a society yet" : "Already part of a society?"}</p>
        <p className="max-w-sm text-[15px] text-muted-foreground">
          {signedIn
            ? "Enter the code your committee shared, or open a link to one of its events and your society will show up here."
            : "Sign in to see its events and your passes, or join one with its code."}
        </p>
        {!signedIn ? (
          <Button asChild className="mt-2">
            <Link to="/login" state={{ from: `${location.pathname}${location.search}` }}>
              Sign in
            </Link>
          </Button>
        ) : null}
      </div>
      <JoinEventCard variant="society" className="mt-6" />
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
