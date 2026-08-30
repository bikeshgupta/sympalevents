import { useQueryClient } from "@tanstack/react-query";
import { HeartHandshake } from "lucide-react";
import { FormEvent, useState } from "react";
import { DataSourceBadge } from "@/components/shared/data-source-badge";
import { FormField } from "@/components/shared/form-field";
import { StatusBadge } from "@/components/shared/status-badge";
import { StatCard } from "@/components/shared/stat-card";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getFirstEventId, SponsorRow, useEventData } from "@/lib/event-data";
import { usePageAccess } from "@/lib/page-access";
import { supabase } from "@/lib/supabase";
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

const sponsorColumns: TableColumn<SponsorRow>[] = [
  { key: "name", label: "Sponsor", getValue: (row) => row.name },
  { key: "flat", label: "Flat", getValue: (row) => row.flat },
  { key: "category", label: "Category", getValue: (row) => row.category },
  { key: "item", label: "Item/Slot", getValue: (row) => row.item },
  { key: "committed", label: "Committed", getValue: (row) => row.committed },
  { key: "received", label: "Received", getValue: (row) => row.received },
  { key: "inKind", label: "In-kind", getValue: (row) => row.inKind },
  { key: "status", label: "Status", getValue: (row) => row.status },
];

export function SponsorsPage() {
  const { data } = useEventData();
  const access = usePageAccess("sponsors");
  const sponsorRows = data.sponsors;
  const sponsorTable = useFilteredSortedRows(sponsorRows, sponsorColumns, "name");
  const committed = sponsorRows.reduce((sum, row) => sum + row.committed, 0);
  const received = sponsorRows.reduce((sum, row) => sum + row.received, 0);

  return (
    <div className="space-y-5">
      <div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-2xl font-semibold">Sponsors</h2>
            <p className="text-sm text-muted-foreground">Manage monetary and in-kind sponsorship commitments.</p>
          </div>
          <DataSourceBadge source={data.source} reason={data.fallbackReason} />
        </div>
      </div>
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Committed" value={formatCurrency(committed)} icon={HeartHandshake} />
        <StatCard title="Received" value={formatCurrency(received)} icon={HeartHandshake} />
        <StatCard title="Outstanding" value={formatCurrency(committed - received)} icon={HeartHandshake} />
        <StatCard title="Sponsors" value={String(sponsorRows.length)} icon={HeartHandshake} />
      </section>
      <PageTools
        action={
          access.canEdit ? <CrudDialog title="Add Sponsor" triggerLabel="Add Sponsor" onSubmit={addSponsor}>
            <FormField label="Sponsor Name" name="name" required />
            <FormField label="Flat No" name="flat" />
            <FormField label="Contact" name="contact" />
            <FormField label="Category" name="category" defaultValue="Other" required />
            <FormField label="Item/Slot" name="item" />
            <FormField label="Committed Amount" name="committed" type="number" defaultValue={0} />
            <FormField label="Received Amount" name="received" type="number" defaultValue={0} />
            <FormField label="Status" name="status" defaultValue="Pending" />
          </CrudDialog> : <span className="text-sm text-muted-foreground">View-only access</span>
        }
      />
      <Card className="overflow-x-auto">
        <TableToolbar
          resultCount={sponsorTable.rows.length}
          totalCount={sponsorRows.length}
        />
        <div className="hidden">
          {sponsorTable.rows.map((row) => (
            <div key={row.name} className="rounded-md border p-4">
              <div className="flex justify-between gap-3">
                <div>
                  <p className="font-medium">{row.name}</p>
                  <p className="text-sm text-muted-foreground">{row.category}{row.inKind ? " · In-kind" : ""}</p>
                </div>
                <StatusBadge status={row.status} />
              </div>
              <p className="mt-3 text-sm">Committed {formatCurrency(row.committed)} · Received {formatCurrency(row.received)}</p>
            </div>
          ))}
        </div>
        <table className="min-w-[1080px] w-full text-sm">
          <thead className="bg-muted text-left text-muted-foreground">
            <tr>
              {sponsorColumns.map((column) => (
                <th key={column.key} className="px-4 py-3 font-medium">
                  <SortableHeader
                    label={column.label}
                    columnKey={column.key}
                    sortKey={sponsorTable.sortKey}
                    sortDirection={sponsorTable.sortDirection}
                    onSort={sponsorTable.toggleSort}
                  />
                  <ColumnFilter
                    column={column}
                    rows={sponsorRows}
                    filters={sponsorTable.filters}
                    onFilterChange={sponsorTable.setColumnFilter}
                  />
                </th>
              ))}
              <th className="px-4 py-3 font-medium" />
            </tr>
          </thead>
          <tbody>
            {sponsorTable.rows.map((row) => (
              <tr key={row.name} className="border-t">
                <td className="px-4 py-3 font-medium">{row.name}</td>
                <td className="px-4 py-3">{row.flat}</td>
                <td className="px-4 py-3">{row.category}</td>
                <td className="px-4 py-3">{row.item}</td>
                <td className="px-4 py-3">{formatCurrency(row.committed)}</td>
                <td className="px-4 py-3">{formatCurrency(row.received)}</td>
                <td className="px-4 py-3">{row.inKind ? "Yes" : "No"}</td>
                <td className="px-4 py-3"><StatusBadge status={row.status} /></td>
                <td className="px-4 py-3">
                  {row.id && access.canEdit ? <SponsorActions sponsor={row} /> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function SponsorActions({ sponsor }: { sponsor: SponsorRow }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  async function handleEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await updateSponsor(sponsor.id!, new FormData(event.currentTarget));
      await queryClient.invalidateQueries({ queryKey: ["event-data"] });
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update sponsor");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <RowActions
        onEdit={() => setOpen(true)}
        onDelete={async () => {
          if (!window.confirm("Delete this sponsor?")) return;
          await deleteRecord("sponsors", sponsor.id!);
          await queryClient.invalidateQueries({ queryKey: ["event-data"] });
        }}
      />
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Sponsor</DialogTitle>
          </DialogHeader>
          <form className="space-y-4" onSubmit={handleEdit}>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Sponsor Name" name="name" defaultValue={sponsor.name} required />
              <FormField label="Flat No" name="flat" defaultValue={sponsor.flat} />
              <FormField label="Contact" name="contact" defaultValue={sponsor.contact} />
              <FormField label="Category" name="category" defaultValue={sponsor.category} required />
              <FormField label="Item/Slot" name="item" defaultValue={sponsor.item} />
              <FormField label="Committed Amount" name="committed" type="number" defaultValue={sponsor.committed} />
              <FormField label="Received Amount" name="received" type="number" defaultValue={sponsor.received} />
              <FormField label="Status" name="status" defaultValue={sponsor.status} />
            </div>
            {error ? <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</p> : null}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

async function addSponsor(formData: FormData) {
  if (!supabase) throw new Error("Supabase is not configured");
  const eventId = await getFirstEventId();
  const { error } = await supabase.from("sponsors").insert({
    event_id: eventId,
    sponsor_name: formString(formData, "name"),
    flat_no: formString(formData, "flat"),
    contact: formString(formData, "contact"),
    category: formString(formData, "category", "Other"),
    item_slot: formString(formData, "item"),
    committed_amount: formNumber(formData, "committed"),
    received_amount: formNumber(formData, "received"),
    status: formString(formData, "status", "Pending"),
  });

  if (error) throw error;
}

async function updateSponsor(id: string, formData: FormData) {
  if (!supabase) throw new Error("Supabase is not configured");
  const { error } = await supabase
    .from("sponsors")
    .update({
      sponsor_name: formString(formData, "name"),
      flat_no: formString(formData, "flat"),
      contact: formString(formData, "contact"),
      category: formString(formData, "category", "Other"),
      item_slot: formString(formData, "item"),
      committed_amount: formNumber(formData, "committed"),
      received_amount: formNumber(formData, "received"),
      status: formString(formData, "status", "Pending"),
    })
    .eq("id", id);
  if (error) throw error;
}

async function deleteRecord(table: "sponsors", id: string) {
  if (!supabase) throw new Error("Supabase is not configured");
  const { error } = await supabase.from(table).delete().eq("id", id);
  if (error) throw error;
}
