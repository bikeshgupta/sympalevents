import { ArrowRight, Check, Circle } from "lucide-react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Announcement } from "@/data/announcements";
import { isInteractiveClosed } from "@/lib/announcements";
import { useEventPath } from "@/lib/event-path";
import { openCount, useOpportunities } from "@/lib/opportunities";
import { useRegistration } from "@/lib/registration";
import { buildChecklist, progress, type ChecklistPage } from "@/lib/your-event";
import { cn } from "@/lib/utils";

/**
 * "Your event": what this resident has left to do, as a short list.
 *
 * It is the page's reason to be opened a second time - it is about *them*, and
 * it changes as they act. The logic is `buildChecklist` (src/lib/your-event.ts).
 * The registration it reads is the same query the action card above already
 * made, so this adds no request; the polls come with the announcements the page
 * already holds, and whether the viewer has voted rode in with them.
 *
 * Only for somebody signed in. A signed-out visitor is invited by the action
 * card above, and a checklist with nobody's name on it is just a list of
 * instructions.
 */
export function YourEventCard({
  eventId,
  signedIn,
  openPageKeys,
  announcements,
  now,
}: {
  eventId?: string;
  signedIn: boolean;
  /** What this viewer may open; `null` in the demo. */
  openPageKeys: Set<string> | null;
  announcements?: Announcement[];
  now: Date;
}) {
  const path = useEventPath();
  const registrationVisible = Boolean(eventId) && openPageKeys !== null && openPageKeys.has("registration");
  const { query } = useRegistration(registrationVisible && signedIn ? eventId : undefined);
  const registration = query.data;
  // The same query the Get involved card makes, so asking twice costs one request.
  const volunteersVisible = Boolean(eventId) && openPageKeys !== null && openPageKeys.has("volunteers");
  const opportunities = useOpportunities(eventId, volunteersVisible && signedIn).query.data;

  const unvotedPolls = (announcements ?? [])
    .filter((post) => post.kind === "poll" && post.status !== "draft" && post.viewerVoted === false && !isInteractiveClosed(post, now))
    .map((post) => ({ id: post.id, title: post.title }));

  const items = buildChecklist({
    signedIn,
    registration: registration
      ? {
          enabled: registration.config.enabled,
          selfService: registration.config.self_service,
          mine: registration.mine
            ? {
                status: registration.mine.status,
                paymentStatus: registration.mine.payment_status,
                amountDue: registration.mine.amount_due,
              }
            : null,
        }
      : null,
    unvotedPolls,
    openOpportunities: openCount(opportunities?.items),
  });

  if (!items.length) return null;

  const { done, total } = progress(items);
  const allDone = total > 0 && done === total;
  const hrefFor = (page: ChecklistPage) => path(`/${page}`);

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-baseline justify-between gap-3">
          <CardTitle>{allDone ? "You're all set" : "Your event"}</CardTitle>
          {total ? (
            <span className="text-sm tabular-nums text-muted-foreground" aria-label={`${done} of ${total} done`}>
              {done} of {total} done
            </span>
          ) : null}
        </div>
        {total ? (
          <div
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={total}
            aria-valuenow={done}
            aria-label="Your progress"
            className="mt-2 h-2 overflow-hidden rounded-full bg-muted"
          >
            <div className="h-full rounded-full bg-primary transition-[width] duration-700 ease-out" style={{ width: `${(done / total) * 100}%` }} />
          </div>
        ) : null}
      </CardHeader>
      <CardContent>
        <ul className="divide-y">
          {items.map((item) => (
            <li key={item.key} className="flex items-start gap-3 py-2.5 first:pt-1 last:pb-0">
              <span
                aria-hidden="true"
                className={cn(
                  "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full",
                  item.done ? "bg-emerald-100 text-emerald-800" : "border bg-background text-muted-foreground",
                )}
              >
                {item.done ? <Check className="h-3.5 w-3.5" /> : <Circle className="h-2.5 w-2.5" />}
              </span>
              <div className="min-w-0 flex-1">
                <p className={cn("text-sm font-medium leading-snug", item.done && "text-muted-foreground")}>
                  {item.label}
                  <span className="sr-only">{item.done ? " - done" : " - to do"}</span>
                </p>
                {item.detail ? <p className="text-xs text-muted-foreground">{item.detail}</p> : null}
              </div>
              {item.page && item.cta ? (
                <Link
                  to={hrefFor(item.page)}
                  className="inline-flex min-h-10 shrink-0 items-center gap-1 text-sm font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {item.cta}
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </Link>
              ) : null}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
