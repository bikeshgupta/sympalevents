import { LogIn, MessageSquareQuote } from "lucide-react";
import { FormEvent, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { StarRating, StarRatingInput } from "@/features/closing/star-rating";
import { formatEventTimestamp } from "@/features/dashboard/dashboard-utils";
import { initials, type ClosingPayload, type EventReview } from "@/lib/closing";

type SortKey = "highest" | "newest" | "lowest";

const sortLabels: Record<SortKey, string> = {
  highest: "Highest rated",
  newest: "Most recent",
  lowest: "Lowest rated",
};

const TOP_COUNT = 5;

/**
 * The anchor this card answers to.
 *
 * One constant for both the `id` and the path a signed-out visitor is sent
 * back to, so the two cannot drift apart. `DashboardPage` is this card's only
 * caller, which is why the path is written out here rather than passed in.
 */
export const reviewsAnchor = "in-their-words";
const returnPath = `/dashboard#${reviewsAnchor}`;

/**
 * What people wrote, next to the closing summary on the dashboard.
 *
 * **Reviews that have text only.** This is the comment section, and a bare
 * five stars with nothing said takes one of five slots without telling
 * anybody anything. The star breakdown and every rating, text or not, are on
 * /closing - this card links there rather than trying to be that.
 *
 * Sorted highest-first by default, most recent breaking the tie, which is the
 * order a committee wants their own page to open on. "Most recent" and
 * "Lowest rated" are there because a summary nobody can turn over is a
 * billboard, not a review section.
 */
export function ClosingReviewsCard({
  feedback,
  isLoading,
  signedIn,
  onSubmit,
}: {
  feedback?: ClosingPayload["feedback"];
  isLoading: boolean;
  signedIn: boolean;
  onSubmit: (input: { rating: number; comment: string }) => Promise<unknown>;
}) {
  const [sort, setSort] = useState<SortKey>("highest");
  // Write it here, not over on /closing. Gone the moment there is one to
  // show: a second review is not a thing anybody has, and editing the one
  // they do have belongs on the page that can also delete it.
  const canWrite = signedIn && feedback && !feedback.mine;

  const written = useMemo(
    () => (feedback?.reviews ?? []).filter((review) => review.comment.trim()),
    [feedback?.reviews],
  );

  const top = useMemo(() => {
    const byNewest = (left: EventReview, right: EventReview) => right.updatedAt.localeCompare(left.updatedAt);
    const sorted = [...written].sort((left, right) => {
      if (sort === "newest") return byNewest(left, right);
      if (sort === "lowest") return left.rating - right.rating || byNewest(left, right);
      return right.rating - left.rating || byNewest(left, right);
    });
    return sorted.slice(0, TOP_COUNT);
  }, [written, sort]);

  return (
    // tabIndex + scroll-mt-20 so `useHashTarget` can land focus here under the
    // sticky header - see src/lib/scroll.ts.
    <Card id={reviewsAnchor} tabIndex={-1} className="flex scroll-mt-20 flex-col focus-visible:outline-none">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <MessageSquareQuote className="h-4 w-4" aria-hidden="true" />
            </span>
            {/* No subtitle. It read "Top 1 of 1 written review" - a fraction
                that says nothing until there are enough of them to be a
                selection, and the card is already headed and already shows
                its own loading and empty states below. */}
            <CardTitle>In their words</CardTitle>
          </div>
          {written.length > 1 ? (
            <div>
              <label className="sr-only" htmlFor="review-sort">
                Sort reviews
              </label>
              <select
                id="review-sort"
                className="h-10 rounded-md border bg-background px-2 text-sm"
                value={sort}
                onChange={(event) => setSort(event.target.value as SortKey)}
              >
                {(Object.keys(sortLabels) as SortKey[]).map((key) => (
                  <option key={key} value={key}>
                    {sortLabels[key]}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
        </div>
      </CardHeader>

      <CardContent className="flex flex-1 flex-col gap-3">
        {canWrite ? <ReviewComposer onSubmit={onSubmit} /> : null}
        {!signedIn ? <SignInToComment /> : null}

        {isLoading ? (
          <div className="h-24 animate-pulse rounded-lg bg-muted" />
        ) : top.length ? (
          <ul className="space-y-3">
            {top.map((review) => (
              <ReviewCard key={review.id} review={review} />
            ))}
          </ul>
        ) : (
          <p className="rounded-md bg-muted p-4 text-sm text-muted-foreground">
            No written reviews yet. Stars without a comment still count towards the average.
          </p>
        )}

        <div className="mt-auto space-y-1">
          {feedback?.mine ? (
            // Says where editing lives, rather than offering a second control
            // for it here. One row, one place to change it.
            <p className="text-sm text-muted-foreground">
              You have reviewed this celebration. Edit or delete it on the closing page.
            </p>
          ) : null}
          {feedback?.count ? (
            <Link
              to="/closing#reviews"
              className="inline-block text-sm font-medium text-primary underline underline-offset-2"
            >
              All {feedback.count} reviews
            </Link>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * The signed-out version of the composer: the same invitation, one step
 * further back.
 *
 * It sends them to `/login` carrying this card's own anchor as the return
 * path, so signing in puts them back here with the write box open rather than
 * on whatever `/dashboard` happens to show at the top. The promise in the
 * copy is the reason to carry it - "you will come straight back" is only worth
 * saying if it is true.
 */
function SignInToComment() {
  return (
    <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
      <p className="text-sm font-medium">Been part of it? Add your comment.</p>
      <p className="text-sm text-muted-foreground">
        Sign in to rate the celebration and leave a few lines. You will come straight back here.
      </p>
      <Button asChild size="sm">
        <Link to="/login" state={{ from: returnPath }}>
          <LogIn className="h-4 w-4" aria-hidden="true" />
          Sign in to comment
        </Link>
      </Button>
    </div>
  );
}

/**
 * Leaving a review without going anywhere.
 *
 * Only ever shown to somebody who has not written one - there is no edit here
 * on purpose. Editing and deleting need the whole form, the star breakdown
 * and a delete button beside them, and that is `/closing`; a second control
 * for the same row on the screen everybody lands on is how two of them end up
 * disagreeing.
 *
 * **Stars alone are enough.** Words are optional, as they are on the full
 * form - a rating posted with nothing said still counts towards the average.
 * It only lands nowhere *visible*, because this card lists written reviews
 * only, so the helper line under the box says so rather than the form
 * refusing to submit.
 */
function ReviewComposer({ onSubmit }: { onSubmit: (input: { rating: number; comment: string }) => Promise<unknown> }) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!rating) {
      setError("Pick a rating between 1 and 5 stars.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      // On success the review becomes `mine` and this whole block unmounts.
      await onSubmit({ rating, comment: comment.trim() });
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save your review");
      setSaving(false);
    }
  }

  return (
    <form className="space-y-2 rounded-lg border bg-muted/30 p-3" onSubmit={handleSubmit}>
      <Label htmlFor="dashboard-review" className="text-sm font-medium">
        Been part of it? Say how it went.
      </Label>
      <StarRatingInput value={rating} onChange={setRating} disabled={saving} />
      <textarea
        id="dashboard-review"
        value={comment}
        rows={2}
        maxLength={1500}
        disabled={saving}
        placeholder="What you will remember about it (optional)"
        onChange={(event) => setComment(event.target.value)}
        className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm leading-relaxed outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
      />
      <p className="text-xs text-muted-foreground">
        Stars on their own are fine - they count towards the rating. Only written ones are listed below.
      </p>
      {error ? <p className="rounded-md bg-destructive/10 p-2 text-sm text-destructive">{error}</p> : null}
      <Button type="submit" size="sm" disabled={saving}>
        {saving ? "Posting..." : "Post review"}
      </Button>
    </form>
  );
}

/** One review, shaped the way anybody already reads them: who, how many
 *  stars, when, then what they actually said. */
function ReviewCard({ review }: { review: EventReview }) {
  return (
    <li className="rounded-lg border bg-card p-3">
      <div className="flex items-center gap-2.5">
        {review.author.photoUrl ? (
          <img src={review.author.photoUrl} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover" />
        ) : (
          <span
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary"
            aria-hidden="true"
          >
            {initials(review.author.name)}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">
            {review.author.name}
            {review.isMine ? <span className="ml-1.5 text-xs text-muted-foreground">(you)</span> : null}
          </p>
          <div className="mt-0.5 flex flex-wrap items-center gap-2">
            <StarRating value={review.rating} size="sm" label={`${review.rating} out of 5`} />
            <span className="text-xs text-muted-foreground">{formatEventTimestamp(review.updatedAt)}</span>
          </div>
        </div>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{review.comment}</p>
    </li>
  );
}
