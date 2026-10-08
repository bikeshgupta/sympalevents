import type { EventStatus } from "./event-status";

/**
 * The one thing a resident is invited to do on an event's home page.
 *
 * Chosen from where the event is in its life and what the viewer already has,
 * never a flat "View event" on everything - the same idea as `callToAction` on
 * the society cards, with more to go on because here we know about their
 * booking. There is exactly one: a screen with two equally loud buttons has
 * none.
 *
 * Pure and import-free beyond a type, so every branch is checkable on its own.
 */

export type ResidentActionPage = "registration" | "event-plan" | "closing";

export type ResidentAction = {
  /** The short line above the button. */
  headline: string;
  /** What the button says. Null for a notice with nothing to do. */
  label: string | null;
  /** The page the button opens. */
  page: ResidentActionPage | null;
};

export type ResidentActionInput = {
  status: EventStatus;
  /** Which pages this viewer may open (`null` = demo: do not filter). */
  canOpen: (page: ResidentActionPage) => boolean;
  /** Registration is switched on, in date, and has places left. */
  registrationOpen: boolean;
  /** Residents book for themselves, rather than through an organiser. */
  selfService: boolean;
  /** They already have an active booking. */
  hasBooking: boolean;
};

export function resolveResidentAction(input: ResidentActionInput): ResidentAction | null {
  const { status, canOpen, registrationOpen, selfService, hasBooking } = input;
  const canRegister = canOpen("registration");
  const canSchedule = canOpen("event-plan");
  const canRelive = canOpen("closing");

  if (status === "draft") return null;

  if (status === "cancelled") {
    return { headline: "This event has been cancelled", label: null, page: null };
  }

  if (status === "completed") {
    return canRelive ? { headline: "That was a wonderful one", label: "View memories", page: "closing" } : null;
  }

  // Booked already: that is the thing they will want, before and during.
  if (hasBooking && canRegister) {
    return {
      headline: status === "live" ? "You are registered" : "You're registered",
      label: "View my registration",
      page: "registration",
    };
  }

  if (status === "live") {
    if (canSchedule) return { headline: "Happening now", label: "See what's on", page: "event-plan" };
    if (registrationOpen && canRegister) return { headline: "Happening now", label: "Register now", page: "registration" };
    return null;
  }

  // Upcoming.
  if (canRegister) {
    if (registrationOpen && selfService) return { headline: "Registration is open", label: "Register now", page: "registration" };
    return { headline: "Join the event", label: "How to register", page: "registration" };
  }
  if (canSchedule) return { headline: "Coming up", label: "View schedule", page: "event-plan" };
  return null;
}

/**
 * Whether registration can be taken right now.
 *
 * Mirrors the server's own checks (`book_event` in 032) only to decide what to
 * *offer* - the server is still the one that accepts or refuses a booking.
 */
export function isRegistrationOpen(
  config: { enabled: boolean; closes_at: string | null; capacity: number | null },
  attendees: number,
  now = new Date(),
) {
  if (!config.enabled) return false;
  if (config.closes_at && now.getTime() >= new Date(config.closes_at).getTime()) return false;
  if (config.capacity !== null && attendees >= config.capacity) return false;
  return true;
}
