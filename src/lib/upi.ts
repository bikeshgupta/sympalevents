/**
 * UPI deep links for self-service contributions.
 *
 * There is no payment gateway and no merchant account here: the resident's own
 * UPI app pays the committee's VPA directly, peer to peer. That has one hard
 * consequence the whole feature is built around - **a UPI intent link cannot
 * report back**. The browser hands control to another app and never learns
 * whether the transfer succeeded, so nothing in this file may be treated as
 * proof of payment. Confirmation is a committee action against the bank
 * statement (see `useContributionPayments`).
 *
 * The VPA is configuration, not a secret - it is the same string printed on a
 * payment QR code - so it lives in the client env alongside the Supabase
 * anon key.
 */

function readEnvValue(value: string | undefined) {
  return value?.trim().replace(/^["']|["']$/g, "");
}

/** The committee's UPI id, e.g. `someone@okhdfcbank`. */
export const upiVpa = readEnvValue(import.meta.env.VITE_UPI_ID as string | undefined) ?? "";

/** The name UPI apps show as the payee. Falls back to the VPA's own handle. */
export const upiPayeeName =
  readEnvValue(import.meta.env.VITE_UPI_PAYEE_NAME as string | undefined) || upiVpa.split("@")[0] || "";

/** False until someone sets VITE_UPI_ID - every payer-facing entry point hides itself. */
export const isUpiConfigured = Boolean(upiVpa);

export type UpiApp = {
  key: string;
  label: string;
  /** Scheme prefix; the query string is identical across all of them. */
  scheme: string;
};

/**
 * `upi://` is the one that always works - Android shows an app chooser and iOS
 * hands off to whichever UPI app is installed. The two named schemes are there
 * because residents ask for "PhonePe" and "Google Pay" by name, not because
 * they do anything the generic link does not.
 */
export const upiApps: UpiApp[] = [
  { key: "any", label: "Any UPI app", scheme: "upi://pay" },
  { key: "phonepe", label: "PhonePe", scheme: "phonepe://pay" },
  { key: "gpay", label: "Google Pay", scheme: "tez://upi/pay" },
  { key: "paytm", label: "Paytm", scheme: "paytmmp://pay" },
];

export type UpiLinkInput = {
  amount: number;
  /** Our own reference, which travels in `tr` and shows up on the statement. */
  reference: string;
  /** Short human note, e.g. "Ganesh Utsav - A-101". Trimmed to what apps accept. */
  note: string;
};

/**
 * Builds the payment URL for one app. Every parameter is percent-encoded:
 * an unencoded `&` in a payee name or note would silently truncate the amount,
 * which is the kind of bug that only shows up as a wrong figure in someone's
 * UPI app.
 */
export function buildUpiUrl(app: UpiApp, { amount, reference, note }: UpiLinkInput) {
  const params = new URLSearchParams({
    pa: upiVpa,
    pn: upiPayeeName,
    // UPI wants a plain decimal string with two places, not a locale format.
    am: amount.toFixed(2),
    cu: "INR",
    // Apps quietly drop long notes, so keep it inside what they all accept.
    tn: note.slice(0, 50),
    tr: reference,
  });

  return `${app.scheme}?${params.toString()}`;
}

/**
 * Desktop browsers have no UPI app to hand off to, so the dialog shows the VPA
 * to copy instead of buttons that would do nothing. Coarse on purpose - a
 * wrong guess here only changes which of two equally usable panels is shown.
 */
export function isLikelyMobile() {
  if (typeof navigator === "undefined") return false;
  return /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent);
}
