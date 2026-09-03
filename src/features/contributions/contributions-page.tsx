import { useQueryClient } from "@tanstack/react-query";
import { CirclePlus, Download, HandCoins, Home, Wallet } from "lucide-react";
import { FormEvent, useState } from "react";
import { DataSourceBadge } from "@/components/shared/data-source-badge";
import { FormField } from "@/components/shared/form-field";
import { StatusBadge } from "@/components/shared/status-badge";
import { StatCard } from "@/components/shared/stat-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { commonExpectedAmount } from "@/lib/contribution-payments";
import { useEventContext } from "@/lib/event-context";
import { ContributionRow, getFirstEventId, useEventData } from "@/lib/event-data";
import { usePageAccess } from "@/lib/page-access";
import { supabase } from "@/lib/supabase";
import { formatCurrency } from "@/lib/utils";
import { ContributeButton } from "@/features/contributions/contribute-dialog";
import { PendingPaymentsPanel } from "@/features/contributions/pending-payments-panel";
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
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" }).format(parsed);
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
  const { selectedEventId } = useEventContext();
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

  const expectedPerFlat = commonExpectedAmount(contributionRows);

  const visibleExpected = visibleRows.reduce((sum, row) => sum + row.expected, 0);
  const visibleReceived = visibleRows.reduce((sum, row) => sum + row.received, 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Contributions</h2>
          <p className="text-sm text-muted-foreground">
            Track resident interest, expected amount, collections, and payment mode.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DataSourceBadge source={data.source} reason={data.fallbackReason} isLoading={isFetching} />
          <ContributeButton
            eventId={selectedEventId}
            eventName={data.event.name}
            expectedPerFlat={expectedPerFlat}
          />
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
            Export CSV
          </Button>
        </div>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Total Flats"
          value={String(contributionRows.length)}
          countTo={contributionRows.length}
          format={(count) => String(count)}
          icon={Home}
          note={contributionRows.length ? `${paidCount} have paid` : undefined}
        />
        <StatCard
          title="Expected"
          value={formatCurrency(expected)}
          countTo={expected}
          format={formatCurrency}
          icon={Wallet}
        />
        <StatCard
          title="Received"
          value={formatCurrency(received)}
          countTo={received}
          format={formatCurrency}
          icon={HandCoins}
          note={expected > 0 ? `${collectedPercent}% of expected` : undefined}
        />
        <StatCard
          title="Additional Contribution"
          value={formatCurrency(additionalContribution)}
          countTo={additionalContribution}
          format={formatCurrency}
          icon={CirclePlus}
          note={
            overPayers.length
              ? `${overPayers.length} resident${overPayers.length > 1 ? "s" : ""} paid above expected`
              : "No one has paid above expected"
          }
        />
      </section>

      <PendingPaymentsPanel eventId={selectedEventId} canEdit={access.canEdit} />

      <PageTools
        searchValue={contributionTable.search}
        onSearchChange={contributionTable.setSearch}
        searchPlaceholder="Search flat, resident, mode…"
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
      <div className="space-y-3 lg:hidden">
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
            <Card key={rowKey(row, index)} className="animate-fade-up" style={staggerStyle(index)}>
              <CardContent className="space-y-3 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{row.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {row.flat}
                      {row.type ? ` · ${row.type}` : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <StatusBadge status={row.status} />
                    {row.id && access.canEdit ? <ContributionActions contribution={row} /> : null}
                  </div>
                </div>
                <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
                  <div>
                    <dt className="text-xs text-muted-foreground">Expected</dt>
                    <dd className="font-medium tabular-nums">{formatCurrency(row.expected)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Received</dt>
                    <dd className="font-medium tabular-nums">{formatCurrency(row.received)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Payment date</dt>
                    <dd className="tabular-nums">{formatPaymentDate(row.paymentDate)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Mode</dt>
                    <dd>{row.mode && row.mode !== "-" ? row.mode : "—"}</dd>
                  </div>
                </dl>
              </CardContent>
            </Card>
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
                  <td className="px-4 py-3 tabular-nums">{row.flat}</td>
                  <td className="px-4 py-3 font-medium">{row.name}</td>
                  <td className="px-4 py-3">{row.type}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatCurrency(row.expected)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatCurrency(row.received)}</td>
                  <td className="px-4 py-3 whitespace-nowrap tabular-nums">{formatPaymentDate(row.paymentDate)}</td>
                  <td className="px-4 py-3">{row.mode && row.mode !== "-" ? row.mode : "—"}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={row.status} />
                  </td>
                  <td className="px-4 py-3">{row.id && access.canEdit ? <ContributionActions contribution={row} /> : null}</td>
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
