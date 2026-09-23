import type { FinancialReport } from "@/lib/financial-report";
import type { XlsxCell, XlsxSheet } from "@/lib/xlsx";

/**
 * The financial report as a workbook - one sheet per section, in the same
 * order as the printed sheet: Summary, Collection, Expenses.
 *
 * Amounts go in as **numbers**, not "₹1,23,456" strings, so the treasurer can
 * sort, filter and add to them; the rupee sign is a cell format (see
 * `src/lib/xlsx.ts`). Dates go in as ISO text, which sorts correctly
 * everywhere and cannot be read as a US date by a spreadsheet in another
 * locale.
 *
 * There is no by-category breakdown, on either surface: the ledger below it
 * already carries every row with its category, and a spreadsheet can group
 * them any way the reader wants.
 *
 * The workbook carries two things the printed sheet deliberately leaves out -
 * payment mode and payment reference. A printed report gets pinned up or
 * photographed; a workbook is the reconciliation tool, and matching a UTR to
 * a bank statement is the whole reason a treasurer opens one.
 */
function blank(): XlsxCell[] {
  return [];
}

function headerRow(labels: string[]): XlsxCell[] {
  return labels.map((label) => ({ value: label, style: "header" as const }));
}

export function financialReportSheets({
  report,
  eventName,
  eventDates,
  location,
  generatedOn,
}: {
  report: FinancialReport;
  eventName: string;
  eventDates: string;
  location?: string;
  generatedOn: string;
}): XlsxSheet[] {
  const masthead: XlsxCell[][] = [
    [{ value: eventName, style: "title" }],
    [{ value: [eventDates, location].filter(Boolean).join(" · "), style: "muted" }],
  ];

  const summaryRows: XlsxCell[][] = [
    ...masthead,
    [{ value: `Financial report · prepared ${generatedOn}`, style: "muted" }],
    blank(),
  ];

  for (const group of report.summary) {
    summaryRows.push([{ value: group.title, style: "heading" }]);
    summaryRows.push(headerRow(["Line", "Amount", "Note"]));
    for (const line of group.lines) {
      summaryRows.push([
        { value: line.label, style: line.emphasis ? "total" : undefined },
        { value: line.amount, style: line.emphasis ? "moneyTotal" : "money" },
        { value: line.note ?? "", style: "muted" },
      ]);
    }
    summaryRows.push(blank());
  }

  const collectionRows: XlsxCell[][] = [
    ...masthead,
    [{ value: "Collection · contributions and sponsorships", style: "muted" }],
    blank(),
    headerRow(["Date", "Type", "Name", "Flat", "Details", "Promised", "Received", "Status", "Mode", "Reference"]),
    ...report.collection.entries.map((entry): XlsxCell[] => [
      entry.date,
      entry.kind,
      entry.name,
      entry.flat,
      entry.detail,
      { value: entry.promised, style: "money" },
      { value: entry.received, style: "money" },
      entry.status,
      entry.mode,
      entry.reference,
    ]),
    [
      { value: "Total", style: "total" },
      ...Array.from({ length: 4 }, (): XlsxCell => ({ value: "", style: "total" })),
      { value: report.collection.totalPromised, style: "moneyTotal" },
      { value: report.collection.totalReceived, style: "moneyTotal" },
      ...Array.from({ length: 3 }, (): XlsxCell => ({ value: "", style: "total" })),
    ],
  ];

  const expenseRows: XlsxCell[][] = [
    ...masthead,
    [{ value: "Expenses · what the money went on", style: "muted" }],
    blank(),
    headerRow(["Date", "Item", "Category", "Amount", "Paid by", "Reimbursement", "Settled on", "Notes"]),
    ...report.expenses.entries.map((entry): XlsxCell[] => [
      entry.date,
      entry.item,
      entry.category,
      { value: entry.amount, style: "money" },
      entry.paidBy,
      entry.status,
      entry.settledOn,
      entry.notes,
    ]),
    [
      { value: "Total", style: "total" },
      { value: "", style: "total" },
      { value: "", style: "total" },
      { value: report.expenses.total, style: "moneyTotal" },
      ...Array.from({ length: 4 }, (): XlsxCell => ({ value: "", style: "total" })),
    ],
  ];

  return [
    { name: "Summary", columns: [34, 16, 28], rows: summaryRows },
    { name: "Collection", columns: [12, 14, 26, 10, 26, 14, 14, 16, 14, 20], rows: collectionRows },
    { name: "Expenses", columns: [12, 30, 18, 14, 22, 18, 12, 36], rows: expenseRows },
  ];
}
