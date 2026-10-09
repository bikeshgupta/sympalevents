import { Camera, ChevronDown, FileText, Paperclip, RotateCcw, X } from "lucide-react";
import { ChangeEvent, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatEventTimestamp, getDateInEventZone } from "@/features/dashboard/dashboard-utils";
import {
  formatFileSize,
  prepareBill,
  type Expense,
  type ExpenseInput,
  type PaidFrom,
  type PreparedBill,
} from "@/lib/expenses";
import { EntrySheet, type EntryIntent } from "@/features/shared/entry-sheet";
import { cn, formatCurrency } from "@/lib/utils";

/**
 * Record or edit an expense - pass `expense` to edit, omit it to create. A phone-first sheet
 * (see EntrySheet), and built for filing several in a row: **Save & add next** clears only what
 * differs between bills (what it was, how much, the photo, the note) and keeps the day, the
 * category and who paid.
 *
 * Deliberately short. The only things a claim needs are what it was, how much, which bucket it
 * goes in, who is owed, and when. Payment mode, expense type and approver were dropped from the
 * form (older rows keep their values). The bill is optional, and a phone photo is shrunk before it
 * is sent - see `prepareBill`.
 */
export function ExpenseFormDialog({
  open,
  onOpenChange,
  expense,
  meName,
  categories,
  canUnsettle,
  onSubmit,
  onUnsettle,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  expense?: Expense;
  /** Pre-fills "Paid by" on a new claim - it is usually the person filing it. */
  meName: string;
  categories: string[];
  canUnsettle: boolean;
  onSubmit: (input: ExpenseInput) => Promise<unknown>;
  onUnsettle: (expense: Expense) => Promise<unknown>;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const itemRef = useRef<HTMLInputElement>(null);
  const today = getDateInEventZone();

  const [item, setItem] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(today);
  const [category, setCategory] = useState("");
  const [otherCategory, setOtherCategory] = useState(false);
  const [paidFrom, setPaidFrom] = useState<PaidFrom | undefined>("pocket");
  const [paidBy, setPaidBy] = useState(meName);
  const [notes, setNotes] = useState("");
  const [more, setMore] = useState(false);
  const [bill, setBill] = useState<PreparedBill | null>(null);
  const [removeBill, setRemoveBill] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [added, setAdded] = useState<{ item: string; amount: number }[]>([]);

  const settled = expense?.status === "settled";
  // Entries from before claims existed are neither owed nor paid; they stay
  // that way unless the editor picks one, rather than silently becoming owed.
  const untracked = Boolean(expense) && expense?.status === null;

  const quickCategories = categories.slice(0, 8);

  // Opening on a different row, or reopening to add, starts from that row / a clean slate.
  useEffect(() => {
    if (!open) return;
    setItem(expense?.item ?? "");
    setAmount(expense ? String(expense.amount) : "");
    setDate(expense?.date || today);
    setCategory(expense?.category ?? "");
    setOtherCategory(Boolean(expense?.category) && !categories.slice(0, 8).includes(expense?.category ?? ""));
    setPaidFrom(!expense ? "pocket" : expense.status === "not_needed" ? "funds" : expense.status ? "pocket" : undefined);
    setPaidBy(expense ? expense.paidBy : meName);
    setNotes(expense?.notes ?? "");
    setMore(Boolean(expense));
    setBill(null);
    setRemoveBill(false);
    setError(null);
    setNotice(null);
    setAdded([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, expense?.id]);

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setError(null);
    setPreparing(true);
    try {
      setBill(await prepareBill(file));
      setRemoveBill(false);
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "Couldn't use that file");
    } finally {
      setPreparing(false);
    }
  }

  async function save(intent: EntryIntent) {
    const value = Number(amount.replace(/[,\s₹]/g, ""));
    if (!item.trim()) return setError("Say what it was for.");
    if (!Number.isFinite(value) || value <= 0) return setError("Enter the amount as a number above zero.");
    if (!category.trim()) return setError("Choose a category, or type your own.");
    if (paidFrom === "pocket" && !settled && !paidBy.trim()) return setError("Who should be paid back?");

    setSaving(true);
    setError(null);
    try {
      await onSubmit({
        item: item.trim(),
        amount: value,
        date,
        category: category.trim(),
        paidBy: paidFrom === "funds" ? "" : paidBy.trim(),
        notes: notes.trim(),
        paidFrom: settled ? undefined : paidFrom,
        bill: bill?.dataUrl,
        removeBill: removeBill && !bill,
      });
      if (intent === "close" || expense) {
        onOpenChange(false);
        return;
      }
      setAdded((list) => [{ item: item.trim(), amount: value }, ...list]);
      setNotice(`Saved ${item.trim()} · ${formatCurrency(value)}`);
      // The day, the category and who paid usually stay the same from one bill to the next.
      setItem("");
      setAmount("");
      setNotes("");
      setBill(null);
      window.setTimeout(() => itemRef.current?.focus(), 0);
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "Unable to save the expense");
    } finally {
      setSaving(false);
    }
  }

  async function unsettle() {
    if (!expense) return;
    setSaving(true);
    setError(null);
    try {
      await onUnsettle(expense);
      onOpenChange(false);
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "Unable to change the claim");
    } finally {
      setSaving(false);
    }
  }

  const showExistingBill = Boolean(expense?.hasBill) && !bill && !removeBill;
  const showPaidBy = paidFrom === "pocket" || (untracked && paidFrom === undefined);
  const total = added.reduce((sum, entry) => sum + entry.amount, 0);

  return (
    <EntrySheet
      open={open}
      onOpenChange={onOpenChange}
      title={expense ? "Edit expense" : "Add an expense"}
      summary={!expense && added.length ? `${added.length} added · ${formatCurrency(total)}` : undefined}
      repeatable={!expense}
      submitLabel="Save changes"
      saving={saving || preparing}
      error={error}
      notice={notice}
      onSubmit={(intent) => save(intent)}
      footerExtra={
        <>
          {settled && canUnsettle ? (
            <Button type="button" variant="ghost" className="h-11" disabled={saving} onClick={() => void unsettle()}>
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
              Mark not settled
            </Button>
          ) : null}
          {added.length ? (
            <section aria-label="Added in this session" className="rounded-lg border bg-muted/40">
              <h3 className="px-3 pt-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Added just now</h3>
              <ul className="divide-y">
                {added.slice(0, 6).map((entry, index) => (
                  <li key={`${entry.item}-${index}`} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                    <span className="min-w-0 truncate">{entry.item}</span>
                    <span className="shrink-0 tabular-nums">{formatCurrency(entry.amount)}</span>
                  </li>
                ))}
              </ul>
              {added.length > 6 ? <p className="px-3 pb-2 text-xs text-muted-foreground">and {added.length - 6} earlier</p> : null}
            </section>
          ) : null}
        </>
      }
    >
      {!expense ? (
        <p className="text-sm text-muted-foreground">Paid for something yourself? Record it here and the admin will pay you back.</p>
      ) : null}

      <div className="space-y-1.5">
        <Label htmlFor="expense-item">What was it for?</Label>
        <Input
          id="expense-item"
          ref={itemRef}
          value={item}
          onChange={(event) => setItem(event.target.value)}
          autoFocus={!expense}
          maxLength={200}
          autoComplete="off"
          enterKeyHint="next"
          placeholder="e.g. Flowers for the stage"
          className="h-12 text-base"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="expense-amount">Amount</Label>
        <div className="relative">
          <span aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-lg text-muted-foreground">
            ₹
          </span>
          <Input
            id="expense-amount"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            inputMode="decimal"
            autoComplete="off"
            enterKeyHint="done"
            placeholder="0"
            className="h-14 pl-8 text-2xl font-semibold tabular-nums"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <span className="text-sm font-medium">Category</span>
        <div className="flex flex-wrap gap-2">
          {quickCategories.map((option) => {
            const selected = !otherCategory && category === option;
            return (
              <button
                key={option}
                type="button"
                aria-pressed={selected}
                onClick={() => {
                  setCategory(option);
                  setOtherCategory(false);
                }}
                className={cn(
                  "inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  selected ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-muted",
                )}
              >
                {option}
              </button>
            );
          })}
          <button
            type="button"
            aria-pressed={otherCategory}
            onClick={() => {
              setOtherCategory(true);
              if (quickCategories.includes(category)) setCategory("");
            }}
            className={cn(
              "inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              otherCategory ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-muted",
            )}
          >
            Type your own
          </button>
        </div>
        {otherCategory || !quickCategories.length ? (
          <Input
            aria-label="Category"
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            maxLength={60}
            list="expense-category-options"
            placeholder="Pick one or type your own"
            className="h-11"
          />
        ) : null}
        <datalist id="expense-category-options">
          {categories.map((option) => (
            <option key={option} value={option} />
          ))}
        </datalist>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Who paid?</legend>
        {settled ? (
          <p className="rounded-md bg-muted p-3 text-sm text-muted-foreground">
            Settled{expense?.settledAt ? ` on ${formatEventTimestamp(expense.settledAt)}` : ""}
            {expense?.settledByName ? ` by ${expense.settledByName}` : ""}. Mark it not settled first to change who paid.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-1 rounded-md border p-0.5">
              <PaidFromOption value="pocket" checked={paidFrom === "pocket"} onSelect={setPaidFrom} label="Out of pocket" hint="Needs paying back" />
              <PaidFromOption value="funds" checked={paidFrom === "funds"} onSelect={setPaidFrom} label="Event funds" hint="Nobody to pay back" />
            </div>
            {untracked && paidFrom === undefined ? (
              <p className="text-xs text-muted-foreground">
                This was recorded before claims were tracked. Pick one to start tracking it, or leave both unset.
              </p>
            ) : null}
          </>
        )}
      </fieldset>

      {showPaidBy || settled ? (
        <div className="space-y-1.5">
          <Label htmlFor="expense-paid-by">{settled ? "Paid by" : "Paid by (who gets paid back)"}</Label>
          <Input
            id="expense-paid-by"
            value={paidBy}
            onChange={(event) => setPaidBy(event.target.value)}
            maxLength={100}
            autoComplete="name"
            className="h-11"
          />
        </div>
      ) : null}

      <div className="space-y-2">
        <span className="text-sm font-medium">
          Bill <span className="font-normal text-muted-foreground">(optional)</span>
        </span>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,application/pdf"
          className="hidden"
          onChange={(event) => void handleFile(event)}
        />

        {bill ? (
          <div className="flex items-center gap-3 rounded-md border p-2">
            <BillThumb src={bill.isPdf ? null : bill.dataUrl} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{bill.name || "Bill"}</p>
              <p className="text-xs tabular-nums text-muted-foreground">{formatFileSize(bill.bytes)} · ready to save</p>
            </div>
            <Button type="button" variant="ghost" size="icon" className="h-11 w-11" aria-label="Remove this bill" onClick={() => setBill(null)}>
              <X className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        ) : showExistingBill ? (
          <div className="flex items-center gap-3 rounded-md border p-2">
            <BillThumb src={null} />
            <div className="min-w-0 flex-1">
              {expense?.billUrl ? (
                <a href={expense.billUrl} target="_blank" rel="noreferrer" className="text-sm font-medium text-primary underline-offset-4 hover:underline">
                  View current bill
                </a>
              ) : (
                <p className="text-sm font-medium">Bill attached</p>
              )}
            </div>
            <Button type="button" variant="ghost" size="icon" className="h-11 w-11" aria-label="Remove the current bill" onClick={() => setRemoveBill(true)}>
              <X className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        ) : removeBill ? (
          <p className="flex items-center justify-between gap-2 rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
            The current bill will be removed when you save.
            <Button type="button" variant="ghost" size="sm" onClick={() => setRemoveBill(false)}>
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              Keep it
            </Button>
          </p>
        ) : null}

        <Button type="button" variant="outline" className="h-12 w-full" disabled={preparing} onClick={() => fileInputRef.current?.click()}>
          {expense?.hasBill || bill ? <Paperclip className="h-4 w-4" aria-hidden="true" /> : <Camera className="h-4 w-4" aria-hidden="true" />}
          {preparing ? "Preparing..." : bill || showExistingBill ? "Replace bill" : "Take a photo or choose a file"}
        </Button>
        <p className="text-xs text-muted-foreground">A photo or a PDF. Only the committee and the person who paid can see it.</p>
      </div>

      <div>
        <button
          type="button"
          aria-expanded={more}
          onClick={() => setMore((value) => !value)}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-md text-sm font-medium text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Date and note
          <ChevronDown className={cn("h-4 w-4 transition-transform", more && "rotate-180")} aria-hidden="true" />
        </button>
        {more ? (
          <div className="mt-2 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="expense-date">Paid on</Label>
              <Input id="expense-date" type="date" value={date} max={today} onChange={(event) => setDate(event.target.value)} className="h-11 w-full min-w-0" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="expense-notes">
                Note <span className="font-normal text-muted-foreground">(optional)</span>
              </Label>
              <textarea
                id="expense-notes"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                rows={2}
                maxLength={1000}
                placeholder="Anything the admin should know"
                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
          </div>
        ) : null}
      </div>
    </EntrySheet>
  );
}

/** A real radio input under a segmented-button look, so arrow keys and
 *  screen readers get radio behaviour without any extra wiring. */
function PaidFromOption({
  value,
  checked,
  onSelect,
  label,
  hint,
}: {
  value: PaidFrom;
  checked: boolean;
  onSelect: (value: PaidFrom) => void;
  label: string;
  hint: string;
}) {
  return (
    <label
      className={cn(
        "flex min-h-11 cursor-pointer flex-col justify-center rounded px-3 py-1.5 text-sm transition-colors focus-within:ring-2 focus-within:ring-ring",
        checked ? "bg-primary text-primary-foreground" : "hover:bg-muted",
      )}
    >
      <input
        type="radio"
        name="paidFrom"
        value={value}
        checked={checked}
        onChange={() => onSelect(value)}
        className="sr-only"
      />
      <span className="font-medium">{label}</span>
      <span className={cn("text-xs", checked ? "text-primary-foreground/85" : "text-muted-foreground")}>{hint}</span>
    </label>
  );
}

function BillThumb({ src }: { src: string | null }) {
  return (
    <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded border bg-muted">
      {src ? (
        <img src={src} alt="" className="h-full w-full object-cover" />
      ) : (
        <FileText className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
      )}
    </div>
  );
}
