import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

/**
 * Event-day entry. The server side is api/_lib/gate.ts.
 *
 * Nothing here is optimistic: a check-in is shown as done only once the server
 * has said so, and the answer it gives *is* the booking as it now stands. That
 * is what makes a second scan of the same pass safe - it comes back unchanged -
 * and it is why a dropped connection can never read as "admitted".
 */

export type GateBooking = {
  id: string;
  version: number;
  name: string;
  flat: string;
  bookingCode: string;
  adults: number;
  children: number;
  food: number;
  checkedIn: number;
  foodServed: number;
  amountDue: number;
  payment: "unpaid" | "submitted" | "verified" | "free" | "refund_pending" | "refunded";
  status: "active" | "cancelled";
  walkIn: boolean;
};

export type GateStats = {
  checkedIn: number;
  attendees: number;
  foodServed: number;
  food: number;
  walkIns: number;
  pendingPayment: number;
};

export type GatePayload = { stats: GateStats; results: GateBooking[]; canOverride: boolean };

export type GateAction =
  | { action: "check_in" | "serve_food"; id: string; version: number; count: number; override?: boolean }
  | { action: "cash"; id: string; version: number }
  | {
      action: "walk_in";
      name: string;
      flat: string;
      adults: number;
      children: number;
      idempotency_key: string;
    };

export const confirmedPayment = (booking: Pick<GateBooking, "payment">) =>
  booking.payment === "verified" || booking.payment === "free";

const base = "/api/events?resource=gate";

export function useGate(eventId: string | undefined, term: string) {
  const client = useQueryClient();
  const key = ["gate", eventId, term];

  const query = useQuery({
    queryKey: key,
    enabled: Boolean(eventId),
    // The totals are what the people at the gate glance at, and other phones are
    // changing them. Twenty seconds keeps them honest without hammering a server
    // from every volunteer's pocket.
    refetchInterval: 20_000,
    retry: 1,
    queryFn: () => apiFetch<GatePayload>(`${base}&eventId=${encodeURIComponent(eventId ?? "")}&q=${encodeURIComponent(term)}`),
  });

  const act = useMutation({
    mutationFn: (input: GateAction) =>
      apiFetch<{ registration: GateBooking }>(`${base}&eventId=${encodeURIComponent(eventId ?? "")}`, {
        method: "POST",
        body: input,
      }),
    onSuccess: ({ registration }) => {
      // Put the server's answer where the volunteer is looking, then refresh the
      // totals behind it.
      client.setQueryData<GatePayload>(key, (old) =>
        old
          ? {
              ...old,
              results: old.results.some((row) => row.id === registration.id)
                ? old.results.map((row) => (row.id === registration.id ? registration : row))
                : [registration, ...old.results],
            }
          : old,
      );
      void client.invalidateQueries({ queryKey: ["gate", eventId] });
    },
  });

  return { query, act };
}

/** Whether the browser believes it is online. A belief, not a promise: the
 *  last successful answer from the server is what "synced" is measured by. */
export function useOnline() {
  const [online, setOnline] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine));
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);
  return online;
}

/** Whether this browser can read a QR code from the camera: it needs the
 *  browser's own `BarcodeDetector` (Chrome and Edge; not iPhone Safari) and a
 *  camera. Where it cannot, the gate's search is the whole of the fallback. */
export function scanningSupported() {
  return typeof window !== "undefined" && "BarcodeDetector" in window && Boolean(navigator.mediaDevices?.getUserMedia);
}
