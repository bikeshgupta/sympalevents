import { formatEventTime } from "@/features/dashboard/dashboard-utils";

/**
 * The hours of an event as a short phrase, or null when it has none.
 *
 * Null is the common case and means "the whole day" - every event made before
 * times existed - so a caller renders nothing for it and the screen looks
 * exactly as it always did.
 *
 *   one day, both      "6:00 pm – 9:00 pm"
 *   one day, one end   "from 6:00 pm"  /  "until 9:00 pm"
 *   several days       "starts 6:00 pm"  /  "ends 9:00 pm"  /  both, joined
 *
 * On a multi-day event a bare range would read as daily hours, which is not
 * what the two fields mean: the start time belongs to the first day and the
 * end time to the last. A plain `.ts` module for the reason
 * `src/lib/event-path.ts` gives.
 */
export function describeEventHours(event: {
  startDate: string;
  endDate: string;
  startTime?: string | null;
  endTime?: string | null;
}): string | null {
  const start = event.startTime?.trim() ? formatEventTime(event.startTime) : null;
  const end = event.endTime?.trim() ? formatEventTime(event.endTime) : null;
  if (!start && !end) return null;

  const oneDay = !event.endDate || event.endDate === event.startDate;
  if (oneDay) {
    if (start && end) return `${start} – ${end}`;
    return start ? `from ${start}` : `until ${end}`;
  }
  if (start && end) return `starts ${start} · ends ${end}`;
  return start ? `starts ${start}` : `ends ${end}`;
}
