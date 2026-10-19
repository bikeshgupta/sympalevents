import { CheckCircle2, Lock, RotateCcw, Unlock } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { DataSourceBadge } from "@/components/shared/data-source-badge";
import { ScrollProgressBar } from "@/components/shared/dashboard-fx";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { ClosingFacts } from "@/features/closing/closing-copy";
import { ClosingRatingStrip, ClosingStory } from "@/features/closing/closing-summary";
import { AuctionResults } from "@/features/closing/auction-results";
import { CreditsDialog } from "@/features/closing/credits-dialog";
import { CreditsSection, type CreditPerson } from "@/features/closing/credits-section";
import { FeedbackSection } from "@/features/closing/feedback-section";
import { GallerySection } from "@/features/closing/gallery-section";
import { MemoryHero } from "@/features/closing/memory-hero";
import { formatEventWeekday, getEventDays } from "@/features/dashboard/dashboard-utils";
import { useSession } from "@/lib/auth";
import { emptyCredits, useEventClosing, usesSeedCredits, withSeedCredits } from "@/lib/closing";
import { defaultCreditsSettings, visibleNames } from "../../../shared/credits-settings";
import { useHashTarget } from "@/lib/scroll";
import { useDashboardMotion, useScrollReveal } from "@/lib/dashboard-motion";
import { useEventAccess } from "@/lib/event-access";
import { useEventContext } from "@/lib/event-context";
import { useEventData } from "@/lib/event-data";
import { useVocabulary } from "@/lib/vocabulary";

/**
 * Everyone who gave something, by name and flat, one entry each.
 *
 * The flat is what tells two families with the same name apart, which is the
 * whole reason it is here - and it is the same pairing the dashboard's
 * Contributions and Sponsors tiles already show publicly (see
 * .claude/rules/ui-ux.md, "Privacy on public pages"). Nothing else off the
 * row travels: no amount, no contact, no payment reference.
 *
 * Rows are keyed on name + flat, so one family's four contributions are one
 * chip, while two different flats with the same surname stay two.
 */
function creditPeople(rows: Array<{ name: string; flat?: string }>): CreditPerson[] {
  const people = new Map<string, CreditPerson>();

  for (const row of rows) {
    const name = row.name.replace(/\s+/g, " ").trim();
    if (!name || name === "-") continue;
    const raw = (row.flat ?? "").replace(/\s+/g, " ").trim().toUpperCase();
    const flat = raw === "-" ? "" : raw;
    const key = `${name.toLowerCase()}|${flat}`;
    if (!people.has(key)) people.set(key, { name, flat });
  }

  return [...people.values()].sort((a, b) => a.name.localeCompare(b.name) || a.flat.localeCompare(b.flat));
}

/**
 * The closing page: what the celebration added up to, who made it happen,
 * the photographs, and what everybody thought of it.
 *
 * Public, like the dashboard - a resident should be able to open the link
 * and read the thank-you note without an account. Writing a review needs a
 * sign-in; editing the note, the credits and the photos needs admin or
 * committee, and closing or reopening it needs an admin of this event
 * (not a society admin with no role here), all enforced in api/_lib/closing.ts.
 *
 * Once it is closed the page is the event's memory: a banner whose name rises
 * in over embers, sections that slide in as they are reached, photographs that
 * open out, a scroll bar along the top, and "Relive it from the top".
 */
export function ClosingPage() {
  const vocab = useVocabulary();
  const { data, isFetching } = useEventData({ includeTasks: false });
  const { selectedEventId } = useEventContext();
  const { data: session } = useSession();
  const { data: eventAccess } = useEventAccess();
  const canManage = eventAccess?.role === "admin" || eventAccess?.role === "committee";
  // Closing turns the event into a memory for everybody: the event's own
  // admins only. `eventRole` leaves out a society admin's promotion to admin.
  const canClose = eventAccess?.eventRole === "admin";
  const motion = useDashboardMotion();
  const stackRef = useRef<HTMLDivElement>(null);
  const [replay, setReplay] = useState(0);
  const seedCredits = usesSeedCredits(data.event);
  const closing = useEventClosing(selectedEventId ?? data.event.id, { seedCredits });
  const [editingCredits, setEditingCredits] = useState(false);
  const isClosed = Boolean(closing.data?.closing.is_closed);
  useScrollReveal(stackRef, motion && isClosed, "up", replay);

  // Arriving from the dashboard's "All N reviews" or its gallery preview.
  // Gated on the query settling: the sections above the target grow as their
  // data lands, so scrolling any earlier lands right and then drifts.
  useHashTarget(!closing.isLoading && !isFetching);

  const contributors = useMemo(() => creditPeople(data.contributions), [data.contributions]);
  const sponsors = useMemo(() => creditPeople(data.sponsors), [data.sponsors]);
  // The server builds the volunteer list from task and schedule owners, and
  // the prasad sponsors from prasad_items. When it has not answered - demo
  // mode, or migration 014 not run yet - the schedule the page already has
  // still names most of the volunteers, so the credits are never emptier than
  // the data actually is. The hand-kept names in src/data/credits.ts are folded
  // in only for the event they belong to (usesSeedCredits).
  const fallbackCredits = emptyCredits(
    creditPeople(data.eventPlan.map((row) => ({ name: row.owner }))).map((person) => person.name),
  );
  const credits = closing.data?.credits ?? (seedCredits ? withSeedCredits(fallbackCredits) : fallbackCredits);
  const creditsSettings = credits.settings ?? defaultCreditsSettings();
  // Which pages this event has open to this viewer. A credits group for a page
  // the event does not use (Prasad on a Garba night) is not drawn at all; null
  // in the demo, where nothing is filtered.
  const openPageKeys =
    data.source === "demo"
      ? null
      : new Set((eventAccess?.pages ?? []).filter((page) => page.canView).map((page) => page.pageKey));

  // "Day 3 · Sat, 20 Sept" for a prasad slot. The server sends the plain date
  // because only the client knows which day of this event it is.
  const eventDays = useMemo(() => getEventDays(data.event), [data.event]);
  const dayLabel = (date: string) => {
    if (!date) return "";
    const day = eventDays.find((entry) => entry.date === date);
    return [day?.label, formatEventWeekday(date)].filter(Boolean).join(" · ");
  };

  const facts: ClosingFacts = {
    eventName: data.event.name,
    location: data.event.location,
    dayCount: eventDays.length,
    eventCount: data.eventPlan.length,
    contributorCount: data.collections.hidden ? data.collections.contributors : contributors.length,
    contributionReceived: data.financials.contributionReceived,
    sponsorCount: data.collections.hidden ? data.collections.sponsors : sponsors.length,
    sponsorshipReceived: data.financials.sponsorshipReceived,
    collectionsHidden: data.collections.hidden,
    // What the card actually shows, so the note never counts somebody the
    // committee hid.
    coreCount: creditsSettings.groups.core.hidden ? 0 : visibleNames(credits.core, creditsSettings.groups.core).length,
    volunteerCount: creditsSettings.groups.volunteers.hidden
      ? 0
      : visibleNames(credits.volunteers, creditsSettings.groups.volunteers).length,
  };

  return (
    <div key={replay} ref={stackRef} className="reveal-stack mx-auto max-w-5xl space-y-4 pb-3 sm:space-y-5">
      {motion && isClosed ? <ScrollProgressBar /> : null}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold">{vocab.labelFor("closing")}</h2>
          <p className="text-sm text-muted-foreground">
            {data.event.name} - the summary, the people behind it, the photographs, and your reviews.
          </p>
        </div>
        <DataSourceBadge source={data.source} reason={data.fallbackReason} isLoading={isFetching} />
      </div>

      {isClosed ? <MemoryHero event={data.event} /> : null}

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

      {/* The four count tiles used to sit here. They restated what the note
          above already says in words - "3 families contributed, 3 sponsors
          backed us" - so the page said the same thing twice before getting to
          the people. The dashboard's summary card keeps them: there only the
          first paragraph shows, so there they are the numbers, not an echo. */}
      <ClosingRatingStrip feedback={closing.data?.feedback} />

      {canManage ? (
        <CloseEventControl
          canClose={canClose}
          isClosed={Boolean(closing.data?.closing.is_closed)}
          isSaving={closing.setClosed.isPending}
          onToggle={(closed) => closing.setClosed.mutateAsync(closed)}
        />
      ) : null}

      <AuctionResults auctions={closing.data?.auctions ?? []} />

      <CreditsSection
        credits={credits}
        contributors={contributors}
        sponsors={sponsors}
        isLoading={closing.isLoading}
        canManage={canManage}
        openPageKeys={openPageKeys}
        onEdit={() => setEditingCredits(true)}
        dayLabel={dayLabel}
      />

      {canManage && editingCredits ? (
        <CreditsDialog
          credits={credits}
          seed={seedCredits}
          sponsors={sponsors}
          contributors={contributors}
          onOpenChange={setEditingCredits}
          onSave={(draft) => closing.saveCredits.mutateAsync(draft)}
        />
      ) : null}

      <GallerySection
        photos={closing.data?.gallery ?? []}
        eventId={selectedEventId ?? data.event.id}
        canManage={canManage}
        isLoading={closing.isLoading}
        signedIn={Boolean(session?.user)}
        actions={{
          add: (input) => closing.addPhoto.mutateAsync(input),
          update: (input) => closing.updatePhoto.mutateAsync(input),
          remove: (photoId) => closing.deletePhoto.mutateAsync(photoId),
          react: (input) => closing.reactToPhoto.mutateAsync(input),
          comment: (input) => closing.addComment.mutateAsync(input),
          deleteComment: (input) => closing.deleteComment.mutateAsync(input),
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

      {isClosed ? (
        <div className="flex justify-center pt-2">
          <Button
            variant="outline"
            onClick={() => {
              window.scrollTo({ top: 0, behavior: motion ? "smooth" : "auto" });
              // Once at the top, draw the page again so it rises in as it first did.
              window.setTimeout(() => setReplay((count) => count + 1), motion ? 450 : 0);
            }}
          >
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            Relive it from the top
          </Button>
        </div>
      ) : null}
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
  canClose,
  isClosed,
  isSaving,
  onToggle,
}: {
  /** An admin of this event. Committee members see the state and who decides it. */
  canClose: boolean;
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
        {!canClose ? (
          <p className="shrink-0 text-sm text-muted-foreground sm:max-w-[14rem] sm:text-right">
            Only this event's admins can {isClosed ? "reopen" : "close"} it.
          </p>
        ) : (
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
        )}
        {isSaving ? <span className="sr-only">Saving</span> : null}
      </CardContent>
    </Card>
  );
}
