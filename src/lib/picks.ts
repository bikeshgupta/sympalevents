import { useCallback, useState } from "react";
import type { CalendarEntry } from "@/lib/calendar";

/**
 * "My picks": the programme items a resident starred.
 *
 * There is no push channel in this app, so a reminder that really does reach a
 * phone has to come from the phone's own calendar. Starring is therefore kept on
 * the device (no account needed, nothing to store or leak), and the button that
 * follows exports exactly those items as a calendar file with an alert on each.
 * It does not pretend to notify anybody itself.
 */

type Item = { id?: string; date: string; activity: string; startTime: string; endTime: string; location: string };

/** Stable across reloads even for a row with no id: the day and the name are what a person sees. */
export function itemKey(item: Pick<Item, "id" | "date" | "activity">) {
  return item.id ?? `${item.date}|${item.activity}`;
}

const storageKey = (eventId: string) => `sympal:picks:${eventId}`;

function read(eventId: string): string[] {
  try {
    const raw = window.localStorage.getItem(storageKey(eventId));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string").slice(0, 200) : [];
  } catch {
    return [];
  }
}

function write(eventId: string, keys: string[]) {
  try {
    window.localStorage.setItem(storageKey(eventId), JSON.stringify(keys));
  } catch {
    // A private window cannot store; the stars simply last until the page does.
  }
}

export function usePicks(eventId: string) {
  // Keyed by event, so switching events never shows another event's stars.
  const [state, setState] = useState(() => ({ id: eventId, keys: read(eventId) }));
  const keys = state.id === eventId ? state.keys : read(eventId);
  const isPicked = useCallback((item: Pick<Item, "id" | "date" | "activity">) => keys.includes(itemKey(item)), [keys]);
  const toggle = useCallback(
    (item: Pick<Item, "id" | "date" | "activity">) => {
      const key = itemKey(item);
      const next = keys.includes(key) ? keys.filter((k) => k !== key) : [...keys, key];
      write(eventId, next);
      setState({ id: eventId, keys: next });
    },
    [eventId, keys],
  );
  return { isPicked, toggle, count: keys.length, keys };
}

/** The picked items as calendar entries, each alerting `alarmMinutes` ahead. Pure. */
export function pickEntries(items: Item[], keys: string[], eventName: string, alarmMinutes = 15): CalendarEntry[] {
  const wanted = new Set(keys);
  return items
    .filter((item) => wanted.has(itemKey(item)) && item.date)
    .map((item) => ({
      title: `${item.activity} · ${eventName}`,
      startDate: item.date,
      endDate: item.date,
      startTime: item.startTime || null,
      endTime: item.endTime || null,
      location: item.location || null,
      alarmMinutes,
    }));
}
