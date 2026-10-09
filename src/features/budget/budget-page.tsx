import { useQueryClient } from "@tanstack/react-query";
import { Calculator, HandCoins, Plus, Scale } from "lucide-react";
import { useState } from "react";
import { DataSourceBadge } from "@/components/shared/data-source-badge";
import { StatCard, StatGrid } from "@/components/shared/stat-card";
import { formatCurrencyCompact } from "@/features/dashboard/dashboard-utils";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { BudgetRow, useEventData } from "@/lib/event-data";
import { usePageAccess } from "@/lib/page-access";
import { apiFetch } from "@/lib/api";
import { formatCurrency } from "@/lib/utils";
import { BudgetEntrySheet } from "@/features/budget/budget-entry-sheet";
import { PageTools } from "@/features/shared/page-tools";
import { RowActions } from "@/features/shared/row-actions";
import { useVocabulary } from "@/lib/vocabulary";
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

export function BudgetPage() {
  const vocab = useVocabulary();
  const { data } = useEventData();
  const [addOpen, setAddOpen] = useState(false);
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
            <h2 className="text-2xl font-semibold">{vocab.labelFor("budget")}</h2>
            <p className="text-sm text-muted-foreground">Plan category-wise costs and compare estimates against actuals.</p>
          </div>
          <DataSourceBadge source={data.source} reason={data.fallbackReason} />
        </div>
      </div>
      <StatGrid>
        <StatCard title="Estimated" value={formatCurrencyCompact(estimated)} valueTitle={formatCurrency(estimated)} icon={Calculator} />
        <StatCard title="Actual" value={formatCurrencyCompact(actual)} valueTitle={formatCurrency(actual)} icon={HandCoins} />
        <StatCard
          title="Variance"
          value={formatCurrencyCompact(estimated - actual)}
          valueTitle={formatCurrency(estimated - actual)}
          icon={Scale}
        />
      </StatGrid>
      <PageTools
        action={
          access.canEdit ? (
            <>
              <Button type="button" onClick={() => setAddOpen(true)}>
                <Plus className="h-4 w-4" aria-hidden="true" />
                Add Budget Item
              </Button>
              <BudgetEntrySheet open={addOpen} onOpenChange={setAddOpen} rows={budgetRows} />
            </>
          ) : <span className="text-sm text-muted-foreground"></span>
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
      <BudgetEntrySheet open={open} onOpenChange={setOpen} budget={budget} rows={[]} />
    </>
  );
}

async function deleteBudget(id: string) {
  await apiFetch(`/api/events?resource=budgets&id=${encodeURIComponent(id)}`, { method: "DELETE" });
}
