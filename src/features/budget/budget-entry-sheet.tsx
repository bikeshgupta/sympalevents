import { useQueryClient } from "@tanstack/react-query";
import { ChevronDown } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ChipChoice, EntrySheet, type EntryIntent } from "@/features/shared/entry-sheet";
import { apiFetch } from "@/lib/api";
import { useEventContext } from "@/lib/event-context";
import { BudgetRow, getFirstEventId } from "@/lib/event-data";
import { cn, formatCurrency } from "@/lib/utils";

/**
 * Add or edit a budget line - the same phone-first sheet as contributions and expenses (see
 * EntrySheet), for planning a whole budget in one sitting.
 *
 * A line is a category, an item, a quantity and a unit cost; the estimate is worked out as you type
 * and shown under them, so the number being committed to is never a surprise. **Save & add next**
 * keeps the category, funding type, status and unit - the things a run of lines for one category
 * share - and clears the item and the numbers. The actual cost and the status are under "More
 * details": at planning time the actual is nearly always still zero.
 *
 * Writes into the event that is selected, not the first one on the person's list.
 */

const FUNDING = ["Common Fund", "Sponsor"];
const STATUSES = ["Planned", "In Progress", "Completed"];
const UNITS = ["lot", "nos", "kg", "day", "hr"];

const toNumber = (value: string) => {
  const parsed = Number(value.replace(/[,\s₹]/g, ""));
  return Number.isFinite(parsed) ? parsed : NaN;
};

export function BudgetEntrySheet({
  open,
  onOpenChange,
  budget,
  rows,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pass a row to edit it; omit to add. */
  budget?: BudgetRow;
  /** Everything already planned, for the category suggestions. */
  rows: BudgetRow[];
}) {
  const queryClient = useQueryClient();
  const { selectedEventId } = useEventContext();
  const itemRef = useRef<HTMLInputElement>(null);
  const editing = Boolean(budget);

  const blank = (b?: BudgetRow) => ({
    category: b?.category ?? "",
    item: b?.item ?? "",
    qty: b ? String(b.qty) : "1",
    unit: b?.unit && b.unit !== "-" ? b.unit : "lot",
    unitCost: b ? String(b.unitCost) : "",
    actual: b ? String(b.actual) : "",
    funding: b?.fundingType && b.fundingType !== "-" ? b.fundingType : "Common Fund",
    status: b?.status && b.status !== "-" ? b.status : "Planned",
  });
  const [form, setForm] = useState(() => blank(budget));
  const [more, setMore] = useState(editing);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [added, setAdded] = useState<{ item: string; estimate: number }[]>([]);

  useEffect(() => {
    if (!open) return;
    setForm(blank(budget));
    setMore(Boolean(budget));
    setError(null);
    setNotice(null);
    setAdded([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, budget?.id]);

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm((current) => ({ ...current, [key]: value }));

  // The categories already in use, most used first - the chips a run of lines is filed under.
  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of rows) if (row.category && row.category !== "-") counts.set(row.category, (counts.get(row.category) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name).slice(0, 8);
  }, [rows]);
  const [otherCategory, setOtherCategory] = useState(false);
  useEffect(() => {
    if (open) setOtherCategory(Boolean(budget?.category) && !categories.includes(budget?.category ?? ""));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, budget?.id]);

  const fundingOptions = useMemo(() => [...new Set([...FUNDING, ...rows.map((row) => row.fundingType).filter((value) => value && value !== "-")])].slice(0, 6), [rows]);
  const statusOptions = useMemo(() => [...new Set([...STATUSES, ...rows.map((row) => row.status).filter((value) => value && value !== "-")])].slice(0, 6), [rows]);

  const qty = toNumber(form.qty || "0");
  const unitCost = toNumber(form.unitCost || "0");
  const estimate = Number.isFinite(qty) && Number.isFinite(unitCost) ? qty * unitCost : 0;

  async function save(intent: EntryIntent) {
    const actual = toNumber(form.actual || "0");
    if (!form.category.trim()) return setError("Choose a category, or type your own.");
    if (!form.item.trim()) return setError("Say what the item is.");
    if (!Number.isFinite(qty) || qty < 0) return setError("The quantity has to be a number.");
    if (!Number.isFinite(unitCost) || unitCost < 0) return setError("The unit cost has to be a number.");
    if (!Number.isFinite(actual) || actual < 0) return setError("The actual cost has to be a number.");

    setSaving(true);
    setError(null);
    try {
      const body = {
        category: form.category.trim(),
        item: form.item.trim(),
        estimated_qty: qty,
        unit: form.unit.trim() || "lot",
        unit_cost: unitCost,
        actual_cost: actual,
        funding_type: form.funding,
        status: form.status,
      };
      if (budget) {
        if (!budget.id) throw new Error("This row cannot be edited");
        await apiFetch(`/api/events?resource=budgets&id=${encodeURIComponent(budget.id)}`, { method: "PATCH", body });
      } else {
        const eventId = selectedEventId ?? (await getFirstEventId());
        await apiFetch("/api/events?resource=budgets", { method: "POST", body: { eventId, ...body } });
      }
      await queryClient.invalidateQueries({ queryKey: ["event-data"] });

      if (intent === "close" || budget) {
        onOpenChange(false);
        return;
      }
      setAdded((list) => [{ item: form.item.trim(), estimate }, ...list]);
      setNotice(`Saved ${form.item.trim()} · ${formatCurrency(estimate)}`);
      // A run of lines usually shares the category, the unit, who funds it and the status.
      setForm((current) => ({ ...current, item: "", qty: "1", unitCost: "", actual: "" }));
      window.setTimeout(() => itemRef.current?.focus(), 0);
    } catch (item) {
      setError(item instanceof Error ? item.message : "Could not save. Try again.");
    } finally {
      setSaving(false);
    }
  }

  const total = added.reduce((sum, entry) => sum + entry.estimate, 0);

  return (
    <EntrySheet
      open={open}
      onOpenChange={onOpenChange}
      title={editing ? "Edit budget item" : "Add budget item"}
      summary={!editing && added.length ? `${added.length} added · ${formatCurrency(total)} estimated` : undefined}
      repeatable={!editing}
      saving={saving}
      error={error}
      notice={notice}
      onSubmit={(intent) => save(intent)}
      footerExtra={
        added.length ? (
          <section aria-label="Added in this session" className="rounded-lg border bg-muted/40">
            <h3 className="px-3 pt-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Added just now</h3>
            <ul className="divide-y">
              {added.slice(0, 6).map((entry, index) => (
                <li key={`${entry.item}-${index}`} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                  <span className="min-w-0 truncate">{entry.item}</span>
                  <span className="shrink-0 tabular-nums">{formatCurrency(entry.estimate)}</span>
                </li>
              ))}
            </ul>
            {added.length > 6 ? <p className="px-3 pb-2 text-xs text-muted-foreground">and {added.length - 6} earlier</p> : null}
          </section>
        ) : null
      }
    >
      <div className="space-y-1.5">
        <span className="text-sm font-medium">Category</span>
        <div className="flex flex-wrap gap-2">
          {categories.map((option) => {
            const selected = !otherCategory && form.category === option;
            return (
              <button
                key={option}
                type="button"
                aria-pressed={selected}
                onClick={() => {
                  set("category", option);
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
            aria-pressed={otherCategory || !categories.length}
            onClick={() => {
              setOtherCategory(true);
              if (categories.includes(form.category)) set("category", "");
            }}
            className={cn(
              "inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              otherCategory || !categories.length ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-muted",
            )}
          >
            {categories.length ? "New category" : "Type a category"}
          </button>
        </div>
        {otherCategory || !categories.length ? (
          <Input
            aria-label="Category"
            value={form.category}
            onChange={(event) => set("category", event.target.value)}
            autoFocus={!editing}
            maxLength={60}
            autoComplete="off"
            placeholder="e.g. Decoration"
            className="h-11"
          />
        ) : null}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="budget-item">Item</Label>
        <Input
          id="budget-item"
          ref={itemRef}
          value={form.item}
          onChange={(event) => set("item", event.target.value)}
          autoComplete="off"
          enterKeyHint="next"
          maxLength={200}
          placeholder="e.g. Stage flowers"
          className="h-12 text-base"
        />
      </div>

      <div className="grid grid-cols-[4.5rem_5.5rem_1fr] gap-3">
        <div className="min-w-0 space-y-1.5">
          <Label htmlFor="budget-qty">Qty</Label>
          <Input id="budget-qty" value={form.qty} onChange={(event) => set("qty", event.target.value)} inputMode="decimal" autoComplete="off" className="h-12 tabular-nums" />
        </div>
        <div className="min-w-0 space-y-1.5">
          <Label htmlFor="budget-unit">Unit</Label>
          <Input id="budget-unit" value={form.unit} onChange={(event) => set("unit", event.target.value)} list="budget-unit-options" autoComplete="off" maxLength={20} className="h-12" />
          <datalist id="budget-unit-options">
            {UNITS.map((unit) => (
              <option key={unit} value={unit} />
            ))}
          </datalist>
        </div>
        <div className="min-w-0 space-y-1.5">
          <Label htmlFor="budget-unit-cost">Unit cost</Label>
          <div className="relative">
            <span aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
              ₹
            </span>
            <Input
              id="budget-unit-cost"
              value={form.unitCost}
              onChange={(event) => set("unitCost", event.target.value)}
              inputMode="decimal"
              autoComplete="off"
              enterKeyHint="done"
              placeholder="0"
              className="h-12 pl-7 text-lg font-semibold tabular-nums"
            />
          </div>
        </div>
      </div>

      <p className="flex items-baseline justify-between gap-3 rounded-lg bg-muted/60 px-3 py-2.5 text-sm" aria-live="polite">
        <span className="text-muted-foreground">
          {Number.isFinite(qty) ? qty : 0} × {formatCurrency(Number.isFinite(unitCost) ? unitCost : 0)}
        </span>
        <span className="text-lg font-semibold tabular-nums">{formatCurrency(estimate)}</span>
      </p>

      <ChipChoice label="Funded from" value={form.funding} options={fundingOptions} onChange={(value) => set("funding", value)} />

      <div>
        <button
          type="button"
          aria-expanded={more}
          onClick={() => setMore((value) => !value)}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-md text-sm font-medium text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Actual cost and status
          <ChevronDown className={cn("h-4 w-4 transition-transform", more && "rotate-180")} aria-hidden="true" />
        </button>
        {more ? (
          <div className="mt-2 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="budget-actual">Actual cost so far (₹)</Label>
              <Input id="budget-actual" value={form.actual} onChange={(event) => set("actual", event.target.value)} inputMode="decimal" autoComplete="off" placeholder="0" className="h-11 tabular-nums" />
            </div>
            <ChipChoice label="Status" value={form.status} options={statusOptions} onChange={(value) => set("status", value)} />
          </div>
        ) : null}
      </div>
    </EntrySheet>
  );
}
