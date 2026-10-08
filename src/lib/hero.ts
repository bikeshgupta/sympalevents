import type { CSSProperties } from "react";

/**
 * How an event's hero is dressed. See migration 035 and api/_lib/hero-options.ts,
 * which cleans the same shape on the way in and the way out.
 *
 * Every field is optional and an event with none of them set is drawn by
 * exactly the code that drew it before this existed - that is the regression
 * bar, and why `heroPhotoStyle` returns `undefined` rather than a default.
 */
export type HeroOptions = {
  /** 0-100: how far across the photograph the anchor sits. */
  focusX?: number;
  /** 0-100: how far down. */
  focusY?: number;
  /** The picture already says the name; keep it for screen readers only. */
  hideTitle?: boolean;
  /** One line under the event name. */
  subtitle?: string;
};

export const MAX_SUBTITLE = 90;

export function heroFocus(options?: HeroOptions | null) {
  return options?.focusX !== undefined && options.focusY !== undefined
    ? { x: options.focusX, y: options.focusY }
    : null;
}

/**
 * The hero photograph's inline style when the organiser has chosen a focal
 * point, otherwise `undefined` so the original per-breakpoint classes (centred
 * and covering on a phone, full-height and right-aligned above `md`) stay in
 * charge. With a focal point the photograph covers the frame at every width -
 * a poster-shaped upload cannot be left-over-right-aligned and still show the
 * part somebody meant - and is anchored on that point.
 */
export function heroPhotoStyle(url: string, options?: HeroOptions | null): CSSProperties {
  const focus = heroFocus(options);
  return focus
    ? {
        backgroundImage: `url("${url}")`,
        backgroundSize: "cover",
        backgroundPosition: `${focus.x}% ${focus.y}%`,
      }
    : { backgroundImage: `url("${url}")` };
}

/** `object-position` for an `<img>` that crops the same photograph. */
export function focusObjectPosition(focus?: { x: number; y: number } | null) {
  return focus ? `${focus.x}% ${focus.y}%` : undefined;
}
