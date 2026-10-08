/**
 * "Good to know": what an organiser tells residents that is not on the schedule.
 *
 * Where to park, what to bring, who to ask, a link to directions. One jsonb
 * object on the event (migration 039), cleaned here on the way in *and* out -
 * jsonb stores anything, and this is text that renders on a page an admin may
 * have set to "anyone with the link".
 *
 * Plain text only. It is rendered as text by React, never as HTML, but the
 * limits matter anyway: eight entries, a short title and a few lines of text
 * each, so it stays something a phone screen can read at a glance.
 *
 * The one link, `directionsUrl`, has to be https. A `javascript:` or `http:`
 * link in a public page is not something an organiser's typo should be able to
 * produce. Pure and import-free, so it is checked on its own
 * (tests/good-to-know.test.mjs).
 */

export type GoodToKnowItem = { title: string; text: string };
export type GoodToKnow = { directionsUrl?: string; items: GoodToKnowItem[] };

export const MAX_ITEMS = 8;
export const MAX_TITLE = 40;
export const MAX_TEXT = 400;
export const MAX_URL = 300;

/** An https URL, or null. */
export function cleanDirectionsUrl(value: unknown): string | null {
  const raw = String(value ?? "").trim();
  if (!raw || raw.length > MAX_URL) return null;
  try {
    const url = new URL(raw);
    return url.protocol === "https:" && url.hostname.includes(".") ? url.toString() : null;
  } catch {
    return null;
  }
}

/**
 * The cleaned value, or null when nothing is left.
 *
 * `strict` is for a write: a link that is not https is an error the organiser
 * should hear about rather than a link that silently vanishes. A read is
 * forgiving and just leaves it out.
 */
export function cleanGoodToKnow(value: unknown, strict = false): GoodToKnow | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;

  const items: GoodToKnowItem[] = [];
  for (const entry of Array.isArray(raw.items) ? raw.items : []) {
    const item = (entry && typeof entry === "object" ? entry : {}) as Record<string, unknown>;
    const title = String(item.title ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_TITLE);
    const text = String(item.text ?? "")
      .replace(/\r\n/g, "\n")
      .replace(/[ \t]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
      .slice(0, MAX_TEXT);
    if (!title || !text) continue;
    items.push({ title, text });
    if (items.length === MAX_ITEMS) break;
  }

  const given = String(raw.directionsUrl ?? "").trim();
  const directionsUrl = cleanDirectionsUrl(given);
  if (strict && given && !directionsUrl) {
    throw Object.assign(new Error("The directions link has to start with https://"), { statusCode: 400 });
  }

  if (!items.length && !directionsUrl) return null;
  return { ...(directionsUrl ? { directionsUrl } : {}), items };
}
