import { useQueryClient } from "@tanstack/react-query";
import { Banknote, HandCoins, ReceiptText } from "lucide-react";
import { FormEvent, useState } from "react";
import { DataSourceBadge } from "@/components/shared/data-source-badge";
import { FormField } from "@/components/shared/form-field";
import { StatCard } from "@/components/shared/stat-card";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CrudDialog, formNumber, formString } from "@/features/shared/crud-dialog";
import { PageTools } from "@/features/shared/page-tools";
import { RowActions } from "@/features/shared/row-actions";
import { ColumnFilter, SortableHeader, TableColumn, TableToolbar, useFilteredSortedRows } from "@/features/shared/table-tools";
import { ExpenseRow, getFirstEventId, useEventData } from "@/lib/event-data";
import { usePageAccess } from "@/lib/page-access";
import { supabase } from "@/lib/supabase";
import { formatCurrency } from "@/lib/utils";

function todayDateInputValue() {
  return new Date().toISOString().slice(0, 10);
}

const expenseColumns: TableColumn<ExpenseRow>[] = [
  { key: "date", label: "Date", getValue: (row) => row.date },
  { key: "category", label: "Category", getValue: (row) => row.category },
  { key: "item", label: "Item", getValue: (row) => row.item },
  { key: "amount", label: "Amount", getValue: (row) => row.amount },
  { key: "paidBy", label: "Paid By", getValue: (row) => row.paidBy },
  { key: "mode", label: "Mode", getValue: (row) => row.mode },
  { key: "type", label: "Type", getValue: (row) => row.type },
  { key: "sponsored", label: "Sponsored", getValue: (row) => row.sponsored },
  { key: "approvedBy", label: "Approved By", getValue: (row) => row.approvedBy },
];

function ExpenseFields({ expense }: { expense?: ExpenseRow }) {
  return (
    <>
      <FormField label="Date" name="date" type="date" defaultValue={expense?.date && expense.date !== "-" ? expense.date : todayDateInputValue()} required />
      <FormField label="Category" name="category" defaultValue={expense?.category} required />
      <FormField label="Item" name="item" defaultValue={expense?.item} required />
      <FormField label="Amount" name="amount" type="number" defaultValue={expense?.amount ?? 0} required />
      <FormField label="Paid By" name="paidBy" defaultValue={expense?.paidBy} />
      <FormField label="Payment Mode" name="mode" defaultValue={expense?.mode ?? "UPI"} />
      <FormField label="Expense Type" name="type" defaultValue={expense?.type ?? "Purchase"} />
      <FormField label="Approved By" name="approvedBy" defaultValue={expense?.approvedBy} />
      <div className="flex items-center gap-2 pt-7">
        <input id={expense ? `sponsored-${expense.id}` : "sponsored"} name="sponsored" type="checkbox" className="h-4 w-4" defaultChecked={expense?.sponsored ?? false} />
        <label className="text-sm font-medium" htmlFor={expense ? `sponsored-${expense.id}` : "sponsored"}>Sponsored</label>
      </div>
      <FormField label="Notes" name="notes" defaultValue={expense?.notes} />
    </>
  );
}

export function ExpensesPage() {
  const { data } = useEventData();
  const access = usePageAccess("expenses");
  const expenseRows = data.expenses;
  const expenseTable = useFilteredSortedRows(expenseRows, expenseColumns, "date");
  const total = expenseRows.reduce((sum, row) => sum + row.amount, 0);
  const sponsored = expenseRows.filter((row) => row.sponsored).reduce((sum, row) => sum + row.amount, 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Expense Ledger</h2>
          <p className="text-sm text-muted-foreground">Track paid expenses, categories, payment mode, approvals, and sponsorship coverage.</p>
        </div>
        <DataSourceBadge source={data.source} reason={data.fallbackReason} />
      </div>
      <section className="grid gap-3 sm:grid-cols-3">
        <StatCard title="Total Expenses" value={formatCurrency(total)} icon={ReceiptText} />
        <StatCard title="Sponsored" value={formatCurrency(sponsored)} icon={HandCoins} />
        <StatCard title="Records" value={String(expenseRows.length)} icon={Banknote} />
      </section>
      <PageTools
        action={
          access.canEdit ? <CrudDialog title="Add Expense" triggerLabel="Add Expense" onSubmit={addExpense}><ExpenseFields /></CrudDialog> : <span className="text-sm text-muted-foreground">View-only access</span>
        }
      />
      <Card className="overflow-x-auto">
        <TableToolbar resultCount={expenseTable.rows.length} totalCount={expenseRows.length} />
        <table className="min-w-[1120px] w-full text-sm">
          <thead className="bg-muted text-left text-muted-foreground">
            <tr>
              {expenseColumns.map((column) => (
                <th key={column.key} className="px-4 py-3 font-medium">
                  <SortableHeader label={column.label} columnKey={column.key} sortKey={expenseTable.sortKey} sortDirection={expenseTable.sortDirection} onSort={expenseTable.toggleSort} />
                  <ColumnFilter column={column} rows={expenseRows} filters={expenseTable.filters} onFilterChange={expenseTable.setColumnFilter} />
                </th>
              ))}
              <th className="px-4 py-3 font-medium" />
            </tr>
          </thead>
          <tbody>
            {expenseTable.rows.map((expense) => (
              <tr key={expense.id ?? `${expense.date}-${expense.item}`} className="border-t">
                <td className="px-4 py-3">{expense.date}</td>
                <td className="px-4 py-3">{expense.category}</td>
                <td className="px-4 py-3 font-medium">{expense.item}</td>
                <td className="px-4 py-3">{formatCurrency(expense.amount)}</td>
                <td className="px-4 py-3">{expense.paidBy}</td>
                <td className="px-4 py-3">{expense.mode}</td>
                <td className="px-4 py-3">{expense.type}</td>
                <td className="px-4 py-3">{expense.sponsored ? "Yes" : "No"}</td>
                <td className="px-4 py-3">{expense.approvedBy}</td>
                <td className="px-4 py-3">{expense.id && access.canEdit ? <ExpenseActions expense={expense} /> : null}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function ExpenseActions({ expense }: { expense: ExpenseRow }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await updateExpense(expense.id!, new FormData(event.currentTarget));
      await queryClient.invalidateQueries({ queryKey: ["event-data"] });
      setOpen(false);
    } catch (item) {
      setError(item instanceof Error ? item.message : "Unable to update expense");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <RowActions
        onEdit={() => setOpen(true)}
        onDelete={async () => {
          if (!window.confirm("Delete this expense?")) return;
          await deleteExpense(expense.id!);
          await queryClient.invalidateQueries({ queryKey: ["event-data"] });
        }}
      />
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Expense</DialogTitle></DialogHeader>
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="grid gap-4 sm:grid-cols-2"><ExpenseFields expense={expense} /></div>
            {error ? <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</p> : null}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={saving}>{saving ? "Saving..." : "Save"}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

function expensePayload(formData: FormData) {
  return {
    expense_date: formString(formData, "date", todayDateInputValue()),
    category: formString(formData, "category"),
    item: formString(formData, "item"),
    amount: formNumber(formData, "amount"),
    paid_by: formString(formData, "paidBy"),
    payment_mode: formString(formData, "mode", "UPI"),
    expense_type: formString(formData, "type", "Purchase"),
    sponsored: formData.get("sponsored") === "on",
    approved_by: formString(formData, "approvedBy"),
    notes: formString(formData, "notes"),
  };
}

async function addExpense(formData: FormData) {
  if (!supabase) throw new Error("Supabase is not configured");
  const eventId = await getFirstEventId();
  const { error } = await supabase.from("expenses").insert({ event_id: eventId, ...expensePayload(formData) });
  if (error) throw error;
}

async function updateExpense(id: string, formData: FormData) {
  if (!supabase) throw new Error("Supabase is not configured");
  const { error } = await supabase.from("expenses").update(expensePayload(formData)).eq("id", id);
  if (error) throw error;
}

async function deleteExpense(id: string) {
  if (!supabase) throw new Error("Supabase is not configured");
  const { error } = await supabase.from("expenses").delete().eq("id", id);
  if (error) throw error;
}
