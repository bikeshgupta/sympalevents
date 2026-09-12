import { MessageSquareQuote, Trash2 } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { StarRating, StarRatingInput } from "@/features/closing/star-rating";
import { formatEventTimestamp } from "@/features/dashboard/dashboard-utils";
import { formatRating, type ClosingPayload } from "@/lib/closing";

type FeedbackActions = {
  save: (input: { rating: number; comment: string }) => Promise<unknown>;
  remove: () => Promise<unknown>;
};

/**
 * Ratings and reviews, the way a resident already understands them: one
 * review per person, written under their own name, editable by them at any
 * time, with the average and the star breakdown above the list.
 *
 * Reading is public - anyone with the link sees what people thought.
 * Writing needs a sign-in, because a review without an author is not one.
 */
export function FeedbackSection({
  feedback,
  signedIn,
  actions,
  isLoading,
}: {
  feedback: ClosingPayload["feedback"];
  signedIn: boolean;
  actions: FeedbackActions;
  isLoading: boolean;
}) {
  const others = feedback.reviews.filter((review) => !review.isMine);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <MessageSquareQuote className="h-4 w-4" aria-hidden="true" />
          </span>
          <div>
            <CardTitle>Reviews</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">How the celebration felt, in everyone's own words.</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {isLoading ? (
          <div className="h-24 animate-pulse rounded-lg bg-muted" />
        ) : (
          <RatingSummary feedback={feedback} />
        )}

        <ReviewForm mine={feedback.mine} signedIn={signedIn} actions={actions} />

        {feedback.reviews.length ? (
          <ul className="space-y-3">
            {feedback.mine ? <ReviewRow key={feedback.mine.id} review={feedback.mine} /> : null}
            {others.map((review) => (
              <ReviewRow key={review.id} review={review} />
            ))}
          </ul>
        ) : (
          <p className="rounded-md bg-muted p-4 text-sm text-muted-foreground">
            No reviews yet. Be the first to say how it went.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function RatingSummary({ feedback }: { feedback: ClosingPayload["feedback"] }) {
  const max = Math.max(1, ...feedback.distribution.map((row) => row.count));

  return (
    <div className="grid gap-4 rounded-lg border bg-muted/40 p-4 sm:grid-cols-[auto_1fr] sm:items-center">
      <div className="text-center sm:pr-5">
        <p className="text-4xl font-semibold tabular-nums leading-none">{formatRating(feedback.average)}</p>
        <StarRating
          value={feedback.average}
          className="mt-2"
          label={
            feedback.count
              ? `Rated ${feedback.average.toFixed(1)} out of 5 from ${feedback.count} reviews`
              : "Not rated yet"
          }
        />
        <p className="mt-1.5 text-xs text-muted-foreground">
          {feedback.count} {feedback.count === 1 ? "review" : "reviews"}
        </p>
      </div>
      <ul className="space-y-1.5">
        {[...feedback.distribution].reverse().map((row) => (
          <li key={row.stars} className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="w-3 shrink-0 text-right tabular-nums">{row.stars}</span>
            <span
              className="h-2 flex-1 overflow-hidden rounded-full bg-background"
              role="progressbar"
              aria-valuenow={row.count}
              aria-valuemin={0}
              aria-valuemax={feedback.count}
              aria-label={`${row.stars} star reviews`}
            >
              <span
                className="block h-full rounded-full bg-amber-400"
                style={{ width: `${(row.count / max) * 100}%` }}
              />
            </span>
            <span className="w-6 shrink-0 text-right tabular-nums">{row.count}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ReviewForm({
  mine,
  signedIn,
  actions,
}: {
  mine: ClosingPayload["feedback"]["mine"];
  signedIn: boolean;
  actions: FeedbackActions;
}) {
  const [rating, setRating] = useState(mine?.rating ?? 0);
  const [comment, setComment] = useState(mine?.comment ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // A review that arrives (or changes) after the form mounted - a fresh
  // sign-in, another device - should show up in the fields, not be silently
  // overwritten by an empty form.
  useEffect(() => {
    setRating(mine?.rating ?? 0);
    setComment(mine?.comment ?? "");
  }, [mine?.id, mine?.rating, mine?.comment]);

  if (!signedIn) {
    return (
      <div className="rounded-md border bg-muted/40 p-4 text-sm">
        <p className="font-medium">Been part of it? Leave your review.</p>
        <p className="mt-1 text-muted-foreground">
          <Link to="/login" className="font-medium text-primary underline underline-offset-2">
            Sign in
          </Link>{" "}
          to rate the celebration and write a few lines. You can edit it whenever you like.
        </p>
      </div>
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!rating) {
      setError("Pick a rating between 1 and 5 stars");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await actions.save({ rating, comment });
      setSaved(true);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save your review");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="space-y-3 rounded-md border p-4" onSubmit={handleSubmit}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Label htmlFor="review-comment" className="text-sm font-medium">
          {mine ? "Your review" : "Write a review"}
        </Label>
        {mine ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={async () => {
              if (!window.confirm("Delete your review?")) return;
              await actions.remove();
              setRating(0);
              setComment("");
              setSaved(false);
            }}
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
            Delete
          </Button>
        ) : null}
      </div>
      <StarRatingInput value={rating} onChange={(next) => { setRating(next); setSaved(false); }} disabled={saving} />
      <textarea
        id="review-comment"
        value={comment}
        maxLength={1500}
        onChange={(event) => {
          setComment(event.target.value);
          setSaved(false);
        }}
        rows={3}
        placeholder="What did you enjoy most? Anything we should do differently next year?"
        className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
      />
      {error ? <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</p> : null}
      <div className="flex items-center justify-end gap-3">
        {saved ? <p className="text-sm text-emerald-700">Saved. Thank you.</p> : null}
        <Button type="submit" disabled={saving}>
          {saving ? "Saving..." : mine ? "Update review" : "Post review"}
        </Button>
      </div>
    </form>
  );
}

function ReviewRow({ review }: { review: ClosingPayload["feedback"]["reviews"][number] }) {
  const edited = review.updatedAt !== review.createdAt;

  return (
    <li className={`rounded-md border p-3 ${review.isMine ? "border-primary/30 bg-primary/5" : "bg-background"}`}>
      <div className="flex items-start gap-3">
        {review.author.photoUrl ? (
          <img src={review.author.photoUrl} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" />
        ) : (
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold text-muted-foreground"
            aria-hidden="true"
          >
            {review.author.name.slice(0, 1).toUpperCase()}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <p className="font-medium">{review.author.name}</p>
            {review.isMine ? (
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">You</span>
            ) : null}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <StarRating value={review.rating} size="sm" label={`${review.rating} out of 5 stars`} />
            <span className="text-xs text-muted-foreground">
              {formatEventTimestamp(review.updatedAt)}
              {edited ? " · edited" : ""}
            </span>
          </div>
          {review.comment ? <p className="mt-2 whitespace-pre-line text-sm">{review.comment}</p> : null}
        </div>
      </div>
    </li>
  );
}
