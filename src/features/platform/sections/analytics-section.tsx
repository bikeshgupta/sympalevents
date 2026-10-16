import { useState } from "react";
import { Link } from "react-router-dom";
import { formatCurrency } from "@/lib/utils";
import { paymentLabels } from "../../../../shared/registration";
import { EmptyState, QueryState, UnavailableState } from "../data-states";
import { formatCount, formatDuration, formatInstantDate } from "../format";
import { PageHeader, SectionHeading } from "../page-header";
import { useAnalytics, type AnalyticsData, type Comparison } from "../platform-api";
import { chartPoints, monthLabel, useSectionLink } from "../platform-helpers";
import { sectionPath, type PlatformSection } from "../platform-sections";
import { BarList, Change, Choices, Figure, FigureRow } from "../platform-ui";
import { TrendChart } from "../trend-chart";
import { usePlatformRange } from "../use-platform-range";
import { ListSkeleton } from "./users-section";

/**
 * Analytics - how Sympal is used, in separate measures that are never blended:
 *
 * - **Active people** (daily, weekly, monthly): distinct signed-in people, counted from visit records.
 * - **Traffic**: visits, which are sessions on event pages - a person can make many.
 * - **Devices and places**: where visits come from, groups under five folded into "Other".
 * - **Pages**: which parts of an event people open (needs the page-view log).
 * - **Retention**: of the people who signed up in a month, how many were active in the last 30 days.
 * - **Events**: bookings, and the contributions societies record for their own events.
 *
 * Every figure says what it counts. Anything the database does not record says so instead of showing zero.
 */
export function AnalyticsSection({ section }: { section: PlatformSection }) {
  const { preset } = usePlatformRange();
  const analytics = useAnalytics(preset);
  return (
    <div>
      <PageHeader title={section.label} summary={section.summary} rangeAware observedAt={analytics.data?.observedAt ?? null} />
      <div className="mt-8">
        <QueryState query={analytics} skeleton={<ListSkeleton />} errorMessage="The analytics could not be loaded.">
          {(data) => <AnalyticsBody data={data} />}
        </QueryState>
      </div>
    </div>
  );
}

function AnalyticsBody({ data }: { data: AnalyticsData }) {
  const days = data.window.days;
  const since = formatInstantDate(data.coverage.visitsSince);
  return (
    <div className="space-y-16">
      <section aria-labelledby="people-heading">
        <div id="people-heading">
          <SectionHeading title="Active people" aside={<span className="text-xs text-muted-foreground">As of {formatInstantDate(data.window.lastDay)}</span>} />
        </div>
        {data.levels ? (
          <>
            <FigureRow>
              <Level label="Daily" value={data.levels.dau} days={1} />
              <Level label="Weekly" value={data.levels.wau} days={7} />
              <Level label="Monthly" value={data.levels.mau} days={30} />
              <Figure
                label="Stickiness"
                value={data.levels.stickiness === null ? "—" : `${Math.round(data.levels.stickiness * 100)}%`}
                detail="Daily people as a share of monthly"
                title="Daily active people divided by monthly active people"
              />
            </FigureRow>
            <p className="mt-3 max-w-3xl text-xs text-muted-foreground">
              Distinct signed-in people with a visit to an event page in the last 1, 7 and 30 days, counted from the visit records - never estimated from visit totals, so a person who visits ten times is one person. They end at the close of the selected period; other pages are not recorded{since ? `, and nothing before ${since}` : ""}.
            </p>
          </>
        ) : (
          <div className="mt-4">
            <UnavailableState title="Not recorded" reason="Visits to event pages are not recorded in this database (database update 028), so active people cannot be counted." />
          </div>
        )}
      </section>

      <Traffic data={data} days={days} />

      <section aria-labelledby="where-heading">
        <div id="where-heading">
          <SectionHeading title="Devices and places" aside={<span className="text-xs text-muted-foreground">Visits in this period</span>} />
        </div>
        {data.devices && data.browsers && data.cities && data.countries ? (
          <>
            <div className="mt-5 grid gap-x-14 gap-y-8 md:grid-cols-2">
              <Breakdown title="Devices" rows={data.devices} />
              <Breakdown title="Browsers" rows={data.browsers} />
              <Breakdown title="Towns and cities" rows={data.cities} />
              <Breakdown title="Countries" rows={data.countries} />
            </div>
            <p className="mt-4 max-w-3xl text-xs text-muted-foreground">
              Counted by visit. Any group of fewer than five visits is combined into "Other" so nobody is shown on their own. Where a place is not known it says Unknown. No IP address is stored; places come from the host's own location headers.
            </p>
          </>
        ) : (
          <div className="mt-4">
            <UnavailableState title="Not recorded" reason="This needs the visit records (database update 028)." />
          </div>
        )}
      </section>

      <section aria-labelledby="pages-heading">
        <div id="pages-heading">
          <SectionHeading title="Pages people open" aside={<span className="text-xs text-muted-foreground">Page views in this period</span>} />
        </div>
        {data.pages ? (
          data.pages.length ? (
            <div className="mt-2 overflow-x-auto">
              <table className="w-full text-sm">
                <caption className="sr-only">Pages of an event, by how often they were opened</caption>
                <thead>
                  <tr className="border-b border-border/80 text-left text-xs uppercase tracking-[0.08em] text-muted-foreground">
                    <th scope="col" className="py-2.5 pr-4 font-semibold">Page</th>
                    <th scope="col" className="px-4 py-2.5 text-right font-semibold">Views</th>
                    <th scope="col" className="py-2.5 pl-4 text-right font-semibold">Typical time</th>
                  </tr>
                </thead>
                <tbody>
                  {data.pages.map((page) => (
                    <tr key={page.page} className="border-b border-border/60">
                      <td className="py-2.5 pr-4 font-medium capitalize">{page.page.replace(/[-_]/g, " ")}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{formatCount(page.views)}</td>
                      <td className="py-2.5 pl-4 text-right tabular-nums">{page.medianSeconds === null ? "—" : formatDuration(page.medianSeconds)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-2 text-xs text-muted-foreground">Typical time is the median where the next page was opened; a page that was the last one seen has no measured time.</p>
            </div>
          ) : (
            <EmptyState title="No page views in this period." />
          )
        ) : (
          <div className="mt-4">
            <UnavailableState title="Not recorded yet" reason="Which pages are opened is kept in the page-view log (database update 030), which this database does not have yet. Visits are recorded, but not which pages within them." />
          </div>
        )}
      </section>

      <section aria-labelledby="retention-heading">
        <div id="retention-heading">
          <SectionHeading title="Do people come back" aside={<span className="text-xs text-muted-foreground">By month of sign-up</span>} />
        </div>
        {data.retention ? (
          data.retention.cohorts.length ? (
            <>
              <ul className="mt-3 divide-y divide-border/70">
                {data.retention.cohorts.map((cohort) => (
                  <li key={cohort.month} className="grid grid-cols-[4.5rem_minmax(0,1fr)_auto] items-center gap-4 py-2.5 text-sm">
                    <span className="font-medium">{monthLabel(cohort.month)}</span>
                    <span className="flex items-center gap-3">
                      <span aria-hidden="true" className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                        <span className="block h-full rounded-full bg-primary" style={{ width: `${(cohort.share ?? 0) * 100}%` }} />
                      </span>
                    </span>
                    <span className="text-right tabular-nums">
                      <span className="font-medium">{cohort.share === null ? "—" : `${Math.round(cohort.share * 100)}%`}</span>
                      <span className="text-muted-foreground"> · {formatCount(cohort.active)} of {formatCount(cohort.people)}</span>
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 max-w-3xl text-xs text-muted-foreground">
                Of the people who signed up in each month, how many were active on event pages in the last {data.retention.activeDays} days. People who only use other pages are not counted as active, and visits are recorded{since ? ` only since ${since}` : ""}, so older months show how many are still around, not how many ever came back.
              </p>
            </>
          ) : (
            <EmptyState title="Nobody has signed up yet." />
          )
        ) : (
          <div className="mt-4">
            <UnavailableState title="Not recorded" reason="This needs the visit records (database update 028)." />
          </div>
        )}
      </section>

      <Events data={data} />
    </div>
  );
}

function Level({ label, value, days }: { label: string; value: Comparison; days: number }) {
  return <Figure label={label} value={formatCount(value.current)} detail={<Change value={value} days={days} />} title={`Distinct signed-in people in the last ${days === 1 ? "day" : `${days} days`}`} />;
}

function Breakdown({ title, rows }: { title: string; rows: { label: string; count: number }[] }) {
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">{title}</h3>
      <div className="mt-3">
        <BarList rows={rows.slice(0, 7)} empty="No visits in this period." />
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------------------------------------- */

function Traffic({ data, days }: { data: AnalyticsData; days: number }) {
  const [measure, setMeasure] = useState<"visits" | "people">("visits");
  const traffic = data.traffic;
  const trackedFrom = data.coverage.visitsSince?.slice(0, 10) ?? null;
  return (
    <section aria-labelledby="traffic-heading">
      <div id="traffic-heading">
        <SectionHeading title="Traffic" aside={<span className="text-xs text-muted-foreground">Against the {days === 365 ? "12 months" : `${days} days`} before</span>} />
      </div>
      {traffic ? (
        <>
          <FigureRow>
            <Figure label="Visits" value={formatCount(traffic.visits.current)} detail={<Change value={traffic.visits} days={days} />} title="Sessions on event pages that began in this period" />
            <Figure label="Signed-in people" value={formatCount(traffic.people.current)} detail={<Change value={traffic.people} days={days} />} title="Distinct signed-in people active in this period" />
            <Figure label="Guest visits" value={formatCount(traffic.guests)} detail="Visits not signed in" />
            <Figure
              label="Typical length"
              value={traffic.length.medianSeconds === null ? "—" : formatDuration(traffic.length.medianSeconds)}
              detail={traffic.length.measured ? `Median of ${formatCount(traffic.length.measured)} of ${formatCount(traffic.length.total)} visits` : "Too short to measure"}
            />
          </FigureRow>
          <div className="mt-6">
            <Choices
              label="Measure"
              value={measure}
              onChange={setMeasure}
              options={[
                { value: "visits", label: "Visits" },
                { value: "people", label: "Signed-in people" },
              ]}
            />
          </div>
          <div className="mt-4">
            {measure === "visits" ? (
              <TrendChart kind="bar" height={220} name="Visits" points={chartPoints(data.days, traffic.series.visits.current, traffic.series.visits.previous, { trackedFrom })} />
            ) : (
              <TrendChart height={220} name="Signed-in people per day" points={chartPoints(data.days, traffic.series.people.current, traffic.series.people.previous, { mode: "average", trackedFrom })} />
            )}
          </div>
          <p className="mt-2 max-w-3xl text-xs text-muted-foreground">
            A visit is one browser session on one event; a person can make many, which is why visits and people are shown apart. {measure === "people" ? "For a period over 92 days each point is the daily average of that week, because adding daily counts would count the same person more than once. " : ""}
            Only event pages are recorded{trackedFrom ? `, since ${formatInstantDate(data.coverage.visitsSince)}` : ""}.
            {data.coverage.visitsPartial ? " More visits exist than were read; these figures are partial." : ""}
          </p>
        </>
      ) : (
        <div className="mt-4">
          <UnavailableState title="Not recorded" reason="Visits to event pages are not recorded in this database (database update 028)." />
        </div>
      )}
    </section>
  );
}

function Events({ data }: { data: AnalyticsData }) {
  const link = useSectionLink();
  const range = data.window.days;
  return (
    <section aria-labelledby="events-heading">
      <div id="events-heading">
        <SectionHeading title="Events" aside={<span className="text-xs text-muted-foreground">Recorded in this period</span>} />
      </div>
      <div className="mt-2 grid gap-x-14 gap-y-12 lg:grid-cols-2">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Bookings</h3>
          {data.bookings ? (
            <div className="mt-3">
              <dl className="grid grid-cols-2 gap-6">
                <div>
                  <dt className="text-sm text-muted-foreground">Bookings made</dt>
                  <dd className="mt-1 text-3xl font-semibold tabular-nums">{formatCount(data.bookings.bookings.current)}</dd>
                  <dd className="mt-1 text-sm"><Change value={data.bookings.bookings} days={range} /></dd>
                </div>
                <div>
                  <dt className="text-sm text-muted-foreground">People booked</dt>
                  <dd className="mt-1 text-3xl font-semibold tabular-nums">{formatCount(data.bookings.people.current)}</dd>
                  <dd className="mt-1 text-sm"><Change value={data.bookings.people} days={range} /></dd>
                </div>
              </dl>
              <div className="mt-5">
                <TrendChart kind="bar" height={150} name="Bookings" points={chartPoints(data.days, data.bookings.series.current, data.bookings.series.previous)} />
              </div>
              <h4 className="mt-6 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Where their payment stands</h4>
              <div className="mt-3">
                <BarList
                  rows={Object.entries(data.bookings.payments)
                    .map(([key, count]) => ({ label: paymentLabels[key as keyof typeof paymentLabels] ?? key, count }))
                    .sort((a, b) => b.count - a.count)}
                  empty="No bookings in this period."
                />
              </div>
              <h4 className="mt-6 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Most booked events</h4>
              <ul className="mt-2 divide-y divide-border/70">
                {data.bookings.top.length ? (
                  data.bookings.top.map((event) => (
                    <li key={event.id} className="flex items-baseline justify-between gap-4 py-2.5 text-sm">
                      <span className="min-w-0">
                        <Link to={link(sectionPath("events"), { event: event.id })} className="block truncate font-medium hover:underline">
                          {event.name}
                        </Link>
                        <span className="block truncate text-xs text-muted-foreground">{event.society}</span>
                      </span>
                      <span className="shrink-0 text-right tabular-nums">
                        {formatCount(event.bookings)} <span className="text-xs text-muted-foreground">· {formatCount(event.people)} people</span>
                      </span>
                    </li>
                  ))
                ) : (
                  <li className="py-3 text-sm text-muted-foreground">No bookings in this period.</li>
                )}
              </ul>
              {data.bookings.partial ? <p className="mt-2 text-xs text-muted-foreground">More bookings exist than were read; these figures are partial.</p> : null}
            </div>
          ) : (
            <div className="mt-3">
              <UnavailableState title="Not available" reason="Bookings are not set up in this database (database update 032)." />
            </div>
          )}
        </div>

        <div>
          <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Contributions recorded by societies</h3>
          {data.money ? (
            <div className="mt-3">
              <p className="rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
                This is money societies record for their own events. It is not Sympal revenue, and nothing here is owed to or held by Sympal.
              </p>
              {data.money.byStatus.length ? (
                <table className="mt-4 w-full text-sm">
                  <caption className="sr-only">Contributions recorded in this period, by status</caption>
                  <thead>
                    <tr className="border-b border-border/80 text-left text-xs uppercase tracking-[0.08em] text-muted-foreground">
                      <th scope="col" className="py-2 pr-4 font-semibold">Status</th>
                      <th scope="col" className="px-4 py-2 text-right font-semibold">Records</th>
                      <th scope="col" className="py-2 pl-4 text-right font-semibold">Received</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.money.byStatus.map((row) => (
                      <tr key={row.status} className="border-b border-border/60">
                        <td className="py-2.5 pr-4 font-medium">{row.status}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{formatCount(row.count)}</td>
                        <td className="py-2.5 pl-4 text-right tabular-nums">{formatCurrency(row.received)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="mt-3">
                  <EmptyState title="No contributions were recorded in this period." />
                </div>
              )}
              {data.money.top.length ? (
                <>
                  <h4 className="mt-6 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Events with the most received</h4>
                  <ul className="mt-2 divide-y divide-border/70">
                    {data.money.top.map((event) => (
                      <li key={event.id} className="flex items-baseline justify-between gap-4 py-2.5 text-sm">
                        <span className="min-w-0">
                          <Link to={link(sectionPath("events"), { event: event.id })} className="block truncate font-medium hover:underline">
                            {event.name}
                          </Link>
                          <span className="block truncate text-xs text-muted-foreground">{event.society}</span>
                        </span>
                        <span className="shrink-0 text-right tabular-nums">{formatCurrency(event.received)}</span>
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}
              <p className="mt-3 text-xs text-muted-foreground">
                By the day each record was made. Totals only: no names, flats or payment references are read.
                {data.money.partial ? " More records exist than were read; these figures are partial." : ""}
              </p>
            </div>
          ) : (
            <div className="mt-3">
              <UnavailableState title="Not available" reason="Contributions are not set up in this database." />
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
