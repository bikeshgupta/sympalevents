import { AlertTriangle, CalendarDays } from "lucide-react";
import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { EventCard } from "@/features/society/event-card";
import { pickFeaturedEvent } from "@/features/society/event-presentation";
import { FeaturedEvent } from "@/features/society/featured-event";
import { SocietyHeader } from "@/features/society/society-header";
import { getEventStatus, groupForStatus, toEventZoneTimestamp, type EventGroup } from "@/lib/event-status";
import { useSocietyHome, type SocietyEvent } from "@/lib/society";
import { cn } from "@/lib/utils";

/**
 * A society's events - the front door.
 *
 * This is a community events board, not a dashboard: one lead event, then
 * three short lists. There are deliberately no stat tiles, no charts and no
 * admin controls here. Managing an event happens inside it.
 *
 * Everything on the page comes from one request (see src/lib/society.ts), so
 * a society with twenty events costs exactly what one with two does.
 */

const tabs: { key: EventGroup; label: string }[] = [
  { key: "upcoming", label: "Upcoming" },
  { key: "ongoing", label: "Ongoing" },
  { key: "past", label: "Past" },
];

export function SocietyHomePage() {
  const { societySlug } = useParams();
  const { data, isLoading, error } = useSocietyHome(societySlug);
  // One clock for the whole page, so every card and the featured pick agree.
  const now = useMemo(() => new Date(), []);

  const featured = useMemo(() => pickFeaturedEvent(data?.events ?? [], now), [data?.events, now]);

  const grouped = useMemo(() => {
    const groups: Record<EventGroup, SocietyEvent[]> = { ongoing: [], upcoming: [], past: [] };
    for (const event of data?.events ?? []) {
      // The featured event is already the loudest thing on the page. Listing
      // it again a few hundred pixels below, with the same call to action, is
      // the duplicate-CTA problem - so it is shown once, at the top.
      if (event.id === featured?.id) continue;
      groups[groupForStatus(getEventStatus(event, now), event, now)].push(event);
    }
    // Soonest first for what is coming and what is on; most recent first for
    // what is done - in each case, the one somebody is most likely to want.
    groups.upcoming.sort((a, b) => toEventZoneTimestamp(a.startDate) - toEventZoneTimestamp(b.startDate));
    groups.ongoing.sort((a, b) => toEventZoneTimestamp(a.endDate) - toEventZoneTimestamp(b.endDate));
    groups.past.sort((a, b) => toEventZoneTimestamp(b.endDate) - toEventZoneTimestamp(a.endDate));
    return groups;
  }, [data?.events, featured?.id, now]);

  // Open on the tab that has something in it, rather than on an empty one.
  const firstPopulated = tabs.find((tab) => grouped[tab.key].length)?.key ?? "upcoming";
  const [active, setActive] = useState<EventGroup | null>(null);
  const current = active ?? firstPopulated;

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

  return (
    <main className="mx-auto w-full max-w-3xl px-4 pb-16 pt-6 sm:pt-8">
      {society ? <SocietyHeader society={society} /> : null}

      {data?.ready === false ? (
        <p className="mt-4 flex items-start gap-2 rounded-md bg-amber-100 p-3 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>
            Run <code className="font-mono">{data.migration}</code> in Supabase to finish setting up societies.
          </span>
        </p>
      ) : null}

      {featured ? (
        <section className="mt-5 sm:mt-6">
          <FeaturedEvent event={featured} to={eventPath(featured)} now={now} />
        </section>
      ) : null}

      {data?.events.length ? (
        <>
          <div role="tablist" aria-label="Events by when they happen" className="mt-7 flex gap-1.5">
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
                  onClick={() => setActive(tab.key)}
                  className={cn(
                    "flex h-9 items-center gap-1.5 rounded-full px-3.5 text-sm font-medium",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    selected ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80",
                  )}
                >
                  {tab.label}
                  {count ? <span className="tabular-nums opacity-70">{count}</span> : null}
                </button>
              );
            })}
          </div>

          <section
            role="tabpanel"
            id={`panel-${current}`}
            aria-labelledby={`tab-${current}`}
            className="mt-4 space-y-3"
          >
            {grouped[current].length ? (
              grouped[current].map((event) => (
                <EventCard key={event.id} event={event} to={eventPath(event)} now={now} />
              ))
            ) : (
              <EmptyGroup group={current} />
            )}
          </section>
        </>
      ) : data?.ready !== false ? (
        <EmptySociety />
      ) : null}
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

function EmptyGroup({ group }: { group: EventGroup }) {
  const copy: Record<EventGroup, string> = {
    upcoming: "Nothing planned yet. When the committee adds an event, it will show up here.",
    ongoing: "Nothing happening right now.",
    past: "No events have finished yet.",
  };
  return <p className="rounded-md border border-dashed p-5 text-sm text-muted-foreground">{copy[group]}</p>;
}

function EmptySociety() {
  return (
    <Card className="mt-6">
      <CardContent className="flex flex-col items-center gap-2 p-8 text-center">
        <CalendarDays className="h-8 w-8 text-muted-foreground" aria-hidden />
        <p className="text-sm font-medium">No events yet</p>
        <p className="max-w-sm text-sm text-muted-foreground">
          This society has not published an event. Once one is created it will appear here for everybody.
        </p>
      </CardContent>
    </Card>
  );
}

/** Never a `0` while the counts are still in flight - a zero that is really
 *  "unknown" is a lie, and this page is made almost entirely of counts. */
function SocietyHomeSkeleton() {
  return (
    <main className="mx-auto w-full max-w-3xl animate-pulse px-4 pb-16 pt-6 sm:pt-8" aria-hidden>
      <div className="h-9 w-56 rounded-md bg-muted" />
      <div className="mt-2 h-4 w-32 rounded bg-muted" />
      <div className="mt-6 h-56 rounded-xl bg-muted" />
      <div className="mt-7 flex gap-1.5">
        {[0, 1, 2].map((key) => (
          <div key={key} className="h-9 w-24 rounded-full bg-muted" />
        ))}
      </div>
      <div className="mt-4 space-y-3">
        {[0, 1].map((key) => (
          <div key={key} className="h-24 rounded-xl bg-muted" />
        ))}
      </div>
    </main>
  );
}
