import type { ClosingFacts } from "@/features/closing/closing-copy";
import { getDefaultEventDay, getEventDays, getEventPhase, getNextEvent, sortTimelineItems } from "@/features/dashboard/dashboard-utils";
import { Settings2 } from "lucide-react";
import { Fragment, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useEventClosing } from "@/lib/closing";
import { useEventData } from "@/lib/event-data";
import { useHashTarget } from "@/lib/scroll";
import { renderWidget, type DashboardContext } from "@/features/dashboard/widget-host";
import { useSession } from "@/lib/auth";
import { useEventAccess } from "@/lib/event-access";
import { useEventPath } from "@/lib/event-path";
import { usePageAccess } from "@/lib/page-access";
import { cn } from "@/lib/utils";
import { layoutRows, normaliseLayout, visibleLayout } from "@/lib/widgets";
import { EventActions } from "@/features/registration/event-actions";
import { ResidentPrimaryAction } from "@/features/dashboard/resident-primary-action";
import { getEventStatus } from "@/lib/event-status";
import { organiserOnlyWidgets } from "@/lib/resident-view";
import { useViewMode } from "@/lib/view-mode";
import { usePicks, pickEntries } from "@/lib/picks";
import { buildIcs, downloadIcs } from "@/lib/calendar";
import { YourEventCard } from "@/features/dashboard/your-event-card";
import { HappeningNowCard } from "@/features/dashboard/happening-now-card";
import { GoodToKnowCard } from "@/features/dashboard/good-to-know-card";
import { GetInvolvedCard } from "@/features/dashboard/get-involved-card";
import { PreviousEditionCard } from "@/features/dashboard/previous-edition-card";
import { CommunityCard } from "@/features/dashboard/community-card";

export function DashboardPage() {
  const { data, isFetching } = useEventData({ includeTasks: false });
  const { data: session } = useSession();
  const { data: eventAccess } = useEventAccess();
  const dashboardAccess = usePageAccess("dashboard");
  // Which of the two views of this event the person gets. An organiser sees the
  // dashboard as it has always been; a resident - or an organiser previewing
  // one - gets a home built around a single action. See src/lib/resident-view.ts.
  const view = useViewMode();
  const isResident = view.mode === "resident";
  const eventPath = useEventPath();
  const picks = usePicks(data.event.id ?? "demo");
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
    contributorCount: data.collections.hidden ? data.collections.contributors : data.contributions.length,
    contributionReceived: financials.contributionReceived,
    sponsorCount: data.collections.hidden ? data.collections.sponsors : data.sponsors.length,
    sponsorshipReceived: financials.sponsorshipReceived,
    collectionsHidden: data.collections.hidden,
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
    picks:
      isResident && data.source !== "demo"
        ? {
            isPicked: picks.isPicked,
            toggle: picks.toggle,
            count: picks.count,
            exportCalendar: () =>
              downloadIcs(`${event.name} - my picks`, buildIcs(pickEntries(timeline, picks.keys, event.name))),
          }
        : undefined,
    source: data.source,
    fallbackReason: data.fallbackReason,
    announcements: data.announcements,
    // A resident preview must look like a resident's: no organiser doors.
    canManageAnnouncements: dashboardAccess.canEdit && data.source !== "demo" && !isResident,
    totalBudget: financials.totalBudget,
    actualExpenses: financials.actualExpenses,
    fundsReceived,
    fundingGap,
    contributionReceived: financials.contributionReceived,
    sponsorshipReceived: financials.sponsorshipReceived,
    contributions: data.contributions,
    sponsors: data.sponsors,
    collections: data.collections,
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

  // The resident's home is the same widgets in the same order the committee
  // arranged them, minus the ones that are the organiser's own (the money maths
  // and the task list), with one action placed directly under the hero.
  const rows = layoutRows(
    visibleLayout(layout, openPageKeys).filter((entry) => !isResident || !organiserOnlyWidgets.has(entry.key)),
  );
  const status = getEventStatus(
    {
      startDate: event.startDate,
      endDate: event.endDate,
      startTime: event.startTime,
      endTime: event.endTime,
      statusOverride: event.statusOverride,
      isClosed,
    },
    now,
  );

  // The access answer decides which view this is. Drawing the organiser's page
  // for a beat and then swapping it would flash controls at residents, and the
  // reverse would flash a stripped page at the committee.
  if (view.isLoading) {
    return (
      <div className="mx-auto max-w-5xl space-y-4" aria-busy="true">
        <div className="h-[420px] animate-pulse rounded-lg bg-muted" />
        <div className="h-24 animate-pulse rounded-xl bg-muted/70" />
      </div>
    );
  }

  return (
    <div className="reveal-stack mx-auto max-w-5xl space-y-4 pb-3 sm:space-y-5">
      {/* An organiser's door, not part of the page: shown only to somebody who
          can edit the dashboard, so a resident's view is exactly what it was.
          It is where an admin hides or reorders widgets and decides whether
          amounts are shown or only counts. */}
      {!isResident && dashboardAccess.canEdit && data.source !== "demo" ? (
        <div className="flex justify-end">
          <Link
            to={eventPath("/customise-dashboard")}
            className="-my-1 inline-flex h-10 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Settings2 className="h-4 w-4" aria-hidden="true" />
            Customise dashboard
          </Link>
        </div>
      ) : null}
      {isResident ? null : <EventActions event={event} />}
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
        // The resident's one action sits directly under the hero.
        const action =
          isResident && live.some((item) => item.entry.key === "hero") ? (
            <>
              <ResidentPrimaryAction
                event={event}
                status={status}
                now={now}
                openPageKeys={openPageKeys}
                nextEvent={nextEvent}
              />
              {/* Live: what is on this minute. Otherwise: the resident's own
                  to-do list. Both read data the page already holds. */}
              {status === "live" ? (
                <HappeningNowCard timeline={timeline} now={now} canOpenSchedule={openPageKeys === null || openPageKeys.has("event-plan")} />
              ) : null}
              {data.source !== "demo" ? (
                <YourEventCard
                  eventId={event.id}
                  signedIn={Boolean(session?.user)}
                  openPageKeys={openPageKeys}
                  announcements={data.announcements}
                  now={now}
                />
              ) : null}
            </>
          ) : null;

        if (live.length === 1) {
          return (
            <Fragment key={live[0].entry.key}>
              {live[0].node}
              {action}
            </Fragment>
          );
        }

        return (
          <section key={live[0].entry.key} className={cn("grid gap-4", row.rowClass)}>
            {live.map((item) => (
              <Fragment key={item.entry.key}>{item.node}</Fragment>
            ))}
          </section>
        );
      })}
      {isResident && data.source !== "demo" ? (
        <CommunityCard event={event} canSeeRegistration={openPageKeys !== null && openPageKeys.has("registration")} />
      ) : null}
      {isResident && data.source !== "demo" ? (
        <GetInvolvedCard eventId={event.id} canSee={openPageKeys !== null && openPageKeys.has("volunteers")} />
      ) : null}
      {isResident && data.source !== "demo" && data.previousEdition ? <PreviousEditionCard edition={data.previousEdition} /> : null}
      {isResident && data.source !== "demo" ? <GoodToKnowCard event={event} /> : null}
    </div>
  );
}
