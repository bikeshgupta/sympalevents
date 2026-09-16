import { MessageSquareQuote } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StarRating } from "@/features/closing/star-rating";
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
}: {
  feedback?: ClosingPayload["feedback"];
  isLoading: boolean;
}) {
  const [sort, setSort] = useState<SortKey>("highest");

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
    <Card className="flex flex-col">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <MessageSquareQuote className="h-4 w-4" aria-hidden="true" />
            </span>
            <div>
              <CardTitle>What people said</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                {isLoading
                  ? "Loading reviews…"
                  : written.length
                    ? `Top ${Math.min(TOP_COUNT, written.length)} of ${written.length} written ${
                        written.length === 1 ? "review" : "reviews"
                      }.`
                    : "Nobody has written one yet."}
              </p>
            </div>
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

        <Link
          to="/closing#reviews"
          className="mt-auto inline-block text-sm font-medium text-primary underline underline-offset-2"
        >
          {feedback?.count ? `All ${feedback.count} reviews` : "Write the first review"}
        </Link>
      </CardContent>
    </Card>
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
