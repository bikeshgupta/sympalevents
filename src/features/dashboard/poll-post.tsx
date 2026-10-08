import { Check } from "lucide-react";
import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import type { Announcement } from "@/data/announcements";
import { closesLabel, percent, pollPayload, usePoll, type PollResult } from "@/lib/announcement-interactions";
import { cn } from "@/lib/utils";

/**
 * A poll, inside the announcements card.
 *
 * One person, one vote, changeable until it closes. What is shown depends on
 * the rule the organiser chose - results always, after you vote, or once it
 * closes - and the server enforces it: a count the rule hides is not in the
 * response, so it is not merely un-drawn.
 *
 * The results are bars, drawn with markup rather than the chart library: the
 * card is on every dashboard and the library is ~380KB that only the auction
 * panel and the collection timeline have earned.
 */
export function PollPost({ post, signedIn, enabled }: { post: Announcement; signedIn: boolean; enabled: boolean }) {
  const definition = pollPayload(post.payload);
  const { query, vote } = usePoll(post.id, enabled);
  const location = useLocation();
  const [choice, setChoice] = useState<string | null>(null);
  const [changing, setChanging] = useState(false);

  const result = query.data;
  // Until the server answers, show the choices from the post itself: they are
  // already here, and an empty card while a request runs would be a flicker.
  const options = result?.options ?? definition.options.map((option) => ({ ...option, votes: null as number | null }));
  const closed = result?.closed ?? (definition.closesAt ? new Date(definition.closesAt) <= new Date() : false);
  const myVote = result?.myVote ?? null;
  const showBallot = !closed && (myVote === null || changing);
  const closing = closesLabel(result?.closesAt ?? definition.closesAt);

  const error = vote.error instanceof Error ? vote.error.message : query.error instanceof Error ? query.error.message : null;

  async function submit() {
    if (!choice) return;
    try {
      await vote.mutateAsync(choice);
      setChanging(false);
      setChoice(null);
    } catch {
      /* shown below from vote.error */
    }
  }

  return (
    <div className="relative mt-2 space-y-3">
      {showBallot ? (
        <fieldset className="space-y-2" disabled={!signedIn || vote.isPending}>
          <legend className="sr-only">{post.title}</legend>
          {options.map((option) => {
            const selected = (choice ?? (changing ? myVote : null)) === option.id;
            return (
              <label
                key={option.id}
                className={cn(
                  "flex min-h-11 cursor-pointer items-center gap-3 rounded-md border bg-background px-3 py-2 text-sm",
                  "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
                  selected && "border-primary bg-accent font-medium",
                  !signedIn && "cursor-default opacity-80",
                )}
              >
                <input
                  type="radio"
                  name={`poll-${post.id}`}
                  value={option.id}
                  checked={selected}
                  onChange={() => setChoice(option.id)}
                  className="h-4 w-4 shrink-0 accent-[hsl(var(--primary))]"
                />
                <span className="min-w-0 flex-1">{option.label}</span>
              </label>
            );
          })}
        </fieldset>
      ) : null}

      {!showBallot ? <ResultBars result={result} options={options} myVote={myVote} /> : null}

      {showBallot && !signedIn ? (
        <Button asChild className="w-full sm:w-auto">
          <Link to="/login" state={{ from: location.pathname }}>
            Sign in to vote
          </Link>
        </Button>
      ) : null}

      {showBallot && signedIn ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" disabled={!choice || vote.isPending} onClick={() => void submit()}>
            {vote.isPending ? "Saving…" : changing ? "Change my vote" : "Vote"}
          </Button>
          {changing ? (
            <Button type="button" variant="outline" onClick={() => setChanging(false)}>
              Cancel
            </Button>
          ) : null}
        </div>
      ) : null}

      {!showBallot && result && !result.canSeeResults ? (
        <p className="text-xs text-muted-foreground">
          {result.showResults === "after_close"
            ? "Results are shown once voting closes."
            : "Vote to see the results."}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        {result?.total !== null && result?.total !== undefined ? (
          <span className="tabular-nums">
            {result.total} {result.total === 1 ? "vote" : "votes"}
          </span>
        ) : null}
        {closing ? <span className="tabular-nums">{closing}</span> : null}
        {!showBallot && !closed && myVote !== null && signedIn ? (
          <button
            type="button"
            onClick={() => {
              setChoice(myVote);
              setChanging(true);
            }}
            className="min-h-10 font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Change my vote
          </button>
        ) : null}
      </div>

      {error ? (
        <p role="alert" className="rounded-md bg-destructive/10 p-2.5 text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Horizontal bars, one per option.
 *
 * Each is a `progressbar` with its whole meaning in the label ("Yes: 12 votes,
 * 40 percent"), so the figure is not carried by the bar's length alone, and
 * the leading option and the viewer's own are marked with words, not just a
 * heavier fill. Width animates once, on arrival, and not again - the global
 * reduced-motion rule flattens it for anybody who has asked.
 */
function ResultBars({
  result,
  options,
  myVote,
}: {
  result?: PollResult;
  options: { id: string; label: string; votes: number | null }[];
  myVote: string | null;
}) {
  const total = result?.total ?? 0;
  const visible = result?.canSeeResults === true;
  const top = visible ? Math.max(...options.map((option) => option.votes ?? 0)) : 0;

  if (!visible) {
    return (
      <ul className="space-y-1.5">
        {options.map((option) => (
          <li key={option.id} className="flex items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm">
            <span className="min-w-0 flex-1">{option.label}</span>
            {option.id === myVote ? <span className="shrink-0 text-xs font-medium text-primary">Your vote</span> : null}
          </li>
        ))}
      </ul>
    );
  }

  return (
    <ul className="space-y-2.5">
      {options.map((option) => {
        const votes = option.votes ?? 0;
        const share = percent(votes, total);
        const leading = top > 0 && votes === top;
        return (
          <li key={option.id}>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className={cn("min-w-0", leading && "font-semibold")}>
                {option.label}
                {option.id === myVote ? (
                  <span className="ml-2 inline-flex items-center gap-0.5 text-xs font-medium text-primary">
                    <Check className="h-3 w-3" aria-hidden="true" />
                    Your vote
                  </span>
                ) : null}
                {leading && total > 0 ? <span className="ml-2 text-xs font-medium text-muted-foreground">Leading</span> : null}
              </span>
              <span className="shrink-0 tabular-nums text-muted-foreground">
                {votes} · {share}%
              </span>
            </div>
            <div
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={share}
              aria-label={`${option.label}: ${votes} ${votes === 1 ? "vote" : "votes"}, ${share} percent`}
              className="mt-1 h-2.5 overflow-hidden rounded-full bg-muted"
            >
              <div
                className={cn("h-full rounded-full transition-[width] duration-700 ease-out", leading ? "bg-primary" : "bg-primary/55")}
                style={{ width: `${share}%` }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
