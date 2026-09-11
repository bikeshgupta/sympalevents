import { AlertTriangle, Banknote, CheckCircle2, FileText, FolderKanban, Image as ImageIcon, Pencil, Plus, ReceiptText, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { DataSourceBadge } from "@/components/shared/data-source-badge";
import { StatCard } from "@/components/shared/stat-card";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatEventDate, formatEventTimestamp } from "@/features/dashboard/dashboard-utils";
import { ExpenseFormDialog } from "@/features/expenses/expense-form-dialog";
import { PageTools } from "@/features/shared/page-tools";
import { ColumnFilter, SortableHeader, TableColumn, TableToolbar, useFilteredSortedRows } from "@/features/shared/table-tools";
import { useSession } from "@/lib/auth";
import { useEventContext } from "@/lib/event-context";
import { ExpenseRow, useEventData } from "@/lib/event-data";
import {
  expensePermissions,
  noExpenseAccess,
  useExpenses,
  type Expense,
  type ExpenseAccess,
  type ExpenseInput,
  type ReimbursementStatus,
} from "@/lib/expenses";
import { cn, formatCurrency } from "@/lib/utils";

/**
 * The expense ledger, and the out-of-pocket claim flow on top of it: a
 * committee member records what they paid (with a photo of the bill if they
 * have one), and the admin pays them back and marks it settled.
 *
 * Rows come from /api/expenses, not useEventData - bills sit in a private
 * bucket only the server can link to, and a committee member without view
 * access to the whole ledger still gets their own claims. Demo mode, where
 * there is no event to ask about, falls back to the demo rows read-only.
 */

const statusLabels: Record<ReimbursementStatus, string> = {
  pending: "Pending",
  settled: "Settled",
  not_needed: "Event funds",
};

// The same palette StatusBadge uses for Partially Paid / Received.
const statusStyles: Record<ReimbursementStatus, string> = {
  pending: "bg-amber-100 text-amber-800",
  settled: "bg-emerald-100 text-emerald-800",
  not_needed: "bg-muted text-muted-foreground",
};

/** Generic starting points for the category box; the event's own categories
 *  come first once there are any. Nothing festival-specific - this app runs
 *  many kinds of event. */
const starterCategories = ["Decoration", "Food", "Sound & lights", "Transport", "Printing", "Supplies", "Other"];

type StatusFilter = "all" | "pending" | "settled";

const statusFilters: Array<{ key: StatusFilter; label: string }> = [
  { key: "all", label: "All" },
  { key: "pending", label: "Pending" },
  { key: "settled", label: "Settled" },
];

function statusLabel(status: ReimbursementStatus | null) {
  return status ? statusLabels[status] : "Not tracked";
}

function paidByLabel(expense: Expense) {
  if (expense.status === "not_needed") return "Event funds";
  return expense.paidBy;
}

const displayedColumns: TableColumn<Expense>[] = [
  { key: "date", label: "Date", getValue: (row) => row.date, searchable: false },
  { key: "item", label: "Item", getValue: (row) => row.item },
  { key: "category", label: "Category", getValue: (row) => row.category },
  { key: "amount", label: "Amount", getValue: (row) => row.amount, searchable: false },
  { key: "paidBy", label: "Paid By", getValue: paidByLabel },
  { key: "status", label: "Status", getValue: (row) => statusLabel(row.status) },
];

// Notes are searchable without spending a column on them; they print under
// the item instead.
const expenseColumns: TableColumn<Expense>[] = [
  ...displayedColumns,
  { key: "notes", label: "Notes", getValue: (row) => row.notes },
];

const filterableColumns = new Set(["category", "paidBy", "status"]);

function demoExpense(row: ExpenseRow, index: number): Expense {
  return {
    id: row.id ?? `demo-${index}`,
    date: row.date,
    category: row.category,
    item: row.item,
    amount: row.amount,
    paidBy: row.paidBy,
    notes: row.notes,
    createdAt: "",
    status: null,
    settledAt: null,
    settledByName: null,
    submittedByName: null,
    mine: false,
    hasBill: false,
    billUrl: null,
    billIsPdf: false,
  };
}

function formatDate(date: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? formatEventDate(date) : "—";
}

export function ExpensesPage() {
  const { data } = useEventData();
  const { data: session } = useSession();
  const { selectedEventId } = useEventContext();
  const { query, create, update, setSettled, remove } = useExpenses(selectedEventId);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogExpense, setDialogExpense] = useState<Expense | undefined>();
  const [actionError, setActionError] = useState<string | null>(null);

  const ledger = query.data;
  const fromApi = Boolean(selectedEventId);
  const isLoading = fromApi && query.isLoading;
  const access: ExpenseAccess = ledger?.access ?? noExpenseAccess;
  const claimsReady = ledger?.claimsReady ?? true;
  const onlyMine = ledger?.scope === "mine";

  const expenses = useMemo(
    () => (fromApi ? ledger?.expenses ?? [] : data.expenses.map(demoExpense)),
    [fromApi, ledger, data.expenses],
  );
  const statusRows = useMemo(
    () => (statusFilter === "all" ? expenses : expenses.filter((row) => row.status === statusFilter)),
    [expenses, statusFilter],
  );
  const table = useFilteredSortedRows(statusRows, expenseColumns, "date", "desc");

  const totals = useMemo(() => {
    const pending = expenses.filter((row) => row.status === "pending");
    return {
      total: expenses.reduce((sum, row) => sum + row.amount, 0),
      pendingAmount: pending.reduce((sum, row) => sum + row.amount, 0),
      pendingCount: pending.length,
      pendingPeople: new Set(pending.map((row) => row.paidBy.trim().toLowerCase())).size,
      categories: new Set(expenses.map((row) => row.category).filter(Boolean)).size,
    };
  }, [expenses]);

  const categories = useMemo(() => {
    const own = Array.from(new Set(expenses.map((row) => row.category.trim()).filter(Boolean))).sort();
    return [...own, ...starterCategories.filter((category) => !own.some((item) => item.toLowerCase() === category.toLowerCase()))];
  }, [expenses]);

  const meName = ledger?.me?.name ?? session?.user.name ?? "";

  function openDialog(expense?: Expense) {
    setDialogExpense(expense);
    setDialogOpen(true);
  }

  function handleSubmit(input: ExpenseInput) {
    return dialogExpense ? update.mutateAsync({ id: dialogExpense.id, ...input }) : create.mutateAsync(input);
  }

  async function handleSettle(expense: Expense) {
    const owed = expense.paidBy || "the person who paid";
    if (!window.confirm(`Mark ${formatCurrency(expense.amount)} for "${expense.item}" as paid back to ${owed}?`)) return;
    setActionError(null);
    try {
      await setSettled.mutateAsync({ id: expense.id, settled: true });
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Unable to mark the claim settled");
    }
  }

  async function handleDelete(expense: Expense) {
    const message = expense.mine && !access.canManage
      ? `Withdraw your claim for "${expense.item}"? This cannot be undone.`
      : `Delete "${expense.item}" (${formatCurrency(expense.amount)})?${expense.hasBill ? " Its bill is deleted too." : ""} This cannot be undone.`;
    if (!window.confirm(message)) return;
    setActionError(null);
    try {
      await remove.mutateAsync(expense.id);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Unable to delete the expense");
    }
  }

  const rowProps = {
    access,
    busyId: setSettled.isPending ? setSettled.variables?.id : undefined,
    onEdit: openDialog,
    onDelete: handleDelete,
    onSettle: handleSettle,
  };

  const emptyMessage = expenses.length
    ? "No expenses match this view."
    : onlyMine
      ? "You haven't recorded anything yet. Paid for something yourself? Add it with a photo of the bill and the admin will pay you back."
      : access.canSubmit
        ? "No expenses yet. Paid for something out of your own pocket? Add it here, with a photo of the bill if you have one."
        : "No expenses recorded yet.";

  return (
    <div className="space-y-5">
      <div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-2xl font-semibold">Expense Ledger</h2>
            <p className="text-sm text-muted-foreground">
              What was spent, who paid, and whether they have been paid back.
            </p>
          </div>
          <DataSourceBadge source={fromApi ? "supabase" : data.source} reason={data.fallbackReason} />
        </div>
      </div>

      {query.isError ? (
        <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {query.error instanceof Error ? query.error.message : "Unable to load expenses"}
        </p>
      ) : null}

      {ledger && !claimsReady ? (
        <p className="flex items-start gap-2 rounded-md bg-amber-100 p-3 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            Adding expenses, bills and settling claims are switched off until{" "}
            <code className="font-mono text-xs">018_expense_claims.sql</code> has been run in Supabase. The ledger below
            still shows every expense.
          </span>
        </p>
      ) : null}

      {onlyMine ? (
        <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
          You are seeing the expenses you recorded. The full ledger is visible to members the admin gives access to.
        </p>
      ) : null}

      <section className="grid gap-3 sm:grid-cols-3">
        <StatCard
          title={onlyMine ? "Your Expenses" : "Total Expenses"}
          value={formatCurrency(totals.total)}
          icon={ReceiptText}
          isLoading={isLoading}
          note={
            totals.pendingCount
              ? `${formatCurrency(totals.pendingAmount)} pending payback${
                  onlyMine ? "" : ` to ${totals.pendingPeople} ${totals.pendingPeople === 1 ? "person" : "people"}`
                }`
              : undefined
          }
        />
        <StatCard title="Categories" value={String(totals.categories)} icon={FolderKanban} isLoading={isLoading} />
        <StatCard title="Records" value={String(expenses.length)} icon={Banknote} isLoading={isLoading} />
      </section>

      <PageTools
        searchValue={table.search}
        onSearchChange={table.setSearch}
        searchPlaceholder="Search item, category, person"
        searchLabel="Search expenses"
        action={
          access.canSubmit ? (
            <Button type="button" onClick={() => openDialog()} disabled={!claimsReady} className="w-full sm:w-auto">
              <Plus className="h-4 w-4" aria-hidden="true" />
              Add Expense
            </Button>
          ) : (
            <span className="text-sm text-muted-foreground">View-only access</span>
          )
        }
      />

      <div role="tablist" aria-label="Filter by reimbursement status" className="flex w-full rounded-md border p-0.5 sm:inline-flex sm:w-auto">
        {statusFilters.map((item) => (
          <button
            key={item.key}
            role="tab"
            type="button"
            aria-selected={statusFilter === item.key}
            aria-controls="expense-list"
            onClick={() => setStatusFilter(item.key)}
            className={cn(
              "min-h-10 flex-1 rounded px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:flex-none",
              statusFilter === item.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
            )}
          >
            {item.label}
            {item.key === "pending" && totals.pendingCount ? (
              <span className="ml-1.5 tabular-nums">({totals.pendingCount})</span>
            ) : null}
          </button>
        ))}
      </div>

      {actionError ? <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{actionError}</p> : null}

      <Card id="expense-list" role="tabpanel" className="overflow-hidden">
        <TableToolbar
          resultCount={table.rows.length}
          totalCount={statusRows.length}
          label={statusRows.length === 1 ? "record" : "records"}
          hasActiveFilters={table.hasActiveFilters}
          onClearFilters={table.clearFilters}
          sortNote={table.isDefaultSort ? "Newest first" : undefined}
        />

        {isLoading ? (
          <div className="space-y-2 p-3" aria-busy="true">
            {[0, 1, 2].map((key) => (
              <div key={key} className="h-16 animate-pulse rounded-md bg-muted/60" />
            ))}
          </div>
        ) : !table.rows.length ? (
          <p className="p-5 text-sm text-muted-foreground">{emptyMessage}</p>
        ) : (
          <>
            {/* Phones and tablets: one card per expense, same data and actions. */}
            <ul className="divide-y lg:hidden">
              {table.rows.map((expense) => (
                <li key={expense.id}>
                  <ExpenseCard expense={expense} {...rowProps} />
                </li>
              ))}
            </ul>

            <div className="hidden overflow-x-auto lg:block">
              <table className="w-full text-sm">
                <thead className="bg-muted text-left text-muted-foreground">
                  <tr>
                    {displayedColumns.map((column) => (
                      <th
                        key={column.key}
                        className={cn("whitespace-nowrap px-4 py-3 font-medium", column.key === "amount" && "text-right")}
                      >
                        <SortableHeader
                          label={column.label}
                          columnKey={column.key}
                          sortKey={table.sortKey}
                          sortDirection={table.sortDirection}
                          onSort={table.toggleSort}
                        />
                        {filterableColumns.has(column.key) ? (
                          <ColumnFilter
                            column={column}
                            rows={statusRows}
                            filters={table.filters}
                            onFilterChange={table.setColumnFilter}
                          />
                        ) : null}
                      </th>
                    ))}
                    <th className="px-4 py-3 font-medium">Bill</th>
                    <th className="px-4 py-3 font-medium">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {table.rows.map((expense) => (
                    <tr key={expense.id} className="border-t align-top">
                      <td className="whitespace-nowrap px-4 py-3 tabular-nums">{formatDate(expense.date)}</td>
                      <td className="max-w-xs px-4 py-3">
                        <p className="font-medium">
                          {expense.item}
                          {expense.mine ? <span className="ml-2 text-xs font-medium text-primary">Yours</span> : null}
                        </p>
                        {expense.notes ? <p className="line-clamp-2 text-xs text-muted-foreground">{expense.notes}</p> : null}
                      </td>
                      <td className="px-4 py-3">{expense.category || "—"}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-right font-medium tabular-nums">
                        {formatCurrency(expense.amount)}
                      </td>
                      <td className="px-4 py-3">{paidByLabel(expense) || "—"}</td>
                      <td className="px-4 py-3">
                        <ReimbursementCell expense={expense} />
                      </td>
                      <td className="px-4 py-3">
                        <BillLink expense={expense} />
                      </td>
                      <td className="px-4 py-2">
                        <ExpenseActions expense={expense} {...rowProps} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>

      {access.canSubmit ? (
        <ExpenseFormDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          expense={dialogExpense}
          meName={meName}
          categories={categories}
          canUnsettle={dialogExpense ? expensePermissions(dialogExpense, access).canUnsettle : false}
          onSubmit={handleSubmit}
          onUnsettle={(expense) => setSettled.mutateAsync({ id: expense.id, settled: false })}
        />
      ) : null}
    </div>
  );
}

type RowProps = {
  expense: Expense;
  access: ExpenseAccess;
  busyId?: string;
  onEdit: (expense: Expense) => void;
  onDelete: (expense: Expense) => void;
  onSettle: (expense: Expense) => void;
};

function ExpenseCard({ expense, ...actionProps }: RowProps) {
  return (
    <article className="space-y-1.5 px-3 py-2.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-medium leading-snug">
            {expense.item}
            {expense.mine ? <span className="ml-2 text-xs font-medium text-primary">Yours</span> : null}
          </h3>
          {expense.notes ? <p className="line-clamp-2 text-xs text-muted-foreground">{expense.notes}</p> : null}
        </div>
        <p className="shrink-0 text-sm font-semibold tabular-nums">{formatCurrency(expense.amount)}</p>
      </div>

      <p className="text-xs text-muted-foreground">
        <span className="tabular-nums">{formatDate(expense.date)}</span>
        {expense.category ? ` · ${expense.category}` : ""}
        {paidByLabel(expense) ? ` · ${expense.status === "not_needed" ? "" : "Paid by "}${paidByLabel(expense)}` : ""}
      </p>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <ReimbursementCell expense={expense} />
        <BillLink expense={expense} />
        <span className="ml-auto">
          <ExpenseActions expense={expense} {...actionProps} />
        </span>
      </div>
    </article>
  );
}

/** Status in words (colour is never the only signal), plus when it was settled. */
function ReimbursementCell({ expense }: { expense: Expense }) {
  if (!expense.status) return <span className="text-xs text-muted-foreground">—</span>;

  return (
    <span className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
      <span
        className={cn(
          "inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium",
          statusStyles[expense.status],
        )}
      >
        {expense.status === "settled" ? <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> : null}
        {statusLabels[expense.status]}
      </span>
      {expense.status === "settled" && expense.settledAt ? (
        <span
          className="whitespace-nowrap text-xs text-muted-foreground"
          title={expense.settledByName ? `Marked settled by ${expense.settledByName}` : undefined}
        >
          {formatEventTimestamp(expense.settledAt)}
        </span>
      ) : null}
    </span>
  );
}

function BillLink({ expense }: { expense: Expense }) {
  if (!expense.hasBill) return <span className="text-xs text-muted-foreground">—</span>;

  // Signed-out visitors, and signed-in viewers outside the committee, are
  // told a bill exists but never get the file.
  if (!expense.billUrl) return <span className="text-xs text-muted-foreground">Bill attached</span>;

  const Icon = expense.billIsPdf ? FileText : ImageIcon;
  return (
    <a
      href={expense.billUrl}
      target="_blank"
      rel="noreferrer"
      className="inline-flex min-h-10 items-center gap-1.5 whitespace-nowrap rounded-md text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
      View bill
      <span className="sr-only"> for {expense.item} (opens in a new tab)</span>
    </a>
  );
}

function ExpenseActions({ expense, access, busyId, onEdit, onDelete, onSettle }: RowProps) {
  const can = expensePermissions(expense, access);
  const busy = busyId === expense.id;

  if (!can.canEdit && !can.canDelete && !can.canSettle) return null;

  return (
    <span className="flex items-center justify-end gap-0.5">
      {can.canSettle ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mr-1 h-10 whitespace-nowrap"
          disabled={busy}
          onClick={() => onSettle(expense)}
        >
          <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
          {busy ? "Saving..." : "Mark settled"}
        </Button>
      ) : null}
      {can.canEdit ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-10 w-9"
          aria-label={`Edit ${expense.item}`}
          onClick={() => onEdit(expense)}
        >
          <Pencil className="h-4 w-4" aria-hidden="true" />
        </Button>
      ) : null}
      {can.canDelete ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-10 w-9"
          aria-label={expense.mine && !access.canManage ? `Withdraw ${expense.item}` : `Delete ${expense.item}`}
          onClick={() => onDelete(expense)}
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" />
        </Button>
      ) : null}
    </span>
  );
}
