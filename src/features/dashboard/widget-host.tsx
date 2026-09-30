import type { ReactNode } from "react";
import { ClosingReviewsCard } from "@/features/closing/closing-reviews-card";
import { ClosingDashboardCard } from "@/features/closing/closing-summary";
import type { ClosingFacts } from "@/features/closing/closing-copy";
import { AnnouncementsCard } from "@/features/dashboard/announcements-card";
import { DashboardAuctions } from "@/features/dashboard/dashboard-auctions";
import type { EventPhase } from "@/features/dashboard/dashboard-utils";
import { EventHero } from "@/features/dashboard/widgets/event-hero";
import { EventSchedule } from "@/features/dashboard/widgets/event-schedule";
import { FinancialSummary } from "@/features/dashboard/widgets/financial-summary";
import { FundingProgress } from "@/features/dashboard/widgets/funding-progress";
import { GalleryPreview } from "@/features/dashboard/widgets/gallery-preview";
import { MyResponsibilities } from "@/features/dashboard/widgets/my-responsibilities";
import type { ClosingPayload } from "@/lib/closing";
import type { AppEvent, ContributionRow, DataSource, EventPlanRow, SponsorRow } from "@/lib/event-data";
import type { LayoutEntry } from "@/lib/widgets";

/**
 * Turning a layout entry into the widget it names.
 *
 * The catalogue in `src/lib/widgets.ts` is data so that the builder can list
 * it without pulling in the dashboard's whole component tree. This is the
 * other half: the one place that knows which component each key means, and
 * what to hand it.
 *
 * Every widget is given the same context, gathered once by the page. That is
 * what makes adding a widget to a dashboard free - none of them fetches
 * anything of its own, so a busier dashboard is not a slower one.
 */

export type DashboardContext = {
  event: AppEvent;
  timeline: EventPlanRow[];
  now: Date;
  phase: EventPhase;
  isFetching: boolean;
  isClosed: boolean;
  signedIn: boolean;
  source: DataSource;
  fallbackReason?: string;

  totalBudget: number;
  actualExpenses: number;
  fundsReceived: number;
  fundingGap: number;
  contributionReceived: number;
  sponsorshipReceived: number;
  contributions: ContributionRow[];
  sponsors: SponsorRow[];

  eventDays: { key: string; label: string; date: string }[];
  selectedDay: string;
  onSelectDay: (day: string) => void;
  selectedItems: EventPlanRow[];
  nextEvent?: EventPlanRow;

  closing?: ClosingPayload;
  closingIsLoading: boolean;
  closingFacts: ClosingFacts;
  onSubmitReview: (input: { rating: number; comment: string }) => Promise<unknown>;
};

export function renderWidget(entry: LayoutEntry, ctx: DashboardContext): ReactNode {
  switch (entry.key) {
    case "hero":
      return (
        <EventHero
          event={ctx.event}
          timeline={ctx.timeline}
          now={ctx.now}
          phase={ctx.phase}
          isLoading={ctx.isFetching}
          isClosed={ctx.isClosed}
          feedback={ctx.closing?.feedback}
          source={ctx.source}
          fallbackReason={ctx.fallbackReason}
        />
      );

    case "closing-summary":
      // Only once the committee has said the celebration is over. Before that
      // there is no note to print and no rating to carry.
      if (!ctx.isClosed) return null;
      return (
        <ClosingDashboardCard
          closing={ctx.closing?.closing}
          facts={ctx.closingFacts}
          feedback={ctx.closing?.feedback}
        />
      );

    case "closing-reviews":
      if (!ctx.isClosed) return null;
      return (
        <ClosingReviewsCard
          feedback={ctx.closing?.feedback}
          isLoading={ctx.closingIsLoading}
          signedIn={ctx.signedIn}
          onSubmit={ctx.onSubmitReview}
        />
      );

    case "auctions":
      return <DashboardAuctions eventId={ctx.event.id} />;

    case "announcements":
      return <AnnouncementsCard event={ctx.event} now={ctx.now} />;

    case "financial-summary":
      return (
        <FinancialSummary
          totalBudget={ctx.totalBudget}
          actualExpenses={ctx.actualExpenses}
          fundsReceived={ctx.fundsReceived}
          fundingGap={ctx.fundingGap}
          sponsors={ctx.sponsors.length}
          contributors={ctx.contributions.length}
          variant={entry.variant}
        />
      );

    case "funding-progress":
      return (
        <FundingProgress
          totalBudget={ctx.totalBudget}
          fundsReceived={ctx.fundsReceived}
          contributionReceived={ctx.contributionReceived}
          sponsorshipReceived={ctx.sponsorshipReceived}
          contributions={ctx.contributions}
          sponsors={ctx.sponsors}
          variant={entry.variant}
        />
      );

    case "schedule":
      return (
        <EventSchedule
          days={ctx.eventDays}
          selectedDay={ctx.selectedDay}
          onSelectDay={ctx.onSelectDay}
          items={ctx.selectedItems}
          allItems={ctx.timeline}
          nextEvent={ctx.nextEvent}
          now={ctx.now}
          phase={ctx.phase}
          variant={entry.variant}
        />
      );

    case "my-responsibilities":
      return <MyResponsibilities eventId={ctx.event.id} signedIn={ctx.signedIn} />;

    case "gallery":
      return <GalleryPreview photos={ctx.closing?.gallery ?? []} variant={entry.variant} />;

    default:
      // A layout naming a widget this build does not have. `normaliseLayout`
      // drops those before they reach here, so this is only ever a
      // belt-and-braces null rather than a broken dashboard.
      return null;
  }
}
