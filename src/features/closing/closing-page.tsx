import { CheckCircle2, Lock, Unlock } from "lucide-react";
import { useMemo, useState } from "react";
import { DataSourceBadge } from "@/components/shared/data-source-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { ClosingFacts } from "@/features/closing/closing-copy";
import { ClosingRatingStrip, ClosingStats, ClosingStory } from "@/features/closing/closing-summary";
import { CreditsSection } from "@/features/closing/credits-section";
import { FeedbackSection } from "@/features/closing/feedback-section";
import { GallerySection } from "@/features/closing/gallery-section";
import { getEventDays } from "@/features/dashboard/dashboard-utils";
import { useSession } from "@/lib/auth";
import { useEventClosing } from "@/lib/closing";
import { useEventAccess } from "@/lib/event-access";
import { useEventContext } from "@/lib/event-context";
import { useEventData } from "@/lib/event-data";

/** Everyone who gave something, by name, with nothing beside the name. */
function creditNames(rows: Array<{ name: string }>) {
  return [...new Set(rows.map((row) => row.name.trim()).filter((name) => name && name !== "-"))].sort((a, b) =>
    a.localeCompare(b),
  );
}

/**
 * The closing page: what the celebration added up to, who made it happen,
 * the photographs, and what everybody thought of it.
 *
 * Public, like the dashboard - a resident should be able to open the link
 * and read the thank-you note without an account. Writing a review needs a
 * sign-in; editing the note, the photos and the closed/open switch needs
 * admin or committee, enforced server-side in api/_lib/closing.ts.
 */
export function ClosingPage() {
  const { data, isFetching } = useEventData({ includeTasks: false });
  const { selectedEventId } = useEventContext();
  const { data: session } = useSession();
  const { data: eventAccess } = useEventAccess();
  const canManage = eventAccess?.role === "admin" || eventAccess?.role === "committee";
  const closing = useEventClosing(selectedEventId ?? data.event.id);

  const contributors = useMemo(() => creditNames(data.contributions), [data.contributions]);
  const sponsors = useMemo(() => creditNames(data.sponsors), [data.sponsors]);
  // The server builds the volunteer list from task and schedule owners. When
  // it has not answered - demo mode, or migration 014 not run yet - the
  // schedule the page already has still names most of them, so the credits
  // are never emptier than the data actually is.
  const credits = closing.data?.credits ?? {
    core: [],
    volunteers: creditNames(data.eventPlan.map((row) => ({ name: row.owner }))),
  };

  const facts: ClosingFacts = {
    eventName: data.event.name,
    location: data.event.location,
    dayCount: getEventDays(data.event).length,
    eventCount: data.eventPlan.length,
    contributorCount: contributors.length,
    contributionReceived: data.financials.contributionReceived,
    sponsorCount: sponsors.length,
    sponsorshipReceived: data.financials.sponsorshipReceived,
    coreCount: credits.core.length,
    volunteerCount: credits.volunteers.length,
  };

  return (
    <div className="reveal-stack mx-auto max-w-5xl space-y-4 pb-3 sm:space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Closing</h2>
          <p className="text-sm text-muted-foreground">
            {data.event.name} - the summary, the people behind it, the photographs, and your reviews.
          </p>
        </div>
        <DataSourceBadge source={data.source} reason={data.fallbackReason} isLoading={isFetching} />
      </div>

      {closing.isError ? (
        <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {closing.error?.message ?? "Couldn't load the closing page."} The summary below still reflects the event's
          own numbers.
        </p>
      ) : null}

      <ClosingStory
        closing={closing.data?.closing}
        facts={facts}
        canManage={canManage}
        onSave={(input) => closing.saveNote.mutateAsync(input)}
      />

      <ClosingRatingStrip feedback={closing.data?.feedback} />

      <ClosingStats facts={facts} isLoading={isFetching} />

      {canManage ? (
        <CloseEventControl
          isClosed={Boolean(closing.data?.closing.is_closed)}
          isSaving={closing.setClosed.isPending}
          onToggle={(closed) => closing.setClosed.mutateAsync(closed)}
        />
      ) : null}

      <CreditsSection
        credits={credits}
        contributors={contributors}
        sponsors={sponsors}
        isLoading={closing.isLoading}
      />

      <GallerySection
        photos={closing.data?.gallery ?? []}
        eventId={selectedEventId ?? data.event.id}
        canManage={canManage}
        isLoading={closing.isLoading}
        actions={{
          add: (input) => closing.addPhoto.mutateAsync(input),
          update: (input) => closing.updatePhoto.mutateAsync(input),
          remove: (photoId) => closing.deletePhoto.mutateAsync(photoId),
        }}
      />

      <FeedbackSection
        feedback={
          closing.data?.feedback ?? {
            average: 0,
            count: 0,
            distribution: [1, 2, 3, 4, 5].map((stars) => ({ stars, count: 0 })),
            reviews: [],
            mine: null,
          }
        }
        signedIn={Boolean(session?.user)}
        isLoading={closing.isLoading}
        actions={{
          save: (input) => closing.saveReview.mutateAsync(input),
          remove: () => closing.deleteReview.mutateAsync(),
        }}
      />
    </div>
  );
}

/**
 * The switch that moves the dashboard over to summary-first.
 *
 * Deliberately not the same thing as the event's dates being past: a
 * committee is usually still collecting photos and writing the note for a
 * week afterwards, and this page should not take over the dashboard until
 * they say it is ready. Reversible, for the same reason.
 */
function CloseEventControl({
  isClosed,
  isSaving,
  onToggle,
}: {
  isClosed: boolean;
  isSaving: boolean;
  onToggle: (closed: boolean) => Promise<unknown>;
}) {
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    setError(null);
    try {
      await onToggle(!isClosed);
    } catch (toggleError) {
      setError(toggleError instanceof Error ? toggleError.message : "Couldn't update the event");
    }
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <span
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
              isClosed ? "bg-emerald-100 text-emerald-700" : "bg-muted text-muted-foreground"
            }`}
          >
            {isClosed ? (
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
            ) : (
              <Lock className="h-4 w-4" aria-hidden="true" />
            )}
          </span>
          <div>
            <p className="text-sm font-medium">
              {isClosed ? "Celebration marked closed" : "Celebration not closed yet"}
            </p>
            <p className="text-sm text-muted-foreground">
              {isClosed
                ? "The dashboard leads with this summary and the reviews; contributions and budget sit below it."
                : "Close it when the note and photos are ready - the dashboard then leads with this summary instead of the money cards."}
            </p>
            {error ? <p className="mt-1 text-sm text-destructive">{error}</p> : null}
          </div>
        </div>
        <Button variant={isClosed ? "outline" : "default"} onClick={toggle} disabled={isSaving} className="shrink-0">
          {isClosed ? (
            <>
              <Unlock className="h-4 w-4" aria-hidden="true" />
              Reopen event
            </>
          ) : (
            <>
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
              Mark as closed
            </>
          )}
        </Button>
        {isSaving ? <span className="sr-only">Saving</span> : null}
      </CardContent>
    </Card>
  );
}
