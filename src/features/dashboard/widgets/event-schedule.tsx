import type { EventPhase, TimelineStatus } from "@/features/dashboard/dashboard-utils";
import type { EventPlanRow } from "@/lib/event-data";
import type { KeyboardEvent } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Check, ChevronDown, Clock3, ListChecks, MapPin } from "lucide-react";
import { formatEventDate, formatEventTime, getDateInEventZone, getDayWindow, getTimelineItemStatus, getWindowProgress, toEventZoneTimestamp } from "@/features/dashboard/dashboard-utils";
import { gapLabel } from "@/lib/announcements";
import { parseAgenda } from "@/lib/agenda";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/**
 * The day-by-day schedule.
 *
 * The structure a returning user knows is unchanged - card, day tabs, an
 * "up next" callout, then a vertical timeline - but each row now carries the
 * detail that made the old version too generic to plan an evening around:
 * how far through a live event we are, and the agenda inside it (puja start,
 * the opening ceremony, when the refreshment counter opens and closes, the running
 * order of the cultural programme). Those come from `sub_events`, parsed by
 * src/lib/agenda.ts - no new columns.
 */
export function EventSchedule({
  days,
  selectedDay,
  onSelectDay,
  items,
  allItems,
  nextEvent,
  now,
  phase,
}: {
  days: Array<{ key: string; label: string; date: string }>;
  selectedDay: string;
  onSelectDay: (day: string) => void;
  items: EventPlanRow[];
  allItems: EventPlanRow[];
  nextEvent?: EventPlanRow;
  now: Date;
  phase: EventPhase;
}) {
  const currentItem = items.find((item) => getTimelineItemStatus(item, now) === "current");
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const todayDate = getDateInEventZone(now);

  const dayTabs = useMemo(
    () =>
      days.map((day) => ({
        ...day,
        count: allItems.filter((item) => item.day === day.key || item.date === day.date).length,
        isToday: day.date === todayDate,
        isPast: day.date < todayDate,
      })),
    [days, allItems, todayDate],
  );

  const dayWindow = getDayWindow(items);
  const agendaCount = useMemo(
    () => items.reduce((sum, item) => sum + parseAgenda(item.subEvents).length, 0),
    [items],
  );
  const doneCount = items.filter((item) => getTimelineItemStatus(item, now) === "completed").length;
  const selectedTab = dayTabs.find((day) => day.key === selectedDay);

  const onTabKeyDown = useCallback(
    (keyEvent: KeyboardEvent<HTMLButtonElement>, index: number) => {
      const offset = keyEvent.key === "ArrowRight" ? 1 : keyEvent.key === "ArrowLeft" ? -1 : 0;
      if (!offset) return;
      keyEvent.preventDefault();
      const next = days[(index + offset + days.length) % days.length];
      if (!next) return;
      onSelectDay(next.key);
      tabRefs.current[next.key]?.focus();
    },
    [days, onSelectDay],
  );

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle>Event Schedule</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              {phase === "during"
                ? "What is happening now, and what comes next."
                : "Every day, hour by hour - including what happens inside each event."}
            </p>
          </div>
          <Clock3 className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
        </div>
      </CardHeader>
      <CardContent className="space-y-4 px-4 sm:px-5">
        {/* Horizontal scroll rather than wrapping: a five-day event should not
            push the timeline below the fold on a phone. */}
        <div
          className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1"
          role="tablist"
          aria-label="Event days"
        >
          {dayTabs.map((day, index) => {
            const active = selectedDay === day.key;
            return (
              <button
                key={day.key}
                ref={(node) => {
                  tabRefs.current[day.key] = node;
                }}
                type="button"
                role="tab"
                aria-selected={active}
                aria-controls="event-day-panel"
                aria-label={`${day.label}, ${formatEventDate(day.date)}, ${day.count} ${day.count === 1 ? "event" : "events"}${day.isToday ? ", today" : day.isPast ? ", finished" : ""}`}
                tabIndex={active ? 0 : -1}
                onKeyDown={(keyEvent) => onTabKeyDown(keyEvent, index)}
                className={`min-w-[6rem] flex-1 shrink-0 rounded-md border px-2 py-2 text-center text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 ${
                  active ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-muted"
                } ${!active && day.isPast ? "opacity-70" : ""}`}
                onClick={() => onSelectDay(day.key)}
              >
                <span className="block">{day.label}</span>
                <span
                  aria-hidden="true"
                  className={`mt-0.5 flex items-center justify-center gap-1 text-xs ${
                    active ? "text-primary-foreground/85" : "text-muted-foreground"
                  }`}
                >
                  {day.isToday ? (
                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${active ? "bg-primary-foreground" : "bg-emerald-500"}`} />
                  ) : day.isPast ? (
                    <Check className="h-3 w-3 shrink-0" />
                  ) : null}
                  {formatEventDate(day.date)}
                </span>
              </button>
            );
          })}
        </div>

        <div id="event-day-panel" role="tabpanel" aria-label={`${selectedDay} schedule`} className="space-y-4">
          {items.length ? (
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">
                {items.length} {items.length === 1 ? "event" : "events"}
              </span>
              {dayWindow ? (
                <span className="tabular-nums">
                  {formatEventTime(dayWindow.start)} - {formatEventTime(dayWindow.end)}
                </span>
              ) : null}
              {agendaCount ? <span>{agendaCount} agenda items</span> : null}
              {selectedTab?.isToday || selectedTab?.isPast ? (
                <span className="font-medium text-primary">{doneCount} done</span>
              ) : null}
            </p>
          ) : null}

          {currentItem ? (
            <UpcomingEvent item={currentItem} label="Happening now" tone="live" now={now} />
          ) : nextEvent ? (
            <UpcomingEvent item={nextEvent} label="Up next" now={now} />
          ) : null}

          {items.length ? (
            <div className="space-y-0">
              {items.map((item, index) => (
                <TimelineItem
                  key={item.id ?? `${item.date}-${item.activity}-${index}`}
                  item={item}
                  status={getTimelineItemStatus(item, now)}
                  isLast={index === items.length - 1}
                  showNowLabel={item !== currentItem}
                  now={now}
                />
              ))}
            </div>
          ) : (
            <div className="rounded-md bg-muted p-4 text-sm text-muted-foreground">
              No activities planned for this day yet. Add them on the Events page, along with the agenda inside each
              one - puja and arti timings, or the running order of a cultural evening.
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/** "in 2 hr 10 min" until an item starts, null once it has begun. */
function startsInLabel(item: EventPlanRow, now: Date) {
  if (!item.startTime) return null;
  const diffMs = toEventZoneTimestamp(item.date, item.startTime) - now.getTime();
  if (diffMs <= 0) return null;
  return `in ${gapLabel(diffMs)}`;
}

function UpcomingEvent({
  item,
  label,
  tone = "default",
  now,
}: {
  item: EventPlanRow;
  label: string;
  tone?: "default" | "live";
  now: Date;
}) {
  const agenda = parseAgenda(item.subEvents);
  const countdown = startsInLabel(item, now);
  const progress = tone === "live" ? getWindowProgress(item.date, item.startTime, item.endTime, now) : 0;

  return (
    <div className={`rounded-md border p-3 ${tone === "live" ? "border-primary/30 bg-primary/5" : "bg-muted/60"}`}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-primary">{label}</p>
        {countdown ? (
          <span className="rounded-full bg-background px-2 py-0.5 text-xs font-medium text-muted-foreground">
            {countdown}
          </span>
        ) : null}
      </div>
      <p className="mt-1 font-semibold">{item.activity}</p>
      <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted-foreground">
        <span className="tabular-nums">
          {item.endTime
            ? `${formatEventTime(item.startTime)} - ${formatEventTime(item.endTime)}`
            : formatEventTime(item.startTime)}
        </span>
        {item.location ? (
          <span className="inline-flex items-center gap-1">
            <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {item.location}
          </span>
        ) : null}
      </p>
      {tone === "live" && item.endTime ? <EventProgress value={progress} label={item.activity} /> : null}
      {agenda.length ? (
        <ul className="mt-2 space-y-0.5 rounded-md bg-background/70 px-2.5 py-1.5 text-sm text-muted-foreground">
          {agenda.slice(0, 3).map((entry, index) => (
            <li key={`${entry}-${index}`} className="flex gap-2">
              <span aria-hidden="true" className="text-primary">&bull;</span>
              <span className="min-w-0">{entry}</span>
            </li>
          ))}
          {agenda.length > 3 ? <li className="pl-4 text-xs">+{agenda.length - 3} more</li> : null}
        </ul>
      ) : null}
    </div>
  );
}

function EventProgress({ value, label }: { value: number; label: string }) {
  return (
    <div
      className="mt-2 h-1.5 overflow-hidden rounded-full bg-primary/15"
      role="progressbar"
      aria-valuenow={Math.round(value)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={`${label} progress`}
    >
      <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${value}%` }} />
    </div>
  );
}

function StatusPill({ status }: { status: TimelineStatus }) {
  if (status === "current") {
    return (
      <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
        <span className="relative flex h-1.5 w-1.5" aria-hidden="true">
          <span className="absolute inline-flex h-full w-full animate-pulse-ring rounded-full bg-primary" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary" />
        </span>
        Live
      </span>
    );
  }

  if (status === "completed") {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
        Done
      </span>
    );
  }

  return null;
}

function TimelineItem({
  item,
  status,
  isLast,
  showNowLabel,
  now,
}: {
  item: EventPlanRow;
  status: TimelineStatus;
  isLast: boolean;
  showNowLabel: boolean;
  now: Date;
}) {
  const isCurrent = status === "current";
  const isCompleted = status === "completed";
  const agenda = useMemo(() => parseAgenda(item.subEvents), [item.subEvents]);
  // Finished events fold their agenda away so the day stays scannable; the
  // one in progress opens itself the moment it goes live, and stays openable
  // by hand afterwards.
  const [showAgenda, setShowAgenda] = useState(status !== "completed");
  const previousStatus = useRef(status);

  useEffect(() => {
    if (status === "current" && previousStatus.current !== "current") setShowAgenda(true);
    previousStatus.current = status;
  }, [status]);

  return (
    <div className="grid grid-cols-[3.5rem_1rem_1fr] gap-2 sm:grid-cols-[4.25rem_1rem_1fr] sm:gap-3">
      <div className="pt-0.5 text-right text-xs font-medium tabular-nums text-muted-foreground sm:text-sm">
        {formatEventTime(item.startTime)}
      </div>
      <div className="relative flex justify-center">
        <span
          className={`mt-1 flex h-4 w-4 items-center justify-center rounded-full border ${
            isCurrent
              ? "border-primary bg-primary"
              : isCompleted
                ? "border-primary bg-primary/15"
                : "border-border bg-card"
          }`}
        >
          {isCompleted ? <Check className="h-3 w-3 text-primary" aria-hidden="true" /> : null}
        </span>
        {!isLast ? <span className="absolute top-5 h-[calc(100%-0.25rem)] w-px bg-border" /> : null}
      </div>
      <div className={`min-w-0 pb-5 ${isCompleted ? "opacity-75" : ""}`}>
        {isCurrent && showNowLabel ? (
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-primary">Happening now</p>
        ) : null}
        <div className="flex items-start justify-between gap-2">
          <p className="font-medium leading-snug">{item.activity}</p>
          <StatusPill status={status} />
        </div>
        <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted-foreground">
          {item.endTime ? (
            <span className="tabular-nums">
              {formatEventTime(item.startTime)} - {formatEventTime(item.endTime)}
            </span>
          ) : null}
          {item.location ? (
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {item.location}
            </span>
          ) : null}
        </p>
        {isCurrent && item.endTime ? <EventProgress value={getWindowProgress(item.date, item.startTime, item.endTime, now)} label={item.activity} /> : null}
        {item.notes ? <p className="mt-1 text-sm text-muted-foreground">{item.notes}</p> : null}
        {agenda.length ? (
          <>
            <button
              type="button"
              onClick={() => setShowAgenda((open) => !open)}
              aria-expanded={showAgenda}
              className="mt-2 inline-flex min-h-10 items-center gap-1.5 rounded-md text-sm font-medium text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ListChecks className="h-4 w-4" aria-hidden="true" />
              Agenda ({agenda.length})
              <ChevronDown
                className={`h-4 w-4 transition-transform ${showAgenda ? "rotate-180" : ""}`}
                aria-hidden="true"
              />
            </button>
            {showAgenda ? <AgendaList items={agenda} /> : null}
          </>
        ) : null}
      </div>
    </div>
  );
}

/**
 * The agenda points inside one event. This is the part the old card was
 * missing: an event that says "7:00 PM - 9:00 PM Cultural Program" tells a
 * resident nothing about what actually happens in it.
 */
function AgendaList({ items }: { items: string[] }) {
  return (
    <ul className="mt-2 space-y-1.5 border-l border-dashed border-border pl-3">
      {items.map((entry, index) => (
        <li key={`${entry}-${index}`} className="flex gap-2.5 text-sm leading-snug">
          <span aria-hidden="true" className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/60" />
          <span className="min-w-0 flex-1">{entry}</span>
        </li>
      ))}
    </ul>
  );
}
