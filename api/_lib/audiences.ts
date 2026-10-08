/**
 * Who a message is for. Pure and import-free, so it is checked on its own
 * (tests/communications.test.mjs) and shared by the segment counts and the
 * count each recorded message stores.
 */

export const audienceKeys = ["everyone", "registered", "payment_pending", "payment_submitted", "food_booked", "not_arrived"] as const;
export type AudienceKey = (typeof audienceKeys)[number];

export type Row = {
  flat: string;
  payment_status: string;
  food_count: number;
  checked_in_count: number;
};

/** Which registrations belong to a segment. Pure, so it can be checked. */
export function inSegment(key: AudienceKey, row: Row) {
  switch (key) {
    case "registered":
      return true;
    case "payment_pending":
      return row.payment_status === "unpaid";
    case "payment_submitted":
      return row.payment_status === "submitted";
    case "food_booked":
      return row.food_count > 0;
    case "not_arrived":
      return ["verified", "free"].includes(row.payment_status) && row.checked_in_count === 0;
    default:
      return false;
  }
}

export const audienceLabels: Record<AudienceKey, string> = {
  everyone: "Everyone in the society group",
  registered: "Registered households",
  payment_pending: "Payment pending",
  payment_submitted: "Payment submitted, awaiting verification",
  food_booked: "Food booked",
  not_arrived: "Booked and paid, not arrived yet",
};

