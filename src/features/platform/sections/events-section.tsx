import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { eventTypeLabel } from "@/features/society/event-type-style";
import { statusLabels } from "../../../../shared/event-status";
import { paymentLabels } from "../../../../shared/registration";
import { EmptyState, QueryState, UnavailableState } from "../data-states";
import { formatCount, formatInstantDate, formatInstantTime } from "../format";
import { PageHeader, SectionHeading } from "../page-header";
import { useEvent, useEvents, type EventRow, type EventStatus, type EventsData } from "../platform-api";
import { chartPoints, counted, eventDates, eventStatusOrder, sumOf, useListParams, useSectionLink } from "../platform-helpers";
import { sectionPath, type PlatformSection } from "../platform-sections";
import { Change, Choices, DetailDrawer, DrawerSection, EventStatusLabel, Fact, Figure, FigureRow, Pager, SearchField } from "../platform-ui";
import { TrendChart } from "../trend-chart";
import { usePlatformRange } from "../use-platform-range";
import { DrawerSkeleton, ListSkeleton } from "./users-section";

/**
 * Events - every event on the platform, by where it stands now. Status comes from getEventStatus() (the same rule
 * residents see), never from a stored column. Booking money is the society's, collected for its event; nothing
 * here treats it as platform revenue, and no amount is shown.
 */

const statusFilters = ["all", ...eventStatusOrder] as const;

export function EventsSection({ section }: { section: PlatformSection }) {
  const { preset } = usePlatformRange();
  const { values, set } = useListParams(["q", "status", "society", "page", "event"] as const);
  const status = (statusFilters as readonly string[]).includes(values.status) ? (values.status as (typeof statusFilters)[number]) : "all";
  const events = useEvents({ range: preset, q: values.q, status: status === "all" ? "" : status, society: values.society, page: values.page });

  return (
    <div>
      <PageHeader title={section.label} summary={section.summary} rangeAware observedAt={events.data?.observedAt ?? null} />
      <div className="mt-8">
        <QueryState query={events} skeleton={<ListSkeleton />} errorMessage="The events could not be loaded.">
          {(data) => (
            <div className="space-y-14">
              <Summary data={data} />
              <Pipeline data={data} active={status} onPick={(next) => set({ status: next })} />
              <Trends data={data} />
              <section aria-labelledby="list-heading">
                <div id="list-heading">
                  <SectionHeading title="Every event" aside={<span className="text-xs text-muted-foreground">Latest start date first</span>} />
                </div>
                <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <SearchField value={values.q} onChange={(q) => set({ q })} placeholder="Search by event or society" label="Search events" />
                  <label className="flex items-center gap-2 text-sm text-muted-foreground">
                    Society
                    <select
                      value={data.filters.society ?? ""}
                      onChange={(event) => set({ society: event.target.value })}
                      className="min-h-10 max-w-[16rem] rounded-lg border bg-card px-2 text-sm text-foreground"
                    >
                      <option value="">All societies</option>
                      {data.societies.map((society) => (
                        <option key={society.id} value={society.id}>
                          {society.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="mt-3">
                  <Choices
                    label="Status"
                    value={status}
                    onChange={(next) => set({ status: next })}
                    options={statusFilters.map((value) => ({ value, label: value === "all" ? "All" : statusLabels[value] }))}
                  />
                </div>
                <EventList rows={data.events} onOpen={(id) => set({ event: id }, { keepPage: true })} />
                <Pager page={data.page} pageSize={data.pageSize} total={data.total} busy={events.isFetching} onPage={(page) => set({ page: String(page) })} />
              </section>
            </div>
          )}
        </QueryState>
      </div>
      <EventDrawer id={values.event || null} range={preset} onClose={() => set({ event: null }, { keepPage: true })} />
    </div>
  );
}

function Summary({ data }: { data: EventsData }) {
  const { status } = data.summary;
  return (
    <FigureRow>
      <Figure label="Events" value={formatCount(data.summary.total)} detail={counted(status.draft, "still a draft", "still drafts")} />
      <Figure label="On now" value={formatCount(status.live)} detail="Between their start and end" />
      <Figure label="Coming up" value={formatCount(status.upcoming)} detail="Published, not yet started" />
      <Figure label="Created" value={formatCount(data.summary.created.current)} detail={<Change value={data.summary.created} days={data.window.days} />} />
    </FigureRow>
  );
}

/** Every event by where it stands now, as one row of stages; choosing a stage filters the list below. */
function Pipeline({ data, active, onPick }: { data: EventsData; active: "all" | EventStatus; onPick: (status: EventStatus | "all") => void }) {
  const total = Math.max(data.summary.total, 1);
  return (
    <section aria-labelledby="pipeline-heading">
      <div id="pipeline-heading">
        <SectionHeading title="Where events stand now" aside={<span className="text-xs text-muted-foreground">Not limited to this period</span>} />
      </div>
      <ol className="mt-5 grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-5">
        {eventStatusOrder.map((key) => {
          const count = data.summary.status[key];
          const chosen = active === key;
          return (
            <li key={key}>
              <button
                type="button"
                aria-pressed={chosen}
                onClick={() => onPick(chosen ? "all" : key)}
                className={cn(
                  "block w-full rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  active !== "all" && !chosen && "opacity-55 hover:opacity-100",
                )}
              >
                <span className="text-sm">
                  <EventStatusLabel status={key} />
                </span>
                <span className="mt-2 block text-2xl font-semibold tabular-nums">{formatCount(count)}</span>
                <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-muted">
                  <span className={cn("block h-full rounded-full", key === "cancelled" ? "bg-destructive/70" : key === "draft" ? "bg-muted-foreground/40" : "bg-primary")} style={{ width: `${(count / total) * 100}%` }} />
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function Trends({ data }: { data: EventsData }) {
  const published = data.series.published;
  return (
    <div className="grid gap-14 lg:grid-cols-2">
      <section aria-labelledby="created-heading">
        <div id="created-heading">
          <SectionHeading title="Events created" aside={<span className="text-xs text-muted-foreground tabular-nums">{formatCount(sumOf(data.series.created.current))} in this period</span>} />
        </div>
        <div className="mt-4">
          <TrendChart kind="bar" height={190} name="Created" points={chartPoints(data.days, data.series.created.current, data.series.created.previous)} />
        </div>
        <p className="mt-2 text-xs text-muted-foreground">Counts events that still exist; a deleted event is not counted.</p>
      </section>
      <section aria-labelledby="published-heading">
        <div id="published-heading">
          <SectionHeading title="Events published" aside={published ? <span className="text-xs text-muted-foreground tabular-nums">{formatCount(sumOf(published.current))} in this period</span> : undefined} />
        </div>
        <div className="mt-4">
          {published ? (
            <TrendChart kind="bar" height={190} name="Published" points={chartPoints(data.days, published.current, published.previous, { trackedFrom: data.coverage.auditSince?.slice(0, 10) ?? null })} />
          ) : (
            <UnavailableState title="Not recorded yet" reason="When an event was published is kept only in the audit log (database update 030), which this database does not have yet." />
          )}
        </div>
      </section>
    </div>
  );
}

function EventList({ rows, onOpen }: { rows: EventRow[]; onOpen: (id: string) => void }) {
  if (!rows.length) return <p className="py-8 text-sm text-muted-foreground">No event matches. Try a shorter search or another filter.</p>;
  return (
    <>
      <ul className="mt-2 divide-y divide-border/70 md:hidden">
        {rows.map((row) => (
          <li key={row.id}>
            <button type="button" onClick={() => onOpen(row.id)} className="flex w-full items-start justify-between gap-3 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <span className="min-w-0">
                <span className="block truncate font-medium">{row.name}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {row.society} · {eventDates(row.startDate, row.endDate)}
                </span>
              </span>
              <span className="shrink-0 text-sm">
                <EventStatusLabel status={row.status} />
              </span>
            </button>
          </li>
        ))}
      </ul>
      <div className="mt-2 hidden overflow-x-auto md:block">
        <table className="w-full text-sm">
          <caption className="sr-only">Events with their status, dates, bookings and visits. Choose a name to open its record.</caption>
          <thead>
            <tr className="border-b border-border/80 text-left text-xs uppercase tracking-[0.08em] text-muted-foreground">
              <th scope="col" className="py-2.5 pr-4 font-semibold">Event</th>
              <th scope="col" className="px-4 py-2.5 font-semibold">Status</th>
              <th scope="col" className="px-4 py-2.5 font-semibold">Dates</th>
              <th scope="col" className="px-4 py-2.5 text-right font-semibold">Bookings</th>
              <th scope="col" className="py-2.5 pl-4 text-right font-semibold">Visits</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-border/60 hover:bg-muted/40">
                <td className="py-2.5 pr-4">
                  <button type="button" onClick={() => onOpen(row.id)} className="text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    <span className="block font-medium hover:underline">{row.name}</span>
                    <span className="block text-xs text-muted-foreground">
                      {row.society}
                      {row.type ? ` · ${eventTypeLabel(row.type)}` : ""}
                    </span>
                  </button>
                </td>
                <td className="px-4 py-2.5">
                  <EventStatusLabel status={row.status} />
                </td>
                <td className="whitespace-nowrap px-4 py-2.5 text-muted-foreground">{eventDates(row.startDate, row.endDate)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums" title="Active bookings, all time">
                  {row.bookings === null ? "—" : formatCount(row.bookings)}
                </td>
                <td className="py-2.5 pl-4 text-right tabular-nums" title="Visits to the event page in this period">
                  {row.visits === null ? "—" : formatCount(row.visits)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-xs text-muted-foreground">Bookings are active bookings, all time. Visits are visits to the event page in this period. A dash means it is not recorded.</p>
      </div>
    </>
  );
}

function EventDrawer({ id, range, onClose }: { id: string | null; range: string; onClose: () => void }) {
  const event = useEvent(id, range);
  const link = useSectionLink();
  const subtitle = event.data ? [event.data.event.society, event.data.event.type ? eventTypeLabel(event.data.event.type) : null].filter(Boolean).join(" · ") : undefined;
  return (
    <DetailDrawer open={Boolean(id)} onClose={onClose} title={event.data?.event.name ?? (event.isPending ? "Loading" : "Event")} subtitle={subtitle}>
      <QueryState query={event} skeleton={<DrawerSkeleton />} errorMessage="This event could not be loaded." notFound={<EmptyState title="There is no such event." hint="It may have been deleted, or the link is wrong." />}>
        {(data) => (
          <div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-4 text-sm">
              <div>
                <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Status now</dt>
                <dd className="mt-1">
                  <EventStatusLabel status={data.event.status} />
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Dates</dt>
                <dd className="mt-1">
                  {eventDates(data.event.startDate, data.event.endDate)}
                  {data.event.startTime ? <span className="block text-xs text-muted-foreground">{[data.event.startTime, data.event.endTime].filter(Boolean).join(" – ")} IST</span> : null}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Society</dt>
                <dd className="mt-1">
                  <Link to={link(sectionPath("societies"), { society: data.event.societyId })} className="hover:underline">
                    {data.event.society || "—"}
                  </Link>
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Created</dt>
                <dd className="mt-1">{formatInstantDate(data.event.createdAt) ?? "—"}</dd>
              </div>
              {data.event.location ? (
                <div className="col-span-2">
                  <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Venue</dt>
                  <dd className="mt-1">{data.event.location}</dd>
                </div>
              ) : null}
            </dl>

            <DrawerSection title="Bookings">
              {data.bookings ? (
                <div className="pt-3">
                  <dl className="grid grid-cols-3 gap-4">
                    <Fact label="Active" value={formatCount(data.bookings.active)} note="All time" />
                    <Fact label="People" value={formatCount(data.bookings.people)} note="Adults and children" />
                    <Fact label="Cancelled" value={formatCount(data.bookings.cancelled)} />
                  </dl>
                  {data.bookings.active ? (
                    <ul className="mt-4 space-y-1.5 text-sm">
                      {Object.entries(data.bookings.payments)
                        .sort((a, b) => b[1] - a[1])
                        .map(([key, count]) => (
                          <li key={key} className="flex justify-between gap-4">
                            <span className="text-muted-foreground">{paymentLabels[key as keyof typeof paymentLabels] ?? key}</span>
                            <span className="tabular-nums">{formatCount(count)}</span>
                          </li>
                        ))}
                    </ul>
                  ) : null}
                  <p className="mt-3 text-xs text-muted-foreground">
                    Contributions are collected by the society for its event. They are not platform revenue, and no amounts are shown here.
                    {data.bookings.partial ? " More bookings exist than were read; these figures are partial." : ""}
                  </p>
                </div>
              ) : (
                <UnavailableState title="Not available" reason="Bookings are not set up in this database (database update 032)." />
              )}
            </DrawerSection>

            <DrawerSection title="Visits to the event page">
              {data.visits ? (
                <div className="pt-3">
                  <dl className="grid grid-cols-3 gap-4">
                    <Fact label="Visits" value={formatCount(data.visits.total)} note="In this period" />
                    <Fact label="Signed in" value={formatCount(data.visits.signedInPeople)} note="Distinct people" />
                    <Fact label="Guests" value={formatCount(data.visits.guests)} note="Visits not signed in" />
                  </dl>
                  {data.visits.total ? (
                    <div className="mt-4">
                      <TrendChart kind="bar" height={140} name="Visits" points={chartPoints(data.days, data.visits.byDay, null)} />
                    </div>
                  ) : null}
                  {Object.keys(data.visits.devices).length ? (
                    <p className="mt-3 text-xs text-muted-foreground">
                      By device:{" "}
                      {Object.entries(data.visits.devices)
                        .sort((a, b) => b[1] - a[1])
                        .map(([device, count]) => `${device} ${formatCount(count)}`)
                        .join(" · ")}
                    </p>
                  ) : null}
                  {data.visits.partial ? <p className="mt-2 text-xs text-muted-foreground">More visits exist than were read; these figures are partial.</p> : null}
                </div>
              ) : (
                <UnavailableState title="Not recorded" reason="Visits to event pages are not recorded in this database." />
              )}
            </DrawerSection>

            <DrawerSection title="Recent actions">
              {data.actions ? (
                data.actions.length ? (
                  <ul className="divide-y divide-border/70">
                    {data.actions.map((action) => (
                      <li key={action.id} className="py-2.5 text-sm">
                        <p className="font-medium">{action.summary ?? `${action.action} ${action.entityType}`}</p>
                        <p className="text-xs text-muted-foreground">
                          {action.actorName || action.actorEmail || "Not recorded"} · {formatInstantDate(action.at)}, {formatInstantTime(action.at)}
                        </p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="py-3 text-sm text-muted-foreground">No recorded actions.</p>
                )
              ) : (
                <UnavailableState title="Not recorded yet" reason="Changes to this event appear here once the audit log exists (database update 030)." />
              )}
            </DrawerSection>
            <p className="mt-8 text-xs text-muted-foreground">To change this event, open it in Sympal Events as its society's admin.</p>
          </div>
        )}
      </QueryState>
    </DetailDrawer>
  );
}
