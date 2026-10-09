import { useQueryClient } from "@tanstack/react-query";
import { ChevronDown } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ChipChoice, EntrySheet, type EntryIntent } from "@/features/shared/entry-sheet";
import { apiFetch } from "@/lib/api";
import { useEventContext } from "@/lib/event-context";
import { ContributionRow, getFirstEventId } from "@/lib/event-data";
import { getDateInEventZone } from "@/features/dashboard/dashboard-utils";
import { cn, formatCurrency } from "@/lib/utils";
import { useVocabulary } from "@/lib/vocabulary";

/**
 * Add or edit a contribution - built for a phone, and for entering many in a row.
 *
 * What a treasurer does with this screen is go down a list of payments and type each one in. So:
 *
 *  - the two things that differ every time (who, how much) are at the top, large, with the
 *    number pad for the amount; everything that is usually the same as the last one (mode, status,
 *    date, owner/tenant, expected amount) is remembered between entries and tucked under
 *    "More details";
 *  - **Save & add next** clears only the person and the amount, keeps the rest, puts the cursor
 *    back on the flat, and lists what has been entered this time, so a run of twenty is twenty
 *    quick passes and a running total instead of twenty trips through a dialog;
 *  - typing a flat that already has a payment offers that household's name and expected amount
 *    (one tap, never filled in behind somebody's back) and says what they have already paid, which
 *    is how a second instalment gets noticed rather than duplicated.
 *
 * It writes through `/api/events?resource=contributions`, into the event that is **selected** - not,
 * as the old form did, the first event on the person's list.
 */

const MODES = ["UPI", "Cash", "Bank transfer", "Cheque"];
const STATUSES = ["Received", "Committed", "Returned"];
const TYPES = ["Owner", "Tenant"];

const toNumber = (value: string) => {
  const parsed = Number(value.replace(/[,\s₹]/g, ""));
  return Number.isFinite(parsed) ? parsed : NaN;
};

export function ContributionEntrySheet({
  open,
  onOpenChange,
  contribution,
  rows,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pass a row to edit it; omit to add. */
  contribution?: ContributionRow;
  /** Everything already recorded, for the household suggestion. */
  rows: ContributionRow[];
}) {
  const vocab = useVocabulary();
  const queryClient = useQueryClient();
  const { selectedEventId } = useEventContext();
  const today = getDateInEventZone();
  const flatRef = useRef<HTMLInputElement>(null);

  const editing = Boolean(contribution);
  const blank = (c?: ContributionRow) => ({
    flat: c?.flat ?? "",
    name: c?.name ?? "",
    type: c?.type && c.type !== "-" ? c.type : "Owner",
    expected: c ? String(c.expected) : "",
    received: c ? String(c.received) : "",
    date: c?.paymentDate && c.paymentDate !== "-" ? c.paymentDate : today,
    mode: c?.mode && c.mode !== "-" ? c.mode : "UPI",
    status: c?.status ?? "Received",
    reference: c?.reference && c.reference !== "-" ? c.reference : "",
  });
  const [form, setForm] = useState(() => blank(contribution));
  const [more, setMore] = useState(editing);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [added, setAdded] = useState<{ flat: string; name: string; amount: number }[]>([]);

  // Opening on a different row, or reopening to add, starts from that row / a clean slate.
  useEffect(() => {
    if (!open) return;
    setForm(blank(contribution));
    setMore(Boolean(contribution));
    setError(null);
    setNotice(null);
    setAdded([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, contribution?.id]);

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm((current) => ({ ...current, [key]: value }));

  const flatKey = form.flat.trim().toLowerCase();
  const household = useMemo(
    () => (flatKey ? rows.filter((row) => row.flat.trim().toLowerCase() === flatKey && row.id !== contribution?.id) : []),
    [rows, flatKey, contribution?.id],
  );
  const alreadyPaid = household.reduce((sum, row) => sum + row.received, 0);
  const known = household[0];
  const expectedNumber = toNumber(form.expected);

  async function save(intent: EntryIntent) {
    const flat = form.flat.trim().toUpperCase();
    const name = form.name.trim();
    const received = toNumber(form.received || "0");
    const expected = toNumber(form.expected || "0");
    if (!flat) return setError(`Enter the ${vocab.unitLower} number.`);
    if (!name) return setError("Enter the resident's name.");
    if (Number.isNaN(received) || received < 0) return setError("The amount received has to be a number.");
    if (Number.isNaN(expected) || expected < 0) return setError("The expected amount has to be a number.");
    if (form.status === "Received" && received <= 0) return setError("Enter the amount received, or change the status to Committed.");

    setSaving(true);
    setError(null);
    try {
      const body = {
        flat_no: flat,
        resident_name: name,
        resident_type: form.type,
        expected_amount: expected,
        received_amount: received,
        received_date: form.date || today,
        payment_mode: form.mode,
        status: form.status,
        reference: form.reference.trim(),
      };
      if (contribution) {
        if (!contribution.id) throw new Error("This row cannot be edited");
        await apiFetch(`/api/events?resource=contributions&id=${encodeURIComponent(contribution.id)}`, { method: "PATCH", body });
      } else {
        const eventId = selectedEventId ?? (await getFirstEventId());
        await apiFetch("/api/events?resource=contributions", { method: "POST", body: { eventId, ...body } });
      }
      await queryClient.invalidateQueries({ queryKey: ["event-data"] });

      if (intent === "close" || contribution) {
        onOpenChange(false);
        return;
      }
      setAdded((list) => [{ flat, name, amount: received }, ...list]);
      setNotice(`Saved ${flat} · ${formatCurrency(received)}`);
      // Only the person and the money change from one entry to the next.
      setForm((current) => ({ ...current, flat: "", name: "", received: "", reference: "" }));
      window.setTimeout(() => flatRef.current?.focus(), 0);
    } catch (item) {
      setError(item instanceof Error ? item.message : "Could not save. Try again.");
    } finally {
      setSaving(false);
    }
  }

  const total = added.reduce((sum, entry) => sum + entry.amount, 0);

  return (
    <EntrySheet
      open={open}
      onOpenChange={onOpenChange}
      title={editing ? "Edit contribution" : "Add contribution"}
      summary={!editing && added.length ? `${added.length} added · ${formatCurrency(total)}` : undefined}
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
                <li key={`${entry.flat}-${index}`} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                  <span className="min-w-0 truncate">
                    <span className="font-medium">{entry.flat}</span> · {entry.name}
                  </span>
                  <span className="shrink-0 tabular-nums">{formatCurrency(entry.amount)}</span>
                </li>
              ))}
            </ul>
            {added.length > 6 ? <p className="px-3 pb-2 text-xs text-muted-foreground">and {added.length - 6} earlier</p> : null}
          </section>
        ) : null
      }
    >
      <div className="flex gap-3">
        <div className="w-28 shrink-0 space-y-1.5">
          <Label htmlFor="contrib-flat">{vocab.unit}</Label>
          <Input
            id="contrib-flat"
            ref={flatRef}
            value={form.flat}
            onChange={(event) => set("flat", event.target.value)}
            autoFocus={!editing}
            autoCapitalize="characters"
            autoComplete="off"
            enterKeyHint="next"
            maxLength={40}
            className="h-12 text-base uppercase"
            placeholder="D104"
          />
        </div>
        <div className="min-w-0 flex-1 space-y-1.5">
          <Label htmlFor="contrib-name">Resident name</Label>
          <Input
            id="contrib-name"
            value={form.name}
            onChange={(event) => set("name", event.target.value)}
            autoComplete="off"
            autoCapitalize="words"
            enterKeyHint="next"
            maxLength={100}
            className="h-12 text-base"
          />
        </div>
      </div>

      {known && !form.name.trim() ? (
        <button
          type="button"
          onClick={() => {
            set("name", known.name);
            set("type", known.type && known.type !== "-" ? known.type : form.type);
            if (!form.expected && known.expected) set("expected", String(known.expected));
          }}
          className="flex min-h-11 w-full items-center justify-between gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span>
            Use <span className="font-semibold">{known.name}</span>
          </span>
          <span className="text-xs text-muted-foreground">{known.type !== "-" ? known.type : ""}</span>
        </button>
      ) : null}
      {household.length ? (
        <p className="-mt-2 text-sm text-amber-900">
          {form.flat.trim().toUpperCase()} already has {formatCurrency(alreadyPaid)} received
          {household.length > 1 ? ` across ${household.length} entries` : ""}. This will be added as another entry.
        </p>
      ) : null}

      <div className="space-y-1.5">
        <Label htmlFor="contrib-received">Amount received</Label>
        <div className="relative">
          <span aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-lg text-muted-foreground">
            ₹
          </span>
          <Input
            id="contrib-received"
            value={form.received}
            onChange={(event) => set("received", event.target.value)}
            inputMode="numeric"
            autoComplete="off"
            enterKeyHint="done"
            placeholder="0"
            className="h-14 pl-8 text-2xl font-semibold tabular-nums"
          />
        </div>
        {expectedNumber > 0 && toNumber(form.received || "0") !== expectedNumber ? (
          <button
            type="button"
            onClick={() => set("received", String(expectedNumber))}
            className="inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Same as expected · {formatCurrency(expectedNumber)}
          </button>
        ) : null}
      </div>

      <ChipChoice label="Paid by" value={form.mode} options={MODES} onChange={(value) => set("mode", value)} />
      <ChipChoice label="Status" value={form.status} options={STATUSES} onChange={(value) => set("status", value)} />

      <div>
        <button
          type="button"
          aria-expanded={more}
          onClick={() => setMore((value) => !value)}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-md text-sm font-medium text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          More details
          <ChevronDown className={cn("h-4 w-4 transition-transform", more && "rotate-180")} aria-hidden="true" />
        </button>
        {more ? (
          <div className="mt-2 space-y-4">
            <ChipChoice label="Owner or tenant" value={form.type} options={TYPES} onChange={(value) => set("type", value)} />
            <div className="grid grid-cols-2 gap-3">
              <div className="min-w-0 space-y-1.5">
                <Label htmlFor="contrib-expected">Expected (₹)</Label>
                <Input
                  id="contrib-expected"
                  value={form.expected}
                  onChange={(event) => set("expected", event.target.value)}
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="0"
                  className="h-11 tabular-nums"
                />
              </div>
              <div className="min-w-0 space-y-1.5">
                <Label htmlFor="contrib-date">Payment date</Label>
                <Input
                  id="contrib-date"
                  type="date"
                  value={form.date}
                  onChange={(event) => set("date", event.target.value)}
                  className="h-11 w-full min-w-0"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="contrib-reference">Reference (optional)</Label>
              <Input
                id="contrib-reference"
                value={form.reference}
                onChange={(event) => set("reference", event.target.value)}
                autoComplete="off"
                maxLength={120}
                placeholder="UPI reference, cheque number…"
                className="h-11"
              />
            </div>
          </div>
        ) : null}
      </div>
    </EntrySheet>
  );
}
