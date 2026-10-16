import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { EmptyState, QueryState, UnavailableState } from "../data-states";
import { formatCount, formatDuration, formatInstantDate, formatInstantTime } from "../format";
import { PageHeader, SectionHeading } from "../page-header";
import {
  useActivity,
  useAuditEntry,
  type AccessData,
  type ActionEntry,
  type ActionsData,
  type ActivityData,
  type VisitsData,
} from "../platform-api";
import { chartPoints, sumOf, useListParams, useSectionLink } from "../platform-helpers";
import { sectionPath, type PlatformSection } from "../platform-sections";
import { BarList, Change, Choices, DetailDrawer, DrawerSection, Fact, Figure, FigureRow, Pager, SearchField } from "../platform-ui";
import { TrendChart } from "../trend-chart";
import { usePlatformRange } from "../use-platform-range";
import { DrawerSkeleton, ListSkeleton } from "./users-section";

/**
 * Activity & Audit - three records that are easy to confuse, kept apart:
 *
 * - **Actions**: what people changed (the audit log). Each opens a read-only record with its before and after values.
 * - **Visits**: who opened event pages, and for how long. Nobody changed anything.
 * - **Access attempts**: signed-in people who opened, or were refused at, this owner-only area.
 *
 * Read-only. Contact details, flats, payment references and tokens are withheld on the server, never merely hidden
 * here, and the drawer says when values were withheld.
 */

type View = "actions" | "visits" | "access";
const views: { value: View; label: string }[] = [
  { value: "actions", label: "Actions" },
  { value: "visits", label: "Visits" },
  { value: "access", label: "Access attempts" },
];
const keys = ["view", "q", "action", "entity", "society", "event", "who", "outcome", "page", "entry"] as const;
const noFilters = { q: null, action: null, entity: null, society: null, event: null, who: null, outcome: null, entry: null };

export function ActivitySection({ section }: { section: PlatformSection }) {
  const { preset } = usePlatformRange();
  const { values, set } = useListParams(keys);
  const view: View = values.view === "visits" || values.view === "access" ? values.view : "actions";

  const params: Record<string, string> = { range: preset, view, page: values.page };
  if (view === "actions") Object.assign(params, { q: values.q, action: values.action, entity: values.entity, society: values.society, event: values.event });
  if (view === "visits") Object.assign(params, { who: values.who, event: values.event });
  if (view === "access") Object.assign(params, { outcome: values.outcome });
  const activity = useActivity(params);
  // A view switch keeps the previous data on screen while the next loads; never draw one view with another's shape.
  const data = activity.data && activity.data.view === view ? activity.data : undefined;

  return (
    <div>
      <PageHeader title={section.label} summary={section.summary} rangeAware observedAt={data?.observedAt ?? null} />
      <div className="mt-6">
        <Choices label="Record" value={view} onChange={(next) => set({ view: next === "actions" ? null : next, ...noFilters })} options={views} />
      </div>
      <div className="mt-6">
        {data ? (
          <ViewBody data={data} values={values} set={set} busy={activity.isFetching} />
        ) : activity.isError ? (
          <QueryState query={activity} skeleton={<ListSkeleton />} errorMessage="This record could not be loaded.">
            {() => null}
          </QueryState>
        ) : (
          <ListSkeleton />
        )}
      </div>
      <EntryDrawer id={values.entry || null} onClose={() => set({ entry: null }, { keepPage: true })} />
    </div>
  );
}

type ListState = ReturnType<typeof useListParams<(typeof keys)[number]>>;
type Shared = { values: ListState["values"]; set: ListState["set"]; busy: boolean };

function ViewBody({ data, values, set, busy }: { data: ActivityData } & Shared) {
  if (!data.available) {
    const text = {
      actions: ["Not recorded yet", "What people changed is kept in the audit log, which this database does not have yet (database update 030). Until it is applied, no actions are recorded."],
      visits: ["Not recorded", "Visits to event pages are not recorded in this database (database update 028)."],
      access: ["Not recorded yet", "Attempts to open this area are kept from database update 047, which is prepared but not applied. Refusals are in the Vercel function log until then."],
    }[data.view];
    return <UnavailableState title={text[0]} reason={text[1]} />;
  }
  if (data.view === "actions") return <ActionsView data={data} values={values} set={set} busy={busy} />;
  if (data.view === "visits") return <VisitsView data={data} values={values} set={set} busy={busy} />;
  return <AccessView data={data} set={set} busy={busy} />;
}

/* ---------------------------------------------------------------------------------------------------------- */
/* Actions                                                                                                      */
/* ---------------------------------------------------------------------------------------------------------- */

const titleCase = (value: string) => value.replace(/_/g, " ").replace(/^./, (letter) => letter.toUpperCase());

function ActionsView({ data, values, set, busy }: { data: ActionsData } & Shared) {
  const days = data.window.days;
  const top = data.summary.byAction[0];
  const filtered = Boolean(values.q || values.action || values.entity || values.society || values.event);
  return (
    <div className="space-y-12">
      <FigureRow>
        <Figure label="Actions" value={formatCount(data.summary.total.current)} detail={<Change value={data.summary.total} days={days} />} />
        <Figure label="People acting" value={formatCount(data.summary.people.current)} detail={<Change value={data.summary.people} days={days} />} />
        <Figure label="Most common" value={top ? titleCase(top.value) : "—"} detail={top ? `${formatCount(top.count)} in this period` : "No actions in this period"} />
        <Figure label="Recorded since" value={formatInstantDate(data.since) ?? "—"} detail="Earlier actions were not logged" />
      </FigureRow>

      <section aria-labelledby="actions-chart">
        <div id="actions-chart">
          <SectionHeading title="Actions per day" aside={<span className="text-xs text-muted-foreground tabular-nums">{formatCount(sumOf(data.series.current))} in this period</span>} />
        </div>
        <div className="mt-4">
          <TrendChart kind="bar" height={190} name="Actions" points={chartPoints(data.days, data.series.current, data.series.previous, { trackedFrom: data.since?.slice(0, 10) ?? null })} />
        </div>
        {data.partial ? <p className="mt-2 text-xs text-muted-foreground">More actions exist than were counted here; the totals above are partial.</p> : null}
      </section>

      <div className="grid gap-12 lg:grid-cols-3">
        <section aria-labelledby="by-action">
          <div id="by-action">
            <SectionHeading title="What was done" />
          </div>
          <div className="mt-4">
            <BarList rows={data.summary.byAction.slice(0, 6).map((row) => ({ label: titleCase(row.value), count: row.count }))} />
          </div>
        </section>
        <section aria-labelledby="by-entity">
          <div id="by-entity">
            <SectionHeading title="To what" />
          </div>
          <div className="mt-4">
            <BarList rows={data.summary.byEntity.slice(0, 6).map((row) => ({ label: titleCase(row.value), count: row.count }))} />
          </div>
        </section>
        <section aria-labelledby="by-person">
          <div id="by-person">
            <SectionHeading title="Busiest people" />
          </div>
          <div className="mt-4">
            <BarList rows={data.summary.topActors.map((actor) => ({ label: actor.name || "Name not recorded", count: actor.count }))} />
          </div>
        </section>
      </div>

      <section aria-labelledby="feed-heading">
        <div id="feed-heading">
          <SectionHeading title="Every action" aside={<span className="text-xs text-muted-foreground">Newest first</span>} />
        </div>
        <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center">
          <SearchField value={values.q} onChange={(q) => set({ q })} placeholder="Search what was done" label="Search actions" />
          <Select label="Action" value={values.action} onChange={(action) => set({ action })} options={data.summary.byAction.map((row) => ({ value: row.value, label: titleCase(row.value) }))} all="Any action" />
          <Select label="To" value={values.entity} onChange={(entity) => set({ entity })} options={data.summary.byEntity.map((row) => ({ value: row.value, label: titleCase(row.value) }))} all="Anything" />
          <Select label="Society" value={values.society} onChange={(society) => set({ society })} options={data.societies.map((society) => ({ value: society.id, label: society.name }))} all="All societies" />
          {filtered ? (
            <button type="button" onClick={() => set({ q: null, action: null, entity: null, society: null, event: null })} className="min-h-10 rounded-lg px-3 text-sm font-medium text-primary hover:bg-primary/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              Clear filters
            </button>
          ) : null}
        </div>
        <ActionList rows={data.entries} onOpen={(id) => set({ entry: id }, { keepPage: true })} />
        <Pager page={data.page} pageSize={data.pageSize} total={data.total} busy={busy} onPage={(page) => set({ page: String(page) })} />
      </section>
    </div>
  );
}

function Select({ label, value, onChange, options, all }: { label: string; value: string; onChange: (value: string) => void; options: { value: string; label: string }[]; all: string }) {
  return (
    <label className="flex items-center gap-2 text-sm text-muted-foreground">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className="min-h-10 max-w-[14rem] rounded-lg border bg-card px-2 text-sm text-foreground">
        <option value="">{all}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

const who = (entry: ActionEntry) => entry.actorName || entry.actorEmail || "Not recorded";
const when = (at: string | null) => (at ? `${formatInstantDate(at)}, ${formatInstantTime(at)}` : "—");

function ActionList({ rows, onOpen }: { rows: ActionEntry[]; onOpen: (id: string) => void }) {
  if (!rows.length) return <EmptyState title="No action matches." hint="Try another period or clear the filters." />;
  return (
    <>
      <ul className="mt-2 divide-y divide-border/70 md:hidden">
        {rows.map((row) => (
          <li key={row.id}>
            <button type="button" onClick={() => onOpen(row.id)} className="block w-full py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <span className="block font-medium">{row.summary ?? `${titleCase(row.action)} ${row.entityType.replace(/_/g, " ")}`}</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                {who(row)} · {when(row.at)}
              </span>
              {row.society || row.event ? <span className="block text-xs text-muted-foreground">{[row.society, row.event].filter(Boolean).join(" · ")}</span> : null}
            </button>
          </li>
        ))}
      </ul>
      <div className="mt-2 hidden overflow-x-auto md:block">
        <table className="w-full text-sm">
          <caption className="sr-only">Recorded actions, newest first. Choose one to see what changed.</caption>
          <thead>
            <tr className="border-b border-border/80 text-left text-xs uppercase tracking-[0.08em] text-muted-foreground">
              <th scope="col" className="py-2.5 pr-4 font-semibold">What happened</th>
              <th scope="col" className="px-4 py-2.5 font-semibold">Who</th>
              <th scope="col" className="px-4 py-2.5 font-semibold">Where</th>
              <th scope="col" className="py-2.5 pl-4 font-semibold">When</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-border/60 hover:bg-muted/40">
                <td className="py-2.5 pr-4">
                  <button type="button" onClick={() => onOpen(row.id)} className="text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    <span className="block font-medium hover:underline">{row.summary ?? `${titleCase(row.action)} ${row.entityType.replace(/_/g, " ")}`}</span>
                    <span className="block text-xs text-muted-foreground">
                      {titleCase(row.action)} · {titleCase(row.entityType)}
                    </span>
                  </button>
                </td>
                <td className="px-4 py-2.5">{who(row)}</td>
                <td className="px-4 py-2.5 text-muted-foreground">{[row.society, row.event].filter(Boolean).join(" · ") || "—"}</td>
                <td className="whitespace-nowrap py-2.5 pl-4 text-muted-foreground">{when(row.at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

/* ---------------------------------------------------------------------------------------------------------- */
/* The record of one action                                                                                     */
/* ---------------------------------------------------------------------------------------------------------- */

function show(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string") return value === "" ? "(empty)" : value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

const withheld = "[hidden]";
const isChange = (item: unknown): item is { from?: unknown; to?: unknown } =>
  Boolean(item) && typeof item === "object" && !Array.isArray(item) && ("from" in (item as object) || "to" in (item as object));

/** Before-and-after pairs, where a pair for a withheld field arrives as the single word "[hidden]". */
const isDiff = (value: unknown): value is Record<string, { from?: unknown; to?: unknown } | typeof withheld> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const items = Object.values(value as Record<string, unknown>);
  return items.some(isChange) && items.every((item) => isChange(item) || item === withheld);
};

function ChangesTable({ changes }: { changes: unknown }) {
  if (changes === null || typeof changes !== "object" || !Object.keys(changes as object).length) {
    return <p className="py-3 text-sm text-muted-foreground">No field values were recorded for this action.</p>;
  }
  if (isDiff(changes)) {
    return (
      <div className="overflow-x-auto">
        <table className="mt-2 w-full text-sm">
          <caption className="sr-only">Fields that changed, with their value before and after</caption>
          <thead>
            <tr className="text-left text-xs uppercase tracking-[0.08em] text-muted-foreground">
              <th scope="col" className="py-2 pr-3 font-semibold">Field</th>
              <th scope="col" className="px-3 py-2 font-semibold">Before</th>
              <th scope="col" className="py-2 pl-3 font-semibold">After</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(changes).map(([field, change]) => (
              <tr key={field} className="border-t border-border/70 align-top">
                <th scope="row" className="py-2 pr-3 text-left font-medium">{titleCase(field)}</th>
                {change === withheld ? (
                  <td colSpan={2} className="px-3 py-2 italic text-muted-foreground">Withheld: this field is never shown here</td>
                ) : (
                  <>
                    <td className="break-words px-3 py-2 text-muted-foreground">{show(change.from)}</td>
                    <td className="break-words py-2 pl-3">{show(change.to)}</td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="mt-2 w-full text-sm">
        <caption className="sr-only">Values recorded with this action</caption>
        <tbody>
          {Object.entries(changes as Record<string, unknown>).map(([field, value]) => (
            <tr key={field} className="border-t border-border/70 align-top first:border-t-0">
              <th scope="row" className="w-2/5 py-2 pr-3 text-left font-medium">{titleCase(field)}</th>
              <td className="break-words py-2">{show(value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EntryDrawer({ id, onClose }: { id: string | null; onClose: () => void }) {
  const entry = useAuditEntry(id);
  const link = useSectionLink();
  const set = useListParams(["entry"] as const).set;
  const data = entry.data?.entry;
  return (
    <DetailDrawer open={Boolean(id)} onClose={onClose} title={data ? data.summary ?? `${titleCase(data.action)} ${data.entityType.replace(/_/g, " ")}` : entry.isPending ? "Loading" : "Action"} subtitle={data ? when(data.at) + " IST" : undefined}>
      <QueryState query={entry} skeleton={<DrawerSkeleton />} errorMessage="This action could not be loaded." notFound={<EmptyState title="There is no such action." hint="It may have been removed, or the link is wrong." />}>
        {(full) => (
          <div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-4">
              <Fact label="Who" value={<span className="text-base">{full.entry.actorName || full.entry.actorEmail || "Not recorded"}</span>} note={full.entry.actorName ? full.entry.actorEmail : undefined} />
              <Fact label="Did" value={<span className="text-base">{titleCase(full.entry.action)}</span>} note={titleCase(full.entry.entityType)} />
              {full.entry.society ? (
                <Fact
                  label="Society"
                  value={
                    <Link to={link(sectionPath("societies"), { society: full.entry.societyId ?? "" })} className="text-base hover:underline">
                      {full.entry.society}
                    </Link>
                  }
                />
              ) : null}
              {full.entry.event ? (
                <Fact
                  label="Event"
                  value={
                    <Link to={link(sectionPath("events"), { event: full.entry.eventId ?? "" })} className="text-base hover:underline">
                      {full.entry.event}
                    </Link>
                  }
                />
              ) : null}
            </dl>

            <DrawerSection title="What changed">
              <ChangesTable changes={full.changes} />
              {full.hiddenValues ? (
                <p className="mt-3 text-xs text-muted-foreground">
                  {full.hiddenValues} {full.hiddenValues === 1 ? "value was" : "values were"} withheld: phone numbers, flats, payment references, tokens, email and address details are never shown here.
                </p>
              ) : null}
            </DrawerSection>

            {full.sameRequest.length ? (
              <DrawerSection title="Made at the same time">
                <ul className="divide-y divide-border/70">
                  {full.sameRequest.map((item) => (
                    <li key={item.id}>
                      <button type="button" onClick={() => set({ entry: item.id }, { keepPage: true })} className="block w-full py-2.5 text-left text-sm hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                        {item.summary ?? `${titleCase(item.action)} ${item.entityType.replace(/_/g, " ")}`}
                      </button>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-xs text-muted-foreground">One request can change several things; they are recorded together.</p>
              </DrawerSection>
            ) : null}
            <p className="mt-8 text-xs text-muted-foreground">This is a record, not a control: nothing here can be edited, reversed or deleted.</p>
          </div>
        )}
      </QueryState>
    </DetailDrawer>
  );
}

/* ---------------------------------------------------------------------------------------------------------- */
/* Visits                                                                                                       */
/* ---------------------------------------------------------------------------------------------------------- */

function VisitsView({ data, values, set, busy }: { data: VisitsData } & Shared) {
  const days = data.window.days;
  const { length } = data.summary;
  return (
    <div className="space-y-12">
      <p className="max-w-3xl text-sm text-muted-foreground">
        Visits are people opening event pages. They are not actions: nothing was changed. Only event pages are recorded, since{" "}
        {formatInstantDate(data.since) ?? "tracking began"}, and no IP address is stored.
      </p>
      <FigureRow>
        <Figure label="Visits" value={formatCount(data.summary.visits.current)} detail={<Change value={data.summary.visits} days={days} />} />
        <Figure label="Signed-in people" value={formatCount(data.summary.people)} detail="Distinct, in this period" />
        <Figure label="Guest visits" value={formatCount(data.summary.guests)} detail="Not signed in" />
        <Figure
          label="Typical length"
          value={length.medianSeconds === null ? "—" : formatDuration(length.medianSeconds)}
          detail={length.measured ? `Median of ${formatCount(length.measured)} of ${formatCount(length.total)} visits` : "No visit lasted long enough to measure"}
        />
      </FigureRow>

      <section aria-labelledby="visits-chart">
        <div id="visits-chart">
          <SectionHeading title="Visits per day" />
        </div>
        <div className="mt-4">
          <TrendChart kind="bar" height={190} name="Visits" points={chartPoints(data.days, data.series.current, data.series.previous, { trackedFrom: data.since?.slice(0, 10) ?? null })} />
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          A visit has no close-out, so its length is measured to the last time the page checked in. Visits that never checked in a second time are left out of the typical length, not counted as zero.
          {data.partial ? " More visits exist than were read; these figures are partial." : ""}
        </p>
      </section>

      <section aria-labelledby="visit-list">
        <div id="visit-list">
          <SectionHeading title="Every visit" aside={<span className="text-xs text-muted-foreground">Newest first</span>} />
        </div>
        <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center">
          <Choices
            label="Who"
            value={data.filters.who}
            onChange={(next) => set({ who: next })}
            options={[
              { value: "all", label: "Everyone" },
              { value: "signed_in", label: "Signed in" },
              { value: "guests", label: "Guests" },
            ]}
          />
          <Select label="Event" value={values.event} onChange={(event) => set({ event })} options={data.events.map((event) => ({ value: event.id, label: event.name }))} all="All events" />
        </div>
        <VisitList rows={data.visits} />
        <Pager page={data.page} pageSize={data.pageSize} total={data.total} busy={busy} onPage={(page) => set({ page: String(page) })} />
      </section>
    </div>
  );
}

function VisitList({ rows }: { rows: VisitsData["visits"] }) {
  if (!rows.length) return <EmptyState title="No visit matches." hint="Try another period or filter." />;
  return (
    <>
      <ul className="mt-2 divide-y divide-border/70 md:hidden">
        {rows.map((row) => (
          <li key={row.id} className="py-3">
            <p className="font-medium">{row.event ?? "An event that no longer exists"}</p>
            <p className="text-xs text-muted-foreground">
              {row.person ?? "Guest"} · {when(row.startedAt)}
            </p>
            <p className="text-xs text-muted-foreground">{[formatDuration(row.seconds), row.pages ? `${row.pages} ${row.pages === 1 ? "page" : "pages"}` : null, [row.device, row.browser].filter(Boolean).join(" · ")].filter((part) => part && part !== "—").join(" · ")}</p>
          </li>
        ))}
      </ul>
      <div className="mt-2 hidden overflow-x-auto md:block">
        <table className="w-full text-sm">
          <caption className="sr-only">Visits to event pages, newest first</caption>
          <thead>
            <tr className="border-b border-border/80 text-left text-xs uppercase tracking-[0.08em] text-muted-foreground">
              <th scope="col" className="py-2.5 pr-4 font-semibold">Event</th>
              <th scope="col" className="px-4 py-2.5 font-semibold">Who</th>
              <th scope="col" className="px-4 py-2.5 font-semibold">Started</th>
              <th scope="col" className="px-4 py-2.5 text-right font-semibold">Length</th>
              <th scope="col" className="px-4 py-2.5 text-right font-semibold">Pages</th>
              <th scope="col" className="py-2.5 pl-4 font-semibold">Device</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-border/60 hover:bg-muted/40">
                <td className="py-2.5 pr-4">
                  <span className="block font-medium">{row.event ?? "An event that no longer exists"}</span>
                  {row.society ? <span className="block text-xs text-muted-foreground">{row.society}</span> : null}
                </td>
                <td className="px-4 py-2.5">{row.person ?? <span className="text-muted-foreground">Guest</span>}</td>
                <td className="whitespace-nowrap px-4 py-2.5 text-muted-foreground">{when(row.startedAt)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{formatDuration(row.seconds)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{row.pages ?? "—"}</td>
                <td className="py-2.5 pl-4 text-muted-foreground">{[row.device, row.browser].filter(Boolean).join(" · ") || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

/* ---------------------------------------------------------------------------------------------------------- */
/* Access attempts                                                                                              */
/* ---------------------------------------------------------------------------------------------------------- */

function AccessView({ data, set, busy }: { data: AccessData; set: ListState["set"]; busy: boolean }) {
  return (
    <div className="space-y-12">
      <p className="max-w-3xl text-sm text-muted-foreground">
        Signed-in people who opened this area, or were refused at it. At most one entry per person per five minutes. A visitor who is not signed in is never recorded here, so a stranger cannot fill this list; those attempts are in the Vercel function log only. No address or device is stored.
      </p>
      <FigureRow columns={3}>
        <Figure label="You opened it" value={formatCount(data.summary.allowed)} detail="Entries in this period" />
        <Figure label="Refused" value={formatCount(data.summary.refused)} detail={data.summary.refused ? `${formatCount(data.summary.refusedPeople)} ${data.summary.refusedPeople === 1 ? "person" : "people"}` : "Nobody else tried"} />
        <Figure label="Recording since" value={formatInstantDate(data.since) ?? "—"} detail={data.since ? "Earlier attempts are not here" : "Nothing recorded yet"} />
      </FigureRow>

      <section aria-labelledby="attempts-heading">
        <div id="attempts-heading">
          <SectionHeading title="Attempts" aside={<span className="text-xs text-muted-foreground">Newest first</span>} />
        </div>
        <div className="mt-4">
          <Choices
            label="Outcome"
            value={data.filters.outcome}
            onChange={(next) => set({ outcome: next })}
            options={[
              { value: "all", label: "All" },
              { value: "allowed", label: "Opened" },
              { value: "refused", label: "Refused" },
            ]}
          />
        </div>
        {data.attempts.length ? (
          <ul className="mt-2 divide-y divide-border/70">
            {data.attempts.map((attempt) => (
              <li key={attempt.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3 text-sm">
                <span className="min-w-0">
                  <span className="font-medium">{attempt.person ?? "Unknown"}</span>
                  {attempt.part ? <span className="text-muted-foreground"> · asked for {attempt.part}</span> : null}
                </span>
                <span className="flex items-center gap-4">
                  <span className="inline-flex items-center gap-2">
                    <span aria-hidden="true" className={cn("h-2 w-2 rounded-full", attempt.outcome === "allowed" ? "bg-primary" : "bg-destructive")} />
                    {attempt.outcome === "allowed" ? "Opened" : "Refused"}
                  </span>
                  <span className="whitespace-nowrap text-muted-foreground">{when(attempt.at)}</span>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="No attempt in this period." hint="Only signed-in people are recorded." />
        )}
        <Pager page={data.page} pageSize={data.pageSize} total={data.total} busy={busy} onPage={(page) => set({ page: String(page) })} />
      </section>
    </div>
  );
}
