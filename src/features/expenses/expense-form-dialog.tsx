import { Camera, FileText, Paperclip, RotateCcw, X } from "lucide-react";
import { ChangeEvent, FormEvent, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
import { cn } from "@/lib/utils";

/**
 * Record or edit an expense - pass `expense` to edit, omit it to create, the
 * same shape as TaskFormDialog.
 *
 * Deliberately short. The only things a claim needs are what it was, how much,
 * when, which bucket it goes in, and who is owed. Payment mode, expense type
 * and approver were dropped from the form (older rows keep their values).
 * The bill is optional, and a phone photo is shrunk before it is sent - see
 * `prepareBill`.
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
  const [paidFrom, setPaidFrom] = useState<PaidFrom | undefined>("pocket");
  const [bill, setBill] = useState<PreparedBill | null>(null);
  const [removeBill, setRemoveBill] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const settled = expense?.status === "settled";
  // Entries from before claims existed are neither owed nor paid; they stay
  // that way unless the editor picks one, rather than silently becoming owed.
  const untracked = Boolean(expense) && expense?.status === null;
  const today = getDateInEventZone();

  // The fields below are uncontrolled and re-mount with the dialog, but these
  // are state and have to be re-seeded whenever it opens on a different row.
  useEffect(() => {
    if (!open) return;
    setPaidFrom(!expense ? "pocket" : expense.status === "not_needed" ? "funds" : expense.status ? "pocket" : undefined);
    setBill(null);
    setRemoveBill(false);
    setError(null);
  }, [open, expense]);

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setError(null);
    setPreparing(true);
    try {
      setBill(await prepareBill(file));
      setRemoveBill(false);
    } catch (item) {
      setError(item instanceof Error ? item.message : "Couldn't use that file");
    } finally {
      setPreparing(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setSaving(true);
    setError(null);

    try {
      await onSubmit({
        item: String(formData.get("item") ?? "").trim(),
        amount: Number(formData.get("amount")),
        date: String(formData.get("date") ?? ""),
        category: String(formData.get("category") ?? "").trim(),
        paidBy: paidFrom === "funds" ? "" : String(formData.get("paidBy") ?? "").trim(),
        notes: String(formData.get("notes") ?? "").trim(),
        paidFrom: settled ? undefined : paidFrom,
        bill: bill?.dataUrl,
        removeBill: removeBill && !bill,
      });
      onOpenChange(false);
    } catch (item) {
      setError(item instanceof Error ? item.message : "Unable to save the expense");
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
    } catch (item) {
      setError(item instanceof Error ? item.message : "Unable to change the claim");
    } finally {
      setSaving(false);
    }
  }

  const showExistingBill = Boolean(expense?.hasBill) && !bill && !removeBill;
  const showPaidBy = paidFrom === "pocket" || (untracked && paidFrom === undefined);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{expense ? "Edit expense" : "Add an expense"}</DialogTitle>
          {!expense ? (
            <p className="text-sm text-muted-foreground">
              Paid for something yourself? Record it here and the admin will pay you back.
            </p>
          ) : null}
        </DialogHeader>

        <form className="space-y-4" onSubmit={submit}>
          <div className="space-y-2">
            <Label htmlFor="expense-item">What was it for?</Label>
            <Input
              id="expense-item"
              name="item"
              required
              maxLength={200}
              defaultValue={expense?.item}
              placeholder="e.g. Flowers for the stage"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="expense-amount">Amount (₹)</Label>
              <Input
                id="expense-amount"
                name="amount"
                type="number"
                inputMode="decimal"
                min="0.01"
                step="0.01"
                required
                defaultValue={expense?.amount}
                className="tabular-nums"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="expense-date">Paid on</Label>
              <Input
                id="expense-date"
                name="date"
                type="date"
                required
                max={today}
                defaultValue={expense?.date || today}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="expense-category">Category</Label>
            <Input
              id="expense-category"
              name="category"
              required
              maxLength={60}
              list="expense-category-options"
              defaultValue={expense?.category}
              placeholder="Pick one or type your own"
            />
            <datalist id="expense-category-options">
              {categories.map((category) => (
                <option key={category} value={category} />
              ))}
            </datalist>
          </div>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Who paid?</legend>
            {settled ? (
              <p className="rounded-md bg-muted p-3 text-sm text-muted-foreground">
                Settled{expense?.settledAt ? ` on ${formatEventTimestamp(expense.settledAt)}` : ""}
                {expense?.settledByName ? ` by ${expense.settledByName}` : ""}. Mark it not settled first to change who
                paid.
              </p>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-1 rounded-md border p-0.5">
                  <PaidFromOption
                    value="pocket"
                    checked={paidFrom === "pocket"}
                    onSelect={setPaidFrom}
                    label="Out of pocket"
                    hint="Needs paying back"
                  />
                  <PaidFromOption
                    value="funds"
                    checked={paidFrom === "funds"}
                    onSelect={setPaidFrom}
                    label="Event funds"
                    hint="Nobody to pay back"
                  />
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
            <div className="space-y-2">
              <Label htmlFor="expense-paid-by">{settled ? "Paid by" : "Paid by (who gets paid back)"}</Label>
              <Input
                id="expense-paid-by"
                name="paidBy"
                required={paidFrom === "pocket" && !settled}
                maxLength={100}
                defaultValue={expense ? expense.paidBy : meName}
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
                <Button type="button" variant="ghost" size="icon" aria-label="Remove this bill" onClick={() => setBill(null)}>
                  <X className="h-4 w-4" aria-hidden="true" />
                </Button>
              </div>
            ) : showExistingBill ? (
              <div className="flex items-center gap-3 rounded-md border p-2">
                <BillThumb src={null} />
                <div className="min-w-0 flex-1">
                  {expense?.billUrl ? (
                    <a
                      href={expense.billUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm font-medium text-primary underline-offset-4 hover:underline"
                    >
                      View current bill
                    </a>
                  ) : (
                    <p className="text-sm font-medium">Bill attached</p>
                  )}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Remove the current bill"
                  onClick={() => setRemoveBill(true)}
                >
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

            <Button
              type="button"
              variant="outline"
              className="w-full"
              disabled={preparing}
              onClick={() => fileInputRef.current?.click()}
            >
              {expense?.hasBill || bill ? (
                <Paperclip className="h-4 w-4" aria-hidden="true" />
              ) : (
                <Camera className="h-4 w-4" aria-hidden="true" />
              )}
              {preparing
                ? "Preparing..."
                : bill || showExistingBill
                  ? "Replace bill"
                  : "Take a photo or choose a file"}
            </Button>
            <p className="text-xs text-muted-foreground">
              A photo or a PDF. Only the committee and the person who paid can see it.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="expense-notes">
              Note <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <textarea
              id="expense-notes"
              name="notes"
              rows={2}
              maxLength={1000}
              defaultValue={expense?.notes}
              placeholder="Anything the admin should know"
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>

          {error ? <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</p> : null}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
            {settled && canUnsettle ? (
              <Button type="button" variant="ghost" disabled={saving} onClick={() => void unsettle()}>
                <RotateCcw className="h-4 w-4" aria-hidden="true" />
                Mark not settled
              </Button>
            ) : (
              <span />
            )}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving || preparing}>
                {saving ? "Saving..." : expense ? "Save changes" : "Add expense"}
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
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
