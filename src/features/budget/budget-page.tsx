import { useQueryClient } from "@tanstack/react-query";
import { Calculator, HandCoins, Scale } from "lucide-react";
import { FormEvent, useState } from "react";
import { DataSourceBadge } from "@/components/shared/data-source-badge";
import { FormField } from "@/components/shared/form-field";
import { StatCard } from "@/components/shared/stat-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BudgetRow, getFirstEventId, useEventData } from "@/lib/event-data";
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

const budgetColumns: TableColumn<BudgetRow>[] = [
  { key: "category", label: "Category", getValue: (row) => row.category },
  { key: "item", label: "Item", getValue: (row) => row.item },
  { key: "qty", label: "Qty", getValue: (row) => row.qty },
  { key: "unit", label: "Unit", getValue: (row) => row.unit },
  { key: "unitCost", label: "Unit Cost", getValue: (row) => row.unitCost },
  { key: "estimated", label: "Estimated", getValue: (row) => row.qty * row.unitCost },
  { key: "actual", label: "Actual", getValue: (row) => row.actual },
  { key: "variance", label: "Variance", getValue: (row) => row.qty * row.unitCost - row.actual },
  { key: "fundingType", label: "Funding Type", getValue: (row) => row.fundingType },
  { key: "status", label: "Status", getValue: (row) => row.status },
];

function BudgetFields({ budget }: { budget?: BudgetRow }) {
  return (
    <>
      <FormField label="Category" name="category" defaultValue={budget?.category} required />
      <FormField label="Item" name="item" defaultValue={budget?.item} required />
      <FormField label="Quantity" name="qty" type="number" defaultValue={budget?.qty ?? 1} />
      <FormField label="Unit" name="unit" defaultValue={budget?.unit ?? "lot"} />
      <FormField label="Unit Cost" name="unitCost" type="number" defaultValue={budget?.unitCost ?? 0} />
      <FormField label="Actual Cost" name="actual" type="number" defaultValue={budget?.actual ?? 0} />
      <FormField label="Funding Type" name="fundingType" defaultValue={budget?.fundingType ?? "Common Fund"} />
      <FormField label="Status" name="status" defaultValue={budget?.status ?? "Planned"} />
    </>
  );
}

export function BudgetPage() {
  const { data } = useEventData();
  const access = usePageAccess("budget");
  const budgetRows = data.budgets;
  const budgetTable = useFilteredSortedRows(budgetRows, budgetColumns, "category");
  const estimated = budgetRows.reduce((sum, row) => sum + row.qty * row.unitCost, 0);
  const actual = budgetRows.reduce((sum, row) => sum + row.actual, 0);

  return (
    <div className="space-y-5">
      <div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-2xl font-semibold">Budget</h2>
            <p className="text-sm text-muted-foreground">Plan category-wise costs and compare estimates against actuals.</p>
          </div>
          <DataSourceBadge source={data.source} reason={data.fallbackReason} />
        </div>
      </div>
      <section className="grid gap-3 sm:grid-cols-3">
        <StatCard title="Estimated" value={formatCurrency(estimated)} icon={Calculator} />
        <StatCard title="Actual" value={formatCurrency(actual)} icon={HandCoins} />
        <StatCard title="Variance" value={formatCurrency(estimated - actual)} icon={Scale} />
      </section>
      <PageTools
        action={
          access.canEdit ? <CrudDialog title="Add Budget Item" triggerLabel="Add Budget Item" onSubmit={addBudgetItem}>
            <BudgetFields />
          </CrudDialog> : <span className="text-sm text-muted-foreground">View-only access</span>
        }
      />
      <Card className="overflow-x-auto">
        <TableToolbar
          resultCount={budgetTable.rows.length}
          totalCount={budgetRows.length}
        />
        <table className="min-w-[1100px] w-full text-sm">
          <thead className="bg-muted text-left text-muted-foreground">
            <tr>
              {budgetColumns.filter((column) => column.key !== "unit").map((column) => (
                <th key={column.key} className="px-4 py-3 font-medium">
                  <SortableHeader
                    label={column.label}
                    columnKey={column.key}
                    sortKey={budgetTable.sortKey}
                    sortDirection={budgetTable.sortDirection}
                    onSort={budgetTable.toggleSort}
                  />
                  <ColumnFilter
                    column={column}
                    rows={budgetRows}
                    filters={budgetTable.filters}
                    onFilterChange={budgetTable.setColumnFilter}
                  />
                </th>
              ))}
              <th className="px-4 py-3 font-medium" />
            </tr>
          </thead>
          <tbody>
            {budgetTable.rows.map((row) => {
              const est = row.qty * row.unitCost;
              return (
                <tr key={row.item} className="border-t">
                  <td className="px-4 py-3">{row.category}</td>
                  <td className="px-4 py-3 font-medium">{row.item}</td>
                  <td className="px-4 py-3">{row.qty} {row.unit}</td>
                  <td className="px-4 py-3">{formatCurrency(row.unitCost)}</td>
                  <td className="px-4 py-3">{formatCurrency(est)}</td>
                  <td className="px-4 py-3">{formatCurrency(row.actual)}</td>
                  <td className="px-4 py-3">{formatCurrency(est - row.actual)}</td>
                  <td className="px-4 py-3">{row.fundingType}</td>
                  <td className="px-4 py-3"><StatusBadge status={row.status} /></td>
                  <td className="px-4 py-3">
                    {row.id && access.canEdit ? (
                      <BudgetActions budget={row} />
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function BudgetActions({ budget }: { budget: BudgetRow }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);

    try {
      await updateBudget(budget.id!, new FormData(event.currentTarget));
      await queryClient.invalidateQueries({ queryKey: ["event-data"] });
      setOpen(false);
    } catch (item) {
      setError(item instanceof Error ? item.message : "Unable to update budget item");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <RowActions
        onEdit={() => setOpen(true)}
        onDelete={async () => {
          if (!window.confirm("Delete this budget item?")) return;
          await deleteBudget(budget.id!);
          await queryClient.invalidateQueries({ queryKey: ["event-data"] });
        }}
      />
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Budget Item</DialogTitle>
          </DialogHeader>
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="grid gap-4 sm:grid-cols-2">
              <BudgetFields budget={budget} />
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

async function addBudgetItem(formData: FormData) {
  if (!supabase) throw new Error("Supabase is not configured");
  const eventId = await getFirstEventId();
  const { error } = await supabase.from("budgets").insert({
    event_id: eventId,
    category: formString(formData, "category"),
    item: formString(formData, "item"),
    estimated_qty: formNumber(formData, "qty"),
    unit: formString(formData, "unit"),
    unit_cost: formNumber(formData, "unitCost"),
    actual_cost: formNumber(formData, "actual"),
    funding_type: formString(formData, "fundingType"),
    status: formString(formData, "status", "Planned"),
  });

  if (error) throw error;
}

async function updateBudget(id: string, formData: FormData) {
  if (!supabase) throw new Error("Supabase is not configured");
  const { error } = await supabase
    .from("budgets")
    .update({
      category: formString(formData, "category"),
      item: formString(formData, "item"),
      estimated_qty: formNumber(formData, "qty"),
      unit: formString(formData, "unit"),
      unit_cost: formNumber(formData, "unitCost"),
      actual_cost: formNumber(formData, "actual"),
      funding_type: formString(formData, "fundingType"),
      status: formString(formData, "status", "Planned"),
    })
    .eq("id", id);
  if (error) throw error;
}

async function deleteBudget(id: string) {
  if (!supabase) throw new Error("Supabase is not configured");
  const { error } = await supabase.from("budgets").delete().eq("id", id);
  if (error) throw error;
}
