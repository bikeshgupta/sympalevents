import { ChevronRight } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { statusLabels } from "../../../../shared/event-status";
import { QueryState, Skeleton, UnavailableState } from "../data-states";
import { formatCount, formatInstantDate, formatInstantTime } from "../format";
import { PageHeader, SectionHeading } from "../page-header";
import { useOverview, type EventStatus, type OverviewData } from "../platform-api";
import { chartPoints, counted, eventStatusOrder, formatDay, istDayKey, sumOf, useSectionLink } from "../platform-helpers";
import type { PlatformSection } from "../platform-sections";
import { sectionPath } from "../platform-sections";
import { Change, Choices, Figure, FigureRow } from "../platform-ui";
import { TrendChart } from "../trend-chart";
import { usePlatformRange } from "../use-platform-range";

/**
 * Overview - the state of the platform in one screen. A sentence that says what changed, four figures that each
 * open their list, the activity behind them against the period before, where events stand, and who is busiest.
 * Every number is read from the database for the selected IST window; anything not recorded says so.
 */
export function OverviewSection({ section }: { section: PlatformSection }) {
  const { preset } = usePlatformRange();
  const overview = useOverview(preset);
  return (
    <div>
      <PageHeader title={section.label} summary={section.summary} rangeAware observedAt={overview.data?.observedAt ?? null} />
      <div className="mt-8">
        <QueryState query={overview} skeleton={<OverviewSkeleton />} errorMessage="The overview could not be loaded.">
          {(data) => <OverviewBody data={data} />}
        </QueryState>
      </div>
    </div>
  );
}

type Measure = "active" | "signups" | "visits";

function OverviewBody({ data }: { data: OverviewData }) {
  const link = useSectionLink();
  const { metrics, series, coverage, window } = data;
  const days = window.days;
  const span = days === 365 ? "12 months" : `${days} days`;
  const [measure, setMeasure] = useState<Measure>(series.activePeople ? "active" : "signups");
  const visitsFrom = istDayKey(coverage.visitsSince);

  const chosen =
    measure === "active" && series.activePeople
      ? { name: "Active people per day", values: series.activePeople, mode: "average" as const, trackedFrom: visitsFrom }
      : measure === "visits" && series.visits
        ? { name: "Visits to event pages", values: series.visits, mode: "sum" as const, trackedFrom: visitsFrom }
        : { name: "People joining", values: series.signups, mode: "sum" as const, trackedFrom: null };

  const live = metrics.events.status.live;
  const joined = metrics.users.joined;

  return (
    <div className="space-y-14">
      {/* The headline: what changed, in words, with the figures it rests on. */}
      <p className="max-w-3xl font-display text-2xl leading-snug sm:text-3xl">
        {joined.current > 0 ? (
          <>
            <Strong>{formatCount(joined.current)}</Strong> {joined.current === 1 ? "person" : "people"} joined Sympal in the last {span}
            {joined.change !== null ? (
              <>
                , <Strong>{Math.abs(Math.round(joined.change * 100))}% {joined.change >= 0 ? "more" : "fewer"}</Strong> than the {span} before.
              </>
            ) : (
              "."
            )}
          </>
        ) : (
          <>Nobody new joined Sympal in the last {span}.</>
        )}{" "}
        <Strong>{formatCount(metrics.societies.active.current)}</Strong> of {formatCount(metrics.societies.total)} societies were active
        {live ? (
          <>
            , and <Strong>{formatCount(live)}</Strong> {live === 1 ? "event is" : "events are"} on right now.
          </>
        ) : (
          ", and no event is on right now."
        )}
      </p>

      <FigureRow>
        <Figure
          label="Registered users"
          value={formatCount(metrics.users.total)}
          detail={
            <>
              +{formatCount(joined.current)} joined · <Change value={joined} days={days} />
            </>
          }
          to={link(sectionPath("users"), { joined: "period" })}
        />
        <Figure
          label="Active societies"
          value={formatCount(metrics.societies.active.current)}
          detail={
            <>
              of {formatCount(metrics.societies.total)} · <Change value={metrics.societies.active} days={days} />
            </>
          }
          to={link(sectionPath("societies"), { label: "active" })}
        />
        <Figure
          label="Events"
          value={formatCount(metrics.events.total)}
          detail={
            <>
              +{formatCount(metrics.events.created.current)} created · <Change value={metrics.events.created} days={days} />
            </>
          }
          to={link(sectionPath("events"))}
        />
        {metrics.activePeople ? (
          <Figure
            label="Active people"
            value={formatCount(metrics.activePeople.current)}
            detail={
              <>
                Signed in on event pages · <Change value={metrics.activePeople} days={days} />
              </>
            }
            to={link(sectionPath("users"), { joined: "active" })}
          />
        ) : (
          <Figure label="Active people" value="—" detail="Visits are not recorded in this database" />
        )}
      </FigureRow>

      <section aria-labelledby="activity-heading">
        <div id="activity-heading">
          <SectionHeading title="Platform activity" aside={<span className="text-xs text-muted-foreground">Against the {span} before</span>} />
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <Choices
            label="Measure"
            value={measure}
            onChange={setMeasure}
            options={[
              ...(series.activePeople ? [{ value: "active" as const, label: "Active people" }] : []),
              { value: "signups" as const, label: "People joining" },
              ...(series.visits ? [{ value: "visits" as const, label: "Visits" }] : []),
            ]}
          />
          <p className="text-sm text-muted-foreground tabular-nums">
            {measure === "active" ? "Daily average " : "Total "}
            <span className="font-semibold text-foreground">
              {measure === "active" ? formatCount(Math.round((sumOf(chosen.values.current) / Math.max(chosen.values.current.length, 1)) * 10) / 10) : formatCount(sumOf(chosen.values.current))}
            </span>
          </p>
        </div>
        <div className="mt-4">
          <TrendChart points={chartPoints(data.days, chosen.values.current, chosen.values.previous, { mode: chosen.mode, trackedFrom: chosen.trackedFrom })} name={chosen.name} />
        </div>
        {measure !== "signups" && coverage.visitsSince ? (
          <p className="mt-2 text-xs text-muted-foreground">
            Visits are recorded for event pages only, from {formatInstantDate(coverage.visitsSince)}.{coverage.visitsPartial ? " This period has more visits than are read at once, so these figures are partial." : ""}
          </p>
        ) : null}
      </section>

      <div className="grid gap-14 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <section aria-labelledby="lifecycle-heading">
          <div id="lifecycle-heading">
            <SectionHeading title="Where events stand now" aside={<Link to={link(sectionPath("events"))} className="text-xs font-medium text-primary">All events</Link>} />
          </div>
          <Lifecycle status={metrics.events.status} total={metrics.events.total} />
        </section>

        <section aria-labelledby="created-heading">
          <div id="created-heading">
            <SectionHeading title="Events created" aside={<span className="text-xs text-muted-foreground tabular-nums">{formatCount(metrics.events.created.current)} vs {formatCount(metrics.events.created.previous)} before</span>} />
          </div>
          <div className="mt-4">
            <TrendChart kind="bar" height={180} points={chartPoints(data.days, series.eventsCreated.current, series.eventsCreated.previous)} name="Created" />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {series.eventsPublished
              ? `${formatCount(sumOf(series.eventsPublished.current))} published in this period, from the audit log.`
              : "When each event was published is not recorded yet. It needs the audit log (database update 030)."}
          </p>
        </section>
      </div>

      <div className="grid gap-14 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <section aria-labelledby="busiest-heading">
          <div id="busiest-heading">
            <SectionHeading title="Most active societies" aside={<span className="text-xs text-muted-foreground">By visits to their event pages</span>} />
          </div>
          {data.societies.length ? (
            <ol className="divide-y divide-border/70">
              {data.societies.map((society, index) => (
                <li key={society.id}>
                  <Link
                    to={link(sectionPath("societies"), { society: society.id })}
                    className="grid grid-cols-[1.5rem_minmax(0,1fr)_auto] items-center gap-3 py-3 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span className="text-right font-semibold tabular-nums text-muted-foreground">{index + 1}</span>
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{society.name}</span>
                      <span className="block text-xs text-muted-foreground tabular-nums">
                        {counted(society.signedInVisitors, "signed-in person", "signed-in people")} · {counted(society.eventsOn, "event on", "events on")} · {formatCount(society.joined)} joined
                      </span>
                    </span>
                    <span className="text-right">
                      <span className="block font-semibold tabular-nums">{formatCount(society.visits)}</span>
                      <span className="block text-xs text-muted-foreground">{society.visits === 1 ? "visit" : "visits"}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
          ) : (
            <p className="py-6 text-sm text-muted-foreground">No society met the activity rule in this period.</p>
          )}
        </section>

        <div className="space-y-12">
          <section aria-labelledby="attention-heading">
            <div id="attention-heading">
              <SectionHeading title="Needs your attention" />
            </div>
            <Attention data={data} />
          </section>

          <section aria-labelledby="recent-heading">
            <div id="recent-heading">
              <SectionHeading title="Recent actions" />
            </div>
            {data.recent ? (
              data.recent.length ? (
                <ul className="divide-y divide-border/70">
                  {data.recent.map((item) => (
                    <li key={item.id} className="py-2.5 text-sm">
                      <p className="font-medium">{item.summary ?? `${item.action} ${item.entityType}`}</p>
                      <p className="text-xs text-muted-foreground">
                        {item.actorName || item.actorEmail || "Not recorded"}
                        {item.society ? ` · ${item.society}` : ""} · {formatInstantDate(item.at)}, {formatInstantTime(item.at)}
                      </p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="py-6 text-sm text-muted-foreground">The audit log has no actions yet.</p>
              )
            ) : (
              <UnavailableState className="mt-4" title="Not recorded yet" reason="Who changed what appears here once the audit log exists (database update 030)." />
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function Strong({ children }: { children: ReactNode }) {
  return <span className="text-primary">{children}</span>;
}

/** Every event by its status right now: a stage per status, each opening its list. */
function Lifecycle({ status, total }: { status: Record<EventStatus, number>; total: number }) {
  const link = useSectionLink();
  return (
    <ul className="mt-4 space-y-1">
      {eventStatusOrder.map((key) => (
        <li key={key}>
          <Link
            to={link(sectionPath("events"), { status: key })}
            className="grid grid-cols-[7rem_minmax(0,1fr)_3rem] items-center gap-3 rounded-md py-2 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className={cn("text-sm", key === "cancelled" && "text-destructive")}>{statusLabels[key]}</span>
            <span className="h-2.5 rounded-r-full bg-muted/70">
              <span
                className={cn("block h-full rounded-r-full", key === "live" ? "bg-primary" : key === "upcoming" ? "bg-chart-budget" : key === "cancelled" ? "bg-destructive/70" : "bg-muted-foreground/45")}
                style={{ width: `${total ? (status[key] / total) * 100 : 0}%`, minWidth: status[key] ? 4 : 0 }}
              />
            </span>
            <span className="text-right font-semibold tabular-nums">{formatCount(status[key])}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function Attention({ data }: { data: OverviewData }) {
  const link = useSectionLink();
  const items: { key: string; text: string; detail: string; to?: ReturnType<ReturnType<typeof useSectionLink>> }[] = [];
  for (const event of data.attention.draftsSoon) {
    items.push({ key: `draft-${event.id}`, text: `${event.name} is still a draft`, detail: `${event.society} · starts ${formatDay(event.startDate) ?? event.startDate}`, to: link(sectionPath("events"), { event: event.id }) });
  }
  if (data.attention.dormant.length) {
    items.push({
      key: "dormant",
      text: `${data.attention.dormant.length} ${data.attention.dormant.length === 1 ? "society has" : "societies have"} gone dormant`,
      detail: data.attention.dormant.slice(0, 3).map((society) => society.name).join(", ") + (data.attention.dormant.length > 3 ? " and more" : ""),
      to: link(sectionPath("societies"), { label: "dormant" }),
    });
  }
  if (data.attention.empty) {
    items.push({ key: "empty", text: `${data.attention.empty} ${data.attention.empty === 1 ? "society is" : "societies are"} still empty`, detail: "No events, and no members besides the creator", to: link(sectionPath("societies"), { label: "empty" }) });
  }
  if (data.coverage.visitsPartial || data.coverage.eventsPartial) {
    items.push({ key: "partial", text: "Some figures are partial", detail: "This period holds more rows than are read at once. The figures need a database view to be exact." });
  }

  if (!items.length) return <p className="py-6 text-sm text-muted-foreground">Nothing needs your attention in this period.</p>;
  return (
    <ul className="divide-y divide-border/70">
      {items.map((item) => (
        <li key={item.key}>
          {item.to ? (
            <Link to={item.to} className="flex items-center justify-between gap-3 py-3 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <AttentionText text={item.text} detail={item.detail} />
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            </Link>
          ) : (
            <div className="py-3">
              <AttentionText text={item.text} detail={item.detail} />
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

function AttentionText({ text, detail }: { text: string; detail: string }) {
  return (
    <span className="flex min-w-0 items-start gap-3">
      <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-chart-budget" />
      <span className="min-w-0">
        <span className="block font-medium">{text}</span>
        <span className="block text-sm text-muted-foreground">{detail}</span>
      </span>
    </span>
  );
}

function OverviewSkeleton() {
  return (
    <div role="status" aria-label="Loading the overview" className="space-y-14">
      <div className="space-y-3">
        <Skeleton className="h-8 w-full max-w-2xl" />
        <Skeleton className="h-8 w-2/3 max-w-xl" />
      </div>
      <div className="grid grid-cols-2 gap-6 border-b border-border/80 pb-6 lg:grid-cols-4">
        {[0, 1, 2, 3].map((key) => (
          <div key={key} className="space-y-3">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-9 w-28" />
            <Skeleton className="h-3 w-36" />
          </div>
        ))}
      </div>
      <Skeleton className="h-64 w-full" />
    </div>
  );
}
