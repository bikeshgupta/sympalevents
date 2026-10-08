import { pageLabels } from "@/lib/page-access";

/** What the app calls a module when an event has not renamed it - for lists
 *  that name modules in plain words (the new-event review). */
export function moduleLabelFor(pageKey: string) {
  return pageLabels[pageKey] ?? pageKey;
}
