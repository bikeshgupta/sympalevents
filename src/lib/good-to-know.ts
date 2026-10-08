/** What an organiser tells residents that is not on the schedule. The server
 *  (api/_lib/good-to-know.ts) cleans it; this is its shape and a few helpers. */
export type GoodToKnowItem = { title: string; text: string };
export type GoodToKnow = { directionsUrl?: string; items: GoodToKnowItem[] };

export const MAX_ITEMS = 8;
export const MAX_TITLE = 40;
export const MAX_TEXT = 400;

/** What an organiser is offered as a starting point. Titles only: nothing here
 *  is published until they have written something under it and saved. */
export const suggestedTitles = ["Parking", "What to bring", "Who to ask"];

/** A map link made from the venue's own name, for when no link was given. */
export function mapsSearchUrl(venue: string) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(venue)}`;
}
