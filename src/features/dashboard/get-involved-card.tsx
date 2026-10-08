import { ArrowRight, HandHelping, Mic2 } from "lucide-react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useEventPath } from "@/lib/event-path";
import { useOpportunities } from "@/lib/opportunities";

/**
 * A few of the things the organisers still need people for, with a way in.
 *
 * Asking is the cheapest thing an app can do to turn a viewer into a
 * participant, so it sits on the home page rather than behind a menu. Draws
 * nothing when nobody is being asked for - an empty "Get involved" is worse than
 * none - and reads the query the checklist already made.
 */
export function GetInvolvedCard({ eventId, canSee }: { eventId?: string; canSee: boolean }) {
  const path = useEventPath();
  const { query } = useOpportunities(eventId, canSee);
  const open = (query.data?.items ?? []).filter((item) => !item.closed && !item.full && !item.mine);
  if (!canSee || !query.data?.ready || !open.length) return null;
  const shown = open.slice(0, 3);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle>Get involved</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <ul className="divide-y">
          {shown.map((item) => {
            const Icon = item.kind === "volunteer" ? HandHelping : Mic2;
            return (
              <li key={item.id} className="flex items-center gap-3 py-2.5 first:pt-1">
                <Icon className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium leading-snug">{item.title}</p>
                  <p className="text-xs text-muted-foreground tabular-nums">{item.left === null ? "Open to everyone" : `${item.left} ${item.left === 1 ? "place" : "places"} left`}</p>
                </div>
              </li>
            );
          })}
        </ul>
        <Link
          to={path("/volunteers")}
          className="inline-flex min-h-10 items-center gap-1 text-sm font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {open.length > shown.length ? `See all ${open.length}` : "Sign up"}
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      </CardContent>
    </Card>
  );
}
