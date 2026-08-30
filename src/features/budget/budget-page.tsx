import { useQueryClient } from "@tanstack/react-query";
import { Calculator } from "lucide-react";
import { DataSourceBadge } from "@/components/shared/data-source-badge";
import { FormField } from "@/components/shared/form-field";
import { StatCard } from "@/components/shared/stat-card";
import { Card } from "@/components/ui/card";
import { getFirstEventId, useEventData } from "@/lib/event-data";
import { usePageAccess } from "@/lib/page-access";
import { supabase } from "@/lib/supabase";
import { formatCurrency } from "@/lib/utils";
import { CrudDialog, formNumber, formString } from "@/features/shared/crud-dialog";
import { PageTools } from "@/features/shared/page-tools";
import { RowActions } from "@/features/shared/row-actions";

export function BudgetPage() {
  const { data } = useEventData();
  const access = usePageAccess("budget");
  const queryClient = useQueryClient();
  const budgetRows = data.budgets;
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
          <DataSourceBadge source={data.source} />
        </div>
      </div>
      <section className="grid gap-3 sm:grid-cols-3">
        <StatCard title="Estimated" value={formatCurrency(estimated)} icon={Calculator} />
        <StatCard title="Actual" value={formatCurrency(actual)} icon={Calculator} />
        <StatCard title="Variance" value={formatCurrency(estimated - actual)} icon={Calculator} />
      </section>
      <PageTools
        action={
          access.canEdit ? <CrudDialog title="Add Budget Item" triggerLabel="Add Budget Item" onSubmit={addBudgetItem}>
            <FormField label="Category" name="category" required />
            <FormField label="Item" name="item" required />
            <FormField label="Quantity" name="qty" type="number" defaultValue={1} />
            <FormField label="Unit" name="unit" defaultValue="lot" />
            <FormField label="Unit Cost" name="unitCost" type="number" defaultValue={0} />
            <FormField label="Actual Cost" name="actual" type="number" defaultValue={0} />
            <FormField label="Funding Type" name="fundingType" defaultValue="Common Fund" />
            <FormField label="Status" name="status" defaultValue="Planned" />
          </CrudDialog> : <span className="text-sm text-muted-foreground">View-only access</span>
        }
      />
      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted text-left text-muted-foreground">
            <tr>
              {["Category", "Item", "Qty", "Unit Cost", "Estimated", "Actual", "Variance", ""].map((head) => (
                <th key={head} className="px-4 py-3 font-medium">{head}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {budgetRows.map((row) => {
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
                  <td className="px-4 py-3">
                    {row.id && access.canEdit ? (
                      <RowActions
                        onEdit={async () => {
                          const actual = window.prompt("Actual cost", String(row.actual));
                          if (actual === null) return;
                          await updateBudget(row.id!, Number(actual));
                          await queryClient.invalidateQueries({ queryKey: ["event-data"] });
                        }}
                        onDelete={async () => {
                          if (!window.confirm("Delete this budget item?")) return;
                          await deleteBudget(row.id!);
                          await queryClient.invalidateQueries({ queryKey: ["event-data"] });
                        }}
                      />
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

async function updateBudget(id: string, actualCost: number) {
  if (!supabase) throw new Error("Supabase is not configured");
  const { error } = await supabase.from("budgets").update({ actual_cost: actualCost }).eq("id", id);
  if (error) throw error;
}

async function deleteBudget(id: string) {
  if (!supabase) throw new Error("Supabase is not configured");
  const { error } = await supabase.from("budgets").delete().eq("id", id);
  if (error) throw error;
}
