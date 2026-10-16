import type { PlatformWindow } from "../../../shared/platform-range";
import type { PlatformColumnSource, PlatformTableSource } from "./platform-api";

/**
 * Formatting for the Platform Control Center. Every instant is read back in IST, the zone every reporting window
 * is cut in (shared/platform-range.ts). Instants here are ISO strings with an offset, so `new Date(value)` is
 * exact; date-only strings go through the IST helpers in dashboard-utils instead.
 */

const zone = "Asia/Kolkata";

const countFormat = new Intl.NumberFormat("en-IN");
export const formatCount = (value: number) => countFormat.format(value);

export function formatInstantDate(value: string | null | undefined) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: zone }).format(parsed);
}

export function formatInstantTime(value: string | null | undefined) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: zone }).format(parsed);
}

/** "16 Sep – 15 Oct 2026": the window's first and last IST days. */
export function formatWindow(window: PlatformWindow) {
  const first = new Date(window.from);
  const last = new Date(Date.parse(window.to) - 1);
  const sameYear =
    new Intl.DateTimeFormat("en-IN", { year: "numeric", timeZone: zone }).format(first) ===
    new Intl.DateTimeFormat("en-IN", { year: "numeric", timeZone: zone }).format(last);
  const start = new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    ...(sameYear ? {} : { year: "numeric" as const }),
    timeZone: zone,
  }).format(first);
  const end = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: zone }).format(last);
  return `${start} – ${end}`;
}

/** One line under a source: what it holds and since when, or what would add it. */
export function sourceDetail(source: PlatformTableSource | PlatformColumnSource) {
  if (source.status === "missing") return `Needs database update ${source.migration}`;
  if (source.status === "error") return "The query failed. It may be a permission or connection problem.";
  if (source.kind === "column") return "Column present";
  if (!source.rows) return "No records yet";
  const since = formatInstantDate(source.firstAt);
  return `${formatCount(source.rows)} ${source.rows === 1 ? "record" : "records"}${since ? ` since ${since}` : ""}`;
}

/** "45 s", "3 min", "1 h 05 min" - for how long a visit lasted. */
export function formatDuration(seconds: number | null | undefined) {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) return "—";
  const total = Math.round(seconds);
  if (total < 60) return `${total} s`;
  const minutes = Math.floor(total / 60);
  if (minutes < 60) return total % 60 ? `${minutes} min ${total % 60} s` : `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return `${hours} h ${String(minutes % 60).padStart(2, "0")} min`;
}
