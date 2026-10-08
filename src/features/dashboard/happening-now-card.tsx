import { ArrowRight, Clock3, MapPin } from "lucide-react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatEventTime, getTimelineItemStatus, sortTimelineItems } from "@/features/dashboard/dashboard-utils";
import type { EventPlanRow } from "@/lib/event-data";
import { useEventPath } from "@/lib/event-path";
import { parseAgenda } from "@/lib/agenda";

/**
 * "Happening now" - the card people open the app for on the day itself.
 *
 * What is on this minute, and the next two things, with where. It only exists
 * while the event is live and only when there is a programme to read from, so a
 * resident is never shown a card that says "nothing" at the moment they are
 * standing in the venue. The full schedule is one tap away and this is
 * deliberately not a copy of it.
 *
 * Reads the programme the page already holds; no request of its own.
 */
export function HappeningNowCard({ timeline, now, canOpenSchedule }: { timeline: EventPlanRow[]; now: Date; canOpenSchedule: boolean }) {
  const path = useEventPath();

  const sorted = sortTimelineItems(timeline).filter((item) => item.startTime);
  const current = sorted.filter((item) => getTimelineItemStatus(item, now) === "current");
  const upcoming = sorted.filter((item) => getTimelineItemStatus(item, now) === "upcoming").slice(0, current.length ? 2 : 3);

  if (!current.length && !upcoming.length) return null;

  const Row = ({ item, live }: { item: EventPlanRow; live?: boolean }) => {
    const first = parseAgenda(item.subEvents)[0];
    return (
      <li className="py-2.5 first:pt-1 last:pb-0">
        <p className="text-sm font-semibold leading-snug">
          {item.activity}
          {live ? <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">On now</span> : null}
        </p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground tabular-nums">
          <span className="inline-flex items-center gap-1">
            <Clock3 className="h-3 w-3" aria-hidden="true" />
            {formatEventTime(item.startTime)}
            {item.endTime ? ` – ${formatEventTime(item.endTime)}` : ""}
          </span>
          {item.location ? (
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3 w-3" aria-hidden="true" />
              {item.location}
            </span>
          ) : null}
        </p>
        {first ? <p className="mt-0.5 text-xs text-muted-foreground">{first}</p> : null}
      </li>
    );
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle>{current.length ? "Happening now" : "Up next"}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        <ul className="divide-y">
          {current.map((item) => (
            <Row key={item.id ?? `${item.date}-${item.activity}`} item={item} live />
          ))}
        </ul>
        {current.length && upcoming.length ? (
          <p className="pt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Up next</p>
        ) : null}
        <ul className="divide-y">
          {upcoming.map((item) => (
            <Row key={item.id ?? `${item.date}-${item.activity}`} item={item} />
          ))}
        </ul>
        {canOpenSchedule ? (
          <Link
            to={path("/event-plan")}
            className="inline-flex min-h-10 items-center gap-1 pt-1 text-sm font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Full programme
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        ) : null}
      </CardContent>
    </Card>
  );
}
