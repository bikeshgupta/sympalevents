/**
 * The once-a-day reminder that a finished event is still waiting to be closed.
 *
 * Pure and import-free, so the rules are checked in tests/closing-reminder.test.mjs.
 * The caller passes the event's status (`getEventStatus`, the one status
 * authority) and today's IST day (`getDateInEventZone`). The popup itself is
 * src/features/closing/closing-reminder.tsx.
 *
 * - **Only the event's own admins** (`eventRole === "admin"` from
 *   /api/event-access). A society admin who holds no role on this event is not
 *   asked, and neither is a committee member - closing is the event admin's
 *   call, and the server enforces the same rule on close/reopen.
 * - **Never in the resident preview**, never on the closing page itself.
 * - **From the moment the event is completed** by its dates (end time, or the
 *   end of the last day), and never for a draft or cancelled event.
 * - **The first visit each day**, India time, remembered on the device.
 * - **Never again once it is closed**, for every admin: the closing row's
 *   `is_closed` is the server's answer, read only when everything else says yes.
 */
export type ReminderGate = {
  eventRole: string | null | undefined;
  isResidentView: boolean;
  onClosingPage: boolean;
  /** `getEventStatus(...)` with `isClosed: false`: "completed" means over by its dates. */
  status: string;
  /** The IST day the reminder was last shown on this device, if ever. */
  lastShownDay: string | null;
  /** Today in India, "2026-11-11". */
  today: string;
};

/** Everything except `is_closed`, which needs a request - so it is asked last. */
export function reminderMayShow(gate: ReminderGate) {
  if (gate.eventRole !== "admin") return false;
  if (gate.isResidentView || gate.onClosingPage) return false;
  if (gate.status !== "completed") return false;
  return gate.lastShownDay !== gate.today;
}

/** Whole days between the event's last day and today, both IST calendar days. */
export function daysSinceEnd(endDate: string, today: string) {
  const end = Date.parse(`${endDate}T00:00:00Z`);
  const now = Date.parse(`${today}T00:00:00Z`);
  if (!Number.isFinite(end) || !Number.isFinite(now)) return 0;
  return Math.max(0, Math.round((now - end) / 86_400_000));
}

export function finishedLabel(endDate: string, today: string) {
  const days = daysSinceEnd(endDate, today);
  if (days <= 0) return "Finished today";
  if (days === 1) return "Finished yesterday";
  return `Finished ${days} days ago`;
}

const storageKey = (eventId: string, userId: string) => `sympal:closing-reminder:${eventId}:${userId}`;

/** Storage can throw (private windows, blocked site data); then the reminder simply asks each visit. */
export function readLastShown(eventId: string, userId: string) {
  try {
    return window.localStorage.getItem(storageKey(eventId, userId));
  } catch {
    return null;
  }
}

export function writeLastShown(eventId: string, userId: string, day: string) {
  try {
    window.localStorage.setItem(storageKey(eventId, userId), day);
  } catch {
    // Nothing to do: see readLastShown.
  }
}
