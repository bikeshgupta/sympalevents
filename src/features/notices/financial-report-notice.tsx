import { FileSpreadsheet } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { formatEventDate } from "@/features/dashboard/dashboard-utils";
import { NoticeBlock, NoticeDialog, NoticeEmpty, NoticeSheet } from "@/features/notices/notice-sheet";
import type { AppEvent, ContributionRow, SponsorRow } from "@/lib/event-data";
import type { Expense } from "@/lib/expenses";
import { buildFinancialReport, type ReportGroup } from "@/lib/financial-report";
import { financialReportSheets } from "@/lib/financial-report-xlsx";
import { cn, formatCurrency } from "@/lib/utils";
import { downloadXlsx } from "@/lib/xlsx";

/**
 * The financial report - **admin only**, offered from the Expenses page.
 *
 * Same shape in both formats, and the same order in both: the summary first,
 * because "did we cover it" is the question, then the collection that
 * answers where the money came from, then the expenses that say where it
 * went. `buildFinancialReport` produces the numbers once and both outputs
 * render them, so the PDF and the spreadsheet cannot drift apart.
 *
 * The printed copy is the committee copy and says so - there is no notice
 * board version of a financial report, so the audience switch is not offered.
 * It carries flats, because a treasurer reading it needs to know which
 * Sharma, but **not payment references or modes**: those are reconciliation
 * detail, they do not fit an A4 column, and a printed sheet is the one that
 * gets photographed. The spreadsheet carries them.
 */
function Money({ value, bold }: { value: number; bold?: boolean }) {
  return <span className={cn("tabular-nums", bold && "font-semibold")}>{formatCurrency(value)}</span>;
}

function SummaryGroup({ group }: { group: ReportGroup }) {
  return (
    <div className="notice-block">
      <p className="text-sm font-semibold">{group.title}</p>
      <dl className="mt-1 space-y-1">
        {group.lines.map((line) => (
          <div
            key={line.label}
            className={cn(
              "flex items-baseline justify-between gap-4 text-sm",
              line.emphasis && "border-t border-border pt-1 font-semibold",
            )}
          >
            <dt>
              {line.label}
              {line.note ? <span className="ml-1.5 text-xs font-normal text-muted-foreground">{line.note}</span> : null}
            </dt>
            <dd>
              <Money value={line.amount} bold={line.emphasis} />
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** A dense print table. Money columns are right-aligned, as everywhere else. */
function ReportTable({ headers, children }: { headers: string[]; children: React.ReactNode }) {
  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="border-b border-border text-left">
          {headers.map((header, index) => (
            <th
              key={header}
              className={cn("py-1 pr-2 font-semibold", index >= headers.length - 1 && "pr-0 text-right")}
            >
              {header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>{children}</tbody>
    </table>
  );
}

function reportDate(date: string) {
  return date ? formatEventDate(date) : "—";
}

export function FinancialReportDialog({
  open,
  onOpenChange,
  event,
  contributions,
  sponsors,
  expenses,
  totalBudget,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  event: AppEvent;
  contributions: ContributionRow[];
  sponsors: SponsorRow[];
  expenses: Expense[];
  totalBudget: number;
}) {
  const report = useMemo(
    () => buildFinancialReport({ contributions, sponsors, expenses, totalBudget }),
    [contributions, sponsors, expenses, totalBudget],
  );

  // Frozen for as long as the dialog is mounted, so the sheet, the workbook
  // and the file name all agree on when the report was prepared.
  const [preparedOn] = useState(() =>
    new Intl.DateTimeFormat("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "Asia/Kolkata",
    }).format(new Date()),
  );
  const [fileStamp] = useState(() =>
    new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date()),
  );

  function downloadSpreadsheet() {
    downloadXlsx(
      `${event.name} - Financial report ${fileStamp}`,
      financialReportSheets({
        report,
        eventName: event.name,
        eventDates: event.dates,
        location: event.location,
        generatedOn: preparedOn,
      }),
    );
  }

  return (
    <NoticeDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Financial report"
      documentTitle={`${event.name} - Financial report ${fileStamp}`}
      audience="internal"
      description={
        <>
          Save it as a PDF from the print dialog, or take the same figures as a spreadsheet. The workbook also carries
          payment modes and references, which the printed copy leaves off.
        </>
      }
      actions={
        <Button type="button" variant="outline" onClick={downloadSpreadsheet}>
          <FileSpreadsheet className="h-4 w-4" aria-hidden="true" />
          Download Excel
        </Button>
      }
    >
      <NoticeSheet
        eventName={event.name}
        eventDates={event.dates}
        location={event.location}
        title="Financial report"
        intro={`Where the money came from and where it went. Prepared ${preparedOn}.`}
        audience="internal"
      >
        <NoticeBlock heading="Summary">
          <div className="space-y-3">
            {report.summary.map((group) => (
              <SummaryGroup key={group.title} group={group} />
            ))}
          </div>
        </NoticeBlock>

        <NoticeBlock
          heading="Collection"
          meta={`${report.collection.entries.length} ${report.collection.entries.length === 1 ? "record" : "records"}`}
        >
          {report.collection.entries.length ? (
            <ReportTable headers={["Date", "Name", "Flat", "Details", "Status", "Promised", "Received"]}>
              {report.collection.entries.map((entry) => (
                <tr key={`${entry.kind}-${entry.id}`} className="border-b border-border/60 align-top">
                  <td className="whitespace-nowrap py-1 pr-2 tabular-nums">{reportDate(entry.date)}</td>
                  <td className="py-1 pr-2">
                    {entry.name || "—"}
                    <span className="block text-[10px] uppercase tracking-wide text-muted-foreground">{entry.kind}</span>
                  </td>
                  <td className="py-1 pr-2">{entry.flat || "—"}</td>
                  <td className="py-1 pr-2">{entry.detail || "—"}</td>
                  <td className="py-1 pr-2">{entry.status}</td>
                  <td className="py-1 pr-2 text-right tabular-nums">{formatCurrency(entry.promised)}</td>
                  <td className="py-1 text-right font-medium tabular-nums">{formatCurrency(entry.received)}</td>
                </tr>
              ))}
              <tr>
                <td className="py-1 pr-2 font-semibold" colSpan={5}>
                  Total
                </td>
                <td className="py-1 pr-2 text-right font-semibold tabular-nums">
                  {formatCurrency(report.collection.totalPromised)}
                </td>
                <td className="py-1 text-right font-semibold tabular-nums">
                  {formatCurrency(report.collection.totalReceived)}
                </td>
              </tr>
            </ReportTable>
          ) : (
            <NoticeEmpty>No contributions or sponsorships have been recorded yet.</NoticeEmpty>
          )}
        </NoticeBlock>

        <NoticeBlock
          heading="Expenses"
          meta={`${report.expenses.entries.length} ${report.expenses.entries.length === 1 ? "record" : "records"}`}
        >
          {report.expenses.entries.length ? (
            <>
              <div className="notice-block">
                <p className="text-sm font-semibold">By category</p>
                <ul className="mt-1 space-y-0.5">
                  {report.expenses.byCategory.map((row) => (
                    <li key={row.category} className="flex items-baseline justify-between gap-4 text-sm">
                      <span>
                        {row.category}
                        <span className="ml-1.5 text-xs text-muted-foreground">
                          {row.count} {row.count === 1 ? "record" : "records"}
                        </span>
                      </span>
                      <Money value={row.amount} />
                    </li>
                  ))}
                </ul>
              </div>

              <p className="text-sm font-semibold">Every expense</p>
              <ReportTable headers={["Date", "Item", "Category", "Paid by", "Reimbursement", "Amount"]}>
                {report.expenses.entries.map((entry) => (
                  <tr key={entry.id} className="border-b border-border/60 align-top">
                    <td className="whitespace-nowrap py-1 pr-2 tabular-nums">{reportDate(entry.date)}</td>
                    <td className="py-1 pr-2">
                      {entry.item}
                      {entry.notes ? (
                        <span className="block text-[10px] text-muted-foreground">{entry.notes}</span>
                      ) : null}
                    </td>
                    <td className="py-1 pr-2">{entry.category || "—"}</td>
                    <td className="py-1 pr-2">{entry.paidBy || "—"}</td>
                    <td className="py-1 pr-2">
                      {entry.status}
                      {entry.settledOn ? (
                        <span className="block text-[10px] text-muted-foreground">{reportDate(entry.settledOn)}</span>
                      ) : null}
                    </td>
                    <td className="py-1 text-right font-medium tabular-nums">{formatCurrency(entry.amount)}</td>
                  </tr>
                ))}
                <tr>
                  <td className="py-1 pr-2 font-semibold" colSpan={5}>
                    Total
                  </td>
                  <td className="py-1 text-right font-semibold tabular-nums">
                    {formatCurrency(report.expenses.total)}
                  </td>
                </tr>
              </ReportTable>
            </>
          ) : (
            <NoticeEmpty>Nothing has been recorded in the ledger yet.</NoticeEmpty>
          )}
        </NoticeBlock>
      </NoticeSheet>
    </NoticeDialog>
  );
}
