import { BarChart3, Megaphone, MessageCircleQuestion, Pin } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { AskPost } from "@/features/dashboard/ask-post";
import { PollPost } from "@/features/dashboard/poll-post";
import { formatEventDate, formatEventTime } from "@/features/dashboard/dashboard-utils";
import { useSession } from "@/lib/auth";
import { isInteractiveClosed, leadTimeLabel, resolveAnnouncements, type ResolvedAnnouncement } from "@/lib/announcements";
import { useEventData } from "@/lib/event-data";
import { useEventPath } from "@/lib/event-path";
import { usePageAccess } from "@/lib/page-access";
import { cn } from "@/lib/utils";

/**
 * Everything the organisers have said, newest first.
 *
 * The announcements card on the home page is a window onto the latest few; this
 * is the record. It answers "did I miss something?" - a change of time, a poll
 * that closed yesterday, an answer to a question - without anyone having to be
 * watching the card when it rotated past.
 *
 * It is the same posts, drawn with the same components (polls and questions work
 * here exactly as they do on the card), from the data the page already loaded:
 * it adds no request of its own beyond what a poll or a question box needs.
 * Pinned posts stay on top. Anything finished - a poll that has closed, a
 * notice whose day has passed - moves under "Earlier" rather than disappearing.
 */
export function UpdatesPage() {
  const { data } = useEventData({ includeTasks: false });
  const { data: session } = useSession();
  const path = useEventPath();
  const dashboard = usePageAccess("dashboard");
  const now = new Date();

  const posts = resolveAnnouncements(data.event, data.announcements);
  const finished = (post: ResolvedAnnouncement) => isInteractiveClosed(post, now) || leadTimeLabel(post, now) === "Completed";
  const current = posts.filter((post) => !finished(post));
  const earlier = posts.filter(finished);

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold sm:text-3xl">Updates</h1>
          <p className="mt-1 text-sm text-muted-foreground">News, polls and answers from the organisers of {data.event.name}.</p>
        </div>
        {dashboard.canEdit && data.source !== "demo" ? (
          <Button asChild variant="outline" className="h-10">
            <Link to={`${path("/dashboard")}?announcements=manage`}>
              <Megaphone className="h-4 w-4" aria-hidden="true" />
              Post an update
            </Link>
          </Button>
        ) : null}
      </header>

      {posts.length === 0 ? (
        <p className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
          Nothing posted yet. When the organisers share news, run a poll or take questions, it will be here.
        </p>
      ) : null}

      {current.length ? (
        <section aria-labelledby="updates-current" className="space-y-3">
          <h2 id="updates-current" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Latest
          </h2>
          {current.map((post) => (
            <Post key={post.id} post={post} signedIn={Boolean(session?.user)} now={now} />
          ))}
        </section>
      ) : null}

      {earlier.length ? (
        <section aria-labelledby="updates-earlier" className="space-y-3">
          <h2 id="updates-earlier" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Earlier
          </h2>
          {earlier.map((post) => (
            <Post key={post.id} post={post} signedIn={Boolean(session?.user)} now={now} muted />
          ))}
        </section>
      ) : null}
    </div>
  );
}

function Post({ post, signedIn, now, muted = false }: { post: ResolvedAnnouncement; signedIn: boolean; now: Date; muted?: boolean }) {
  const isPoll = post.kind === "poll";
  const isAsk = post.kind === "ask";
  const posted = post.publishedAt ? formatEventDate(post.publishedAt.slice(0, 10)) : "";

  return (
    <article
      className={cn("rounded-xl border bg-card p-4", muted && "bg-muted/30")}
      aria-label={post.title}
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold",
            muted ? "bg-muted text-muted-foreground" : "bg-primary text-primary-foreground",
          )}
        >
          {isPoll ? <BarChart3 className="h-3 w-3" aria-hidden="true" /> : null}
          {isAsk ? <MessageCircleQuestion className="h-3 w-3" aria-hidden="true" /> : null}
          {isPoll ? "Poll" : isAsk ? "Ask us anything" : post.tag}
        </span>
        {post.pinned ? (
          <span className="inline-flex items-center gap-1 font-medium text-muted-foreground">
            <Pin className="h-3 w-3" aria-hidden="true" />
            Pinned
          </span>
        ) : null}
        {muted ? <span className="font-medium text-muted-foreground">Closed</span> : null}
        {posted ? <span className="ml-auto tabular-nums text-muted-foreground">Posted {posted}</span> : null}
      </div>

      <h3 className="mt-2 text-base font-semibold leading-snug">{post.title}</h3>
      {post.body ? <p className="mt-1 whitespace-pre-line text-sm leading-snug text-muted-foreground">{post.body}</p> : null}

      {isPoll ? <PollPost post={post} signedIn={signedIn} enabled /> : null}
      {isAsk ? <AskPost post={post} signedIn={signedIn} enabled /> : null}

      {!isPoll && !isAsk && (post.resolvedDate || post.time || post.location) ? (
        <p className="mt-2 text-xs text-muted-foreground tabular-nums">
          {[
            post.resolvedDate ? formatEventDate(post.resolvedDate) : null,
            post.time ? formatEventTime(post.time) : null,
            post.location,
          ]
            .filter(Boolean)
            .join(" · ")}
          {leadTimeLabel(post, now) && !muted ? ` · ${leadTimeLabel(post, now)}` : ""}
        </p>
      ) : null}
    </article>
  );
}
