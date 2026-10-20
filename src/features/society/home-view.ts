/**
 * The two tabs at the top of the home page: "My space" and the person's society.
 *
 * Pure and import-free so the rules can be checked without rendering anything.
 *
 * - The second tab is named after the society when the person has exactly one ("TRU WindChimes"), and
 *   "Societies" once they have more, because then the tab holds a choice between them.
 * - Which tab is open comes from the address (`?view=space`), so a link, a refresh and the Back button all
 *   agree. Without it the society tab opens, since that is where a member's events are - unless the person
 *   has no society at all, or their society has no events to show (`societyEmpty`), when My space opens.
 *   A society named in the address always opens, empty or not: somebody chose it.
 * - The same page and the same rules for somebody signed out: My space holds "Create your free event" and the
 *   code box, and only creating an event or joining a society asks them to sign in. A society opened by its
 *   address shows that society, as it always has.
 * - `?view=society` opens the society tab even for somebody with no society, so the tab is never a dead link.
 */

export type HomeView = "space" | "society";

export const SPACE_PARAM = "view";
export const SPACE_VALUE = "space";
export const SOCIETY_VALUE = "society";

export function homeView(
  param: string | null | undefined,
  opts: { societyCount: number; hasSlug: boolean; societyEmpty?: boolean | null },
): HomeView {
  if (param === SPACE_VALUE) return "space";
  if (param === SOCIETY_VALUE) return "society";
  // A society named in the address is a society to show, member or not.
  if (opts.hasSlug) return "society";
  if (opts.societyCount === 0) return "space";
  // Unknown (still loading) counts as not empty, so the society's own skeleton shows meanwhile.
  return opts.societyEmpty === true ? "space" : "society";
}

export function societyTabLabel(societies: { name: string }[]) {
  if (societies.length === 1) return societies[0].name;
  return "Societies";
}

/** Whether the society tab holds a chooser between societies. One society needs no chooser. */
export function showsSocietyChooser(societyCount: number) {
  return societyCount > 1;
}
