import { useSearchParams } from "react-router-dom";
import { formatCount } from "./format";
import type { Comparison, EventStatus, SocietyLabel } from "./platform-api";

/**
 * Small pure helpers and the address-state hook shared by the Phase 2 sections. Components live in .tsx files;
 * these do not draw.
 */

const zone = "Asia/Kolkata";

/** "▲ 29% vs the 30 days before" - or a plain sentence when there is nothing earlier to compare with. */
export function changeText(value: Comparison, days: number) {
  const span = days === 365 ? "12 months" : `${days} days`;
  if (value.change === null) return value.current > 0 ? `None in the ${span} before` : `Same as the ${span} before`;
  if (Math.abs(value.change) < 0.005) return `Same as the ${span} before`;
  const pct = Math.abs(value.change * 100);
  return `${value.change > 0 ? "▲" : "▼"} ${pct >= 10 ? pct.toFixed(0) : pct.toFixed(1)}% vs the ${span} before`;
}

export function changeTone(value: Comparison): "up" | "down" | "flat" {
  if (value.change === null || Math.abs(value.change) < 0.005) return "flat";
  return value.change > 0 ? "up" : "down";
}

/** "16 Sep" for an IST day key (YYYY-MM-DD). */
export function dayLabel(day: string, withYear = false) {
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", ...(withYear ? { year: "numeric" as const } : {}), timeZone: zone }).format(
    new Date(`${day}T12:00:00+05:30`),
  );
}

/** "Oct '26" for a month key (YYYY-MM). */
export function monthLabel(month: string) {
  const date = new Date(`${month}-15T12:00:00+05:30`);
  return `${new Intl.DateTimeFormat("en-IN", { month: "short", timeZone: zone }).format(date)} '${month.slice(2, 4)}`;
}

/** A date-only string (YYYY-MM-DD) as "14 Sep 2026", read in IST. */
export function formatDay(date: string | null | undefined) {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  return dayLabel(date, true);
}

export function eventDates(startDate: string, endDate: string) {
  if (!startDate) return "—";
  if (!endDate || endDate === startDate) return dayLabel(startDate, true);
  const sameYear = startDate.slice(0, 4) === endDate.slice(0, 4);
  return `${dayLabel(startDate, !sameYear)} – ${dayLabel(endDate, true)}`;
}

/** How long ago an instant was, in words a person uses. */
export function sinceText(value: string | null, now = Date.now()) {
  if (!value) return null;
  const time = Date.parse(value);
  if (Number.isNaN(time)) return null;
  const days = Math.floor((now - time) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} ${months === 1 ? "month" : "months"} ago`;
  const years = Math.floor(days / 365);
  return `${years} ${years === 1 ? "year" : "years"} ago`;
}

export type ChartPoint = { label: string; tip: string; current: number | null; previous: number | null };

const dayKeyMs = (day: string) => Date.parse(`${day}T12:00:00+05:30`);
const shiftDay = (day: string, days: number) => new Date(dayKeyMs(day) - days * 86_400_000 + 5.5 * 3_600_000).toISOString().slice(0, 10);

/**
 * Turns aligned daily arrays into chart points. Windows over 92 days become weeks: counts are summed, and a
 * measure of distinct people (`average`) becomes the average per day, because adding daily distinct counts would
 * count the same person several times.
 *
 * `trackedFrom` is the first IST day the source recorded anything. Days before it are "not tracked" (null) in both
 * periods, never 0: an absence of tracking is not an absence of activity.
 */
export function chartPoints(
  days: string[],
  current: number[],
  previous: number[] | null,
  options: { mode?: "sum" | "average"; trackedFrom?: string | null } = {},
): ChartPoint[] {
  const mode = options.mode ?? "sum";
  const tracked = (day: string) => !options.trackedFrom || day >= options.trackedFrom;
  const offset = days.length;
  const value = (values: number[] | null, index: number, day: string) => (values && tracked(day) ? values[index] ?? 0 : null);

  if (days.length <= 92) {
    return days.map((day, index) => ({
      label: dayLabel(day),
      tip: dayLabel(day, true),
      current: value(current, index, day),
      previous: previous ? value(previous, index, shiftDay(day, offset)) : null,
    }));
  }
  const points: ChartPoint[] = [];
  for (let start = 0; start < days.length; start += 7) {
    const end = Math.min(start + 7, days.length);
    const fold = (values: number[] | null, shift: number) => {
      if (!values) return null;
      let total = 0;
      let counted = 0;
      for (let index = start; index < end; index += 1) {
        if (!tracked(shiftDay(days[index], shift))) continue;
        total += values[index] ?? 0;
        counted += 1;
      }
      if (!counted) return null;
      return mode === "average" ? Math.round((total / counted) * 10) / 10 : total;
    };
    points.push({ label: dayLabel(days[start]), tip: `Week of ${dayLabel(days[start], true)}`, current: fold(current, 0), previous: fold(previous, offset) });
  }
  return points;
}

/** The IST day an instant falls on, as YYYY-MM-DD. */
export const istDayKey = (value: string | null | undefined) => (value ? new Date(Date.parse(value) + 5.5 * 3_600_000).toISOString().slice(0, 10) : null);

/** "1 visit", "2 visits" - a count with the noun that agrees with it. */
export const counted = (value: number, one: string, many: string) => `${formatCount(value)} ${value === 1 ? one : many}`;

export const sumOf = (values: number[]) => values.reduce((total, value) => total + value, 0);

export const societyLabelText: Record<SocietyLabel, string> = {
  new: "New",
  active: "Active",
  quiet: "Quiet",
  dormant: "Dormant",
  empty: "Empty",
};

export const societyLabelHelp: Record<SocietyLabel, string> = {
  new: "Created in this period",
  active: "An event was created or on, someone joined, or its event pages were visited, in this period",
  quiet: "Nothing in this period, but something in the last 90 days",
  dormant: "Nothing for 90 days or more",
  empty: "No events, and no members besides its creator",
};

export const eventStatusOrder: EventStatus[] = ["live", "upcoming", "draft", "completed", "cancelled"];

export const roleText: Record<string, string> = { admin: "Admin", committee: "Committee", read_only: "Resident" };

/** One section's list state, kept in the address so a refresh, the back button and a shared link all agree. */
export function useListParams<K extends string>(keys: readonly K[]) {
  const [params, setParams] = useSearchParams();
  const values = Object.fromEntries(keys.map((key) => [key, params.get(key) ?? ""])) as Record<K, string>;

  function set(changes: Partial<Record<K | "page", string | null>>, options: { keepPage?: boolean } = {}) {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(changes) as [string, string | null][]) {
      if (value === null || value === "" || value === "all" || value === "any") next.delete(key);
      else next.set(key, value);
    }
    if (!options.keepPage && !("page" in changes)) next.delete("page");
    setParams(next, { replace: true });
  }

  return { values, set, params };
}

/** A link to another section that keeps the reporting period, plus any filters. */
export function useSectionLink() {
  const [params] = useSearchParams();
  const range = params.get("range");
  return (path: string, extra: Record<string, string> = {}) => {
    const search = new URLSearchParams({ ...(range ? { range } : {}), ...extra }).toString();
    return { pathname: path, search: search ? `?${search}` : "" };
  };
}
