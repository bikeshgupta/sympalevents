import { useMemo } from "react";
import { Link } from "react-router-dom";
import { EmptyState, QueryState, UnavailableState } from "../data-states";
import { formatCount, formatInstantDate, formatInstantTime } from "../format";
import { PageHeader, SectionHeading } from "../page-header";
import { useSocieties, useSociety, type SocietiesData, type SocietyLabel, type SocietyRow } from "../platform-api";
import { chartPoints, counted, eventDates, monthLabel, sinceText, societyLabelText, sumOf, useListParams, useSectionLink } from "../platform-helpers";
import { sectionPath, type PlatformSection } from "../platform-sections";
import { Change, Choices, DetailDrawer, DrawerSection, EventStatusLabel, Fact, Figure, FigureRow, LabelMeter, SearchField, SocietyLabelTag } from "../platform-ui";
import { TrendChart } from "../trend-chart";
import { usePlatformRange } from "../use-platform-range";
import { DrawerSkeleton, ListSkeleton } from "./users-section";

/**
 * Societies - adoption and activity, observed. One written rule labels every society (New, Active, Quiet, Dormant,
 * Empty), the same rule the Overview counts with (shared/platform-metrics.ts). This is not Society Management:
 * nothing here changes a society.
 */

type Sort = "visits" | "newest" | "members" | "name";
const labelFilters = ["all", "new", "active", "quiet", "dormant", "empty"] as const;

export function SocietiesSection({ section }: { section: PlatformSection }) {
  const { preset } = usePlatformRange();
  const societies = useSocieties(preset);
  const { values, set } = useListParams(["q", "label", "sort", "society"] as const);
  return (
    <div>
      <PageHeader title={section.label} summary={section.summary} rangeAware observedAt={societies.data?.observedAt ?? null} />
      <div className="mt-8">
        <QueryState query={societies} skeleton={<ListSkeleton />} errorMessage="The societies could not be loaded.">
          {(data) => <SocietiesBody data={data} values={values} set={set} />}
        </QueryState>
      </div>
      <SocietyDrawer id={values.society || null} range={preset} onClose={() => set({ society: null }, { keepPage: true })} />
    </div>
  );
}

type ListState = ReturnType<typeof useListParams<"q" | "label" | "sort" | "society">>;

function SocietiesBody({ data, values, set }: { data: SocietiesData; values: ListState["values"]; set: ListState["set"] }) {
  const days = data.window.days;
  const label = (labelFilters as readonly string[]).includes(values.label) ? (values.label as (typeof labelFilters)[number]) : "all";
  const sort: Sort = values.sort === "newest" || values.sort === "members" || values.sort === "name" ? values.sort : "visits";

  const rows = useMemo(() => {
    const needle = values.q.toLowerCase();
    return data.societies
      .filter((row) => label === "all" || row.label === label)
      .filter((row) => !needle || row.name.toLowerCase().includes(needle) || (row.city ?? "").toLowerCase().includes(needle))
      .sort((a, b) => {
        if (sort === "newest") return (b.createdAt ?? "").localeCompare(a.createdAt ?? "");
        if (sort === "members") return b.members - a.members;
        if (sort === "name") return a.name.localeCompare(b.name);
        return b.visits - a.visits || b.eventsOn - a.eventsOn || a.name.localeCompare(b.name);
      });
  }, [data.societies, label, sort, values.q]);

  return (
    <div className="space-y-14">
      <FigureRow>
        <Figure label="Societies" value={formatCount(data.summary.total)} detail={`${formatCount(data.summary.withEvents)} have run an event`} />
        <Figure label="Active" value={formatCount(data.summary.active.current)} detail={<Change value={data.summary.active} days={days} />} />
        <Figure label="New" value={formatCount(data.summary.new.current)} detail={<Change value={data.summary.new} days={days} />} />
        <Figure label="Memberships added" value={formatCount(sumOf(data.series.joined.current))} detail={`vs ${formatCount(sumOf(data.series.joined.previous))} before`} />
      </FigureRow>

      <div className="grid gap-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <section aria-labelledby="labels-heading">
          <div id="labels-heading">
            <SectionHeading title="How societies are doing" />
          </div>
          <div className="mt-5">
            <LabelMeter labels={data.summary.labels} total={data.summary.total} />
          </div>
        </section>
        <section aria-labelledby="joins-heading">
          <div id="joins-heading">
            <SectionHeading title="People joining societies" />
          </div>
          <div className="mt-4">
            <TrendChart kind="bar" height={190} points={chartPoints(data.days, data.series.joined.current, data.series.joined.previous)} name="Memberships added" />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Counts memberships that still exist; leaving a society is not recorded until the role history (database update 046).
            {data.coverage.firstMembershipAt ? ` The earliest join date, ${formatInstantDate(data.coverage.firstMembershipAt)}, may be when existing members were imported rather than when they joined.` : ""}
          </p>
        </section>
      </div>

      {data.series.createdByMonth.length > 1 ? (
        <section aria-labelledby="created-heading">
          <div id="created-heading">
            <SectionHeading title="Societies created, by month" aside={<span className="text-xs text-muted-foreground">All time</span>} />
          </div>
          <div className="mt-4">
            <TrendChart
              kind="bar"
              height={160}
              name="Societies created"
              points={data.series.createdByMonth.map((point) => ({ label: monthLabel(point.month), tip: monthLabel(point.month), current: point.value, previous: null }))}
            />
          </div>
        </section>
      ) : null}

      <section aria-labelledby="list-heading">
        <div id="list-heading">
          <SectionHeading title="Every society" aside={<span className="text-xs text-muted-foreground tabular-nums">{formatCount(rows.length)} shown</span>} />
        </div>
        <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <SearchField value={values.q} onChange={(q) => set({ q })} placeholder="Search by name or city" label="Search societies" />
          <div className="flex flex-wrap items-center gap-3">
            <Choices label="Label" value={label} onChange={(next) => set({ label: next })} options={labelFilters.map((value) => ({ value, label: value === "all" ? "All" : societyLabelText[value as SocietyLabel] }))} />
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              Sort
              <select value={sort} onChange={(event) => set({ sort: event.target.value === "visits" ? null : event.target.value })} className="min-h-10 rounded-lg border bg-card px-2 text-sm text-foreground">
                <option value="visits">Most visited</option>
                <option value="newest">Newest</option>
                <option value="members">Most members</option>
                <option value="name">Name</option>
              </select>
            </label>
          </div>
        </div>
        <SocietyList rows={rows} onOpen={(id) => set({ society: id }, { keepPage: true })} />
      </section>
    </div>
  );
}

function SocietyList({ rows, onOpen }: { rows: SocietyRow[]; onOpen: (id: string) => void }) {
  if (!rows.length) return <p className="py-8 text-sm text-muted-foreground">No society matches.</p>;
  return (
    <>
      <ul className="mt-2 divide-y divide-border/70 md:hidden">
        {rows.map((row) => (
          <li key={row.id}>
            <button type="button" onClick={() => onOpen(row.id)} className="flex w-full items-start justify-between gap-3 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <span className="min-w-0">
                <span className="block truncate font-medium">{row.name}</span>
                <span className="block text-xs text-muted-foreground tabular-nums">
                  {counted(row.members, "member", "members")} · {counted(row.events, "event", "events")} · {counted(row.visits, "visit", "visits")}
                </span>
              </span>
              <span className="shrink-0 text-sm">
                <SocietyLabelTag label={row.label} />
              </span>
            </button>
          </li>
        ))}
      </ul>
      <div className="mt-2 hidden overflow-x-auto md:block">
        <table className="w-full text-sm">
          <caption className="sr-only">Societies with their label, members, events, visits and last activity. Choose a name to open its record.</caption>
          <thead>
            <tr className="border-b border-border/80 text-left text-xs uppercase tracking-[0.08em] text-muted-foreground">
              <th scope="col" className="py-2.5 pr-4 font-semibold">Society</th>
              <th scope="col" className="px-4 py-2.5 font-semibold">Label</th>
              <th scope="col" className="px-4 py-2.5 text-right font-semibold">Members</th>
              <th scope="col" className="px-4 py-2.5 text-right font-semibold">Events</th>
              <th scope="col" className="px-4 py-2.5 text-right font-semibold">Visits</th>
              <th scope="col" className="py-2.5 pl-4 font-semibold">Last activity</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-border/60 hover:bg-muted/40">
                <td className="py-2.5 pr-4">
                  <button type="button" onClick={() => onOpen(row.id)} className="text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    <span className="block font-medium hover:underline">{row.name}</span>
                    <span className="block text-xs text-muted-foreground">
                      {row.city ? `${row.city} · ` : ""}since {formatInstantDate(row.createdAt) ?? "—"}
                    </span>
                  </button>
                </td>
                <td className="px-4 py-2.5">
                  <SocietyLabelTag label={row.label} />
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums">{formatCount(row.members)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{formatCount(row.events)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{formatCount(row.visits)}</td>
                <td className="py-2.5 pl-4 text-muted-foreground">{sinceText(row.lastActivityAt) ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function SocietyDrawer({ id, range, onClose }: { id: string | null; range: string; onClose: () => void }) {
  const society = useSociety(id, range);
  const link = useSectionLink();
  return (
    <DetailDrawer open={Boolean(id)} onClose={onClose} title={society.data?.society.name ?? (society.isPending ? "Loading" : "Society")} subtitle={society.data ? [society.data.society.city, `since ${formatInstantDate(society.data.society.createdAt)}`].filter(Boolean).join(" · ") : undefined}>
      <QueryState query={society} skeleton={<DrawerSkeleton />} errorMessage="This society could not be loaded." notFound={<EmptyState title="There is no such society." hint="It may have been deleted, or the link is wrong." />}>
        {(data) => (
          <div>
            <p className="text-sm">
              <SocietyLabelTag label={data.society.label} />
            </p>
            <dl className="mt-5 grid grid-cols-3 gap-4">
              <Fact label="Members" value={formatCount(data.society.members)} note={`${data.roles.admin} admin · ${data.roles.committee} committee`} />
              <Fact label="Visits" value={formatCount(data.society.visits)} note={counted(data.society.signedInVisitors, "signed-in person", "signed-in people")} />
              <Fact label="Joined" value={formatCount(data.society.joined)} note="In this period" />
            </dl>

            <DrawerSection title="Events">
              {data.events.length ? (
                <ul className="divide-y divide-border/70">
                  {data.events.map((event) => (
                    <li key={event.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2.5 text-sm">
                      <span className="min-w-0">
                        <Link to={link(sectionPath("events"), { event: event.id })} className="font-medium hover:underline">
                          {event.name}
                        </Link>
                        <span className="block text-xs text-muted-foreground">{eventDates(event.startDate, event.endDate)}</span>
                      </span>
                      <span className="flex items-center gap-4 text-xs text-muted-foreground tabular-nums">
                        {counted(event.visits, "visit", "visits")}
                        <EventStatusLabel status={event.status} />
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="py-3 text-sm text-muted-foreground">No events yet.</p>
              )}
            </DrawerSection>

            {data.joinsByMonth.length ? (
              <DrawerSection title="Members joining, by month">
                <div className="mt-3">
                  <TrendChart kind="bar" height={140} name="Joined" points={data.joinsByMonth.map((point) => ({ label: monthLabel(point.month), tip: monthLabel(point.month), current: point.value, previous: null }))} />
                </div>
              </DrawerSection>
            ) : null}

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
                <UnavailableState title="Not recorded yet" reason="Actions in this society appear here once the audit log exists (database update 030)." />
              )}
            </DrawerSection>
            <p className="mt-8 text-xs text-muted-foreground">To change anything about this society, use Society Management in Sympal Events.</p>
          </div>
        )}
      </QueryState>
    </DetailDrawer>
  );
}
