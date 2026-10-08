/**
 * Cleaning for "Get involved" input. No imports, so the API and the tests share it.
 *
 * What a person typed into a sign-up goes to an organiser who will act on it,
 * so it is trimmed, capped and shaped here rather than trusted: `details` is a
 * jsonb column, which stores anything it is handed.
 */

export type OpportunityKind = "volunteer" | "performance";

export type PerformanceDetails = { act: string; minutes: number | null; performers: string };

const squash = (value: unknown, max: number) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);

export function cleanPerformanceDetails(value: unknown): PerformanceDetails {
  const raw = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const minutes = Number(raw.minutes);
  return {
    act: squash(raw.act, 100),
    minutes: Number.isFinite(minutes) && minutes >= 1 && minutes <= 60 ? Math.round(minutes) : null,
    performers: squash(raw.performers, 200),
  };
}

/** A phone number, loosely: digits, spaces, + and - only, so nothing else is stored in a contact column. */
export function cleanContact(value: unknown) {
  return String(value ?? "").replace(/[^0-9+\- ]/g, "").replace(/\s+/g, " ").trim().slice(0, 40);
}

export function cleanNote(value: unknown) {
  return String(value ?? "").replace(/[ \t]+/g, " ").trim().slice(0, 500);
}

/** The number the opportunity card shows, and whether anybody else can still join. */
export function placesLeft(kind: OpportunityKind, slots: number | null, confirmed: number, pending: number) {
  if (slots === null) return { taken: kind === "volunteer" ? confirmed : confirmed + pending, left: null as number | null, full: false };
  const taken = kind === "volunteer" ? confirmed : confirmed + pending;
  const left = Math.max(0, slots - taken);
  return { taken, left, full: left === 0 };
}
