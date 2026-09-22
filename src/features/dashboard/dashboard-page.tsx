import type { ClosingFacts } from "@/features/closing/closing-copy";
import { AnnouncementsCard } from "@/features/dashboard/announcements-card";
import { ClosingDashboardCard } from "@/features/closing/closing-summary";
import { ClosingReviewsCard } from "@/features/closing/closing-reviews-card";
import { DashboardAuctions } from "@/features/dashboard/dashboard-auctions";
import { EventHero } from "@/features/dashboard/widgets/event-hero";
import { EventSchedule } from "@/features/dashboard/widgets/event-schedule";
import { FinancialSummary } from "@/features/dashboard/widgets/financial-summary";
import { FundingProgress } from "@/features/dashboard/widgets/funding-progress";
import { GalleryPreview } from "@/features/dashboard/widgets/gallery-preview";
import { MyResponsibilities } from "@/features/dashboard/widgets/my-responsibilities";
import { getDefaultEventDay, getEventDays, getEventPhase, getNextEvent, sortTimelineItems } from "@/features/dashboard/dashboard-utils";
import { useEffect, useMemo, useState } from "react";
import { useEventClosing } from "@/lib/closing";
import { useEventData } from "@/lib/event-data";
import { useHashTarget } from "@/lib/scroll";
import { useSession } from "@/lib/auth";

export function DashboardPage() {
  const { data, isFetching } = useEventData({ includeTasks: false });
  const { data: session } = useSession();
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

  const moneySection = (
    <section className="grid gap-4 lg:grid-cols-[1fr_0.85fr]">
      <FinancialSummary
        totalBudget={financials.totalBudget}
        actualExpenses={financials.actualExpenses}
        fundsReceived={fundsReceived}
        fundingGap={fundingGap}
        sponsors={data.sponsors.length}
        contributors={data.contributions.length}
      />
      <FundingProgress
        totalBudget={financials.totalBudget}
        fundsReceived={fundsReceived}
        contributionReceived={financials.contributionReceived}
        sponsorshipReceived={financials.sponsorshipReceived}
        contributions={data.contributions}
        sponsors={data.sponsors}
      />
    </section>
  );

  const scheduleSection = (
    <EventSchedule
      days={eventDays}
      selectedDay={selectedDay}
      onSelectDay={setSelectedDay}
      items={selectedItems}
      allItems={timeline}
      nextEvent={nextEvent}
      now={now}
      phase={phase}
    />
  );

  return (
    <div className="reveal-stack mx-auto max-w-5xl space-y-4 pb-3 sm:space-y-5">
      <EventHero
        event={event}
        timeline={timeline}
        now={now}
        phase={phase}
        isLoading={isFetching}
        isClosed={isClosed}
        feedback={closing.data?.feedback}
        source={data.source}
        fallbackReason={data.fallbackReason}
      />
      {/* Once the celebration is closed the summary and what people wrote sit
          side by side - "how did it go" is two questions, the committee's
          answer and everybody else's. */}
      {isClosed ? (
        <section className="grid items-start gap-4 lg:grid-cols-[1.1fr_1fr]">
          <ClosingDashboardCard
            closing={closing.data?.closing}
            facts={closingFacts}
            feedback={closing.data?.feedback}
          />
          <ClosingReviewsCard
            feedback={closing.data?.feedback}
            isLoading={closing.isLoading}
            signedIn={Boolean(session?.user)}
            onSubmit={(input) => closing.saveReview.mutateAsync(input)}
          />
        </section>
      ) : null}
      <DashboardAuctions eventId={event.id} />
      <AnnouncementsCard event={event} now={now} />
      {/* Before the event is closed, money is the live question and leads the
          page. Once it is closed, the celebration summary leads and the
          contribution and funding cards move underneath it. */}
      {isClosed ? scheduleSection : moneySection}
      {isClosed ? moneySection : scheduleSection}
      <MyResponsibilities eventId={event.id} signedIn={Boolean(session?.user)} />
      <GalleryPreview photos={closing.data?.gallery ?? []} />
    </div>
  );
}
