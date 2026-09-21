import { useQueryClient } from "@tanstack/react-query";
import { CirclePlus, Download, HandCoins, Home, TrendingUp, Wallet } from "lucide-react";
import { FormEvent, lazy, Suspense, useMemo, useState } from "react";
import { DataSourceBadge } from "@/components/shared/data-source-badge";
import { FormField } from "@/components/shared/form-field";
import { StatusBadge } from "@/components/shared/status-badge";
import { StatCard, StatGrid } from "@/components/shared/stat-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ContributionRow, SponsorRow, getFirstEventId, useEventData } from "@/lib/event-data";
import { usePageAccess } from "@/lib/page-access";
import { supabase } from "@/lib/supabase";
import {
  buildCollectionSeries,
  collectionStateOn,
  type CollectionDayState,
} from "@/features/contributions/collection-timeline-data";
import { formatCurrencyCompact, formatEventWeekday } from "@/features/dashboard/dashboard-utils";
import { formatCurrency } from "@/lib/utils";
import { CrudDialog, formNumber, formString } from "@/features/shared/crud-dialog";
import { PageTools } from "@/features/shared/page-tools";
import { RowActions } from "@/features/shared/row-actions";
import {
  ColumnFilter,
  SortableHeader,
  TableColumn,
  TableToolbar,
  useFilteredSortedRows,
} from "@/features/shared/table-tools";

/**
 * `recharts` is ~385KB and this is the only thing on Contributions that wants
 * it, so it stays behind its own chunk - the same boundary the auction details
 * panel keeps. A static import here would drag it into the main bundle for
 * every visitor on every screen.
 */
const CollectionTimelineChart = lazy(() =>
  import("@/features/contributions/collection-timeline-chart").then((mod) => ({
    default: mod.CollectionTimelineChart,
  })),
);

function todayDateInputValue() {
  return new Date().toISOString().slice(0, 10);
}

const contributionStatuses = ["Received", "Committed", "Returned"];

/** Standard per-flat contribution, pre-filled when adding a new record. */
const DEFAULT_EXPECTED_CONTRIBUTION = 1000;

/** Renders a stored ISO date for humans; blank/"-" placeholders become an em dash. */
function formatPaymentDate(value: string) {
  if (!value || value === "-") return "—";
  const parsed = new Date(`${value}T00:00:00+05:30`);
  if (Number.isNaN(parsed.getTime())) return value;
  // Parsed at midnight IST, so it has to be read back in IST too - without the
  // timeZone the browser's own zone reformats it and anyone west of India sees
  // the previous day, which the collection timeline above would then contradict.
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  }).format(parsed);
}

function rowKey(row: ContributionRow, index: number) {
  return row.id ?? `${row.flat}-${row.name}-${index}`;
}

/**
 * Staggers the entrance of the first rows so the list feels like it arrives
 * rather than appearing. Capped so a 200-flat society does not wait 7 seconds.
 */
function staggerStyle(index: number) {
  return { animationDelay: `${Math.min(index, 12) * 35}ms` };
}

const contributionColumns: TableColumn<ContributionRow>[] = [
  { key: "flat", label: "Flat", getValue: (row) => row.flat },
  { key: "name", label: "Resident", getValue: (row) => row.name },
  { key: "type", label: "Type", getValue: (row) => row.type },
  { key: "expected", label: "Expected", getValue: (row) => row.expected },
  { key: "received", label: "Received", getValue: (row) => row.received },
  { key: "paymentDate", label: "Payment Date", getValue: (row) => row.paymentDate },
  { key: "mode", label: "Mode", getValue: (row) => row.mode },
  { key: "status", label: "Status", getValue: (row) => row.status },
  { key: "reference", label: "Reference", getValue: (row) => row.reference },
  // Not rendered as a column - it exists so the list can default to newest first.
  { key: "createdAt", label: "Added", getValue: (row) => row.createdAt, searchable: false },
];

const hiddenColumnKeys = new Set(["reference", "createdAt"]);
const visibleColumns = contributionColumns.filter((column) => !hiddenColumnKeys.has(column.key));
const numericColumnKeys = new Set(["expected", "received"]);

// Excel only reads UTF-8 CSV correctly when the file starts with a byte order mark.
const UTF8_BOM = String.fromCharCode(0xfeff);

function escapeCsvValue(value: string | number) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function exportContributionsToCsv(rows: ContributionRow[]) {
  const headers = ["Flat", "Resident", "Type", "Expected", "Received", "Payment Date", "Mode", "Status", "Reference"];
  const bodyRows = rows.map((row) => [
    row.flat,
    row.name,
    row.type,
    row.expected,
    row.received,
    row.paymentDate,
    row.mode,
    row.status,
    row.reference,
  ]);
  const csv = [headers, ...bodyRows].map((row) => row.map(escapeCsvValue).join(",")).join("\r\n");
  const blob = new Blob([`${UTF8_BOM}${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `contributions-${todayDateInputValue()}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function ContributionFields({ contribution }: { contribution?: ContributionRow }) {
  return (
    <>
      <FormField label="Flat No" name="flat" defaultValue={contribution?.flat} required />
      <FormField label="Resident Name" name="name" defaultValue={contribution?.name} required />
      <FormField label="Owner/Tenant" name="type" defaultValue={contribution?.type ?? "Owner"} />
      <FormField
        label="Expected Contribution"
        name="expected"
        type="number"
        defaultValue={contribution?.expected ?? DEFAULT_EXPECTED_CONTRIBUTION}
        required
      />
      <FormField label="Received" name="received" type="number" defaultValue={contribution?.received ?? 0} />
      <FormField
        label="Payment Date"
        name="paymentDate"
        type="date"
        defaultValue={contribution?.paymentDate && contribution.paymentDate !== "-" ? contribution.paymentDate : todayDateInputValue()}
      />
      <FormField label="Payment Mode" name="mode" defaultValue={contribution?.mode && contribution.mode !== "-" ? contribution.mode : "UPI"} />
      <div className="space-y-2">
        <label className="text-sm font-medium" htmlFor={contribution ? `status-${contribution.id}` : "status"}>
          Status
        </label>
        <select
          id={contribution ? `status-${contribution.id}` : "status"}
          name="status"
          className="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          defaultValue={contribution?.status ?? "Received"}
        >
          {contributionStatuses.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>
      </div>
      <FormField label="Reference" name="reference" defaultValue={contribution?.reference} />
    </>
  );
}

export function ContributionsPage() {
  const { data, isFetching } = useEventData();
  const access = usePageAccess("contributions");
  const contributionRows = data.contributions;
  const contributionTable = useFilteredSortedRows(contributionRows, contributionColumns, "createdAt", "desc");
  const visibleRows = contributionTable.rows;

  const expected = contributionRows.reduce((sum, row) => sum + row.expected, 0);
  const received = contributionRows.reduce((sum, row) => sum + row.received, 0);
  // Per-resident overpayment. Summing the aggregate difference instead would net
  // overpayers against underpayers and read zero almost always.
  const overPayers = contributionRows.filter((row) => row.received > row.expected);
  const additionalContribution = overPayers.reduce((sum, row) => sum + (row.received - row.expected), 0);
  const paidCount = contributionRows.filter((row) => row.received > 0).length;
  const collectedPercent = expected > 0 ? Math.round((received / expected) * 100) : 0;

  const visibleExpected = visibleRows.reduce((sum, row) => sum + row.expected, 0);
  const visibleReceived = visibleRows.reduce((sum, row) => sum + row.received, 0);

  return (
    <div className="space-y-4">
      {/* Title and actions share one line at every width - stacking them cost a
          whole row on a phone before anything useful was on screen. */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-xl font-semibold sm:text-2xl">Contributions</h2>
          <p className="text-xs text-muted-foreground sm:text-sm">
            Track resident interest, expected amount, collections, and payment mode.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <DataSourceBadge source={data.source} reason={data.fallbackReason} isLoading={isFetching} />
          <Button
            variant="outline"
            onClick={() => exportContributionsToCsv(visibleRows)}
            disabled={!visibleRows.length}
            title={
              contributionTable.hasActiveFilters
                ? "Exports the rows currently shown"
                : "Exports all contribution rows"
            }
          >
            <Download className="h-4 w-4" />
            {/* The label is what makes the button wide; the icon and its title
                still say what it does on a phone. */}
            <span className="hidden sm:inline">Export CSV</span>
            <span className="sr-only sm:hidden">Export CSV</span>
          </Button>
        </div>
      </div>

      {/* One row at every width. These were one column on a phone - four stacked
          cards, ~380px of screen, before a single resident was visible.
          StatGrid plus compact currency (with the exact figure on the
          `title`, as the UI rules require) get the same four numbers into ~60px. */}
      <StatGrid>
        <StatCard
          title="Flats"
          value={String(contributionRows.length)}
          countTo={contributionRows.length}
          format={(count) => String(count)}
          icon={Home}
          note={contributionRows.length ? `${paidCount} have paid` : undefined}
        />
        <StatCard
          title="Expected"
          value={formatCurrencyCompact(expected)}
          valueTitle={formatCurrency(expected)}
          countTo={expected}
          format={formatCurrencyCompact}
          icon={Wallet}
        />
        <StatCard
          title="Received"
          value={formatCurrencyCompact(received)}
          valueTitle={formatCurrency(received)}
          countTo={received}
          format={formatCurrencyCompact}
          icon={HandCoins}
          note={expected > 0 ? `${collectedPercent}% of expected` : undefined}
        />
        <StatCard
          title="Additional"
          shortTitle="Extra"
          value={formatCurrencyCompact(additionalContribution)}
          valueTitle={formatCurrency(additionalContribution)}
          countTo={additionalContribution}
          format={formatCurrencyCompact}
          icon={CirclePlus}
          note={
            overPayers.length
              ? `${overPayers.length} resident${overPayers.length > 1 ? "s" : ""} paid above expected`
              : "No one has paid above expected"
          }
        />
      </StatGrid>

      <CollectionTimeline
        contributions={contributionRows}
        sponsors={data.sponsors}
        totalBudget={data.financials.totalBudget}
        isLoading={isFetching}
      />

      <PageTools
        inline
        searchValue={contributionTable.search}
        onSearchChange={contributionTable.setSearch}
        searchPlaceholder="Search flat, resident…"
        searchLabel="Search contributions"
        action={
          access.canEdit ? (
            <CrudDialog title="Add Contribution" triggerLabel="Add Contribution" onSubmit={addContribution}>
              <ContributionFields />
            </CrudDialog>
          ) : (
            <span className="text-sm text-muted-foreground">View-only access</span>
          )
        }
      />

      {/* Mobile: a card per resident. The desktop table is 980px wide and unusable on a phone. */}
      <div className="space-y-1.5 lg:hidden">
        <TableToolbar
          resultCount={visibleRows.length}
          totalCount={contributionRows.length}
          label="flats"
          hasActiveFilters={contributionTable.hasActiveFilters}
          onClearFilters={contributionTable.clearFilters}
          sortNote={contributionTable.isDefaultSort ? "Newest first" : undefined}
        />
        {visibleRows.length ? (
          visibleRows.map((row, index) => (
            <ContributionCard
              key={rowKey(row, index)}
              row={row}
              index={index}
              canEdit={access.canEdit}
            />
          ))
        ) : (
          <EmptyState hasRows={contributionRows.length > 0} onClearFilters={contributionTable.clearFilters} />
        )}
      </div>

      {/* Desktop: the full table. */}
      <Card className="hidden overflow-x-auto lg:block">
        <TableToolbar
          resultCount={visibleRows.length}
          totalCount={contributionRows.length}
          label="flats"
          hasActiveFilters={contributionTable.hasActiveFilters}
          onClearFilters={contributionTable.clearFilters}
          sortNote={contributionTable.isDefaultSort ? "Newest first" : undefined}
        />
        <table className="w-full min-w-[980px] text-sm">
          <thead className="bg-muted text-left text-muted-foreground">
            <tr>
              {visibleColumns.map((column) => {
                const isNumeric = numericColumnKeys.has(column.key);
                return (
                  <th
                    key={column.key}
                    scope="col"
                    className={`px-4 py-3 font-medium ${isNumeric ? "text-right" : ""}`}
                  >
                    <span className={`inline-flex items-center ${isNumeric ? "justify-end" : ""}`}>
                      <SortableHeader
                        label={column.label}
                        columnKey={column.key}
                        sortKey={contributionTable.sortKey}
                        sortDirection={contributionTable.sortDirection}
                        onSort={contributionTable.toggleSort}
                      />
                      <ColumnFilter
                        column={column}
                        rows={contributionRows}
                        filters={contributionTable.filters}
                        onFilterChange={contributionTable.setColumnFilter}
                      />
                    </span>
                  </th>
                );
              })}
              <th scope="col" className="px-4 py-3 font-medium">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.length ? (
              visibleRows.map((row, index) => (
                <tr
                  key={rowKey(row, index)}
                  className="animate-fade-in border-t transition-colors hover:bg-muted/40"
                  style={staggerStyle(index)}
                >
                  <td className="px-4 py-2 tabular-nums">{row.flat}</td>
                  <td className="px-4 py-2 font-medium">{row.name}</td>
                  <td className="px-4 py-2">{row.type}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{formatCurrency(row.expected)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{formatCurrency(row.received)}</td>
                  <td className="px-4 py-2 whitespace-nowrap tabular-nums">{formatPaymentDate(row.paymentDate)}</td>
                  <td className="px-4 py-2">{row.mode && row.mode !== "-" ? row.mode : "—"}</td>
                  <td className="px-4 py-2">
                    <StatusBadge status={row.status} />
                  </td>
                  <td className="px-4 py-1">{row.id && access.canEdit ? <ContributionActions contribution={row} /> : null}</td>
                </tr>
              ))
            ) : (
              <tr className="border-t">
                <td colSpan={visibleColumns.length + 1} className="px-4 py-10">
                  <EmptyState hasRows={contributionRows.length > 0} onClearFilters={contributionTable.clearFilters} />
                </td>
              </tr>
            )}
          </tbody>
          {visibleRows.length ? (
            <tfoot>
              <tr className="border-t bg-muted/60 font-medium">
                <td className="px-4 py-3" colSpan={3}>
                  {contributionTable.hasActiveFilters ? "Total (filtered)" : "Total"}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">{formatCurrency(visibleExpected)}</td>
                <td className="px-4 py-3 text-right tabular-nums">{formatCurrency(visibleReceived)}</td>
                <td className="px-4 py-3" colSpan={4} />
              </tr>
            </tfoot>
          ) : null}
        </table>
      </Card>
    </div>
  );
}

/**
 * How the collection grew, and where it stood on any one day.
 *
 * Contributions and sponsorships stack onto a single running total, against
 * the event's budget, because "have we raised enough" is one question and not
 * two. Picking a date answers the committee's other question - what came in
 * that day, what we had by then, and how far short of the budget that left us.
 *
 * The chart itself is lazy: it is the only thing on this page that needs
 * `recharts`, and everything around it (the day's figures, the empty state)
 * renders from `buildCollectionSeries` while that chunk loads.
 */
function CollectionTimeline({
  contributions,
  sponsors,
  totalBudget,
  isLoading,
}: {
  contributions: ContributionRow[];
  sponsors: SponsorRow[];
  totalBudget: number;
  isLoading: boolean;
}) {
  const series = useMemo(() => buildCollectionSeries(contributions, sponsors), [contributions, sponsors]);
  const points = series.points;
  const latestDate = points.length ? points[points.length - 1].date : "";
  // Null means "follow the latest collection day", so the panel keeps up as
  // money comes in instead of pinning itself to whatever was latest on mount.
  const [pickedDate, setPickedDate] = useState<string | null>(null);
  const selectedDate = pickedDate ?? latestDate;
  const state = useMemo(
    () => (points.length ? collectionStateOn(points, selectedDate, totalBudget) : null),
    [points, selectedDate, totalBudget],
  );

  return (
    <Card>
      <CardHeader className="gap-1 p-4 pb-2 sm:p-5 sm:pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" aria-hidden="true" />
            Collection Timeline
          </CardTitle>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-chart-collected" aria-hidden="true" />
              Collected
            </span>
            {totalBudget > 0 ? (
              <span className="flex items-center gap-1.5">
                {/* Dashed, matching the line it labels. */}
                <span
                  className="h-0.5 w-4 rounded-sm bg-chart-budget"
                  style={{
                    background:
                      "repeating-linear-gradient(90deg, hsl(var(--chart-budget)) 0 5px, transparent 5px 9px)",
                  }}
                  aria-hidden="true"
                />
                Budget
              </span>
            ) : null}
          </div>
        </div>
        <p className="text-xs text-muted-foreground sm:text-sm">
          Contributions and sponsorships added up day by day, against the budget. Pick a date to see where
          the collection stood.
        </p>
      </CardHeader>
      <CardContent className="space-y-3 p-4 pt-0 sm:p-5 sm:pt-0">
        {isLoading && !points.length ? (
          <div className="h-48 animate-pulse rounded-md bg-muted sm:h-64" aria-hidden="true" />
        ) : !points.length ? (
          <div className="rounded-md bg-muted p-6 text-center">
            <p className="text-sm font-medium">Nothing collected yet.</p>
            <p className="mt-1 text-sm text-muted-foreground">
              The timeline draws itself once a contribution or a sponsorship is recorded with a date.
            </p>
          </div>
        ) : (
          <>
            <Suspense fallback={<div className="h-48 animate-pulse rounded-md bg-muted sm:h-64" aria-hidden="true" />}>
              <CollectionTimelineChart
                points={points}
                totalBudget={totalBudget}
                selectedDate={selectedDate}
                onSelectDate={setPickedDate}
              />
            </Suspense>

            <div className="flex flex-wrap items-end gap-2 border-t pt-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground" htmlFor="collection-date">
                  State on
                </label>
                <input
                  id="collection-date"
                  type="date"
                  className="h-10 rounded-md border bg-background px-3 text-sm tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  value={selectedDate}
                  min={points[0].date}
                  max={latestDate}
                  onChange={(event) => setPickedDate(event.target.value || null)}
                />
              </div>
              {pickedDate && pickedDate !== latestDate ? (
                <Button variant="outline" onClick={() => setPickedDate(null)}>
                  Latest
                </Button>
              ) : null}
              <p className="hidden flex-1 text-right text-xs text-muted-foreground sm:block">
                Tapping the chart picks a day too.
              </p>
            </div>

            {state ? <CollectionDayFigures state={state} totalBudget={totalBudget} /> : null}

            {series.undated > 0 ? (
              <p className="text-xs text-muted-foreground">
                {formatCurrency(series.undated)} across {series.undatedRows}{" "}
                {series.undatedRows === 1 ? "record" : "records"} carries no date, so it is in the page totals
                above but not on this chart.
              </p>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * The selected day in four figures. One row at every width, like the page's
 * stat tiles - the point of this strip is comparing the four, and stacking
 * them on a phone turns one glance into a scroll.
 */
function CollectionDayFigures({ state, totalBudget }: { state: CollectionDayState; totalBudget: number }) {
  const ahead = state.shortfall <= 0;

  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground">
        On {formatEventWeekday(state.date)}
      </p>
      <div className="mt-1.5 grid grid-cols-4 gap-2">
        <DayFigure label="Came in" shortLabel="In" value={state.onDay} />
        <DayFigure label="Contributions" shortLabel="Contrib." value={state.contributions} />
        <DayFigure label="Sponsors" shortLabel="Spons." value={state.sponsors} />
        <DayFigure
          label="Collected"
          shortLabel="Total"
          value={state.total}
          note={totalBudget > 0 ? `${state.percentOfBudget}% of budget` : undefined}
        />
      </div>
      {totalBudget > 0 ? (
        <p className="mt-2 rounded-md bg-muted px-3 py-2 text-xs sm:text-sm">
          Against a budget of{" "}
          <span className="font-medium tabular-nums">{formatCurrency(totalBudget)}</span>, that left{" "}
          <span className={`font-semibold tabular-nums ${ahead ? "text-primary" : "text-destructive"}`}>
            {formatCurrency(Math.abs(state.shortfall))}
          </span>{" "}
          {ahead ? "raised above the budget." : "still to raise."}
        </p>
      ) : null}
    </div>
  );
}

function DayFigure({
  label,
  shortLabel,
  value,
  note,
}: {
  label: string;
  shortLabel: string;
  value: number;
  note?: string;
}) {
  return (
    <div className="min-w-0 rounded-md border px-2 py-1.5">
      <p className="truncate text-sm font-semibold tabular-nums sm:text-base" title={formatCurrency(value)}>
        {formatCurrencyCompact(value)}
      </p>
      <p className="truncate text-[11px] font-medium uppercase tracking-wide text-muted-foreground sm:text-xs">
        <span aria-hidden="true" className="sm:hidden">
          {shortLabel}
        </span>
        <span className="sr-only sm:not-sr-only">{label}</span>
      </p>
      {note ? <p className="hidden truncate text-[11px] text-muted-foreground sm:block">{note}</p> : null}
    </div>
  );
}

/**
 * One resident's contribution on a phone, in two rows rather than the six the
 * expected/received/date/mode definition list used to take. The point of this
 * screen is scanning a society's worth of flats, so the card is sized for how
 * many fit on one screen, not for how much each one can hold.
 *
 *   Meera Sharma .............................. R500 of R1,000  [Received]
 *   A-101 - Owner - 12 Sep 2026 - UPI ...................... [edit] [delete]
 *
 * "of R1,000" appears only when received and expected differ, so a fully paid
 * flat reads as one clean number and a shortfall is the thing that stands out.
 */
function ContributionCard({
  row,
  index,
  canEdit,
}: {
  row: ContributionRow;
  index: number;
  canEdit: boolean;
}) {
  const short = row.received !== row.expected;
  const meta = [row.flat, row.type, formatPaymentDate(row.paymentDate), row.mode && row.mode !== "-" ? row.mode : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <Card className="animate-fade-up" style={staggerStyle(index)}>
      <CardContent className="px-3 py-2">
        <div className="flex items-baseline justify-between gap-2">
          <p className="min-w-0 flex-1 truncate text-sm font-medium">{row.name}</p>
          <p className="shrink-0 text-sm tabular-nums">
            <span className="font-semibold">{formatCurrency(row.received)}</span>
            {short ? (
              <span className="text-muted-foreground"> of {formatCurrency(row.expected)}</span>
            ) : null}
          </p>
          <StatusBadge status={row.status} />
        </div>
        <div className="flex items-center justify-between gap-2">
          <p className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{meta}</p>
          {row.id && canEdit ? (
            <div className="-my-1 shrink-0">
              <ContributionActions contribution={row} />
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

function EmptyState({ hasRows, onClearFilters }: { hasRows: boolean; onClearFilters: () => void }) {
  if (hasRows) {
    return (
      <div className="rounded-md bg-muted p-6 text-center">
        <p className="text-sm font-medium">No contributions match the current search or filters.</p>
        <Button variant="outline" size="sm" className="mt-3" onClick={onClearFilters}>
          Clear filters
        </Button>
      </div>
    );
  }

  return (
    <div className="rounded-md bg-muted p-6 text-center">
      <p className="text-sm font-medium">No contributions recorded yet.</p>
      <p className="mt-1 text-sm text-muted-foreground">
        Use Add Contribution to log the first resident payment for this event.
      </p>
    </div>
  );
}

function ContributionActions({ contribution }: { contribution: ContributionRow }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);

    try {
      await updateContribution(contribution, new FormData(event.currentTarget));
      await queryClient.invalidateQueries({ queryKey: ["event-data"] });
      setOpen(false);
    } catch (item) {
      setError(item instanceof Error ? item.message : "Unable to update contribution");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <RowActions
        onEdit={() => setOpen(true)}
        onDelete={async () => {
          if (!window.confirm(`Delete the contribution for ${contribution.flat} (${contribution.name})?`)) return;
          await deleteContribution(contribution.id!);
          await queryClient.invalidateQueries({ queryKey: ["event-data"] });
        }}
        editLabel={`Edit contribution for ${contribution.flat}`}
        deleteLabel={`Delete contribution for ${contribution.flat}`}
      />
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Contribution</DialogTitle>
          </DialogHeader>
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="grid gap-4 sm:grid-cols-2">
              <ContributionFields contribution={contribution} />
            </div>
            {error ? <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</p> : null}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "Saving..." : "Save"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

async function addContribution(formData: FormData) {
  if (!supabase) throw new Error("Supabase is not configured");
  const eventId = await getFirstEventId();

  const { data: resident, error: residentError } = await supabase
    .from("residents")
    .insert({
      event_id: eventId,
      flat_no: formString(formData, "flat"),
      resident_name: formString(formData, "name"),
      resident_type: formString(formData, "type", "Owner"),
      interested: true,
    })
    .select("id")
    .single();

  if (residentError) throw residentError;

  const { error } = await supabase.from("contributions").insert({
    event_id: eventId,
    resident_id: resident.id,
    expected_amount: formNumber(formData, "expected"),
    received_amount: formNumber(formData, "received"),
    received_date: formString(formData, "paymentDate", todayDateInputValue()),
    payment_mode: formString(formData, "mode", "UPI"),
    status: formString(formData, "status", "Received"),
    reference: formString(formData, "reference"),
  });

  if (error) throw error;
}

async function updateContribution(contribution: ContributionRow, formData: FormData) {
  if (!supabase) throw new Error("Supabase is not configured");

  if (contribution.residentId) {
    const { error: residentError } = await supabase
      .from("residents")
      .update({
        flat_no: formString(formData, "flat"),
        resident_name: formString(formData, "name"),
        resident_type: formString(formData, "type", "Owner"),
      })
      .eq("id", contribution.residentId);

    if (residentError) throw residentError;
  }

  const { error } = await supabase
    .from("contributions")
    .update({
      expected_amount: formNumber(formData, "expected"),
      received_amount: formNumber(formData, "received"),
      received_date: formString(formData, "paymentDate", todayDateInputValue()),
      payment_mode: formString(formData, "mode", "UPI"),
      status: formString(formData, "status", "Received"),
      reference: formString(formData, "reference"),
    })
    .eq("id", contribution.id);
  if (error) throw error;
}

async function deleteContribution(id: string) {
  if (!supabase) throw new Error("Supabase is not configured");
  const { error } = await supabase.from("contributions").delete().eq("id", id);
  if (error) throw error;
}
