/**
 * The messages an organiser sends most, written once.
 *
 * Plain text for WhatsApp - no markup beyond what WhatsApp itself renders -
 * built from the event's own facts so the date, venue and link are never typed
 * out wrong at ten at night. A message **never names a recipient**: the audience
 * is a description ("payment pending") that tells the organiser who to paste it
 * to, not text inside the message. Pure, so it is checked on its own.
 */

export type TemplateKey = "registration_reminder" | "payment_reminder" | "schedule_update" | "volunteer_request" | "custom";

export type MessageContext = {
  eventName: string;
  /** "Sat, 17 Oct" - already formatted. */
  when: string;
  /** "7:00 pm" or "". */
  time: string;
  venue: string;
  /** Where to register. Absolute. */
  registerLink: string;
  /** The event's page. Absolute. */
  eventLink: string;
  paymentInstructions: string;
  /** "17 Oct, 6:00 pm" or "" - when registration closes. */
  deadline: string;
};

export const messageTemplates: { key: TemplateKey; label: string; hint: string; defaultAudience: string }[] = [
  { key: "registration_reminder", label: "Registration reminder", hint: "Tell people registration is open", defaultAudience: "everyone" },
  { key: "payment_reminder", label: "Payment reminder", hint: "Chase unpaid bookings", defaultAudience: "payment_pending" },
  { key: "schedule_update", label: "Schedule update", hint: "A change or a reminder of the programme", defaultAudience: "registered" },
  { key: "volunteer_request", label: "Volunteer request", hint: "Ask for helping hands", defaultAudience: "everyone" },
  { key: "custom", label: "Your own message", hint: "Start from a blank page", defaultAudience: "everyone" },
];

const line = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(" · ");

export function buildMessage(key: TemplateKey, ctx: MessageContext): string {
  const where = line(ctx.when, ctx.time, ctx.venue);

  switch (key) {
    case "registration_reminder":
      return [
        `Hello! Registration for ${ctx.eventName} is open.`,
        where,
        "",
        `Please register your household here: ${ctx.registerLink}`,
        ctx.deadline ? `Registration closes ${ctx.deadline}.` : "",
        "",
        "Thank you!",
      ]
        .filter((value, index, all) => value !== "" || (index > 0 && all[index - 1] !== ""))
        .join("\n")
        .trim();

    case "payment_reminder":
      return [
        `Hello! A gentle reminder to complete your payment for ${ctx.eventName}${ctx.when ? ` (${ctx.when})` : ""}.`,
        "",
        ctx.paymentInstructions ? `How to pay:\n${ctx.paymentInstructions}` : "",
        "",
        `After paying, please add your UPI / bank reference to your booking: ${ctx.registerLink}`,
        ctx.deadline ? `Please do this before ${ctx.deadline}.` : "",
        "",
        "Thank you!",
      ]
        .filter((value, index, all) => value !== "" || (index > 0 && all[index - 1] !== ""))
        .join("\n")
        .trim();

    case "schedule_update":
      return [
        `Update for ${ctx.eventName}:`,
        "",
        "[Write the change or reminder here]",
        "",
        where,
        `Full programme: ${ctx.eventLink}`,
      ].join("\n");

    case "volunteer_request":
      return [
        `We need a few volunteers for ${ctx.eventName}.`,
        where,
        "",
        "If you can help, even for an hour, please reply to this message with your name and flat number.",
        "",
        "Thank you!",
      ]
        .filter((value, index, all) => value !== "" || (index > 0 && all[index - 1] !== ""))
        .join("\n")
        .trim();

    default:
      return "";
  }
}

/** A message that still has its fill-in-the-blank marker is not ready to send. */
export function hasPlaceholder(body: string) {
  return /\[[^\]]*(write|add|insert)[^\]]*\]/i.test(body);
}
