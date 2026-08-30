import type { AppEvent, EventPlanRow } from "@/lib/event-data";
import { formatCurrency } from "@/lib/utils";

export type EventPhase = "before" | "during" | "after";
export type TimelineStatus = "completed" | "current" | "upcoming";

const KOLKATA_OFFSET_MS = 5.5 * 60 * 60 * 1000;

export function formatCurrencyCompact(value: number) {
  const compact = (amount: number, suffix: string) =>
    `₹${new Intl.NumberFormat("en-IN", { maximumFractionDigits: amount >= 10 ? 1 : 2 }).format(amount)}${suffix}`;
  if (value >= 100000) return compact(value / 100000, "L");
  if (value >= 1000) return compact(value / 1000, "K");
  return formatCurrency(value);
}

export function calculateFundingProgress(fundsReceived: number, totalBudget: number) {
  if (totalBudget <= 0) return 0;
  return Math.min(100, Math.max(0, (fundsReceived / totalBudget) * 100));
}

export function toEventZoneTimestamp(date: string, time = "00:00") {
  const [year, month, day] = date.split("-").map(Number);
  const [hours = 0, minutes = 0, seconds = 0] = time.split(":").map(Number);
  return Date.UTC(year, month - 1, day, hours, minutes, seconds) - KOLKATA_OFFSET_MS;
}

export function getDateInEventZone(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

export function getEventPhase(event: AppEvent, now = new Date()): EventPhase {
  const currentMs = now.getTime();
  const startMs = toEventZoneTimestamp(event.startDate);
  const endMs = toEventZoneTimestamp(event.endDate, "23:59:59");
  if (currentMs < startMs) return "before";
  if (currentMs > endMs) return "after";
  return "during";
}

export function getEventDays(event: AppEvent) {
  const startMs = toEventZoneTimestamp(event.startDate);
  const endMs = toEventZoneTimestamp(event.endDate);
  const dayCount = Math.max(1, Math.round((endMs - startMs) / 86400000) + 1);

  return Array.from({ length: dayCount }, (_, index) => {
    const date = new Date(startMs + KOLKATA_OFFSET_MS + index * 86400000).toISOString().slice(0, 10);
    return {
      key: `Day ${index + 1}`,
      label: `Day ${index + 1}`,
      date,
    };
  });
}

export function getDefaultEventDay(event: AppEvent, now = new Date()) {
  const phase = getEventPhase(event, now);
  const days = getEventDays(event);
  const currentDate = getDateInEventZone(now);

  if (phase === "before") return days[0]?.key ?? "Day 1";
  if (phase === "after") return days.at(-1)?.key ?? "Day 1";

  return days.find((day) => day.date === currentDate)?.key ?? days[0]?.key ?? "Day 1";
}

export function sortTimelineItems(items: EventPlanRow[]) {
  return [...items].sort((a, b) => {
    const dateCompare = a.date.localeCompare(b.date);
    if (dateCompare !== 0) return dateCompare;
    return (a.startTime || "99:99").localeCompare(b.startTime || "99:99");
  });
}

export function getTimelineItemStatus(item: EventPlanRow, now = new Date()): TimelineStatus {
  if (item.status.toLowerCase() === "completed") return "completed";
  if (!item.startTime) {
    return item.date < getDateInEventZone(now) ? "completed" : "upcoming";
  }

  const currentMs = now.getTime();
  const startMs = toEventZoneTimestamp(item.date, item.startTime);
  const endMs = item.endTime ? toEventZoneTimestamp(item.date, item.endTime) : startMs;

  if (item.endTime && currentMs >= startMs && currentMs <= endMs) return "current";
  if (!item.endTime && Math.abs(currentMs - startMs) < 60000) return "current";
  if (currentMs >= endMs) return "completed";
  return "upcoming";
}

export function getNextEvent(items: EventPlanRow[], now = new Date()) {
  return sortTimelineItems(items).find((item) => item.startTime && getTimelineItemStatus(item, now) === "upcoming");
}

export function formatEventDate(date: string) {
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short" }).format(new Date(`${date}T00:00:00+05:30`));
}

export function formatEventTime(time: string) {
  if (!time) return "Time TBC";
  return new Intl.DateTimeFormat("en-IN", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Kolkata",
  }).format(new Date(toEventZoneTimestamp("2026-01-01", time)));
}
