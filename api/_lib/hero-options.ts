/**
 * How an event's hero is dressed - see migration 035 and src/lib/hero.ts.
 *
 * One cleaner, used on the way in (appearance.ts) and on the way out
 * (event-data.ts, society-home.ts), because jsonb stores whatever it is given
 * and a row edited by hand must not be able to put a 4000-character subtitle
 * or an off-screen focal point in front of every visitor. Keys that are absent
 * or unusable are simply left out, so `null` still means "exactly what the
 * hero has always done".
 */

export type HeroOptions = {
  focusX?: number;
  focusY?: number;
  hideTitle?: boolean;
  subtitle?: string;
};

export const maxSubtitle = 90;

function percent(value: unknown) {
  const n = Number(value);
  if (value === null || value === "" || !Number.isFinite(n)) return undefined;
  return Math.round(Math.min(100, Math.max(0, n)));
}

export function cleanHeroOptions(value: unknown): HeroOptions | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const out: HeroOptions = {};

  // A focal point is only meaningful as a pair.
  const x = percent(raw.focusX);
  const y = percent(raw.focusY);
  if (x !== undefined && y !== undefined) {
    out.focusX = x;
    out.focusY = y;
  }

  if (raw.hideTitle === true) out.hideTitle = true;

  const subtitle = String(raw.subtitle ?? "").replace(/\s+/g, " ").trim().slice(0, maxSubtitle);
  if (subtitle) out.subtitle = subtitle;

  return Object.keys(out).length ? out : null;
}
