import { AlertTriangle, CalendarDays } from "lucide-react";
import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { EventCard } from "@/features/society/event-card";
import { groupByMonth, pickFeaturedEvent, residentVisibleEvents } from "@/features/society/event-presentation";
import { FeaturedEvent } from "@/features/society/featured-event";
import { SocietyHeader } from "@/features/society/society-header";
import { getEventStatus, groupForStatus, toEventZoneTimestamp, type EventGroup } from "@/lib/event-status";
import { useSocietyHome, type SocietyEvent } from "@/lib/society";
import { cn } from "@/lib/utils";

/**
 * A society's events - the front door.
 *
 * The question this page answers is "what is happening in my community", not
 * "what records exist in my society", and the shape follows from that: one
 * event shown large, then a short scannable list. There are deliberately no
 * stat tiles, no charts and no admin controls - managing an event happens
 * inside it.
 *
 * Everything comes from one request (src/lib/society.ts), so a society with
 * twenty events costs exactly what one with two does.
 */

const tabs: { key: EventGroup; label: string }[] = [
  { key: "upcoming", label: "Upcoming" },
  { key: "ongoing", label: "Live" },
  { key: "past", label: "Past" },
];

export function SocietyHomePage() {
  const { societySlug } = useParams();
  const { data, isLoading, error } = useSocietyHome(societySlug);
  // One clock for the whole page, so every card and the featured pick agree.
  const now = useMemo(() => new Date(), []);

  // Drafts never reach this page, and a cancelled event only stays while its
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
    groups.upcoming.sort((a, b) => toEventZoneTimestamp(a.startDate) - toEventZoneTimestamp(b.startDate));
    groups.ongoing.sort((a, b) => toEventZoneTimestamp(a.endDate) - toEventZoneTimestamp(b.endDate));
    groups.past.sort((a, b) => toEventZoneTimestamp(b.endDate) - toEventZoneTimestamp(a.endDate));
    return groups;
  }, [events, featured?.id, now]);

  // Open on a tab that has something in it rather than on an empty one.
  const firstPopulated = tabs.find((tab) => grouped[tab.key].length)?.key ?? "upcoming";
  const [chosen, setChosen] = useState<EventGroup | null>(null);
  const current = chosen ?? firstPopulated;

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
  const hasAnything = events.length > 0;

  return (
    <main className="mx-auto w-full max-w-3xl px-4 pb-16 pt-5 sm:pt-7">
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
        <section className="mt-4 sm:mt-5">
          <FeaturedEvent event={featured} to={eventPath(featured)} now={now} />
        </section>
      ) : null}

      {hasAnything ? (
        <>
          <div className="mt-7 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
            <h2 className="text-lg font-semibold">What&rsquo;s happening</h2>

            {/* Text tabs with an underline rather than filled pills: three
                solid capsules competed with the featured card for weight, and
                an empty one was as loud as a full one. A tab with nothing in
                it is dimmed and carries no count. */}
            <div role="tablist" aria-label="Events by when they happen" className="-mb-px flex gap-4">
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
                      "relative pb-1.5 text-sm font-medium transition-colors",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                      selected ? "text-foreground" : count ? "text-muted-foreground hover:text-foreground" : "text-muted-foreground/50",
                    )}
                  >
                    {tab.label}
                    {count ? <span className="ml-1 text-xs tabular-nums text-muted-foreground">{count}</span> : null}
                    {selected ? (
                      <span aria-hidden className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-primary" />
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>

          <section
            role="tabpanel"
            id={`panel-${current}`}
            aria-labelledby={`tab-${current}`}
            className="mt-4 space-y-2.5"
          >
            {grouped[current].length ? (
              // Months only once there is enough to scan - see groupByMonth.
              groupByMonth(grouped[current], now).map((group) => (
                <div key={group.key || "all"} className="space-y-2.5">
                  {group.heading ? (
                    <h3 className="pt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {group.heading}
                    </h3>
                  ) : null}
                  {group.events.map((event) => (
                    <EventCard key={event.id} event={event} to={eventPath(event)} now={now} />
                  ))}
                </div>
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
  return <p className="rounded-xl border border-dashed p-5 text-sm text-muted-foreground">{copy[group]}</p>;
}

function EmptySociety() {
  return (
    <div className="mt-6 flex flex-col items-center gap-2 rounded-2xl border border-dashed p-10 text-center">
      <CalendarDays className="h-8 w-8 text-muted-foreground" aria-hidden />
      <p className="text-sm font-medium">No events yet</p>
      <p className="max-w-sm text-sm text-muted-foreground">
        This society has not published an event. Once one is created it will appear here for everybody.
      </p>
    </div>
  );
}

/** Never a `0` while the counts are still in flight - a zero that is really
 *  "unknown" is a lie, and this page is made almost entirely of counts. */
function SocietyHomeSkeleton() {
  return (
    <main className="mx-auto w-full max-w-3xl animate-pulse px-4 pb-16 pt-5 sm:pt-7" aria-hidden>
      <div className="h-8 w-56 rounded-md bg-muted" />
      <div className="mt-1.5 h-4 w-40 rounded bg-muted" />
      <div className="mt-5 aspect-[16/10] w-full rounded-2xl bg-muted sm:aspect-[21/9]" />
      <div className="mt-7 h-6 w-40 rounded bg-muted" />
      <div className="mt-4 space-y-2.5">
        {[0, 1, 2].map((key) => (
          <div key={key} className="h-[104px] rounded-xl bg-muted" />
        ))}
      </div>
    </main>
  );
}
