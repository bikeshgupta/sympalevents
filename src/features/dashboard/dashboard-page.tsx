import type { ClosingFacts } from "@/features/closing/closing-copy";
import { getDefaultEventDay, getEventDays, getEventPhase, getNextEvent, sortTimelineItems } from "@/features/dashboard/dashboard-utils";
import { Fragment, useEffect, useMemo, useState } from "react";
import { useEventClosing } from "@/lib/closing";
import { useEventData } from "@/lib/event-data";
import { useHashTarget } from "@/lib/scroll";
import { renderWidget, type DashboardContext } from "@/features/dashboard/widget-host";
import { useSession } from "@/lib/auth";
import { useEventAccess } from "@/lib/event-access";
import { cn } from "@/lib/utils";
import { layoutRows, normaliseLayout, visibleLayout } from "@/lib/widgets";

export function DashboardPage() {
  const { data, isFetching } = useEventData({ includeTasks: false });
  const { data: session } = useSession();
  const { data: eventAccess } = useEventAccess();
  const [now, setNow] = useState(() => new Date());
  const event = data.event;
  const eventDays = useMemo(() => getEventDays(event), [event]);
  const defaultDay = useMemo(() => getDefaultEventDay(event, now), [event, now]);
  const [selectedDay, setSelectedDay] = useState(defaultDay);
  const financials = data.financials;
  const fundsReceived = financials.contributionReceived + financials.sponsorshipReceived;
  const fundingGap = Math.max(financials.totalBudget - fundsReceived, 0);
  const phase = getEventPhase(event, now);
  const selectedDate = eventDays.find((day) => day.key === selectedDay)?.date;
  const timeline = data.eventPlan;
  const selectedItems = useMemo(
    () => sortTimelineItems(timeline.filter((item) => item.day === selectedDay || item.date === selectedDate)),
    [timeline, selectedDay, selectedDate],
  );
  const nextEvent = getNextEvent(timeline, now);
  const closing = useEventClosing(event.id);
  // Being past the last day is not the same as being finished: the committee
  // decides when the celebration is closed, because that is when the note and
  // the photographs are ready to lead the page.
  const isClosed = Boolean(closing.data?.closing.is_closed);

  // Coming back from signing in to leave a review: #in-their-words puts them
  // on the card they clicked from, with the write box open.
  useHashTarget(!closing.isLoading && !isFetching);
  const closingFacts: ClosingFacts = {
    eventName: event.name,
    location: event.location,
    dayCount: eventDays.length,
    eventCount: timeline.length,
    contributorCount: data.contributions.length,
    contributionReceived: financials.contributionReceived,
    sponsorCount: data.sponsors.length,
    sponsorshipReceived: financials.sponsorshipReceived,
    coreCount: closing.data?.credits.core.length ?? 0,
    volunteerCount: closing.data?.credits.volunteers.length ?? 0,
  };

  // Tick only as fast as the screen needs: per-second for the live countdown, every
  // 30s to keep timeline statuses fresh during the event, and not at all afterwards.
  useEffect(() => {
    if (phase === "after") return;
    const intervalMs = phase === "before" ? 1000 : 30000;
    const interval = window.setInterval(() => setNow(new Date()), intervalMs);
    return () => window.clearInterval(interval);
  }, [phase]);

  useEffect(() => {
    setSelectedDay(defaultDay);
  }, [defaultDay, event.id]);

  // What this dashboard is made of, in the committee's order. A stored layout
  // is normalised against the catalogue first, so a widget added or removed by
  // a later release never leaves a saved arrangement broken. No layout at all
  // means the default for this kind of event, which is exactly the order the
  // dashboard has always rendered in.
  const layout = useMemo(
    () => normaliseLayout(event.dashboardLayout, isClosed),
    [event.dashboardLayout, isClosed],
  );

  // A widget tied to a module the admin has switched off, or that this viewer
  // cannot open, is not drawn. That list is the server's, and it is the same
  // one the sidebar filters on - there is no second permission rule here.
  //
  // Demo mode is the exception, for the reason the nav makes the same one
  // (`isDemoNav` in app-layout.tsx): with no event there is no admin to have
  // configured anything and nothing real to protect, so the dashboard shows
  // the whole tour rather than filtering itself down to nothing.
  const openPageKeys = useMemo(() => {
    if (data.source === "demo") return null;
    return new Set((eventAccess?.pages ?? []).filter((page) => page.canView).map((page) => page.pageKey));
  }, [eventAccess, data.source]);

  const context: DashboardContext = {
    event,
    timeline,
    now,
    phase,
    isFetching,
    isClosed,
    signedIn: Boolean(session?.user),
    source: data.source,
    fallbackReason: data.fallbackReason,
    totalBudget: financials.totalBudget,
    actualExpenses: financials.actualExpenses,
    fundsReceived,
    fundingGap,
    contributionReceived: financials.contributionReceived,
    sponsorshipReceived: financials.sponsorshipReceived,
    contributions: data.contributions,
    sponsors: data.sponsors,
    eventDays,
    selectedDay,
    onSelectDay: setSelectedDay,
    selectedItems,
    nextEvent,
    closing: closing.data,
    closingIsLoading: closing.isLoading,
    closingFacts,
    onSubmitReview: (input) => closing.saveReview.mutateAsync(input),
  };

  const rows = layoutRows(visibleLayout(layout, openPageKeys));

  return (
    <div className="reveal-stack mx-auto max-w-5xl space-y-4 pb-3 sm:space-y-5">
      {rows.map((row) => {
        const rendered = row.entries.map((entry) => ({ entry, node: renderWidget(entry, context) }));
        // A widget that decides it has nothing to draw (the closing note
        // before the event is closed) must not leave an empty grid cell or an
        // empty row behind it.
        const live = rendered.filter((item) => item.node !== null);
        if (!live.length) return null;

        // Fragments, not wrapper divs. Several widgets render nothing of
        // their own when they have nothing to show - the auctions strip with
        // no published auction, for one - and an empty wrapper still counts
        // for `space-y-4`, leaving a gap where nothing is.
        if (live.length === 1) {
          return <Fragment key={live[0].entry.key}>{live[0].node}</Fragment>;
        }

        return (
          <section key={live[0].entry.key} className={cn("grid gap-4", row.rowClass)}>
            {live.map((item) => (
              <Fragment key={item.entry.key}>{item.node}</Fragment>
            ))}
          </section>
        );
      })}
    </div>
  );
}
