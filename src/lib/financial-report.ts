import type { ContributionRow, SponsorRow } from "@/lib/event-data";
import type { Expense } from "@/lib/expenses";

/**
 * The financial report - one set of numbers, two outputs.
 *
 * The Expenses page offers an admin a report to print (or save as a PDF, the
 * same way every other notice in this app does) and the same thing as a
 * spreadsheet. Both are built from **this** file, so the printed sheet and
 * the workbook can never disagree about what was collected or spent: the
 * renderers only decide how a number looks, never what it is.
 *
 * The order is fixed and deliberate - **summary, then collection, then
 * expenses**: what it adds up to, where the money came from, where it went.
 *
 * Nothing here queries anything. It takes the rows the page already holds
 * (`useEventData()` for contributions and sponsorships, the ledger from
 * `/api/expenses` for spending) so the report is exactly what the admin is
 * looking at, and so this module stays trivially testable.
 *
 * **Admin only.** The report pulls the whole ledger together with flat
 * numbers and, in the spreadsheet, payment references - it is a treasurer's
 * working document, not something to hand round. The page gates the button on
 * the server's `access.isAdmin`; see expenses-page.tsx.
 */

export type ReportLine = {
  label: string;
  amount: number;
  /** A qualifier that belongs with the figure ("3 claims", "of ₹5,000 expected"). */
  note?: string;
  /** The line of its group that answers the question the group asks. */
  emphasis?: boolean;
};

export type ReportGroup = { title: string; lines: ReportLine[] };

export type CollectionEntry = {
  id: string;
  kind: "Contribution" | "Sponsorship";
  /** ISO, or "" when the record carries no usable date. */
  date: string;
  name: string;
  flat: string;
  detail: string;
  promised: number;
  received: number;
  status: string;
  mode: string;
  /** UTR / cheque number - spreadsheet only, never the printed sheet. */
  reference: string;
};

export type ExpenseEntry = {
  id: string;
  date: string;
  item: string;
  category: string;
  amount: number;
  paidBy: string;
  status: string;
  settledOn: string;
  notes: string;
};

export type CategoryTotal = { category: string; amount: number; count: number };

export type FinancialReport = {
  summary: ReportGroup[];
  collection: {
    entries: CollectionEntry[];
    contributionExpected: number;
    contributionReceived: number;
    sponsorCommitted: number;
    sponsorReceived: number;
    totalPromised: number;
    totalReceived: number;
    outstanding: number;
  };
  expenses: {
    entries: ExpenseEntry[];
    total: number;
    byCategory: CategoryTotal[];
    pendingAmount: number;
    pendingCount: number;
    settledAmount: number;
    fundsAmount: number;
    untrackedAmount: number;
  };
  balance: number;
  totalBudget: number;
};

const isoDate = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The day money actually moved. A contribution's `paymentDate` and a
 * sponsor's `payment_date` are both routinely blank - the sponsors form has
 * never asked for one - so the day the record was created stands in, the same
 * fallback the collection timeline makes. Anything unusable becomes "", and
 * sorts last rather than pretending to be the epoch.
 */
export function moneyDate(paymentDate: string, createdAt: string) {
  if (isoDate.test(paymentDate)) return paymentDate;
  if (createdAt) {
    const parsed = new Date(createdAt);
    if (!Number.isNaN(parsed.getTime())) {
      return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(parsed);
    }
  }
  return "";
}

function byDate(left: { date: string }, right: { date: string }) {
  if (!left.date) return 1;
  if (!right.date) return -1;
  return left.date.localeCompare(right.date);
}

function sum<T>(rows: T[], get: (row: T) => number) {
  return rows.reduce((total, row) => total + get(row), 0);
}

const expenseStatusLabels: Record<string, string> = {
  pending: "Pending payback",
  settled: "Settled",
  not_needed: "Event funds",
};

function settledOn(expense: Expense) {
  if (!expense.settledAt) return "";
  const parsed = new Date(expense.settledAt);
  if (Number.isNaN(parsed.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(parsed);
}

export function buildFinancialReport({
  contributions,
  sponsors,
  expenses,
  totalBudget,
}: {
  contributions: ContributionRow[];
  sponsors: SponsorRow[];
  expenses: Expense[];
  totalBudget: number;
}): FinancialReport {
  const contributionEntries: CollectionEntry[] = contributions.map((row, index) => ({
    id: row.id ?? `contribution-${index}`,
    kind: "Contribution",
    date: moneyDate(row.paymentDate, row.createdAt),
    name: row.name === "-" ? "" : row.name,
    flat: row.flat === "-" ? "" : row.flat,
    detail: row.type === "-" ? "" : row.type,
    promised: row.expected,
    received: row.received,
    status: row.status,
    mode: row.mode === "-" ? "" : row.mode,
    reference: row.reference,
  }));

  const sponsorEntries: CollectionEntry[] = sponsors.map((row, index) => ({
    id: row.id ?? `sponsor-${index}`,
    kind: "Sponsorship",
    date: moneyDate(row.paymentDate, row.createdAt),
    name: row.name === "-" ? "" : row.name,
    flat: row.flat,
    // The category is what the sponsorship was for; the slot narrows it.
    detail: [row.category === "-" ? "" : row.category, row.item].filter(Boolean).join(" · ") + (row.inKind ? " (in kind)" : ""),
    promised: row.committed,
    received: row.received,
    status: row.status,
    mode: "",
    reference: "",
  }));

  const entries = [...contributionEntries, ...sponsorEntries].sort(byDate);

  const contributionExpected = sum(contributions, (row) => row.expected);
  const contributionReceived = sum(contributions, (row) => row.received);
  const sponsorCommitted = sum(sponsors, (row) => row.committed);
  const sponsorReceived = sum(sponsors, (row) => row.received);
  const totalPromised = contributionExpected + sponsorCommitted;
  const totalReceived = contributionReceived + sponsorReceived;
  // Promised money that has not arrived. Never negative: an overpayment is
  // not a debt anyone still owes, and netting the two would read 0 forever.
  const outstanding = Math.max(totalPromised - totalReceived, 0);

  const expenseEntries: ExpenseEntry[] = expenses
    .map((expense) => ({
      id: expense.id,
      date: isoDate.test(expense.date) ? expense.date : "",
      item: expense.item,
      category: expense.category,
      amount: expense.amount,
      paidBy: expense.status === "not_needed" ? "Event funds" : expense.paidBy,
      status: expense.status ? expenseStatusLabels[expense.status] : "Not tracked",
      settledOn: settledOn(expense),
      notes: expense.notes,
    }))
    .sort(byDate);

  const spent = sum(expenses, (expense) => expense.amount);
  const pending = expenses.filter((expense) => expense.status === "pending");
  const pendingAmount = sum(pending, (expense) => expense.amount);
  const settledAmount = sum(expenses.filter((e) => e.status === "settled"), (expense) => expense.amount);
  const fundsAmount = sum(expenses.filter((e) => e.status === "not_needed"), (expense) => expense.amount);
  const untrackedAmount = sum(expenses.filter((e) => e.status === null), (expense) => expense.amount);

  const categories = new Map<string, CategoryTotal>();
  for (const expense of expenses) {
    const category = expense.category.trim() || "Uncategorised";
    const existing = categories.get(category) ?? { category, amount: 0, count: 0 };
    existing.amount += expense.amount;
    existing.count += 1;
    categories.set(category, existing);
  }
  const byCategory = [...categories.values()].sort((left, right) => right.amount - left.amount);

  const balance = totalReceived - spent;

  const summary: ReportGroup[] = [
    {
      title: "Money in",
      lines: [
        {
          label: "Contributions received",
          amount: contributionReceived,
          note: `${contributions.length} ${contributions.length === 1 ? "record" : "records"}`,
        },
        {
          label: "Sponsorships received",
          amount: sponsorReceived,
          note: `${sponsors.length} ${sponsors.length === 1 ? "sponsor" : "sponsors"}`,
        },
        { label: "Total collected", amount: totalReceived, emphasis: true },
        { label: "Promised but not yet received", amount: outstanding },
      ],
    },
    {
      title: "Money out",
      lines: [
        {
          label: "Total spent",
          amount: spent,
          note: `${expenses.length} ${expenses.length === 1 ? "record" : "records"}`,
          emphasis: true,
        },
        { label: "Paid from event funds", amount: fundsAmount },
        { label: "Reimbursed to members", amount: settledAmount },
        {
          label: "Still owed to members",
          amount: pendingAmount,
          note: `${pending.length} ${pending.length === 1 ? "claim" : "claims"}`,
        },
        ...(untrackedAmount ? [{ label: "Recorded before claims were tracked", amount: untrackedAmount }] : []),
      ],
    },
    {
      title: "Where it stands",
      lines: [
        { label: "Balance in hand", amount: balance, note: "collected less spent", emphasis: true },
        { label: "Planned budget", amount: totalBudget },
        { label: "Left in the planned budget", amount: totalBudget - spent },
      ],
    },
  ];

  return {
    summary,
    collection: {
      entries,
      contributionExpected,
      contributionReceived,
      sponsorCommitted,
      sponsorReceived,
      totalPromised,
      totalReceived,
      outstanding,
    },
    expenses: {
      entries: expenseEntries,
      total: spent,
      byCategory,
      pendingAmount,
      pendingCount: pending.length,
      settledAmount,
      fundsAmount,
      untrackedAmount,
    },
    balance,
    totalBudget,
  };
}
