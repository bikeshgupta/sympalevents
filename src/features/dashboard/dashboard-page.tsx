import { useQuery } from "@tanstack/react-query";
import {
  CalendarDays,
  Check,
  CircleAlert,
  Clock3,
  HandCoins,
  HeartHandshake,
  Image,
  Landmark,
  MapPin,
  ReceiptIndianRupee,
  Sparkles,
  TrendingUp,
  Users,
} from "lucide-react";
import { KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatedNumber } from "@/components/shared/animated-number";
import { DataSourceBadge } from "@/components/shared/data-source-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AnnouncementsCard } from "@/features/dashboard/announcements-card";
import {
  calculateFundingProgress,
  formatCurrencyCompact,
  formatEventDate,
  formatEventTime,
  getDefaultEventDay,
  getEventDays,
  getEventPhase,
  getNextEvent,
  getTimelineItemStatus,
  sortTimelineItems,
  toEventZoneTimestamp,
  type EventPhase,
  type TimelineStatus,
} from "@/features/dashboard/dashboard-utils";
import { apiFetch } from "@/lib/api";
import type { AppEvent, ContributionRow, EventPlanRow, TaskRow } from "@/lib/event-data";
import { useEventData } from "@/lib/event-data";
import { useSession } from "@/lib/auth";
import { useCountUp } from "@/lib/motion";
import { formatCurrency } from "@/lib/utils";
import staticHeroImageUrl from "./bg-image.jpeg";

/**
 * Contributor tiles. No rank numbers or medals - every contributor gets an
 * equally cheerful tile, they just happen to be laid out largest-first.
 *
 * A soft tint per position, so no two neighbouring tiles share a colour.
 */
const tileTints = [
  "bg-rose-50 border-rose-100",
  "bg-sky-50 border-sky-100",
  "bg-amber-50 border-amber-100",
  "bg-emerald-50 border-emerald-100",
  "bg-violet-50 border-violet-100",
  "bg-orange-50 border-orange-100",
  "bg-teal-50 border-teal-100",
  "bg-fuchsia-50 border-fuchsia-100",
  "bg-lime-50 border-lime-100",
];

/** Nine tiles over three columns - always exactly three tidy rows. */
const MAX_TILES = 9;

const fallbackHeroStyle = {
  background:
    "linear-gradient(135deg, hsl(var(--primary)) 0%, hsl(182 43% 18%) 52%, hsl(32 55% 42%) 100%)",
};

export function DashboardPage() {
  const { data, isFetching } = useEventData({ includeTasks: false });
  const { data: session } = useSession();
  const [now, setNow] = useState(() => new Date());
  const event = data.event;
  const eventDays = useMemo(() => getEventDays(event), [event]);
  const defaultDay = useMemo(() => getDefaultEventDay(event, now), [event, now]);
  const [selectedDay, setSelectedDay] = useState(defaultDay);
  const financials = data.financials;
  const fundsReceived = financials.contributionReceived + financials.sponsorshipReceived;
  const fundingGap = Math.max(financials.totalBudget - fundsReceived, 0);
  const phase = getEventPhase(event, now);
  const selectedDate = eventDays.find((day) => day.key === selectedDay)?.date;
  const timeline = data.eventPlan;
  const selectedItems = useMemo(
    () => sortTimelineItems(timeline.filter((item) => item.day === selectedDay || item.date === selectedDate)),
    [timeline, selectedDay, selectedDate],
  );
  const nextEvent = getNextEvent(timeline, now);

  // Tick only as fast as the screen needs: per-second for the live countdown, every
  // 30s to keep timeline statuses fresh during the event, and not at all afterwards.
  useEffect(() => {
    if (phase === "after") return;
    const intervalMs = phase === "before" ? 1000 : 30000;
    const interval = window.setInterval(() => setNow(new Date()), intervalMs);
    return () => window.clearInterval(interval);
  }, [phase]);

  useEffect(() => {
    setSelectedDay(defaultDay);
  }, [defaultDay, event.id]);

  return (
    <div className="reveal-stack mx-auto max-w-5xl space-y-4 pb-3 sm:space-y-5">
      <EventHero
        event={event}
        timeline={timeline}
        now={now}
        phase={phase}
        isLoading={isFetching}
        source={data.source}
        fallbackReason={data.fallbackReason}
      />
      <AnnouncementsCard event={event} now={now} />
      <section className="grid gap-4 lg:grid-cols-[1fr_0.85fr]">
        <FinancialSummary
          totalBudget={financials.totalBudget}
          actualExpenses={financials.actualExpenses}
          fundsReceived={fundsReceived}
          fundingGap={fundingGap}
          sponsors={data.sponsors.length}
          contributors={data.contributions.length}
        />
        <FundingProgress
          totalBudget={financials.totalBudget}
          fundsReceived={fundsReceived}
          contributionReceived={financials.contributionReceived}
          sponsorshipReceived={financials.sponsorshipReceived}
          contributions={data.contributions}
        />
      </section>
      <EventSchedule
        days={eventDays}
        selectedDay={selectedDay}
        onSelectDay={setSelectedDay}
        items={selectedItems}
        nextEvent={nextEvent}
        now={now}
        phase={phase}
      />
      <MyResponsibilities eventId={event.id} signedIn={Boolean(session?.user)} />
      <GalleryPreview />
    </div>
  );
}

function EventHero({
  event,
  timeline,
  now,
  phase,
  isLoading,
  source,
  fallbackReason,
}: {
  event: AppEvent;
  timeline: EventPlanRow[];
  now: Date;
  phase: EventPhase;
  isLoading: boolean;
  source: "supabase" | "demo";
  fallbackReason?: string;
}) {
  const heroImageUrl = event.heroImageUrl || staticHeroImageUrl;

  return (
    <section
      className="relative flex min-h-[440px] flex-col overflow-hidden rounded-lg p-4 pb-7 text-white shadow-lg sm:min-h-[420px] sm:p-6 sm:pb-9"
      style={fallbackHeroStyle}
    >
      {/*
       * The photo is its own layer so it can be sized per breakpoint: filling the
       * frame on a phone, and sitting full-height on the right on wider screens
       * where the copy only occupies the left half.
       */}
      <div
        className="absolute inset-0 bg-cover bg-center bg-no-repeat md:bg-right md:bg-[length:auto_100%]"
        style={{ backgroundImage: `url("${heroImageUrl}")` }}
        aria-hidden="true"
      />
      {/*
       * Scrims are weighted to where the copy actually sits - the top band on
       * mobile, the left edge on desktop - leaving the middle of the frame almost
       * clear so the event photo is the thing you see.
       */}
      <div
        className="absolute inset-0 md:hidden"
        style={{
          background:
            "linear-gradient(180deg, rgba(0,0,0,0.80) 0%, rgba(0,0,0,0.52) 20%, rgba(0,0,0,0.14) 38%, rgba(0,0,0,0.02) 58%, rgba(0,0,0,0.28) 100%)",
        }}
        aria-hidden="true"
      />
      <div
        className="absolute inset-0 hidden md:block"
        style={{
          background:
            "linear-gradient(90deg, rgba(0,0,0,0.86) 0%, rgba(0,0,0,0.62) 40%, rgba(0,0,0,0.16) 62%, rgba(0,0,0,0) 100%)",
        }}
        aria-hidden="true"
      />

      {/* The section is a flex column and this fills it, so the countdown is
          pinned to the bottom padding at every breakpoint without hard-coding a
          height that has to be kept in sync with the section's own padding. */}
      <div className="relative z-10 flex flex-1 flex-col justify-between gap-6 md:grid md:grid-cols-[minmax(0,0.54fr)_minmax(0,0.46fr)]">
        <div className="flex flex-1 flex-col justify-between gap-6">
          {/* Top block: status, name, where and when. Nothing sits below it until
              the countdown, so the middle of the hero stays open. */}
          <div>
            <div className="flex items-start justify-between gap-3">
              <PhaseBadge phase={phase} />
              <div className="md:hidden">
                <DataSourceBadge source={source} reason={fallbackReason} isLoading={isLoading} />
              </div>
            </div>

            <h1 className="mt-3 text-3xl font-semibold leading-[1.1] tracking-tight [text-shadow:0_2px_4px_rgba(0,0,0,0.9),0_6px_24px_rgba(0,0,0,0.85)] sm:text-4xl lg:text-5xl">
              {event.name}
            </h1>

            <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-white/90 [text-shadow:0_1px_3px_rgba(0,0,0,0.95),0_2px_12px_rgba(0,0,0,0.8)] sm:text-sm">
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5 shrink-0 text-white/75" aria-hidden="true" />
                {event.location}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <CalendarDays className="h-3.5 w-3.5 shrink-0 text-white/75" aria-hidden="true" />
                {event.dates}
              </span>
            </div>
          </div>

          <HeroCountdown event={event} timeline={timeline} now={now} phase={phase} />
        </div>

        <div className="hidden items-start justify-end md:flex">
          <DataSourceBadge source={source} reason={fallbackReason} isLoading={isLoading} />
        </div>
      </div>
    </section>
  );
}

function PhaseBadge({ phase }: { phase: EventPhase }) {
  if (phase === "during") {
    return (
      <span className="inline-flex items-center gap-2 rounded-full border border-emerald-300/30 bg-emerald-400/15 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-emerald-100 backdrop-blur-sm">
        <span className="relative flex h-2 w-2" aria-hidden="true">
          <span className="absolute inline-flex h-full w-full animate-pulse-ring rounded-full bg-emerald-300" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-300" />
        </span>
        Live now
      </span>
    );
  }

  if (phase === "after") {
    return (
      <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white/85 backdrop-blur-sm">
        <Check className="h-3.5 w-3.5" aria-hidden="true" />
        Completed
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white/85 backdrop-blur-sm">
      <Sparkles className="h-3.5 w-3.5 animate-pulse-soft" aria-hidden="true" />
      Upcoming
    </span>
  );
}

function countdownSummary(units: Array<{ label: string; value: number }>) {
  const spoken = units
    .filter((unit) => unit.label !== "Sec")
    .map((unit) => `${unit.value} ${unit.label.toLowerCase()}`)
    .join(", ");
  return `Event starts in ${spoken}`;
}

function HeroCountdown({
  event,
  timeline,
  now,
  phase,
}: {
  event: AppEvent;
  timeline: EventPlanRow[];
  now: Date;
  phase: EventPhase;
}) {
  const firstScheduleItem = sortTimelineItems(timeline).find((item) => item.startTime);
  const startMs = firstScheduleItem
    ? toEventZoneTimestamp(firstScheduleItem.date, firstScheduleItem.startTime)
    : toEventZoneTimestamp(event.startDate);
  const remainingMs = Math.max(startMs - now.getTime(), 0);
  const totalSeconds = Math.floor(remainingMs / 1000);
  const units = [
    { label: "Days", value: Math.floor(totalSeconds / 86400) },
    { label: "Hours", value: Math.floor((totalSeconds % 86400) / 3600) },
    { label: "Min", value: Math.floor((totalSeconds % 3600) / 60) },
    { label: "Sec", value: totalSeconds % 60 },
  ];
  const today = new Intl.DateTimeFormat("en-IN", {
    dateStyle: "full",
    timeZone: event.timezone,
  }).format(now);
  const nextEvent = getNextEvent(timeline, now);

  if (phase === "after") {
    return (
      <div className="rounded-xl border border-white/15 bg-black/50 p-4 backdrop-blur-sm">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-white/70">Event wrapped</p>
            <p className="mt-1 truncate text-xl font-semibold sm:text-2xl">Thank you to everyone who took part</p>
          </div>
          <Check className="h-7 w-7 shrink-0 text-emerald-300" aria-hidden="true" />
        </div>
      </div>
    );
  }

  if (phase === "during") {
    return (
      <div className="space-y-3 rounded-xl border border-white/15 bg-black/50 p-4 backdrop-blur-sm">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-white/70">Today</p>
            <p className="truncate text-sm font-medium text-white/90">{today}</p>
          </div>
        </div>
        {nextEvent ? <HeroUpcomingEvent item={nextEvent} label="Up next" /> : null}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-white/20 bg-black/45 px-4 py-3.5 shadow-[0_10px_30px_rgba(0,0,0,0.35)] backdrop-blur-md">
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/60">Starts in</p>
      <p className="sr-only">{countdownSummary(units)}</p>

      <div className="mt-2 flex items-stretch" aria-hidden="true">
        {units.map((unit, index) => (
          <div key={unit.label} className="contents">
            {index > 0 ? <span className="my-1 w-px shrink-0 bg-white/15" /> : null}
            <div className="flip-unit flex-1 px-1 text-center">
              {/* Keying on the value remounts the face, replaying the flip each tick. */}
              <span
                key={unit.value}
                className="flip-face font-countdown block text-[2rem] leading-none text-white drop-shadow-[0_2px_10px_rgba(0,0,0,0.6)] sm:text-4xl"
              >
                {String(unit.value).padStart(2, "0")}
              </span>
              <span className="mt-1.5 block text-[10px] font-semibold uppercase tracking-[0.16em] text-white/55">
                {unit.label}
              </span>
            </div>
          </div>
        ))}
      </div>

      {nextEvent ? (
        <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-white/10 pt-2.5 text-xs text-white/75 sm:text-sm">
          <span className="font-semibold uppercase tracking-wide text-white/50">First up</span>
          <span className="font-medium text-white/95">{nextEvent.activity}</span>
          <span className="tabular-nums text-white/70">{formatEventTime(nextEvent.startTime)}</span>
        </p>
      ) : null}
    </div>
  );
}

function EventSchedule({
  days,
  selectedDay,
  onSelectDay,
  items,
  nextEvent,
  now,
  phase,
}: {
  days: Array<{ key: string; label: string; date: string }>;
  selectedDay: string;
  onSelectDay: (day: string) => void;
  items: EventPlanRow[];
  nextEvent?: EventPlanRow;
  now: Date;
  phase: EventPhase;
}) {
  const currentItem = items.find((item) => getTimelineItemStatus(item, now) === "current");
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

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
              {phase === "during" ? "Today's timeline from Events." : "Day-wise timeline synced from Events."}
            </p>
          </div>
          <Clock3 className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Event days">
          {days.map((day, index) => {
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
                tabIndex={active ? 0 : -1}
                onKeyDown={(keyEvent) => onTabKeyDown(keyEvent, index)}
                className={`min-w-24 flex-1 rounded-md border px-2 py-2 text-center text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 ${
                  active ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-muted"
                }`}
                onClick={() => onSelectDay(day.key)}
              >
                <span className="block">{day.label}</span>
                <span
                  className={`mt-0.5 block text-xs ${active ? "text-primary-foreground/85" : "text-muted-foreground"}`}
                >
                  {formatEventDate(day.date)}
                </span>
              </button>
            );
          })}
        </div>

        <div id="event-day-panel" role="tabpanel" aria-label={`${selectedDay} schedule`} className="space-y-4">
          {currentItem ? (
            <UpcomingEvent item={currentItem} label="Happening now" tone="live" />
          ) : nextEvent ? (
            <UpcomingEvent item={nextEvent} label="Up next" />
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
                />
              ))}
            </div>
          ) : (
            <div className="rounded-md bg-muted p-4 text-sm text-muted-foreground">
              No activities planned for this day yet. Add them on the Events page.
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function UpcomingEvent({
  item,
  label,
  tone = "default",
}: {
  item: EventPlanRow;
  label: string;
  tone?: "default" | "live";
}) {
  const subEvents = splitSubEvents(item.subEvents);

  return (
    <div className={`rounded-md border p-3 ${tone === "live" ? "border-primary/30 bg-primary/5" : "bg-muted/60"}`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-primary">{label}</p>
      <p className="mt-1 font-semibold">{item.activity}</p>
      <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted-foreground">
        <span>{formatEventTime(item.startTime)}</span>
        {item.location ? (
          <span className="inline-flex items-center gap-1">
            <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {item.location}
          </span>
        ) : null}
      </p>
      {subEvents.length ? <SubEventList items={subEvents} className="mt-2" /> : null}
    </div>
  );
}

function HeroUpcomingEvent({ item, label }: { item: EventPlanRow; label: string }) {
  const subEvents = splitSubEvents(item.subEvents);

  return (
    <div className="rounded-md border border-white/15 bg-white/10 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-white/75">{label}</p>
      <p className="mt-1 font-semibold text-white">{item.activity}</p>
      <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm text-white/80">
        <span>{formatEventTime(item.startTime)}</span>
        {item.location ? <span>{item.location}</span> : null}
      </p>
      {subEvents.length ? <SubEventList items={subEvents} className="mt-2 text-white/85" /> : null}
    </div>
  );
}

function TimelineItem({
  item,
  status,
  isLast,
  showNowLabel,
}: {
  item: EventPlanRow;
  status: TimelineStatus;
  isLast: boolean;
  showNowLabel: boolean;
}) {
  const isCurrent = status === "current";
  const isCompleted = status === "completed";
  const subEvents = splitSubEvents(item.subEvents);

  return (
    <div className="grid grid-cols-[4.25rem_1rem_1fr] gap-3">
      <div className="pt-0.5 text-right text-sm font-medium tabular-nums text-muted-foreground">
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
      <div className={`pb-5 ${isCompleted ? "opacity-70" : ""}`}>
        {isCurrent && showNowLabel ? (
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-primary">Happening now</p>
        ) : null}
        <p className="font-medium leading-snug">{item.activity}</p>
        <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted-foreground">
          {item.endTime ? (
            <span className="tabular-nums">
              {formatEventTime(item.startTime)} - {formatEventTime(item.endTime)}
            </span>
          ) : null}
          {item.location ? <span>{item.location}</span> : null}
        </p>
        {subEvents.length ? <SubEventList items={subEvents} className="mt-2" /> : null}
        {item.notes ? <p className="mt-1 text-sm text-muted-foreground">{item.notes}</p> : null}
      </div>
    </div>
  );
}

function splitSubEvents(value: string) {
  return value
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function SubEventList({ items, className = "text-muted-foreground" }: { items: string[]; className?: string }) {
  return (
    <div className={`flex flex-wrap gap-1.5 ${className}`}>
      {items.map((item) => (
        <span key={item} className="rounded-md border border-current/10 bg-background/60 px-2 py-1 text-xs text-current">
          {item}
        </span>
      ))}
    </div>
  );
}

function FinancialSummary({
  totalBudget,
  actualExpenses,
  fundsReceived,
  fundingGap,
  sponsors,
  contributors,
}: {
  totalBudget: number;
  actualExpenses: number;
  fundsReceived: number;
  fundingGap: number;
  sponsors: number;
  contributors: number;
}) {
  const isSettledGap = fundingGap === 0;
  const cards = [
    {
      label: "Planned Budget",
      value: totalBudget,
      icon: Landmark,
      chip: "bg-primary/10 text-primary",
      edge: "before:bg-primary",
    },
    {
      label: "Funds Received",
      value: fundsReceived,
      icon: HandCoins,
      chip: "bg-emerald-100 text-emerald-700",
      edge: "before:bg-emerald-500",
    },
    {
      label: "Actual Expenses",
      value: actualExpenses,
      icon: ReceiptIndianRupee,
      chip: "bg-amber-100 text-amber-700",
      edge: "before:bg-amber-500",
    },
    {
      label: "Funding Gap",
      value: fundingGap,
      icon: isSettledGap ? Check : CircleAlert,
      chip: isSettledGap ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700",
      edge: isSettledGap ? "before:bg-emerald-500" : "before:bg-rose-500",
    },
  ];

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Landmark className="h-4 w-4" aria-hidden="true" />
          </span>
          <CardTitle>Financial Summary</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          {cards.map((card, index) => {
            const Icon = card.icon;
            return (
              <div
                key={card.label}
                className={`relative overflow-hidden rounded-lg border bg-gradient-to-br from-background to-muted/40 p-3 pl-4 transition-all hover:-translate-y-0.5 hover:shadow-md before:absolute before:inset-y-0 before:left-0 before:w-1 ${card.edge}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-xs font-medium leading-tight text-muted-foreground">{card.label}</p>
                  <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${card.chip}`}>
                    <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                  </span>
                </div>
                <AnimatedNumber
                  value={card.value}
                  format={formatCurrencyCompact}
                  duration={900 + index * 120}
                  className="mt-2 block text-xl font-semibold tracking-tight tabular-nums"
                  title={formatCurrency(card.value)}
                />
                {card.label === "Funding Gap" && isSettledGap ? (
                  <p className="mt-0.5 animate-fade-in text-xs font-medium text-emerald-700">Fully funded</p>
                ) : null}
              </div>
            );
          })}
        </div>
        <div className="grid grid-cols-2 divide-x rounded-lg border bg-muted/50 text-sm">
          <div className="flex items-center gap-2.5 p-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-background text-primary">
              <HeartHandshake className="h-4 w-4" aria-hidden="true" />
            </span>
            <div>
              <p className="text-xs text-muted-foreground">Sponsors</p>
              <AnimatedNumber
                value={sponsors}
                format={(count) => String(count)}
                duration={800}
                className="block text-lg font-semibold leading-tight tabular-nums"
              />
            </div>
          </div>
          <div className="flex items-center gap-2.5 p-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-background text-primary">
              <Users className="h-4 w-4" aria-hidden="true" />
            </span>
            <div>
              <p className="text-xs text-muted-foreground">Contributors</p>
              <AnimatedNumber
                value={contributors}
                format={(count) => String(count)}
                duration={800}
                className="block text-lg font-semibold leading-tight tabular-nums"
              />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function FundingProgress({
  totalBudget,
  fundsReceived,
  contributionReceived,
  sponsorshipReceived,
  contributions,
}: {
  totalBudget: number;
  fundsReceived: number;
  contributionReceived: number;
  sponsorshipReceived: number;
  contributions: ContributionRow[];
}) {
  const progress = calculateFundingProgress(fundsReceived, totalBudget);
  const rounded = Math.round(progress);
  // The bar and the percentage share one animation so they always agree.
  const animatedProgress = useCountUp(progress, { duration: 1400 });
  const aboveExpected = contributions.filter((row) => row.received > row.expected).length;
  // Every contributor, largest first. If they do not all fit the mosaic, the
  // final tile becomes a "+N more" tile instead of a ninth contributor.
  const contributors = useMemo(
    () => contributions.filter((row) => row.received > 0).sort((left, right) => right.received - left.received),
    [contributions],
  );
  const overflowCount = Math.max(contributors.length - (MAX_TILES - 1), 0);
  const visibleContributors = overflowCount ? contributors.slice(0, MAX_TILES - 1) : contributors.slice(0, MAX_TILES);

  // Each source drawn as its own slice of the budget, so the split is readable
  // at a glance instead of only as two numbers underneath a single bar.
  const sponsorshipShare = totalBudget > 0 ? Math.min(100, (sponsorshipReceived / totalBudget) * 100) : 0;
  const contributionShare = totalBudget > 0 ? Math.min(100 - sponsorshipShare, (contributionReceived / totalBudget) * 100) : 0;
  const scale = progress > 0 ? animatedProgress / progress : 0;

  return (
    <Card className="overflow-hidden">
      <CardHeader className="border-b bg-gradient-to-br from-accent/40 to-transparent pb-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <HeartHandshake className="h-4 w-4 animate-float" aria-hidden="true" />
            </span>
            <CardTitle>Funding Progress</CardTitle>
          </div>
          <div className="text-right">
            <p className="text-3xl font-semibold leading-none tracking-tight tabular-nums" aria-label={`${rounded}% funded`}>
              <span aria-hidden="true">{Math.round(animatedProgress)}%</span>
            </p>
            <p className="mt-1 text-xs text-muted-foreground">funded</p>
          </div>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{formatCurrency(fundsReceived)}</span> of{" "}
          {formatCurrency(totalBudget)} raised
        </p>
      </CardHeader>

      <CardContent className="pt-4">
        <div
          role="progressbar"
          aria-label="Funding progress"
          aria-valuenow={rounded}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuetext={`${rounded}% funded — ${formatCurrency(sponsorshipReceived)} sponsorship, ${formatCurrency(contributionReceived)} contribution`}
          className="relative flex h-3.5 overflow-hidden rounded-full bg-muted"
        >
          <div
            className="relative h-full overflow-hidden bg-primary transition-none"
            style={{ width: `${sponsorshipShare * scale}%` }}
          >
            <span
              aria-hidden="true"
              className="absolute inset-y-0 -left-1/3 w-1/3 animate-sheen bg-gradient-to-r from-transparent via-white/40 to-transparent"
            />
          </div>
          <div className="h-full bg-amber-400" style={{ width: `${contributionShare * scale}%` }} />
        </div>

        <div className="mt-4 space-y-2.5 text-sm">
          <div className="flex items-center justify-between gap-3">
            <span className="inline-flex items-center gap-2 text-muted-foreground">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-primary" aria-hidden="true" />
              Sponsorship
            </span>
            <AnimatedNumber value={sponsorshipReceived} format={formatCurrency} className="font-semibold tabular-nums" />
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="inline-flex items-center gap-2 text-muted-foreground">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-amber-400" aria-hidden="true" />
              Contribution
            </span>
            <AnimatedNumber value={contributionReceived} format={formatCurrency} className="font-semibold tabular-nums" />
          </div>
          {aboveExpected ? (
            <p className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-xs font-medium text-emerald-800">
              <TrendingUp className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>
                {aboveExpected} resident{aboveExpected > 1 ? "s" : ""} contributed more than expected.
              </span>
            </p>
          ) : null}
        </div>

        {visibleContributors.length ? (
          <div className="mt-4 border-t pt-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Contributors</p>
            <div className="mt-2 grid grid-cols-3 gap-1.5">
              {visibleContributors.map((row, index) => {
                const who = row.flat && row.flat !== "-" ? `${row.flat} · ${row.name}` : row.name;
                return (
                  <div
                    key={row.id ?? `${row.flat}-${index}`}
                    title={`${formatCurrency(row.received)} from ${who}`}
                    className={`animate-fade-up rounded-lg border px-2 py-1.5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md ${tileTints[index % tileTints.length]}`}
                    style={{ animationDelay: `${index * 45}ms` }}
                  >
                    <p className="text-[13px] font-semibold leading-tight tabular-nums text-foreground">
                      {formatCurrency(row.received)}
                    </p>
                    <p className="truncate text-[11px] leading-tight text-foreground/60">{who}</p>
                  </div>
                );
              })}

              {overflowCount ? (
                <div
                  className="flex animate-fade-up flex-col justify-center rounded-lg border border-dashed bg-muted/50 px-2 py-1.5 shadow-sm"
                  style={{ animationDelay: `${visibleContributors.length * 45}ms` }}
                >
                  <p className="text-[13px] font-semibold leading-tight tabular-nums">+{overflowCount}</p>
                  <p className="truncate text-[11px] leading-tight text-muted-foreground">more</p>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function MyResponsibilities({ eventId, signedIn }: { eventId?: string; signedIn: boolean }) {
  const { data } = useQuery({
    queryKey: ["my-responsibilities", eventId],
    enabled: signedIn && Boolean(eventId),
    queryFn: async () => apiFetch<{ responsibilities: TaskRow[] }>(`/api/my-responsibilities?eventId=${eventId}`),
    retry: false,
  });
  const responsibilities = data?.responsibilities ?? [];

  if (!signedIn || !responsibilities.length) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle>My Responsibilities</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {responsibilities.slice(0, 4).map((item) => (
          <div key={item.id ?? item.task} className="rounded-md border bg-background p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-primary">
              {item.due !== "-" ? formatEventDate(item.due) : "Date TBC"}
            </p>
            <p className="mt-1 font-medium">{item.task}</p>
            <p className="mt-1 text-sm text-muted-foreground">{item.status}</p>
          </div>
        ))}
        {responsibilities.length > 4 ? (
          <p className="text-sm text-muted-foreground">+{responsibilities.length - 4} more on the Tasks page.</p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function GalleryPreview() {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle>Gallery</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-3 rounded-md bg-muted p-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-background">
            <Image className="h-5 w-5 text-primary" aria-hidden="true" />
          </div>
          <div>
            <p className="text-sm font-medium">No event images yet.</p>
            <p className="text-sm text-muted-foreground">Photos will appear here once added.</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
