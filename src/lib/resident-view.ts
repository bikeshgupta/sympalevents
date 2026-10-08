/**
 * The rules that make the resident's view of an event different from an
 * organiser's - kept pure, so they can be checked without rendering anything.
 *
 * ## Two views of one event
 *
 * A resident wants to know what the event is, when, and what to do about it. A
 * committee member wants to run it. They used to open the same app and see the
 * same sixteen-item sidebar, so a resident browsing a Garba night met Budget,
 * Expenses, Tasks and Contacts. Now:
 *
 *   - **organiser** - anybody with a role on the event (admin, committee or
 *     read-only), or an explicit edit grant on any page. They see what they have
 *     always seen, and can preview the resident's view.
 *   - **resident** - everybody else: signed out, or signed in without a role.
 *
 * This is presentation, never permission. The server still decides which pages
 * and which data a person may have (`useEventAccess().pages`); a view only
 * decides which of those are *put in front* of them. Nothing here grants access
 * and nothing here is a reason to skip a server check.
 */

export type ViewMode = "organiser" | "resident";

/**
 * Pages that are for running the event, not attending it. A resident's menu
 * leaves them out; a direct link still works if the server allows it - this is
 * a menu, not a lock.
 *
 * A deny-list on purpose: a page this file has never heard of shows up for a
 * resident the server allows, rather than silently vanishing.
 */
export const organiserOnlyPages = new Set([
  "contributions",
  "sponsors",
  "budget",
  "expenses",
  "tasks",
  "volunteers",
  "contacts",
  "settings",
]);

/** Dashboard widgets that are the organiser's own: the money maths and the
 *  signed-in person's task list. */
export const organiserOnlyWidgets = new Set(["financial-summary", "my-responsibilities"]);

export function isOrganiserPage(pageKey: string) {
  return organiserOnlyPages.has(pageKey);
}

/**
 * Whether somebody is an organiser of this event.
 *
 * A role of any kind counts, `read_only` included: those members were given
 * the app on purpose and may have been granted pages that a resident menu
 * would hide, so trimming their sidebar would take something away from them.
 * An explicit edit grant counts for the same reason.
 */
export function isEventOrganiser(access: {
  role: string | null;
  pages: { canEdit: boolean }[];
}) {
  return access.role !== null || access.pages.some((page) => page.canEdit);
}

/**
 * The view somebody gets.
 *
 * - No event yet (the demo): the app as it has always been.
 * - An organiser: their own view, unless they chose to preview a resident's.
 * - Anyone else: the resident's.
 */
export function resolveViewMode(input: {
  hasEvent: boolean;
  isOrganiser: boolean;
  previewing: boolean;
}): ViewMode {
  if (!input.hasEvent) return "organiser";
  if (!input.isOrganiser) return "resident";
  return input.previewing ? "resident" : "organiser";
}
