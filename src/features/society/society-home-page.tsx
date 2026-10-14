import { AlertTriangle, CalendarDays } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { buildCommunityFeed } from "@/features/society/community-feed";
import { CommunitySection } from "@/features/society/community-section";
import { EventCard } from "@/features/society/event-card";
import { groupByMonth, pickFeaturedEvent, residentVisibleEvents } from "@/features/society/event-presentation";
import { FeaturedEvent } from "@/features/society/featured-event";
import { firstNameOf, greetingFor } from "@/features/society/greeting";
import { SocietyAccount } from "@/features/society/society-account";
import { SocietyActions } from "@/features/society/society-actions";
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
  const { data, isLoading, error } = useSocietyHome(societySlug);
  const { data: session } = useSession();
  // One clock for the whole page, so every row and the featured pick agree.
  const now = useMemo(() => new Date(), []);
  const [managing, setManaging] = useState(false);
  const { societies, isLoading: contextLoading } = useEventContext();

  // Drafts never reach this page's lists, and a cancelled event only stays while its
  // date is still ahead - see residentVisibleEvents for why.
  const events = useMemo(() => residentVisibleEvents(data?.events ?? [], now), [data?.events, now]);
  const featured = useMemo(() => pickFeaturedEvent(events, now), [events, now]);
  const grouped = useMemo(() => {
    const groups: Record<EventGroup, SocietyEvent[]> = { ongoing: [], upcoming: [], past: [] };
    for (const event of events) {
      // The featured event is already the loudest thing here. Listing it again
      // a few hundred pixels below, with the same call to action, is the
      // duplicate-CTA problem - so it appears once, at the top.
      if (event.id === featured?.id) continue;
      groups[groupForStatus(getEventStatus(event, now), event, now)].push(event);
    }
    groups.upcoming.sort((a, b) => eventStartInstant(a.startDate, a.startTime) - eventStartInstant(b.startDate, b.startTime));
    groups.ongoing.sort((a, b) => eventEndInstant(a.endDate, a.endTime) - eventEndInstant(b.endDate, b.endTime));
    groups.past.sort((a, b) => eventEndInstant(b.endDate, b.endTime) - eventEndInstant(a.endDate, a.endTime));
    return groups;
  }, [events, featured?.id, now]);

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

  if (isLoading) return <SocietyHomeSkeleton />;

  if (error) {
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

  return (
    <main className="mx-auto w-full max-w-3xl px-4 pb-12 pt-4 sm:pt-6">
      <SocietyAccount role={memberRole} />

      {society ? (
        <div className="mt-4">
          <SocietyHeader society={society} greeting={greeting} />
        </div>
      ) : null}

      <SocietyActions
        canManage={canManage}
        isSocietyAdmin={isSocietyAdmin}
        societySlug={society?.slug}
        draftCount={drafts.length}
        draftsOpen={managing}
        onToggleDrafts={() => setManaging((value) => !value)}
      />

      {data?.ready === false ? (
        <p className="mt-4 flex items-start gap-2 rounded-md bg-amber-100 p-3 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>Society events are being set up. Please check back shortly.</span>
        </p>
      ) : null}

      {managing && canManage && drafts.length ? (
        <section className="mt-2" aria-label="Draft events">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Draft events</h2>
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
          <div role="tablist" aria-label="Events by when they happen" className="mt-1 grid grid-cols-3 border-b">
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
                  {selected ? <span aria-hidden className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-primary" /> : null}
                </button>
              );
            })}
          </div>

          <section role="tabpanel" id={`panel-${current}`} aria-labelledby={`tab-${current}`} className="mt-1">
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
                    {group.events.map((event) => (
                      <li key={event.id}>
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

/** Never a `0` while the counts are still in flight - a zero that is really
 *  "unknown" is a lie, and this page is made almost entirely of counts. */
function SocietyHomeSkeleton() {
  return (
    <main className="mx-auto w-full max-w-3xl animate-pulse px-4 pb-12 pt-4 sm:pt-6" aria-hidden>
      <div className="flex items-center gap-3">
        <div className="h-11 w-11 rounded-full bg-muted" />
        <div className="h-4 w-40 rounded bg-muted" />
      </div>
      <div className="mt-4 h-3 w-44 rounded bg-muted" />
      <div className="mt-2 h-7 w-64 rounded-md bg-muted" />
      <div className="mt-2 h-4 w-52 rounded bg-muted" />
      <div className="-mx-4 mt-4 aspect-[6/5] bg-muted sm:mx-0 sm:aspect-[16/8] sm:rounded-2xl" />
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
