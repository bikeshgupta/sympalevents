/**
 * Formatting for printed notices - see src/features/notices/.
 *
 * Lives here rather than beside the components so that file exports only
 * components (fast refresh) and so a notice never hand-rolls a date.
 */

/**
 * Who may open and print a notice: **admin or committee only**.
 *
 * Deliberately the member's role, not view access to the page. A notice is a
 * committee instrument - it goes on the board or into the residents' group
 * over the committee's name, and its committee copy carries flats, owners and
 * internal notes. A resident who can *read* a page (or anyone at all, on a
 * page the admin made public) has no business issuing one, so the button is
 * not drawn for them and neither notice dialog is mounted.
 *
 * This is a UI gate on data the viewer already has; it is not a data
 * boundary. What each page hands a viewer is still decided server-side
 * (api/_lib/prasad.ts, api/expenses.ts, and page visibility).
 */
export function canPrintNotices(role: string | null | undefined) {
  return role === "admin" || role === "committee";
}

/** A timestamp as "14 Sept, 7:00 pm", read in the event's zone. */
export function formatNoticeTimestamp(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Kolkata",
  }).format(parsed);
}

/** "Printed 12 Sept 2026", for the footer of a sheet. */
export function formatPrintedOn(now = new Date()) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  }).format(now);
}

/**
 * "Day 2" when the date falls on or after the event's first day, otherwise
 * the plain weekday date - a slot or an event can sit outside the event's own
 * dates (a pre-event puja).
 */
export function noticeDayLabel(date: string, startDate: string, fallback: (date: string) => string) {
  const start = Date.parse(`${startDate}T00:00:00Z`);
  const on = Date.parse(`${date}T00:00:00Z`);
  if (Number.isNaN(start) || Number.isNaN(on)) return fallback(date);
  const index = Math.round((on - start) / (24 * 60 * 60 * 1000));
  return index >= 0 ? `Day ${index + 1}` : fallback(date);
}
