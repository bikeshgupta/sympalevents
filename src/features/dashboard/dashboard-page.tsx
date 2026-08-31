import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  CalendarDays,
  Check,
  Clock3,
  HandCoins,
  HeartHandshake,
  Image,
  Landmark,
  MapPin,
  ReceiptIndianRupee,
  Timer,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { DataSourceBadge } from "@/components/shared/data-source-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  type TimelineStatus,
} from "@/features/dashboard/dashboard-utils";
import { apiFetch } from "@/lib/api";
import type { AppEvent, EventPlanRow, TaskRow } from "@/lib/event-data";
import { useEventData } from "@/lib/event-data";
import { useSession } from "@/lib/auth";
import { formatCurrency } from "@/lib/utils";
import staticHeroImageUrl from "./bg-image.jpeg";

const fallbackHeroStyle = {
  background:
    "linear-gradient(135deg, hsl(var(--primary)) 0%, hsl(182 43% 18%) 52%, hsl(32 55% 42%) 100%)",
};
export function DashboardPage() {
  const { data, isLoading } = useEventData({ includeTasks: false });
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
  const selectedItems = sortTimelineItems(
    data.eventPlan.filter((item) => item.day === selectedDay || item.date === selectedDate),
  );
  const nextEvent = getNextEvent(data.eventPlan, now);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    setSelectedDay(defaultDay);
  }, [defaultDay, event.id]);

  return (
    <div className="mx-auto max-w-5xl space-y-4 pb-3 sm:space-y-5">
      <EventHero
        event={event}
        timeline={data.eventPlan}
        now={now}
        phase={phase}
        isLoading={isLoading}
        source={data.source}
        fallbackReason={data.fallbackReason}
      />
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
      {phase === "during" ? (
        <MyResponsibilities eventId={event.id} signedIn={Boolean(session?.user)} />
      ) : null}
      {phase !== "during" ? (
        <MyResponsibilities eventId={event.id} signedIn={Boolean(session?.user)} />
      ) : null}
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
  phase: "before" | "during" | "after";
  isLoading: boolean;
  source: "supabase" | "demo";
  fallbackReason?: string;
}) {
  const heroImageUrl = event.heroImageUrl || staticHeroImageUrl;

  return (
    <section
      className="relative min-h-[320px] overflow-hidden rounded-lg bg-card p-5 text-white shadow-lg sm:min-h-[360px] sm:p-6"
      style={{
        ...fallbackHeroStyle,
        backgroundImage: `linear-gradient(90deg, rgba(0,0,0,0.88) 0%, rgba(0,0,0,0.72) 42%, rgba(0,0,0,0.24) 62%, rgba(0,0,0,0.04) 100%), url("${heroImageUrl}")`,
        backgroundPosition: "left center, right center",
        backgroundRepeat: "no-repeat",
        backgroundSize: "cover, auto 100%",
      }}
    >
      <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/45 to-transparent" />
      <div className="relative z-10 grid min-h-[280px] gap-6 sm:min-h-[312px] md:grid-cols-[minmax(0,0.48fr)_minmax(0,0.52fr)]">
        <div className="flex flex-col justify-between gap-6">
          <div className="flex justify-end md:hidden">
            <DataSourceBadge source={isLoading ? undefined : source} reason={fallbackReason} />
          </div>
          <div>
            <p className="text-sm font-semibold  tracking-wide text-white/80 drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)]">{event.location}</p>
            <h1 className="mt-2 text-3xl font-semibold leading-tight drop-shadow-[0_3px_12px_rgba(0,0,0,0.95)] sm:text-4xl">{event.name}</h1>
            <p className="mt-3 flex items-center gap-2 text-sm text-white/90 drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)]">
              <CalendarDays className="h-4 w-4" />
              {event.dates}
            </p>
          </div>
          <HeroCountdown event={event} timeline={timeline} now={now} phase={phase} />
        </div>
        <div className="hidden items-start justify-end md:flex">
          <DataSourceBadge source={isLoading ? undefined : source} reason={fallbackReason} />
        </div>
      </div>
    </section>
  );
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
  phase: "before" | "during" | "after";
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
      <div className="rounded-lg border border-white/15 bg-black/55 p-4 shadow-[inset_0_1px_20px_rgba(255,255,255,0.08)]">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-white/75">Completed</p>
            <p className="mt-1 text-2xl font-semibold">{event.name}</p>
          </div>
          <Check className="h-7 w-7 text-white" />
        </div>
      </div>
    );
  }

  if (phase === "during") {
    return (
      <div className="space-y-3 rounded-lg border border-white/15 bg-black/55 p-4 shadow-[inset_0_1px_20px_rgba(255,255,255,0.08)]">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-white/75">Event Live</p>
            <p className="text-sm text-white/80">{today}</p>
          </div>
          <span className="rounded-full bg-white px-3 py-1 text-sm font-medium text-primary">Now</span>
        </div>
        {nextEvent ? <HeroUpcomingEvent item={nextEvent} label="Up next" /> : null}
      </div>
    );
  }

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-white/75">Starts in</p>
      <div className="mt-2 rounded-lg bg-black/72 px-3 py-3 shadow-[inset_0_1px_22px_rgba(255,255,255,0.08),0_8px_24px_rgba(0,0,0,0.32)]" aria-label="Countdown to event start">
        <div className="flex items-baseline justify-between gap-1 text-[#b8ffe4] drop-shadow-[0_0_8px_rgba(184,255,228,0.42)]">
          {units.map((unit, index) => (
            <div key={unit.label} className="contents">
              <span className="font-digital text-4xl leading-none text-[#c8ffef] sm:text-5xl">
                {String(unit.value).padStart(2, "0")}
              </span>
              {index < units.length - 1 ? <span className="font-digital text-3xl leading-none text-[#c8ffef]/70 sm:text-4xl">:</span> : null}
            </div>
          ))}
        </div>
        <div className="mt-2 grid grid-cols-4 text-center text-[10px] font-semibold uppercase text-white/60">
          {units.map((unit) => (
            <span key={unit.label}>{unit.label}</span>
          ))}
        </div>
      </div>
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
  phase: "before" | "during" | "after";
}) {
  const currentItem = items.find((item) => getTimelineItemStatus(item, now) === "current");

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
          <Clock3 className="h-5 w-5 text-primary" />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 gap-2" role="tablist" aria-label="Event days">
          {days.map((day) => {
            const active = selectedDay === day.key;
            return (
              <button
                key={day.key}
                type="button"
                role="tab"
                aria-selected={active}
                className={`rounded-md border px-2 py-2 text-center text-sm font-medium transition ${
                  active ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-muted"
                }`}
                onClick={() => onSelectDay(day.key)}
              >
                <span className="block">{day.label}</span>
                <span className={`mt-0.5 block text-[11px] ${active ? "text-primary-foreground/85" : "text-muted-foreground"}`}>
                  {formatEventDate(day.date)}
                </span>
              </button>
            );
          })}
        </div>

        {currentItem ? <UpcomingEvent item={currentItem} label="Happening now" tone="live" /> : nextEvent ? <UpcomingEvent item={nextEvent} label="Up next" /> : null}

        {items.length ? (
          <div className="space-y-0">
            {items.map((item, index) => (
              <TimelineItem key={item.id ?? `${item.date}-${item.activity}-${index}`} item={item} status={getTimelineItemStatus(item, now)} isLast={index === items.length - 1} />
            ))}
          </div>
        ) : (
          <div className="rounded-md bg-muted p-4 text-sm text-muted-foreground">No activities planned for this day yet.</div>
        )}
      </CardContent>
    </Card>
  );
}

function UpcomingEvent({ item, label, tone = "default" }: { item: EventPlanRow; label: string; tone?: "default" | "live" }) {
  const subEvents = splitSubEvents(item.subEvents);

  return (
    <div className={`rounded-md border p-3 ${tone === "live" ? "border-primary/30 bg-primary/5" : "bg-muted/60"}`}>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-primary">{label}</p>
      <p className="mt-1 font-semibold">{item.activity}</p>
      <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted-foreground">
        <span>{formatEventTime(item.startTime)}</span>
        {item.location ? <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{item.location}</span> : null}
      </p>
      {subEvents.length ? <SubEventList items={subEvents} className="mt-2" /> : null}
    </div>
  );
}

function HeroUpcomingEvent({ item, label }: { item: EventPlanRow; label: string }) {
  const subEvents = splitSubEvents(item.subEvents);

  return (
    <div className="rounded-md border border-white/15 bg-white/10 p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-white/70">{label}</p>
      <p className="mt-1 font-semibold text-white">{item.activity}</p>
      <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm text-white/75">
        <span>{formatEventTime(item.startTime)}</span>
        {item.location ? <span>{item.location}</span> : null}
      </p>
      {subEvents.length ? <SubEventList items={subEvents} className="mt-2 text-white/80" /> : null}
    </div>
  );
}

function TimelineItem({ item, status, isLast }: { item: EventPlanRow; status: TimelineStatus; isLast: boolean }) {
  const isCurrent = status === "current";
  const isCompleted = status === "completed";
  const subEvents = splitSubEvents(item.subEvents);

  return (
    <div className="grid grid-cols-[4.25rem_1rem_1fr] gap-3">
      <div className="pt-0.5 text-right text-sm font-medium tabular-nums text-muted-foreground">{formatEventTime(item.startTime)}</div>
      <div className="relative flex justify-center">
        <span className={`mt-1 flex h-4 w-4 items-center justify-center rounded-full border ${isCurrent ? "border-primary bg-primary" : isCompleted ? "border-primary bg-primary/15" : "border-border bg-card"}`}>
          {isCompleted ? <Check className="h-3 w-3 text-primary" /> : null}
        </span>
        {!isLast ? <span className="absolute top-5 h-[calc(100%-0.25rem)] w-px bg-border" /> : null}
      </div>
      <div className="pb-5">
        {isCurrent ? <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-primary">Happening now</p> : null}
        <p className="font-medium leading-snug">{item.activity}</p>
        <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted-foreground">
          {item.endTime ? <span>{formatEventTime(item.startTime)} - {formatEventTime(item.endTime)}</span> : null}
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
  const cards = [
    { label: "Planned Budget", value: totalBudget, icon: Landmark },
    { label: "Funds Received", value: fundsReceived, icon: HandCoins },
    { label: "Actual Expenses", value: actualExpenses, icon: ReceiptIndianRupee },
    { label: "Funding Gap", value: fundingGap, icon: Timer },
  ];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle>Financial Summary</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          {cards.map((card) => {
            const Icon = card.icon;
            return (
              <div key={card.label} className="rounded-md border bg-background p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-medium text-muted-foreground">{card.label}</p>
                  <Icon className="h-4 w-4 text-primary" />
                </div>
                <p className="mt-2 text-xl font-semibold tabular-nums">{formatCurrencyCompact(card.value)}</p>
              </div>
            );
          })}
        </div>
        <div className="grid grid-cols-2 gap-3 rounded-md bg-muted p-3 text-sm">
          <div>
            <p className="text-muted-foreground">Sponsors</p>
            <p className="text-lg font-semibold">{sponsors}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Contributors</p>
            <p className="text-lg font-semibold">{contributors}</p>
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
}: {
  totalBudget: number;
  fundsReceived: number;
  contributionReceived: number;
  sponsorshipReceived: number;
}) {
  const progress = calculateFundingProgress(fundsReceived, totalBudget);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle>Funding Progress</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-sm text-muted-foreground">{formatCurrency(fundsReceived)} of {formatCurrency(totalBudget)} funded</p>
            <p className="mt-1 text-2xl font-semibold">{Math.round(progress)}%</p>
          </div>
          <HeartHandshake className="h-6 w-6 text-primary" />
        </div>
        <div className="mt-4 h-3 overflow-hidden rounded-full bg-muted" aria-hidden="true">
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progress}%` }} />
        </div>
        <div className="mt-4 space-y-2 text-sm">
          <div className="flex justify-between gap-3">
            <span className="text-muted-foreground">Contribution</span>
            <span className="font-medium">{formatCurrency(contributionReceived)}</span>
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-muted-foreground">Sponsorship</span>
            <span className="font-medium">{formatCurrency(sponsorshipReceived)}</span>
          </div>
        </div>
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
            <p className="text-xs font-medium uppercase tracking-wide text-primary">{item.due !== "-" ? formatEventDate(item.due) : "Date TBC"}</p>
            <p className="mt-1 font-medium">{item.task}</p>
            <p className="mt-1 text-sm text-muted-foreground">{item.status}</p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function GalleryPreview() {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between pb-3">
        <CardTitle>Gallery</CardTitle>
        <Button asChild variant="ghost" size="sm">
          <Link to="/settings" aria-label="View gallery settings">
            View All
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-3 rounded-md bg-muted p-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-background">
            <Image className="h-5 w-5 text-primary" />
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
