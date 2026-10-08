import { audit } from "./audit.js";
import { missingColumnName, selectDegrading } from "./schema-compat.js";
import { assertServiceSupabase, getRequestBody, requireAppUser, requireEventAdmin, sendJson } from "./server.js";

/**
 * What an event IS - its name, venue, dates, hours - and whether the amounts
 * raised are shown. `PATCH /api/events?resource=details`, event admin only.
 *
 * ## Why this exists
 *
 * Nothing could change an event after it was created. The only writes to
 * `events` anywhere in the app were two inserts, so a mistyped date, a venue
 * that moved or a name that needed fixing had no screen at all, and "when does
 * it start" could not carry a time because the columns are plain `date`s.
 *
 * ## The migration (031) and what works without it
 *
 * Name, venue and dates have always had columns, so they save on any
 * database. The two times and the collections setting are 031's: asking to
 * CHANGE one of those before it has run answers 501 naming the file, and
 * writes nothing - not even the fields that could have been saved - so a form
 * never half-applies. Asking for no change to them (a time already blank,
 * sent blank again) is not a request and costs nothing, which is what lets the
 * Settings card send its whole form every time.
 *
 * ## Time semantics
 *
 * Times are wall-clock in the event's own zone, same as `event_schedule`.
 * Blank means "the whole day". The ordering check treats a missing start time
 * as 00:00 and a missing end time as 23:59, which is how the status model
 * reads them (src/lib/event-status.ts), so an edit this accepts is never one
 * the status model would read as ending before it began.
 *
 * Moving the dates never moves the schedule. If scheduled items now fall
 * outside the new range the reply says how many, and that is all: whether
 * they should move is the committee's call, item by item.
 */

type ApiRequest = {
  method?: string;
  body?: unknown;
  query?: Record<string, unknown>;
  headers: { authorization?: string };
};

type ApiResponse = {
  setHeader?: (name: string, value: string) => void;
  status: (statusCode: number) => { json: (body: unknown) => void };
};

const MIGRATION = "supabase/migrations/031_event_details.sql";

const coreColumns = ["id", "name", "start_date", "end_date", "location"];
const optionalColumns = ["start_time", "end_time", "finance_visibility"];

function fail(message: string, statusCode: number) {
  const error = new Error(message);
  Object.assign(error, { statusCode });
  return error;
}

/** A real calendar date, not just something shaped like one: 30 February
 *  parses, and then renders as 2 March. */
export function cleanDate(value: unknown, label: string) {
  const text = String(value ?? "").trim();
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(text) ? new Date(`${text}T00:00:00Z`) : null;
  if (!parsed || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== text) {
    throw fail(`${label} is not a real date`, 400);
  }
  return text;
}

/** `HH:MM`, 24-hour, or blank for "the whole day". */
export function cleanTime(value: unknown, label: string): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (!text) return null;
  const match = text.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) {
    throw fail(`${label} should be a time like 18:30`, 400);
  }
  return `${match[1].padStart(2, "0")}:${match[2]}`;
}

/** What a `time` column hands back (`18:00:00`) as the `HH:MM` the app speaks. */
function clock(value: unknown): string | null {
  const match = String(value ?? "").trim().match(/^(\d{1,2}):(\d{2})/);
  return match ? `${match[1].padStart(2, "0")}:${match[2]}` : null;
}

export async function handleEventDetails(req: ApiRequest, res: ApiResponse) {
  if (!["PATCH", "POST"].includes(String(req.method))) {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  const supabase = assertServiceSupabase();
  const { appUser } = await requireAppUser(req);
  const body = (await getRequestBody(req)) as Record<string, unknown>;

  const eventId = String(body.eventId ?? "");
  if (!eventId) throw fail("eventId is required", 400);

  // An event admin, or the society's admin standing in for one.
  await requireEventAdmin(eventId, appUser.id);

  const found = await selectDegrading("events", [...coreColumns, ...optionalColumns], coreColumns, (select) =>
    supabase.from("events").select(select).eq("id", eventId).maybeSingle(),
  );
  if (found.error) throw found.error;
  const current = found.data as Record<string, unknown> | null;
  if (!current) throw fail("That event does not exist", 404);

  const hasTimes = "start_time" in current && "end_time" in current;
  const hasFinance = "finance_visibility" in current;

  const updates: Record<string, unknown> = {};

  // ---- the columns every database has ------------------------------------
  if (body.name !== undefined) {
    const name = String(body.name ?? "").replace(/\s+/g, " ").trim();
    if (!name) throw fail("An event needs a name", 400);
    if (name.length > 120) throw fail("Keep the name under 120 characters", 400);
    updates.name = name;
  }

  if (body.location !== undefined) {
    const location = String(body.location ?? "").replace(/\s+/g, " ").trim();
    if (location.length > 160) throw fail("Keep the venue under 160 characters", 400);
    updates.location = location;
  }

  const startDate = body.startDate !== undefined ? cleanDate(body.startDate, "The start date") : String(current.start_date);
  const endDate = body.endDate !== undefined ? cleanDate(body.endDate, "The end date") : String(current.end_date);
  if (body.startDate !== undefined) updates.start_date = startDate;
  if (body.endDate !== undefined) updates.end_date = endDate;

  // ---- what 031 adds ------------------------------------------------------
  const wantedStartTime = body.startTime !== undefined ? cleanTime(body.startTime, "The start time") : undefined;
  const wantedEndTime = body.endTime !== undefined ? cleanTime(body.endTime, "The end time") : undefined;

  let wantedFinance: "full" | "count_only" | undefined;
  if (body.financeVisibility !== undefined) {
    const value = String(body.financeVisibility);
    if (value !== "full" && value !== "count_only") throw fail("That is not a choice this setting has", 400);
    wantedFinance = value;
  }

  // Only a CHANGE is a request. A column that does not exist reads as blank
  // (and as 'full'), so "blank again" and "full again" are no-ops there.
  const startTimeChanged = wantedStartTime !== undefined && wantedStartTime !== clock(current.start_time);
  const endTimeChanged = wantedEndTime !== undefined && wantedEndTime !== clock(current.end_time);
  const financeChanged =
    wantedFinance !== undefined && wantedFinance !== (hasFinance ? String(current.finance_visibility) : "full");

  if ((startTimeChanged || endTimeChanged) && !hasTimes) {
    throw fail(`Setting a start or end time needs ${MIGRATION}. Run it, then save again. Nothing was changed.`, 501);
  }
  if (financeChanged && !hasFinance) {
    throw fail(
      `Showing counts instead of amounts needs ${MIGRATION}. Run it, then try again. Nothing was changed.`,
      501,
    );
  }

  if (startTimeChanged) updates.start_time = wantedStartTime;
  if (endTimeChanged) updates.end_time = wantedEndTime;
  if (financeChanged) updates.finance_visibility = wantedFinance;

  // ---- does it still make sense? -----------------------------------------
  const effectiveStartTime = startTimeChanged ? wantedStartTime : hasTimes ? clock(current.start_time) : null;
  const effectiveEndTime = endTimeChanged ? wantedEndTime : hasTimes ? clock(current.end_time) : null;

  assertEventWindow(startDate, endDate, effectiveStartTime, effectiveEndTime);

  if (!Object.keys(updates).length) {
    sendJson(res, 200, { ok: true, changed: false, ...shape(current), scheduleOutsideRange: 0 });
    return;
  }

  const { data: saved, error } = await supabase
    .from("events")
    .update(updates)
    .eq("id", eventId)
    .select(["id", ...Object.keys(updates)].join(","))
    .single();

  if (error) {
    // The columns were there a moment ago, so this is a race with a rollback
    // or a stale schema cache. Name the file rather than the column.
    const column = missingColumnName(error);
    if (column && ["start_time", "end_time", "finance_visibility"].includes(column)) {
      throw fail(`That needs ${MIGRATION}. Run it, then try again. Nothing was changed.`, 501);
    }
    throw error;
  }

  const after = { ...current, ...(saved as unknown as Record<string, unknown>) };

  audit(req, {
    action: "update",
    entityType: "event",
    entityId: eventId,
    eventId,
    actor: { id: appUser.id },
    before: current,
    after,
    summary: summarise(updates),
  });

  // Scheduled items that fall outside the new range. A warning, nothing more.
  let scheduleOutsideRange = 0;
  if (updates.start_date !== undefined || updates.end_date !== undefined) {
    const schedule = await supabase.from("event_schedule").select("id,activity_date").eq("event_id", eventId);
    if (!schedule.error) {
      scheduleOutsideRange = (schedule.data ?? []).filter((row) => {
        const day = String(row.activity_date ?? "");
        return /^\d{4}-\d{2}-\d{2}$/.test(day) && (day < startDate || day > endDate);
      }).length;
    }
  }

  sendJson(res, 200, { ok: true, changed: true, ...shape(after), scheduleOutsideRange });
}

/**
 * An event has to end after it begins. A blank start is the start of its day
 * and a blank end is the end of its day, exactly as the status model reads
 * them - so only a one-day event can contradict itself on times alone.
 */
export function assertEventWindow(
  startDate: string,
  endDate: string,
  startTime: string | null,
  endTime: string | null,
) {
  if (endDate < startDate) throw fail("The event cannot end before it starts", 400);
  if (endDate === startDate && (endTime ?? "23:59") <= (startTime ?? "00:00")) {
    throw fail("On a one-day event the end time has to be after the start time", 400);
  }
}

function shape(row: Record<string, unknown>) {
  return {
    event: {
      name: String(row.name ?? ""),
      location: String(row.location ?? ""),
      startDate: String(row.start_date ?? ""),
      endDate: String(row.end_date ?? ""),
      startTime: clock(row.start_time),
      endTime: clock(row.end_time),
      financeVisibility: row.finance_visibility === "count_only" ? "count_only" : "full",
    },
  };
}

/** One readable line for the log, so the table can be scanned without
 *  decoding jsonb. */
function summarise(updates: Record<string, unknown>) {
  const parts: string[] = [];
  if (updates.name !== undefined) parts.push("name");
  if (updates.location !== undefined) parts.push("venue");
  if (updates.start_date !== undefined || updates.end_date !== undefined) parts.push("dates");
  if (updates.start_time !== undefined || updates.end_time !== undefined) parts.push("times");
  if (updates.finance_visibility !== undefined) {
    parts.push(updates.finance_visibility === "count_only" ? "collections shown as counts only" : "collections shown in full");
  }
  return `Changed this event's ${parts.join(", ")}`;
}
