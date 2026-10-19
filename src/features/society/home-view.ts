/**
 * The two tabs at the top of the home page: "My space" and the person's society.
 *
 * Pure and import-free so the rules can be checked without rendering anything.
 *
 * - The second tab is named after the society when the person has exactly one ("TRU WindChimes"), and
 *   "Societies" once they have more, because then the tab holds a choice between them.
 * - Which tab is open comes from the address (`?view=space`), so a link, a refresh and the Back button all
 *   agree. Without it the society tab opens, since that is where a member's events are - unless the person
 *   has no society at all, when My space is the only tab with anything in it.
 * - A signed-out visitor gets no tabs: My space is a person's own, and there is nobody to own it.
 */

export type HomeView = "space" | "society";

export const SPACE_PARAM = "view";
export const SPACE_VALUE = "space";

export function homeView(param: string | null | undefined, opts: { signedIn: boolean; societyCount: number; hasSlug: boolean }): HomeView {
  if (!opts.signedIn) return "society";
  if (param === SPACE_VALUE) return "space";
  // A society named in the address is a society to show, member or not.
  if (opts.hasSlug) return "society";
  return opts.societyCount > 0 ? "society" : "space";
}

export function societyTabLabel(societies: { name: string }[]) {
  if (societies.length === 1) return societies[0].name;
  return "Societies";
}

/** Whether the society tab holds a chooser between societies. One society needs no chooser. */
export function showsSocietyChooser(societyCount: number) {
  return societyCount > 1;
}
