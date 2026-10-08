import { useQueryClient } from "@tanstack/react-query";
import { CircleDollarSign, Download, Plus, Search, UserCheck, Users } from "lucide-react";
import { FormEvent, useMemo, useState } from "react";
import { StatCard, StatGrid } from "@/components/shared/stat-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BookingCard, BookingForm } from "@/features/registration/registration-parts";
import { apiFetch } from "@/lib/api";
import type { RegistrationFilter, RegistrationPayload } from "@/lib/registration";
import { cn, formatCurrency } from "@/lib/utils";
import { paymentLabels, quoteBooking, type Registration, type RegistrationConfig } from "../../../shared/registration";

/**
 * The organiser's list of households.
 *
 * Built around one habit: somebody rings, or turns up, and you add them. Name
 * and flat are the only required fields and the form that takes them is always
 * the first thing on the page, not behind a button. Family, food and guests are
 * one click further for the times they matter.
 *
 * Under it, the bookings - filterable by what you are about to do with them
 * (chase the unpaid, verify the submitted), as a table on a desktop and as
 * cards on a phone, never a squeezed table. A booking's details and actions
 * open in place. Verifying a batch of submitted payments, and exporting what
 * you are looking at, are one step each.
 *
 * Everything that changes a booking is still the server's call: this screen
 * only decides what to put in front of somebody who is already an organiser.
 */

const filterChips: { key: RegistrationFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "unpaid", label: "Not paid" },
  { key: "submitted", label: "Submitted" },
  { key: "confirmed", label: "Confirmed" },
  { key: "checked_in", label: "Checked in" },
  { key: "refunds", label: "Refunds" },
  { key: "cancelled", label: "Cancelled" },
];

const paymentTone: Record<Registration["payment_status"], string> = {
  unpaid: "bg-amber-100 text-amber-900",
  submitted: "bg-violet-100 text-violet-900",
  verified: "bg-emerald-100 text-emerald-800",
  free: "bg-emerald-100 text-emerald-800",
  refund_pending: "bg-rose-100 text-rose-900",
  refunded: "bg-muted text-muted-foreground",
};

export function RegistrationsManager({
  eventId,
  data,
  config,
  filter,
  onFilter,
  search,
  onSearch,
  page,
  onPage,
  isFetching,
  pending,
  onAction,
  onSave,
}: {
  eventId: string;
  data: RegistrationPayload;
  config: RegistrationConfig;
  filter: RegistrationFilter;
  onFilter: (filter: RegistrationFilter) => void;
  /** The term being searched for, and a way to search for another. */
  search: string;
  onSearch: (term: string) => void;
  page: number;
  onPage: (page: number) => void;
  isFetching: boolean;
  pending: boolean;
  /** A change to one booking: verify, check in, edit, cancel... */
  onAction: (row: Registration, action: string, value?: string) => Promise<void>;
  /** Adding a household through the booking form. */
  onSave: (body: unknown) => Promise<void>;
}) {
  const client = useQueryClient();
  const url = `/api/events?resource=registration&eventId=${encodeURIComponent(eventId)}`;
  const refresh = () => client.invalidateQueries({ queryKey: ["registration", eventId] });

  const rows = useMemo(() => data.registrations ?? [], [data.registrations]);
  const counts = data.counts ?? null;
  const summary = data.summary;

  const [searchText, setSearchText] = useState(search);
  const [openId, setOpenId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  // ---- quick add -----------------------------------------------------------
  const [name, setName] = useState("");
  const [flat, setFlat] = useState("");
  const [duplicate, setDuplicate] = useState<string | null>(null);
  const [detailed, setDetailed] = useState(false);

  async function quickAdd(confirmDuplicate = false) {
    setBusy(true);
    setNotice(null);
    try {
      await apiFetch(url, {
        method: "POST",
        body: {
          contact_name: name.trim(),
          flat: flat.trim(),
          adults: 1,
          children: 0,
          guests: 0,
          food_count: 0,
          idempotency_key: crypto.randomUUID(),
          quoted_amount: quoteBooking(config, { adults: 1, children: 0, food_count: 0 }),
          on_behalf: true,
          confirm_duplicate: confirmDuplicate,
        },
      });
      setNotice({ tone: "ok", text: `Added ${name.trim()} · ${flat.trim().toUpperCase()}.` });
      setName("");
      setFlat("");
      setDuplicate(null);
      await refresh();
    } catch (error) {
      const failure = error as Error & { code?: string };
      if (failure.code === "duplicate_flat") setDuplicate(failure.message);
      else setNotice({ tone: "error", text: failure.message });
    } finally {
      setBusy(false);
    }
  }

  function submitQuickAdd(event: FormEvent) {
    event.preventDefault();
    setDuplicate(null);
    void quickAdd(false);
  }

  // ---- bulk verify -----------------------------------------------------------
  const verifiable = useMemo(
    () => rows.filter((row) => row.status === "active" && row.payment_status === "submitted"),
    [rows],
  );
  const chosen = verifiable.filter((row) => selected.has(row.id));
  const chosenTotal = chosen.reduce((sum, row) => sum + row.amount_due, 0);

  async function verifySelected() {
    if (!chosen.length) return;
    // The confirmation says how much money, because that is what a treasurer is
    // actually agreeing to when they press it.
    if (
      !window.confirm(
        `Confirm that ${chosen.length} payment${chosen.length === 1 ? "" : "s"} totalling ${formatCurrency(chosenTotal / 100)} have reached your account?`,
      )
    )
      return;
    setBusy(true);
    setNotice(null);
    try {
      const { results } = await apiFetch<{ results: { id: string; ok: boolean; error?: string }[] }>(url, {
        method: "PATCH",
        body: { action: "verify_many", items: chosen.map((row) => ({ id: row.id, version: row.version })) },
      });
      const done = results.filter((item) => item.ok).length;
      const failed = results.length - done;
      setNotice({
        tone: failed ? "error" : "ok",
        text: failed
          ? `Verified ${done} of ${results.length}. ${failed} changed since you opened the list - review ${failed === 1 ? "it" : "them"} and try again.`
          : `Verified ${done} payment${done === 1 ? "" : "s"}.`,
      });
      setSelected(new Set());
      await refresh();
    } catch (error) {
      setNotice({ tone: "error", text: (error as Error).message });
    } finally {
      setBusy(false);
    }
  }

  // ---- export ----------------------------------------------------------------
  async function exportCsv() {
    setBusy(true);
    setNotice(null);
    try {
      const file = await apiFetch<{ filename: string; csv: string; count: number }>(
        `${url}&export=csv&filter=${filter}&search=${encodeURIComponent(search)}`,
      );
      const blob = new Blob([file.csv], { type: "text/csv;charset=utf-8" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = file.filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(link.href);
      setNotice({ tone: "ok", text: `Exported ${file.count} ${file.count === 1 ? "booking" : "bookings"}.` });
    } catch (error) {
      setNotice({ tone: "error", text: (error as Error).message });
    } finally {
      setBusy(false);
    }
  }

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const allSelected = verifiable.length > 0 && verifiable.every((row) => selected.has(row.id));
  const pendingCount = (counts?.unpaid ?? 0) + (counts?.submitted ?? 0);

  return (
    <div className="space-y-4">
      <StatGrid>
        <StatCard
          title="Households"
          value={String(summary.households ?? 0)}
          icon={Users}
          note={`${summary.attendees ?? 0} people`}
        />
        <StatCard title="Confirmed" value={String(counts?.confirmed ?? 0)} icon={UserCheck} note="Payment settled" />
        <StatCard
          title="Pending"
          value={String(pendingCount)}
          icon={CircleDollarSign}
          note={summary.pendingAmount ? `${formatCurrency((summary.pendingAmount ?? 0) / 100)} due` : undefined}
        />
        <StatCard title="Checked in" value={String(summary.checkedIn ?? 0)} icon={UserCheck} note={`of ${summary.attendees ?? 0}`} />
      </StatGrid>

      {/* Quick add stays at the top: it is the thing done most. */}
      <section aria-labelledby="quick-add-heading" className="rounded-xl border bg-card p-4">
        <h2 id="quick-add-heading" className="font-semibold">
          Quick add household
        </h2>
        <p className="mt-0.5 text-sm text-muted-foreground">Only name and flat are required.</p>
        <form onSubmit={submitQuickAdd} className="mt-3 grid gap-3 sm:grid-cols-[1fr_9rem_auto] sm:items-end">
          <label className="block space-y-1.5 text-sm">
            <span className="font-medium">Resident name</span>
            <Input value={name} onChange={(event) => setName(event.target.value)} required minLength={2} maxLength={100} autoComplete="off" />
          </label>
          <label className="block space-y-1.5 text-sm">
            <span className="font-medium">Flat number</span>
            <Input value={flat} onChange={(event) => setFlat(event.target.value)} required maxLength={40} placeholder="D104" autoComplete="off" />
          </label>
          <Button type="submit" className="h-10" disabled={busy || pending || !name.trim() || !flat.trim()}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            Add household
          </Button>
        </form>

        {duplicate ? (
          <div role="alert" className="mt-3 space-y-2 rounded-md bg-amber-100 p-3 text-sm text-amber-900">
            <p>{duplicate} Add this one as well?</p>
            <div className="flex gap-2">
              <Button type="button" size="sm" className="h-10" disabled={busy} onClick={() => void quickAdd(true)}>
                Add anyway
              </Button>
              <Button type="button" size="sm" variant="outline" className="h-10 bg-background" onClick={() => setDuplicate(null)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : null}

        <button
          type="button"
          onClick={() => setDetailed((value) => !value)}
          aria-expanded={detailed}
          className="mt-2 min-h-10 text-sm font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {detailed ? "Hide family, food and guests" : "+ Add family, food or guests"}
        </button>
        {detailed ? (
          <div className="mt-2">
            <BookingForm
              admin
              config={config}
              pending={pending}
              onSave={async (body) => {
                await onSave(body);
                setDetailed(false);
              }}
            />
          </div>
        ) : null}
      </section>

      {notice ? (
        <p
          role={notice.tone === "error" ? "alert" : "status"}
          className={cn(
            "rounded-md p-3 text-sm",
            notice.tone === "error" ? "bg-destructive/10 text-destructive" : "bg-emerald-50 text-emerald-900",
          )}
        >
          {notice.text}
        </p>
      ) : null}

      <section className="space-y-3 rounded-xl border bg-card p-4">
        <div className="flex flex-wrap items-center gap-2">
          <form
            role="search"
            className="flex min-w-0 flex-1 gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              onSearch(searchText.trim());
            }}
          >
            <Input
              aria-label="Search by name, flat or booking code"
              placeholder="Search name, flat or booking code"
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
            />
            <Button type="submit" variant="outline" className="shrink-0">
              <Search className="h-4 w-4" aria-hidden="true" />
              <span className="sr-only sm:not-sr-only">Search</span>
            </Button>
          </form>
          <Button type="button" variant="outline" disabled={busy} onClick={() => void exportCsv()}>
            <Download className="h-4 w-4" aria-hidden="true" />
            Export CSV
          </Button>
        </div>

        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter bookings">
          {filterChips
            .filter((chip) => chip.key !== "refunds" || (counts?.refunds ?? 0) > 0 || filter === "refunds")
            .map((chip) => {
              const active = chip.key === filter;
              return (
                <button
                  key={chip.key}
                  type="button"
                  aria-pressed={active}
                  onClick={() => {
                    setSelected(new Set());
                    setOpenId(null);
                    onFilter(chip.key);
                  }}
                  className={cn(
                    "inline-flex min-h-10 items-center gap-1.5 rounded-full border px-3 text-sm",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    active ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted",
                  )}
                >
                  {chip.label}
                  {counts ? <span className="tabular-nums opacity-80">{counts[chip.key] ?? 0}</span> : null}
                </button>
              );
            })}
        </div>

        {chosen.length ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-accent px-3 py-2 text-sm">
            <span>
              {chosen.length} selected · {formatCurrency(chosenTotal / 100)}
            </span>
            <Button type="button" disabled={busy} onClick={() => void verifySelected()}>
              Verify selected
            </Button>
          </div>
        ) : null}

        {rows.length ? (
          <>
            {/* Desktop: a table. */}
            <div className="hidden overflow-x-auto lg:block">
              <table className="w-full text-sm">
                <caption className="sr-only">Bookings</caption>
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th scope="col" className="w-10 py-2 pr-2">
                      {verifiable.length ? (
                        <input
                          type="checkbox"
                          aria-label="Select every submitted payment on this page"
                          checked={allSelected}
                          onChange={() => setSelected(allSelected ? new Set() : new Set(verifiable.map((row) => row.id)))}
                        />
                      ) : null}
                    </th>
                    <th scope="col" className="py-2 pr-3 font-medium">Household</th>
                    <th scope="col" className="py-2 pr-3 text-right font-medium">People</th>
                    <th scope="col" className="py-2 pr-3 text-right font-medium">Food</th>
                    <th scope="col" className="py-2 pr-3 text-right font-medium">Amount</th>
                    <th scope="col" className="py-2 pr-3 font-medium">Payment</th>
                    <th scope="col" className="py-2 pr-3 text-right font-medium">In</th>
                    <th scope="col" className="py-2 text-right font-medium"><span className="sr-only">Details</span></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <TableRow
                      key={row.id}
                      row={row}
                      open={openId === row.id}
                      checked={selected.has(row.id)}
                      selectable={verifiable.includes(row)}
                      onToggleSelect={() => toggle(row.id)}
                      onToggleOpen={() => setOpenId(openId === row.id ? null : row.id)}
                      pending={pending}
                      onAction={(action, value) => onAction(row, action, value)}
                    />
                  ))}
                </tbody>
              </table>
            </div>

            {/* Phone and tablet: cards. */}
            <ul className="space-y-2 lg:hidden">
              {rows.map((row) => (
                <li key={row.id} className="rounded-lg border bg-background p-3">
                  <div className="flex items-start gap-3">
                    {verifiable.includes(row) ? (
                      <input
                        type="checkbox"
                        className="mt-1 h-5 w-5 shrink-0"
                        aria-label={`Select ${row.contact_name}, ${row.flat}`}
                        checked={selected.has(row.id)}
                        onChange={() => toggle(row.id)}
                      />
                    ) : null}
                    <div className="min-w-0 flex-1">
                      <p className="font-medium leading-snug">
                        {row.contact_name} · {row.flat}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
                        {row.adults + row.children} people · {row.food_count} meals · {formatCurrency(row.amount_due / 100)}
                      </p>
                    </div>
                    <PaymentBadge row={row} />
                  </div>
                  <button
                    type="button"
                    aria-expanded={openId === row.id}
                    onClick={() => setOpenId(openId === row.id ? null : row.id)}
                    className="mt-1 min-h-10 text-sm font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {openId === row.id ? "Hide details" : "Open"}
                  </button>
                  {openId === row.id ? (
                    <div className="mt-2">
                      <BookingCard row={row} manager pending={pending} onAction={(action, value) => onAction(row, action, value)} />
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="rounded-md border border-dashed p-5 text-sm text-muted-foreground">
            {search
              ? `Nobody matches "${search}" in this view.`
              : filter === "all"
                ? "No households yet. Add the first one above."
                : "Nothing in this view."}
          </p>
        )}

        <div className="flex items-center justify-between">
          <Button variant="outline" disabled={!page || isFetching} onClick={() => onPage(page - 1)}>
            Previous
          </Button>
          <span className="text-sm tabular-nums">Page {page + 1}</span>
          <Button variant="outline" disabled={!data.hasMore || isFetching} onClick={() => onPage(page + 1)}>
            Next
          </Button>
        </div>
      </section>
    </div>
  );
}

function PaymentBadge({ row }: { row: Registration }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        row.status === "cancelled" ? "bg-muted text-muted-foreground" : paymentTone[row.payment_status],
      )}
    >
      {row.status === "cancelled" ? "Cancelled · " : ""}
      {paymentLabels[row.payment_status]}
    </span>
  );
}

function TableRow({
  row,
  open,
  checked,
  selectable,
  onToggleSelect,
  onToggleOpen,
  pending,
  onAction,
}: {
  row: Registration;
  open: boolean;
  checked: boolean;
  selectable: boolean;
  onToggleSelect: () => void;
  onToggleOpen: () => void;
  pending: boolean;
  onAction: (action: string, value?: string) => Promise<void>;
}) {
  const people = row.adults + row.children;
  return (
    <>
      <tr className="border-b last:border-0">
        <td className="py-2.5 pr-2 align-middle">
          {selectable ? (
            <input
              type="checkbox"
              className="h-4 w-4"
              aria-label={`Select ${row.contact_name}, ${row.flat}`}
              checked={checked}
              onChange={onToggleSelect}
            />
          ) : null}
        </td>
        <td className="py-2.5 pr-3 align-middle">
          <p className="font-medium">
            {row.contact_name} · {row.flat}
          </p>
          <p className="text-xs text-muted-foreground">Booking {row.id.slice(0, 8).toUpperCase()}</p>
        </td>
        <td className="py-2.5 pr-3 text-right align-middle tabular-nums">{people}</td>
        <td className="py-2.5 pr-3 text-right align-middle tabular-nums">{row.food_count}</td>
        <td className="py-2.5 pr-3 text-right align-middle tabular-nums">{formatCurrency(row.amount_due / 100)}</td>
        <td className="py-2.5 pr-3 align-middle">
          <PaymentBadge row={row} />
        </td>
        <td className="py-2.5 pr-3 text-right align-middle tabular-nums">
          {row.checked_in_count}/{people}
        </td>
        <td className="py-2.5 text-right align-middle">
          <button
            type="button"
            aria-expanded={open}
            onClick={onToggleOpen}
            className="min-h-10 px-2 text-sm font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {open ? "Hide" : "Open"}
          </button>
        </td>
      </tr>
      {open ? (
        <tr className="border-b bg-muted/30">
          <td colSpan={8} className="p-3">
            <BookingCard row={row} manager pending={pending} onAction={onAction} />
          </td>
        </tr>
      ) : null}
    </>
  );
}
