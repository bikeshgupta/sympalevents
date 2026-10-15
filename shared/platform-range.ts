/**
 * Reporting windows for the Platform Control Center, in IST calendar days.
 *
 * A window is `[from, to)`: `from` is midnight IST on its first day and `to` is midnight IST after its last day,
 * both as UTC instants, so a query can use `>= from and < to` on any timestamptz column. "Last 30 days" ends at
 * the end of today, IST, and includes today. The previous window has the same number of days and ends where the
 * current one starts, so a comparison is always like for like.
 *
 * Pure: `now` is a parameter, so the tests can pin the clock.
 */

export const platformRangePresets = ["7d", "30d", "90d", "12m"] as const;
export type PlatformRangePreset = (typeof platformRangePresets)[number];
export const defaultPlatformRange: PlatformRangePreset = "30d";

const presetDays: Record<PlatformRangePreset, number> = { "7d": 7, "30d": 30, "90d": 90, "12m": 365 };

export const platformRangeLabels: Record<PlatformRangePreset, string> = {
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  "90d": "Last 90 days",
  "12m": "Last 12 months",
};

/** The longest window any platform query may cover. */
export const maxPlatformRangeDays = 400;

const istOffsetMs = 5.5 * 60 * 60 * 1000;
const dayMs = 24 * 60 * 60 * 1000;

export type PlatformWindow = {
  preset: PlatformRangePreset;
  days: number;
  /** Inclusive start, UTC ISO instant at IST midnight. */
  from: string;
  /** Exclusive end, UTC ISO instant at the IST midnight after the last day. */
  to: string;
  /** The same-length window just before. */
  previous: { from: string; to: string };
  /** The first and last IST calendar days, as YYYY-MM-DD. */
  firstDay: string;
  lastDay: string;
};

export function isPlatformRangePreset(value: unknown): value is PlatformRangePreset {
  return typeof value === "string" && (platformRangePresets as readonly string[]).includes(value);
}

/** A preset from a query string or address, falling back to the default for anything unknown. */
export function readPlatformRange(value: unknown): PlatformRangePreset {
  return isPlatformRangePreset(value) ? value : defaultPlatformRange;
}

/** Midnight IST at the start of the IST day containing `instant`, as epoch ms. */
export function istDayStart(instant: number): number {
  return Math.floor((instant + istOffsetMs) / dayMs) * dayMs - istOffsetMs;
}

/** The IST calendar day of an instant, as YYYY-MM-DD. */
export function istDay(instant: number): string {
  return new Date(instant + istOffsetMs).toISOString().slice(0, 10);
}

export function platformWindow(preset: PlatformRangePreset, now: number = Date.now()): PlatformWindow {
  const days = Math.min(presetDays[preset], maxPlatformRangeDays);
  const to = istDayStart(now) + dayMs;
  const from = to - days * dayMs;
  const previousFrom = from - days * dayMs;
  return {
    preset,
    days,
    from: new Date(from).toISOString(),
    to: new Date(to).toISOString(),
    previous: { from: new Date(previousFrom).toISOString(), to: new Date(from).toISOString() },
    firstDay: istDay(from),
    lastDay: istDay(to - 1),
  };
}
