import { BadgeIndianRupee, Check, Loader2, Phone, X } from "lucide-react";
import { useState } from "react";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ContributionPayment, useContributionPayments } from "@/lib/contribution-payments";
import { isUpiConfigured } from "@/lib/upi";
import { formatCurrency } from "@/lib/utils";

/**
 * The committee's side of self-service UPI contributions.
 *
 * Nothing a resident does adds to the collected total on its own - a UPI
 * intent link cannot report back, so every payment lands here first as a
 * claim. Confirming one is what writes the row into Contributions; rejecting
 * leaves the numbers untouched.
 */
export function PendingPaymentsPanel({ eventId, canEdit }: { eventId?: string; canEdit: boolean }) {
  const { payments, isLoading, isError, error, review } = useContributionPayments(eventId, { enabled: canEdit });
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Residents can only reach the payment flow when a UPI id is configured, so
  // without one there is nothing for this queue to ever hold.
  if (!canEdit || !isUpiConfigured) return null;

  async function confirm(payment: ContributionPayment) {
    const question =
      `Confirm ${formatCurrency(payment.amount)} from ${payment.flat_no} (${payment.resident_name})?\n\n` +
      "This adds it to the Contributions list and the collected total.";
    if (!window.confirm(question)) return;

    setActionError(null);
    try {
      await review.mutateAsync({ paymentId: payment.id, action: "confirm" });
    } catch (item) {
      setActionError(item instanceof Error ? item.message : "Could not confirm this payment");
    }
  }

  async function reject(payment: ContributionPayment, reviewNote: string) {
    setActionError(null);
    try {
      await review.mutateAsync({ paymentId: payment.id, action: "reject", reviewNote });
      setRejectingId(null);
    } catch (item) {
      setActionError(item instanceof Error ? item.message : "Could not reject this payment");
    }
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-3 border-b pb-4">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
            <BadgeIndianRupee className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <CardTitle>Payments to confirm</CardTitle>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Residents who paid by UPI. Check your account, then confirm to add it to the list.
            </p>
          </div>
        </div>
        {payments.length ? (
          <span className="shrink-0 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium tabular-nums text-amber-800">
            {payments.length} waiting
          </span>
        ) : null}
      </CardHeader>

      <CardContent className="pt-4">
        {isLoading ? (
          <div className="space-y-2" aria-live="polite">
            <span className="sr-only">Loading payments</span>
            <div className="h-16 animate-pulse rounded-md bg-muted" />
            <div className="h-16 animate-pulse rounded-md bg-muted" />
          </div>
        ) : isError ? (
          <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            {error ?? "Could not load pending payments."}
          </p>
        ) : payments.length === 0 ? (
          <p className="rounded-md bg-muted p-4 text-sm text-muted-foreground">
            Nothing waiting. Payments residents start from “Contribute now” appear here for you to confirm.
          </p>
        ) : (
          <ul className="space-y-3">
            {payments.map((payment) => (
              <li key={payment.id} className="rounded-lg border p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium">
                      {payment.flat_no} · {payment.resident_name}
                      {payment.resident_type ? (
                        <span className="text-muted-foreground"> ({payment.resident_type})</span>
                      ) : null}
                    </p>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      {formatSubmittedAt(payment.created_at)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="text-lg font-semibold tabular-nums">{formatCurrency(payment.amount)}</span>
                    <StatusBadge status={statusLabel(payment.status)} />
                  </div>
                </div>

                <dl className="mt-3 grid gap-x-4 gap-y-2 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-xs text-muted-foreground">Our reference</dt>
                    <dd className="break-all font-medium">{payment.reference}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Their transaction ID</dt>
                    <dd className="break-all">{payment.payer_reference || "—"}</dd>
                  </div>
                  {payment.phone ? (
                    <div>
                      <dt className="text-xs text-muted-foreground">Phone</dt>
                      <dd>
                        <a
                          className="inline-flex items-center gap-1.5 hover:underline"
                          href={`tel:${payment.phone}`}
                        >
                          <Phone className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                          {payment.phone}
                        </a>
                      </dd>
                    </div>
                  ) : null}
                  {payment.note ? (
                    <div className="sm:col-span-2">
                      <dt className="text-xs text-muted-foreground">Message</dt>
                      <dd>{payment.note}</dd>
                    </div>
                  ) : null}
                </dl>

                {payment.status === "initiated" ? (
                  <p className="mt-3 rounded-md bg-muted p-2.5 text-xs text-muted-foreground">
                    This resident opened their UPI app but never told us whether it went through — check the account
                    before confirming.
                  </p>
                ) : null}

                {rejectingId === payment.id ? (
                  <RejectRow
                    saving={review.isPending}
                    onCancel={() => setRejectingId(null)}
                    onReject={(note) => reject(payment, note)}
                  />
                ) : (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button size="sm" disabled={review.isPending} onClick={() => confirm(payment)}>
                      {review.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                      ) : (
                        <Check className="h-4 w-4" aria-hidden="true" />
                      )}
                      Confirm
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={review.isPending}
                      onClick={() => {
                        setActionError(null);
                        setRejectingId(payment.id);
                      }}
                    >
                      <X className="h-4 w-4" aria-hidden="true" />
                      Reject
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}

        {actionError ? (
          <p className="mt-3 rounded-md bg-destructive/10 p-3 text-sm text-destructive">{actionError}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function RejectRow({
  saving,
  onCancel,
  onReject,
}: {
  saving: boolean;
  onCancel: () => void;
  onReject: (note: string) => void;
}) {
  const [note, setNote] = useState("");

  return (
    <div className="mt-3 space-y-2 rounded-md border border-destructive/30 bg-destructive/5 p-3">
      <label className="text-sm font-medium" htmlFor="rejectNote">
        Why are you rejecting this?
      </label>
      <Input
        id="rejectNote"
        value={note}
        onChange={(event) => setNote(event.target.value)}
        placeholder="Not found in the account, duplicate…"
        maxLength={200}
      />
      <div className="flex gap-2">
        <Button size="sm" variant="outline" disabled={saving} onClick={() => onReject(note.trim())}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
          Reject payment
        </Button>
        <Button size="sm" variant="ghost" disabled={saving} onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

/** "Awaiting confirmation" reads as a queue state; "Pending" matches the badge palette. */
function statusLabel(status: ContributionPayment["status"]) {
  return status === "awaiting_confirmation" ? "Pending" : "Not Started";
}

function formatSubmittedAt(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  }).format(parsed);
}
