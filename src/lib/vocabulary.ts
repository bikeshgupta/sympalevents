import { useEventAccess } from "@/lib/event-access";
import { pageLabels } from "@/lib/page-access";

/**
 * What this event calls things.
 *
 * Two mechanisms, and deliberately only two - this is not an internationalisation
 * layer and should not grow into one:
 *
 *   - a module's `label_override`, which names a whole screen. A sports meet's
 *     Contributions page is "Entry fees"; a cultural night's Prasad page is
 *     "Refreshments". Set per event in Settings -> Modules, resolved by the
 *     server, and already used by the nav.
 *   - `events.unit_label`, the word for the unit a person belongs to. "Flat"
 *     in a housing society, "House" in a school, "Team" in a league. It was
 *     hardcoded as Flat across Contributions, Sponsors and their CSV exports.
 *
 * Anything else stays literal. A screen whose copy only makes sense for one
 * kind of event is a screen to rewrite, not a string to parameterise.
 */

export type Vocabulary = {
  /** What this event calls the given module. */
  labelFor: (pageKey: string) => string;
  /** Singular, capitalised: "Flat", "Team". */
  unit: string;
  /** Plural, capitalised: "Flats", "Teams". */
  unitPlural: string;
  /** Lower case, for the middle of a sentence. */
  unitLower: string;
  eventType: string;
};

/**
 * English plurals are only irregular in ways this does not hit: the realistic
 * values are Flat, House, Home, Team, Department, Wing, Block. A word ending
 * in a sibilant would read wrong with a bare "s", so those take "es".
 */
function pluralise(word: string) {
  if (/(s|x|z|ch|sh)$/i.test(word)) return `${word}es`;
  if (/[^aeiou]y$/i.test(word)) return `${word.slice(0, -1)}ies`;
  return `${word}s`;
}

/**
 * Everything here comes from `useEventAccess()`, which every screen already
 * calls once. Reading the unit label from `useEventData()` instead would key a
 * second copy of the screen payload on this hook's own task flag and fetch the
 * whole event again on pages that ask for tasks.
 */
export function useVocabulary(): Vocabulary {
  const { data: access } = useEventAccess();

  const labels = new Map(
    (Array.isArray(access?.pages) ? access.pages : [])
      .filter((page) => page.label)
      .map((page) => [page.pageKey, page.label as string]),
  );

  const unit = (access?.unitLabel ?? "").trim() || "Flat";

  return {
    labelFor: (pageKey: string) => labels.get(pageKey) ?? pageLabels[pageKey] ?? pageKey,
    unit,
    unitPlural: pluralise(unit),
    unitLower: unit.toLowerCase(),
    eventType: access?.eventType ?? "festival",
  };
}

/**
 * Relabel the unit column of a table's column list.
 *
 * The column lists stay module-scope consts, as every table screen here
 * defines them - this only swaps the one label at render time, so sorting,
 * filtering and the CSV export all keep working off the same `key`.
 */
export function withUnitColumn<T extends { key: string; label: string }>(columns: T[], unit: string): T[] {
  return columns.map((column) => (column.key === "flat" ? { ...column, label: unit } : column));
}
