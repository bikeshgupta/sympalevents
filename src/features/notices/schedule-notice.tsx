import { useMemo, useState } from "react";
import { Label } from "@/components/ui/label";
import { formatEventTime, formatEventWeekday } from "@/features/dashboard/dashboard-utils";
import {
  NoticeBlock,
  NoticeDialog,
  NoticeEmpty,
  NoticeSheet,
  type NoticeAudience,
} from "@/features/notices/notice-sheet";
import { parseAgenda } from "@/lib/agenda";
import type { AppEvent, EventPlanRow } from "@/lib/event-data";
import { noticeDayLabel } from "@/lib/notices";
import { cn } from "@/lib/utils";

/**
 * The programme notice, in two shapes from one screen:
 *
 *   "Whole programme" - every day, every event, with each event's agenda as
 *                       its running order;
 *   one event         - that event alone, which is how the cultural evening's
 *                       running order gets its own poster.
 *
 * External copies leave out the owner and the committee's own notes; the
 * times, places and running order are the point of a notice board.
 */
function hasRealDate(row: EventPlanRow) {
  return /^\d{4}-\d{2}-\d{2}$/.test(row.date);
}

function timeRange(row: EventPlanRow) {
  if (!row.startTime && !row.endTime) return "";
  if (row.startTime && row.endTime) return `${formatEventTime(row.startTime)} - ${formatEventTime(row.endTime)}`;
  return formatEventTime(row.startTime || row.endTime);
}

function dayLabel(date: string, event: AppEvent) {
  return noticeDayLabel(date, event.startDate, formatEventWeekday);
}

function EventEntry({
  row,
  audience,
  poster = false,
}: {
  row: EventPlanRow;
  audience: NoticeAudience;
  /** One event on its own sheet: bigger type, for a board. */
  poster?: boolean;
}) {
  const agenda = parseAgenda(row.subEvents);
  const when = timeRange(row);

  return (
    <div className="notice-block">
      {/* On a poster the sheet's own heading already names the event and its
          time, so the line is not repeated - the running order is the sheet. */}
      {poster ? null : (
        <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
          {when ? <span className="font-semibold tabular-nums">{when}</span> : null}
          <span className="font-semibold">{row.activity}</span>
          {row.location ? <span className="text-muted-foreground">· {row.location}</span> : null}
        </p>
      )}
      {agenda.length ? (
        <ul className={cn("list-disc", poster ? "ml-6 mt-2 space-y-2 text-xl" : "ml-4 mt-1 space-y-0.5 text-sm")}>
          {agenda.map((point, index) => (
            <li key={`${point}-${index}`}>{point}</li>
          ))}
        </ul>
      ) : poster ? (
        <NoticeEmpty>
          No running order has been added to this event yet - add its agenda on the Events page.
        </NoticeEmpty>
      ) : null}
      {audience === "internal" ? (
        <div className="mt-1 space-y-0.5 text-xs text-muted-foreground">
          {row.owner ? <p>Owner: {row.owner}</p> : null}
          {row.attendance ? <p>Expected: {row.attendance}</p> : null}
          {row.notes ? <p>Note: {row.notes}</p> : null}
        </div>
      ) : null}
    </div>
  );
}

export function ScheduleNoticeDialog({
  open,
  onOpenChange,
  event,
  rows,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  event: AppEvent;
  rows: EventPlanRow[];
}) {
  const [audience, setAudience] = useState<NoticeAudience>("external");
  const [scope, setScope] = useState("all");

  const dated = useMemo(
    () =>
      [...rows]
        .filter(hasRealDate)
        .sort((left, right) => left.date.localeCompare(right.date) || left.startTime.localeCompare(right.startTime)),
    [rows],
  );

  const single = dated.find((row) => row.id === scope);

  const days = useMemo(() => {
    const included = scope === "all" ? dated : dated.filter((row) => row.id === scope);
    const byDate = new Map<string, EventPlanRow[]>();
    for (const row of included) byDate.set(row.date, [...(byDate.get(row.date) ?? []), row]);
    return [...byDate.entries()].sort(([left], [right]) => left.localeCompare(right));
  }, [dated, scope]);

  const title = single ? single.activity : "Programme";
  const intro = single
    ? [dayLabel(single.date, event), formatEventWeekday(single.date), timeRange(single), single.location]
        .filter(Boolean)
        .join(" · ")
    : undefined;

  return (
    <NoticeDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Programme notice"
      documentTitle={`${event.name} - ${title}`}
      audience={audience}
      onAudienceChange={setAudience}
      controls={
        <div className="space-y-1.5">
          <Label htmlFor="notice-scope">What to print</Label>
          <select
            id="notice-scope"
            className="h-10 w-full rounded-md border bg-background px-3 text-sm"
            value={scope}
            onChange={(item) => setScope(item.target.value)}
          >
            <option value="all">Whole programme - every day</option>
            {dated.map((row) => (
              <option key={row.id ?? `${row.date}-${row.activity}`} value={row.id ?? ""}>
                {`${dayLabel(row.date, event)} - ${row.activity}`}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">
            Pick one event to print its running order on its own - the cultural evening, for instance.
          </p>
        </div>
      }
    >
      <NoticeSheet
        eventName={event.name}
        eventDates={event.dates}
        location={event.location}
        title={title}
        intro={intro}
        audience={audience}
        size={single ? "poster" : "notice"}
      >
        {days.length ? (
          days.map(([date, list]) =>
            single ? (
              <div key={date} className="space-y-2.5">
                {list.map((row) => (
                  <EventEntry key={row.id ?? row.activity} row={row} audience={audience} poster />
                ))}
              </div>
            ) : (
              <NoticeBlock key={date} heading={dayLabel(date, event)} meta={formatEventWeekday(date)}>
                {list.map((row) => (
                  <EventEntry key={row.id ?? `${row.activity}-${row.startTime}`} row={row} audience={audience} />
                ))}
              </NoticeBlock>
            ),
          )
        ) : (
          <NoticeEmpty>No events have been scheduled yet.</NoticeEmpty>
        )}
      </NoticeSheet>
    </NoticeDialog>
  );
}
