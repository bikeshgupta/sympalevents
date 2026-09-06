/**
 * Agenda items inside one scheduled event - "puja starts 8:30, arti 10:00,
 * prasad counter 12:00-13:30", or the running order of a cultural evening.
 *
 * These live in `event_schedule.sub_events`, the existing free-text column,
 * one item per line. No migration: a line simply gains an optional time
 * prefix, and every line that has never had one still parses exactly as it
 * used to (an untimed label, or several of them separated by commas).
 *
 *   08:30-10:00 | Ganesh Sthapna | Pandit ji leads the sankalp
 *   10:00 | Pushpanjali
 *   Bhajan by the ladies group
 *
 * The Events page writes this canonical `HH:MM-HH:MM | Title | Note` shape,
 * but the parser is deliberately forgiving about what a committee member
 * might type by hand - "7 pm - Dance performances", "10.30am Arti".
 */
export type AgendaItem = {
  /** 24h "HH:MM", or "" when the item carries no time. */
  startTime: string;
  endTime: string;
  title: string;
  note: string;
};

/** A clock reading that is unambiguously a time: it has minutes, or am/pm. */
const TIME = String.raw`\d{1,2}[:.]\d{2}\s*(?:[ap]\.?m\.?)?|\d{1,2}\s*[ap]\.?m\.?`;
const RANGE_SEPARATOR = String.raw`\s*(?:-|–|—|to)\s*`;
const LEADING_TIME = new RegExp(`^(${TIME})(?:${RANGE_SEPARATOR}(${TIME}))?\\s*(.*)$`, "i");
const ONLY_TIME = new RegExp(`^(${TIME})(?:${RANGE_SEPARATOR}(${TIME}))?$`, "i");

/** "9:30 pm" / "21.30" / "7pm" -> "21:30". Null when it is not a time. */
export function normalizeTime(value: string) {
  const raw = value.trim().toLowerCase().replace(/\./g, ":");
  const match = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/.exec(raw);
  if (!match) return null;

  let hours = Number(match[1]);
  const minutes = Number(match[2] ?? "0");
  const meridiem = match[3];

  if (!meridiem && match[2] === undefined) return null;
  if (hours > 23 || minutes > 59) return null;
  if (meridiem === "pm" && hours < 12) hours += 12;
  if (meridiem === "am" && hours === 12) hours = 0;
  if (hours > 23) return null;

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function toItem(startTime: string | null, endTime: string | null, title: string, note = ""): AgendaItem {
  return {
    startTime: startTime ?? "",
    endTime: endTime ?? "",
    title: title.trim(),
    note: note.trim(),
  };
}

/** Strips the punctuation a person naturally puts between a time and a title. */
function stripSeparator(value: string) {
  return value.replace(/^[\s\-–—:•·|]+/, "").trim();
}

function parseLine(line: string): AgendaItem[] {
  const parts = line.split("|").map((part) => part.trim());

  if (parts.length > 1) {
    const range = ONLY_TIME.exec(parts[0]);
    if (range) {
      return [toItem(normalizeTime(range[1]), range[2] ? normalizeTime(range[2]) : null, parts[1], parts[2] ?? "")];
    }
    return [toItem(null, null, parts[0], parts.slice(1).join(" · "))];
  }

  const leading = LEADING_TIME.exec(line);
  if (leading) {
    const title = stripSeparator(leading[3]);
    if (title) {
      return [toItem(normalizeTime(leading[1]), leading[2] ? normalizeTime(leading[2]) : null, title)];
    }
  }

  // Pre-agenda rows: one line holding several comma-separated labels.
  return line
    .split(",")
    .map((label) => label.trim())
    .filter(Boolean)
    .map((label) => toItem(null, null, label));
}

/** Author order is the running order, so nothing here re-sorts the items. */
export function parseAgenda(value: string): AgendaItem[] {
  if (!value.trim()) return [];
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap(parseLine)
    .filter((item) => item.title);
}

export function serializeAgenda(items: AgendaItem[]) {
  return items
    .filter((item) => item.title.trim())
    .map((item) => {
      const title = item.title.trim();
      const note = item.note.trim();
      const window = item.endTime ? `${item.startTime}-${item.endTime}` : item.startTime;
      const columns = window ? [window, title] : [title];
      if (note) columns.push(note);
      return columns.join(" | ");
    })
    .join("\n");
}

export function hasTimedAgenda(items: AgendaItem[]) {
  return items.some((item) => item.startTime);
}
