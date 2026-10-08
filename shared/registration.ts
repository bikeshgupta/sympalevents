import { z } from "zod";

const money = z.number().int().min(0).max(10000000);
export const registrationConfigSchema = z.object({
  enabled: z.boolean(),
  self_service: z.boolean(),
  audience: z.enum(["society", "public"]),
  adult_price: money,
  child_price: money,
  child_age_limit: z.number().int().min(1).max(21),
  food_enabled: z.boolean(),
  food_price: money,
  allow_guests: z.boolean(),
  capacity: z.number().int().min(1).max(100000).nullable(),
  closes_at: z.string().datetime({ offset: true }).nullable(),
  payment_instructions: z.string().trim().max(1500),
  cancellation_policy: z.string().trim().max(1500),
});
export type RegistrationConfig = z.infer<typeof registrationConfigSchema>;
export const defaultRegistrationConfig: RegistrationConfig = {
  enabled: false,
  self_service: false,
  audience: "society",
  adult_price: 0,
  child_price: 0,
  child_age_limit: 18,
  food_enabled: false,
  food_price: 0,
  allow_guests: false,
  capacity: null,
  closes_at: null,
  payment_instructions: "",
  cancellation_policy: "",
};
export const bookingSchema = z
  .object({
    contact_name: z.string().trim().min(2).max(100),
    flat: z.string().trim().min(1).max(40),
    adults: z.number().int().min(0).max(20),
    children: z.number().int().min(0).max(20),
    guests: z.number().int().min(0).max(40),
    food_count: z.number().int().min(0).max(40),
    idempotency_key: z.string().uuid(),
    quoted_amount: money.optional(),
    on_behalf: z.boolean().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.adults + v.children < 1 || v.adults + v.children > 40)
      ctx.addIssue({
        code: "custom",
        message: "Choose between 1 and 40 attendees",
      });
    if (v.guests > v.adults + v.children)
      ctx.addIssue({
        code: "custom",
        message: "Guests are part of your attendee count",
      });
    if (v.food_count > v.adults + v.children)
      ctx.addIssue({
        code: "custom",
        message: "Food portions cannot exceed attendees",
      });
  });
export type BookingInput = z.infer<typeof bookingSchema>;
/** All money is integer paise, with a price snapshot saved per booking. */
export function quoteBooking(
  config: RegistrationConfig,
  booking: Pick<BookingInput, "adults" | "children" | "food_count">,
) {
  return (
    booking.adults * config.adult_price +
    booking.children * config.child_price +
    (config.food_enabled ? booking.food_count * config.food_price : 0)
  );
}
export type Registration = {
  id: string;
  event_id: string;
  contact_name: string;
  flat: string;
  adults: number;
  children: number;
  guests: number;
  food_count: number;
  amount_due: number;
  payment_status:
    | "unpaid"
    | "submitted"
    | "verified"
    | "free"
    | "refund_pending"
    | "refunded";
  status: "active" | "cancelled";
  payment_reference: string;
  checked_in_count: number;
  food_served_count: number;
  version: number;
  created_at: string;
};
export const paymentLabels: Record<Registration["payment_status"], string> = {
  unpaid: "Payment due",
  submitted: "Awaiting verification",
  verified: "Payment verified",
  free: "Free entry",
  refund_pending: "Refund pending",
  refunded: "Refund recorded",
};
