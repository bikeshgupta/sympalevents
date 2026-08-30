import { useQueryClient } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { FormEvent, useState } from "react";
import { DataSourceBadge } from "@/components/shared/data-source-badge";
import { FormField } from "@/components/shared/form-field";
import { StatusBadge } from "@/components/shared/status-badge";
import { StatCard } from "@/components/shared/stat-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ContributionRow, getFirstEventId, useEventData } from "@/lib/event-data";
import { usePageAccess } from "@/lib/page-access";
import { supabase } from "@/lib/supabase";
import { formatCurrency } from "@/lib/utils";
import { CrudDialog, formNumber, formString } from "@/features/shared/crud-dialog";
import { PageTools } from "@/features/shared/page-tools";
import { RowActions } from "@/features/shared/row-actions";
import {
  ColumnFilter,
  ColumnFilterPanel,
  SortableHeader,
  TableColumn,
  TableToolbar,
  useFilteredSortedRows,
} from "@/features/shared/table-tools";

function todayDateInputValue() {
  return new Date().toISOString().slice(0, 10);
}

const contributionStatuses = ["Received", "Committed", "Returned"];

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
];

function escapeHtml(value: string | number) {
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
  const csv = [headers, ...bodyRows].map((row) => row.map(escapeHtml).join(",")).join("\r\n");
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
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
      <FormField label="Expected Contribution" name="expected" type="number" defaultValue={contribution?.expected} required />
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
          className="h-10 w-full rounded-md border bg-background px-3 text-sm"
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
  const { data } = useEventData();
  const access = usePageAccess("contributions");
  const queryClient = useQueryClient();
  const contributionRows = data.contributions;
  const contributionTable = useFilteredSortedRows(contributionRows, contributionColumns, "flat");
  const expected = contributionRows.reduce((sum, row) => sum + row.expected, 0);
  const received = contributionRows.reduce((sum, row) => sum + row.received, 0);
  const additionalContribution = Math.max(received - expected, 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Contributions</h2>
          <p className="text-sm text-muted-foreground">Track resident interest, expected amount, collections, and payment mode.</p>
        </div>
        <div className="flex items-center gap-2">
          <DataSourceBadge source={data.source} reason={data.fallbackReason} />
          <Button variant="outline" onClick={() => exportContributionsToCsv(contributionTable.rows)}>
            <Download className="h-4 w-4" />
            Export CSV
          </Button>
        </div>
      </div>
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Total Flats" value={String(contributionRows.length)} icon={Download} />
        <StatCard title="Expected" value={formatCurrency(expected)} icon={Download} />
        <StatCard title="Received" value={formatCurrency(received)} icon={Download} />
        <StatCard title="Additional Contribution" value={formatCurrency(additionalContribution)} icon={Download} />
      </section>
      <PageTools
        action={
          access.canEdit ? <CrudDialog title="Add Contribution" triggerLabel="Add Contribution" onSubmit={addContribution}>
            <ContributionFields />
          </CrudDialog> : <span className="text-sm text-muted-foreground">View-only access</span>
        }
      />
      <div className="hidden">
        <TableToolbar
          resultCount={contributionTable.rows.length}
          totalCount={contributionRows.length}
        />
        <ColumnFilterPanel
          columns={contributionColumns}
          filters={contributionTable.filters}
          onFilterChange={contributionTable.setColumnFilter}
        />
        {contributionTable.rows.map((row) => (
          <Card key={row.flat}>
            <CardContent className="space-y-3 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium">{row.name}</p>
                  <p className="text-sm text-muted-foreground">{row.flat} · {row.type}</p>
                </div>
                <StatusBadge status={row.status} />
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <span>Expected {formatCurrency(row.expected)}</span>
                <span>Received {formatCurrency(row.received)}</span>
                <span>Payment date {row.paymentDate}</span>
                <span>Mode {row.mode}</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card className="overflow-x-auto">
        <TableToolbar
          resultCount={contributionTable.rows.length}
          totalCount={contributionRows.length}
        />
        <table className="min-w-[980px] w-full text-sm">
          <thead className="bg-muted text-left text-muted-foreground">
            <tr>
              {contributionColumns.slice(0, 8).map((column) => (
                <th key={column.key} className="px-4 py-3 font-medium">
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
                </th>
              ))}
              <th className="px-4 py-3 font-medium" />
            </tr>
          </thead>
          <tbody>
            {contributionTable.rows.map((row) => (
              <tr key={row.flat} className="border-t">
                <td className="px-4 py-3">{row.flat}</td>
                <td className="px-4 py-3 font-medium">{row.name}</td>
                <td className="px-4 py-3">{row.type}</td>
                <td className="px-4 py-3">{formatCurrency(row.expected)}</td>
                <td className="px-4 py-3">{formatCurrency(row.received)}</td>
                <td className="px-4 py-3">{row.paymentDate}</td>
                <td className="px-4 py-3">{row.mode}</td>
                <td className="px-4 py-3"><StatusBadge status={row.status} /></td>
                <td className="px-4 py-3">
                  {row.id && access.canEdit ? (
                    <ContributionActions contribution={row} />
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
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
        onEdit={async () => setOpen(true)}
        onDelete={async () => {
          if (!window.confirm("Delete this contribution?")) return;
          await deleteContribution(contribution.id!);
          await queryClient.invalidateQueries({ queryKey: ["event-data"] });
        }}
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
