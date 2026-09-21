import { assertServiceSupabase } from "./server.js";

/**
 * Reading the day-wise schedule, shared by the route that owns it
 * (api/event-schedule.ts) and the composite read behind
 * `GET /api/events?resource=data` (api/_lib/event-data.ts).
 *
 * It lives here rather than in either caller because both need the identical
 * missing-column degradation below, and a second copy of that is exactly the
 * kind of thing that drifts: one caller gets fixed, the other keeps returning
 * a 500 on an event whose project never ran 007.
 */

const scheduleColumns =
  "id,day,activity_date,activity,sub_events,start_time,end_time,location,expected_attendance,owner_name,status,notes";
const scheduleColumnsWithoutSubEvents =
  "id,day,activity_date,activity,start_time,end_time,location,expected_attendance,owner_name,status,notes";

/**
 * `event_schedule.sub_events` needs 007, which was never applied to the live
 * project. PostgREST reports the absent column a few different ways depending
 * on whether it is the schema cache or Postgres itself that complains, so all
 * of them are treated the same.
 */
export function isMissingSubEventsColumn(error: { code?: string; message?: string } | null) {
  return Boolean(
    error &&
      (["42703", "PGRST204"].includes(error.code ?? "") ||
        error.message?.includes("'sub_events' column") ||
        error.message?.includes("sub_events")),
  );
}

/**
 * Reads tolerate a missing `sub_events` column - the rest of the schedule is
 * still worth showing. Writes deliberately do not; see `assertAgendaStorable`
 * in api/event-schedule.ts.
 */
export async function fetchSchedule(supabase: ReturnType<typeof assertServiceSupabase>, eventId: string) {
  // The two selects return different row shapes (the retry has no
  // `sub_events`), so `data` is widened to cover both - otherwise assigning
  // the fallback result below is a type error. The rows are passed straight
  // back out as JSON, so nothing downstream needs the narrower type.
  const primary = await supabase
    .from("event_schedule")
    .select(scheduleColumns)
    .eq("event_id", eventId)
    .order("activity_date", { ascending: true })
    .order("start_time", { ascending: true });

  let data: Record<string, unknown>[] | null = primary.data;
  let error = primary.error;

  if (isMissingSubEventsColumn(error)) {
    const retryResult = await supabase
      .from("event_schedule")
      .select(scheduleColumnsWithoutSubEvents)
      .eq("event_id", eventId)
      .order("activity_date", { ascending: true })
      .order("start_time", { ascending: true });
    data = retryResult.data;
    error = retryResult.error;
  }

  if (error) throw error;
  return data ?? [];
}
