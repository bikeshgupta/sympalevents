/**
 * "Add to my calendar".
 *
 * A calendar entry is the only reminder this app can honestly give: it has no
 * push channel, and a button called "remind me" that reminds nobody is worse
 * than none. An `.ics` file put in somebody's own calendar *will* buzz their
 * phone, with an alert if we ask for one.
 *
 * Times are the event's own clock, Asia/Kolkata, which has no daylight saving,
 * so converting to UTC is a fixed 5h30m and the file needs no timezone block.
 * An event with no hours is an all-day entry, which is what "no hours" has
 * always meant here. Pure and import-free, so it is checked on its own
 * (tests/calendar.test.mjs).
 */

export type CalendarEntry = {
  title: string;
  /** `yyyy-mm-dd` */
  startDate: string;
  endDate: string;
  /** `HH:mm` on the event's clock; absent means the whole day. */
  startTime?: string | null;
  endTime?: string | null;
  location?: string | null;
  description?: string | null;
  url?: string | null;
  /** An alert this many minutes before the start. */
  alarmMinutes?: number | null;
};

const IST_MS = 5.5 * 60 * 60 * 1000;

const pad = (n: number) => String(n).padStart(2, "0");

/** `20261017T133000Z` for a date and time read on the event's clock. */
function utc(date: string, time: string) {
  const [y, m, d] = date.split("-").map(Number);
  const [hh = 0, mm = 0] = time.split(":").map(Number);
  const at = new Date(Date.UTC(y, m - 1, d, hh, mm) - IST_MS);
  return `${at.getUTCFullYear()}${pad(at.getUTCMonth() + 1)}${pad(at.getUTCDate())}T${pad(at.getUTCHours())}${pad(at.getUTCMinutes())}00Z`;
}

/** `20261017` for a date, optionally moved on by some days. */
function day(date: string, plus = 0) {
  const [y, m, d] = date.split("-").map(Number);
  const at = new Date(Date.UTC(y, m - 1, d + plus));
  return `${at.getUTCFullYear()}${pad(at.getUTCMonth() + 1)}${pad(at.getUTCDate())}`;
}

/** Start and end, as the pair of values both formats need. */
function span(entry: CalendarEntry) {
  if (!entry.startTime) {
    // All day. The end of a date range is exclusive in both formats.
    return { allDay: true as const, start: day(entry.startDate), end: day(entry.endDate, 1) };
  }
  const start = utc(entry.startDate, entry.startTime);
  const end = entry.endTime
    ? utc(entry.endDate, entry.endTime)
    : // A start with no end: two hours is a sensible block rather than a zero-length one.
      utc(entry.startDate, `${pad((Number(entry.startTime.split(":")[0]) + 2) % 24)}:${entry.startTime.split(":")[1] ?? "00"}`);
  return { allDay: false as const, start, end };
}

/** RFC 5545 text escaping. */
const escapeText = (value: string) =>
  value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

/** Lines longer than 75 octets are folded onto continuation lines. */
function fold(line: string) {
  const bytes = new TextEncoder();
  if (bytes.encode(line).length <= 75) return line;
  const parts: string[] = [];
  let current = "";
  for (const char of line) {
    const limit = parts.length === 0 ? 75 : 74;
    if (bytes.encode(current + char).length > limit) {
      parts.push(current);
      current = char;
    } else current += char;
  }
  parts.push(current);
  return parts.join("\r\n ");
}

export function buildIcs(entries: CalendarEntry[], now = new Date()): string {
  const stamp = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`;
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//SymPal Events//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH"];

  entries.forEach((entry, index) => {
    const when = span(entry);
    lines.push("BEGIN:VEVENT");
    // Stable, so adding the same entry twice replaces it rather than duplicating.
    lines.push(`UID:${day(entry.startDate)}-${entry.startTime ?? "all"}-${index}-${entry.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40)}@sympalevents`);
    lines.push(`DTSTAMP:${stamp}`);
    if (when.allDay) {
      lines.push(`DTSTART;VALUE=DATE:${when.start}`, `DTEND;VALUE=DATE:${when.end}`);
    } else {
      lines.push(`DTSTART:${when.start}`, `DTEND:${when.end}`);
    }
    lines.push(`SUMMARY:${escapeText(entry.title)}`);
    if (entry.location) lines.push(`LOCATION:${escapeText(entry.location)}`);
    const description = [entry.description, entry.url].filter(Boolean).join("\n");
    if (description) lines.push(`DESCRIPTION:${escapeText(description)}`);
    if (entry.url) lines.push(`URL:${entry.url}`);
    if (entry.alarmMinutes && !when.allDay) {
      lines.push("BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${escapeText(entry.title)}`, `TRIGGER:-PT${entry.alarmMinutes}M`, "END:VALARM");
    }
    lines.push("END:VEVENT");
  });

  lines.push("END:VCALENDAR");
  return `${lines.map(fold).join("\r\n")}\r\n`;
}

/** A link that opens Google Calendar with the entry filled in. */
export function googleCalendarUrl(entry: CalendarEntry) {
  const when = span(entry);
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: entry.title,
    dates: `${when.start}/${when.end}`,
  });
  if (entry.location) params.set("location", entry.location);
  const details = [entry.description, entry.url].filter(Boolean).join("\n");
  if (details) params.set("details", details);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/** Hand an `.ics` to the browser as a download. */
export function downloadIcs(filename: string, ics: string) {
  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename.endsWith(".ics") ? filename : `${filename}.ics`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(link.href);
}
