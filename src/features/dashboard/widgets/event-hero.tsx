import staticHeroImageUrl from "../bg-image.jpeg";
import type { AppEvent, EventPlanRow } from "@/lib/event-data";
import type { ClosingPayload } from "@/lib/closing";
import type { EventPhase } from "@/features/dashboard/dashboard-utils";
import { CalendarDays, Check, MapPin, Sparkles } from "lucide-react";
import { DataSourceBadge } from "@/components/shared/data-source-badge";
import { StarRating } from "@/features/closing/star-rating";
import { formatEventTime, getNextEvent, sortTimelineItems, toEventZoneTimestamp } from "@/features/dashboard/dashboard-utils";
import { formatRating } from "@/lib/closing";
import { parseAgenda } from "@/lib/agenda";

const fallbackHeroStyle = {
  background:
    "linear-gradient(135deg, hsl(var(--primary)) 0%, hsl(182 43% 18%) 52%, hsl(32 55% 42%) 100%)",
};

export function EventHero({
  event,
  timeline,
  now,
  phase,
  isLoading,
  isClosed,
  feedback,
  source,
  fallbackReason,
}: {
  event: AppEvent;
  timeline: EventPlanRow[];
  now: Date;
  phase: EventPhase;
  isLoading: boolean;
  isClosed: boolean;
  feedback?: ClosingPayload["feedback"];
  source: "supabase" | "demo";
  fallbackReason?: string;
}) {
  const heroImageUrl = event.heroImageUrl || staticHeroImageUrl;
  // Marking the celebration closed wraps the hero too, whatever the calendar
  // says - a countdown to an event the committee has already thanked
  // everyone for would read as a bug.
  const displayPhase: EventPhase = isClosed ? "after" : phase;

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
              <PhaseBadge phase={displayPhase} />
              <div className="md:hidden">
                <DataSourceBadge source={source} reason={fallbackReason} isLoading={isLoading} />
              </div>
            </div>

            <h1 className="mt-3 text-3xl font-semibold leading-[1.1] tracking-tight [text-shadow:0_2px_4px_rgba(0,0,0,0.9),0_6px_24px_rgba(0,0,0,0.85)] sm:text-4xl lg:text-5xl">
              {event.name}
            </h1>

            {/* How it was rated, right under the name, once it is over. On a
                frosted plate rather than a text shadow: a number this small
                has to clear the photo behind it, and dimming the whole scrim
                to buy that would cost the image (see the UI rules, §2). */}
            {isClosed && feedback?.count ? (
              <div className="mt-2.5 inline-flex items-center gap-2 rounded-full bg-black/40 px-3 py-1 backdrop-blur">
                <StarRating
                  value={feedback.average}
                  size="sm"
                  label={`Rated ${feedback.average.toFixed(1)} out of 5 from ${feedback.count} reviews`}
                />
                <span className="text-sm font-semibold tabular-nums">{formatRating(feedback.average)}</span>
                <span className="text-xs text-white/80">
                  {feedback.count} {feedback.count === 1 ? "review" : "reviews"}
                </span>
              </div>
            ) : null}

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

          <HeroCountdown event={event} timeline={timeline} now={now} phase={displayPhase} />
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
    <div className="rounded-xl border border-white/20 bg-black/45 px-3.5 py-2.5 shadow-[0_10px_30px_rgba(0,0,0,0.35)] backdrop-blur-md">
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/60">Starts in</p>
      <p className="sr-only">{countdownSummary(units)}</p>

      <div className="mt-1.5 flex items-stretch" aria-hidden="true">
        {units.map((unit, index) => (
          <div key={unit.label} className="contents">
            {index > 0 ? <span className="my-0.5 w-px shrink-0 bg-white/15" /> : null}
            <div className="flip-unit flex-1 px-1 text-center">
              {/* Keying on the value remounts the face, replaying the flip each tick. */}
              <span
                key={unit.value}
                className="flip-face font-countdown block text-[26px] leading-none text-white drop-shadow-[0_2px_10px_rgba(0,0,0,0.6)] sm:text-[32px]"
              >
                {String(unit.value).padStart(2, "0")}
              </span>
              <span className="mt-1 block text-[10px] font-semibold uppercase tracking-[0.16em] text-white/55">
                {unit.label}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function HeroUpcomingEvent({ item, label }: { item: EventPlanRow; label: string }) {
  const agenda = parseAgenda(item.subEvents);

  return (
    <div className="rounded-md border border-white/15 bg-white/10 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-white/75">{label}</p>
      <p className="mt-1 font-semibold text-white">{item.activity}</p>
      <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm text-white/80">
        <span className="tabular-nums">{formatEventTime(item.startTime)}</span>
        {item.location ? <span>{item.location}</span> : null}
      </p>
      {agenda.length ? (
        <p className="mt-2 truncate text-sm text-white/85">
          {agenda.slice(0, 3).join(" · ")}
        </p>
      ) : null}
    </div>
  );
}
