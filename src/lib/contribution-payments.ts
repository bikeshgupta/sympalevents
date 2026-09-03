import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import type { ContributionRow } from "@/lib/event-data";

/**
 * A resident's self-service UPI contribution, from "opened their UPI app" to
 * "the committee saw it on the statement".
 *
 * `initiated`            - the link was opened; we have not heard back.
 * `awaiting_confirmation`- the payer says they paid. Still just a claim.
 * `confirmed`            - a committee member matched it and it is now a
 *                          row in Contributions.
 * `rejected`             - reviewed and not accepted.
 * `cancelled`            - the payer told us they did not complete it.
 */
export type ContributionPaymentStatus =
  | "initiated"
  | "awaiting_confirmation"
  | "confirmed"
  | "rejected"
  | "cancelled";

export type ContributionPayment = {
  id: string;
  event_id: string;
  contribution_id: string | null;
  resident_id: string | null;
  flat_no: string;
  resident_name: string;
  resident_type: string | null;
  phone: string | null;
  amount: number;
  note: string | null;
  reference: string;
  payer_reference: string | null;
  upi_vpa: string | null;
  status: ContributionPaymentStatus;
  reviewed_at: string | null;
  review_note: string | null;
  created_at: string;
  updated_at: string;
};

/**
 * The amount this event actually expects per flat, read from the rows rather
 * than assumed. The most common expected value, not the average, so one flat
 * pledging ten times the usual amount does not drag the suggestion up. Zero
 * when there is nothing to go on, which reads as "no chips".
 */
export function commonExpectedAmount(rows: ContributionRow[]) {
  const counts = new Map<number, number>();
  for (const row of rows) {
    if (row.expected > 0) counts.set(row.expected, (counts.get(row.expected) ?? 0) + 1);
  }

  let best = 0;
  let bestCount = 0;
  for (const [amount, count] of counts) {
    if (count > bestCount) {
      best = amount;
      bestCount = count;
    }
  }
  return best;
}

export function suggestedAmounts(expectedPerFlat: number) {
  if (!Number.isFinite(expectedPerFlat) || expectedPerFlat <= 0) return [];
  return [expectedPerFlat, expectedPerFlat * 2, expectedPerFlat * 5];
}

const ENDPOINT = "/api/events?resource=contribution-payments";

export type StartPaymentInput = {
  eventId: string;
  flat: string;
  name: string;
  type: string;
  phone: string;
  amount: number;
  note?: string;
  upiVpa?: string;
};

/**
 * Records the attempt *before* the hand-off to the UPI app, so a payment that
 * the resident completes but never comes back to report is still sitting in
 * the committee's queue to be matched against the statement.
 *
 * Deliberately `requireAuth: false`: the dashboard is a public page and a
 * resident should not need an account to contribute. The server treats the
 * result as an unverified claim either way.
 */
export function useStartContributionPayment() {
  return useMutation({
    mutationFn: (input: StartPaymentInput) =>
      apiFetch<{ payment: ContributionPayment }>(ENDPOINT, {
        method: "POST",
        body: input,
        requireAuth: false,
      }),
  });
}

/**
 * The payer's own answer to "did that go through?". Authorized by the
 * reference the server handed back when the payment was started - that is what
 * keeps one resident from closing out another's payment.
 */
export function useReportContributionPayment() {
  return useMutation({
    mutationFn: (input: {
      paymentId: string;
      reference: string;
      action: "reported" | "cancelled";
      payerReference?: string;
    }) =>
      apiFetch<{ payment: ContributionPayment }>(ENDPOINT, {
        method: "PATCH",
        body: input,
        requireAuth: false,
      }),
  });
}

/**
 * The committee's review queue. Confirming is the only thing in this feature
 * that writes to `contributions`, which is why the numbers on the dashboard
 * can never be moved by an unverified claim.
 *
 * Gated on `enabled` because the server answers this one for admin/committee
 * only - asking as a resident would just 403 on every screen load.
 */
export function useContributionPayments(eventId?: string, options: { enabled?: boolean } = {}) {
  const enabled = Boolean(eventId) && options.enabled !== false;
  const queryClient = useQueryClient();
  const queryKey = ["contribution-payments", eventId];

  const query = useQuery({
    queryKey,
    enabled,
    queryFn: () =>
      apiFetch<{ payments: ContributionPayment[] }>(`${ENDPOINT}&eventId=${encodeURIComponent(eventId!)}`),
    retry: false,
  });

  async function refresh() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey }),
      // A confirmed payment becomes a contribution row, so the table, the
      // stat cards and the dashboard all have to re-read.
      queryClient.invalidateQueries({ queryKey: ["event-data"] }),
    ]);
  }

  const review = useMutation({
    mutationFn: (input: { paymentId: string; action: "confirm" | "reject"; reviewNote?: string }) =>
      apiFetch<{ payment: ContributionPayment }>(ENDPOINT, { method: "PATCH", body: input }),
    onSuccess: refresh,
  });

  return {
    payments: query.data?.payments ?? [],
    isLoading: enabled && query.isLoading,
    isError: query.isError,
    error: query.error instanceof Error ? query.error.message : null,
    review,
  };
}
