import { MessageCircleQuestion, ThumbsUp } from "lucide-react";
import { FormEvent, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import type { Announcement } from "@/data/announcements";
import { closesAtOf, closesLabel, useQuestions, type Question } from "@/lib/announcement-interactions";
import { cn } from "@/lib/utils";

const MAX = 300;
const SHOWN = 3;

/**
 * An ask-me-anything, inside the announcements card.
 *
 * Anybody signed in can ask; nothing they write is public until an organiser
 * lets it through, because this is a page an admin may have set to "anyone with
 * the link" and an open box is an invitation. The asker sees their own question
 * wait, so it never looks as though it vanished. Asked anonymously unless they
 * tick otherwise - a name is the sensitive part - and never with a flat.
 *
 * Organisers moderate in place: Approve, Answer, Hide. Nothing about who asked
 * is shown to them either unless the asker chose to give a name.
 */
export function AskPost({ post, signedIn, enabled }: { post: Announcement; signedIn: boolean; enabled: boolean }) {
  const { query, ask, upvote, moderate } = useQuestions(post.id, enabled);
  const location = useLocation();
  const [text, setText] = useState("");
  const [named, setNamed] = useState(false);
  const [sent, setSent] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const list = query.data;
  const closed = list?.closed ?? false;
  const closing = closesLabel(list?.closesAt ?? closesAtOf(post.payload));
  const questions = list?.questions ?? [];
  const shown = showAll ? questions : questions.slice(0, SHOWN);
  const error = [ask.error, upvote.error, moderate.error, query.error].find((item) => item instanceof Error) as Error | undefined;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSent(null);
    try {
      const result = await ask.mutateAsync({ body: text, anonymous: !named });
      setText("");
      setSent(
        result.status === "approved"
          ? "Posted."
          : "Thanks. The organisers will look at your question before it appears here.",
      );
    } catch {
      /* shown below from ask.error */
    }
  }

  return (
    <div className="relative mt-2 space-y-3">
      {!closed ? (
        signedIn ? (
          <form onSubmit={(event) => void submit(event)} className="space-y-2">
            <label htmlFor={`ask-${post.id}`} className="sr-only">
              Your question
            </label>
            <textarea
              id={`ask-${post.id}`}
              value={text}
              maxLength={MAX}
              onChange={(event) => setText(event.target.value)}
              placeholder="Type your question…"
              className="min-h-20 w-full rounded-md border border-input bg-background p-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="flex min-h-10 items-center gap-2 text-xs text-muted-foreground">
                <input type="checkbox" checked={named} onChange={(event) => setNamed(event.target.checked)} />
                Show my name with it
              </label>
              <div className="flex items-center gap-3">
                <span className="text-xs tabular-nums text-muted-foreground">
                  {text.length}/{MAX}
                </span>
                <Button type="submit" disabled={ask.isPending || text.trim().length < 3}>
                  {ask.isPending ? "Sending…" : "Ask"}
                </Button>
              </div>
            </div>
          </form>
        ) : (
          <Button asChild className="w-full sm:w-auto">
            <Link to="/login" state={{ from: location.pathname }}>
              Sign in to ask
            </Link>
          </Button>
        )
      ) : (
        <p className="text-sm text-muted-foreground">Questions are closed. The answers below stay up.</p>
      )}

      {sent ? (
        <p role="status" className="text-sm text-primary">
          {sent}
        </p>
      ) : null}

      {shown.length ? (
        <ul className="space-y-2">
          {shown.map((question) => (
            <QuestionItem
              key={question.id}
              question={question}
              canModerate={list?.canModerate === true}
              signedIn={signedIn}
              busy={upvote.isPending || moderate.isPending}
              onUpvote={() => upvote.mutate(question.id)}
              onModerate={(action, answer) => moderate.mutateAsync({ questionId: question.id, action, answer })}
            />
          ))}
        </ul>
      ) : query.isLoading ? null : (
        <p className="text-sm text-muted-foreground">
          No questions yet. {closed ? "" : "Be the first to ask."}
        </p>
      )}

      {questions.length > SHOWN ? (
        <button
          type="button"
          onClick={() => setShowAll((value) => !value)}
          className="min-h-10 text-sm font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {showAll ? "Show fewer" : `Show all ${questions.length} questions`}
        </button>
      ) : null}

      <div className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
        {list?.canModerate && list.pending ? (
          <span className="font-medium text-foreground">
            {list.pending} waiting for you
          </span>
        ) : null}
        {closing ? <span className="tabular-nums">{closing}</span> : null}
      </div>

      {error ? (
        <p role="alert" className="rounded-md bg-destructive/10 p-2.5 text-sm text-destructive">
          {error.message}
        </p>
      ) : null}
    </div>
  );
}

function QuestionItem({
  question,
  canModerate,
  signedIn,
  busy,
  onUpvote,
  onModerate,
}: {
  question: Question;
  canModerate: boolean;
  signedIn: boolean;
  busy: boolean;
  onUpvote: () => void;
  onModerate: (action: "approve" | "hide" | "answer", answer?: string) => Promise<unknown>;
}) {
  const [answering, setAnswering] = useState(false);
  const [draft, setDraft] = useState(question.answer ?? "");
  const waiting = question.status === "pending";

  return (
    <li className={cn("rounded-md border bg-background p-3 text-sm", waiting && "border-dashed")}>
      <div className="flex items-start gap-2">
        <MessageCircleQuestion className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="whitespace-pre-line leading-snug">{question.body}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {question.askedBy ? `Asked by ${question.askedBy}` : "A resident asked"}
            {question.mine ? " · yours" : ""}
            {waiting ? " · Waiting for the organisers" : ""}
          </p>
        </div>
        {!waiting ? (
          <button
            type="button"
            disabled={!signedIn || busy}
            onClick={onUpvote}
            aria-pressed={question.iUpvoted}
            aria-label={`${question.upvotes} ${question.upvotes === 1 ? "person wants" : "people want"} this answered${signedIn ? "" : ". Sign in to add yours"}`}
            className={cn(
              "inline-flex h-10 min-w-10 shrink-0 items-center justify-center gap-1 rounded-md border px-2 text-xs tabular-nums",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default",
              question.iUpvoted ? "border-primary bg-accent font-semibold text-primary" : "bg-card text-muted-foreground",
            )}
          >
            <ThumbsUp className="h-3.5 w-3.5" aria-hidden="true" />
            {question.upvotes}
          </button>
        ) : null}
      </div>

      {question.answer ? (
        <div className="mt-2 rounded-md bg-accent/60 p-2.5">
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">Answer</p>
          <p className="mt-0.5 whitespace-pre-line leading-snug">{question.answer}</p>
        </div>
      ) : null}

      {canModerate ? (
        answering ? (
          <form
            className="mt-2 space-y-2"
            onSubmit={(event) => {
              event.preventDefault();
              void onModerate("answer", draft).then(() => setAnswering(false));
            }}
          >
            <label htmlFor={`answer-${question.id}`} className="sr-only">
              Your answer
            </label>
            <textarea
              id={`answer-${question.id}`}
              value={draft}
              maxLength={1500}
              onChange={(event) => setDraft(event.target.value)}
              className="min-h-20 w-full rounded-md border border-input bg-background p-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <div className="flex gap-2">
              <Button type="submit" disabled={busy || !draft.trim()}>
                Post answer
              </Button>
              <Button type="button" variant="outline" onClick={() => setAnswering(false)}>
                Cancel
              </Button>
            </div>
          </form>
        ) : (
          <div className="mt-2 flex flex-wrap gap-2">
            {waiting ? (
              <Button type="button" variant="outline" size="sm" className="h-10" disabled={busy} onClick={() => void onModerate("approve")}>
                Approve
              </Button>
            ) : null}
            <Button type="button" variant="outline" size="sm" className="h-10" disabled={busy} onClick={() => setAnswering(true)}>
              {question.answer ? "Edit answer" : "Answer"}
            </Button>
            <Button type="button" variant="outline" size="sm" className="h-10 text-destructive" disabled={busy} onClick={() => void onModerate("hide")}>
              Hide
            </Button>
          </div>
        )
      ) : null}
    </li>
  );
}
