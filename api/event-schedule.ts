import {
  assertServiceSupabase,
  getRequestBody,
  handleApiError,
  requireAppUser,
  sendJson,
} from "./_lib/server.js";

type ApiRequest = {
  method?: string;
  body?: unknown;
  query?: Record<string, unknown>;
  headers: {
    authorization?: string;
  };
};

type ApiResponse = {
  setHeader?: (name: string, value: string) => void;
  status: (statusCode: number) => {
    json: (body: unknown) => void;
  };
};

async function requireScheduleEditAccess(supabase: ReturnType<typeof assertServiceSupabase>, eventId: string, userId: string) {
  const [{ data: member, error: memberError }, { data: permission, error: permissionError }] = await Promise.all([
    supabase
      .from("event_members")
      .select("role")
      .eq("event_id", eventId)
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("event_page_permissions")
      .select("access_level")
      .eq("event_id", eventId)
      .eq("user_id", userId)
      .eq("page_key", "event-plan")
      .maybeSingle(),
  ]);

  if (memberError) throw memberError;
  if (permissionError) throw permissionError;

  const canEdit = member?.role === "admin" || permission?.access_level === "edit";
  if (!canEdit) {
    const error = new Error("You do not have edit access for events");
    Object.assign(error, { statusCode: 403 });
    throw error;
  }
}

function schedulePayload(body: Record<string, unknown>) {
  return {
    day: String(body.day ?? ""),
    activity_date: String(body.activity_date ?? ""),
    activity: String(body.activity ?? ""),
    sub_events: String(body.sub_events ?? ""),
    start_time: body.start_time ? String(body.start_time) : null,
    end_time: body.end_time ? String(body.end_time) : null,
    location: String(body.location ?? ""),
    expected_attendance: Number(body.expected_attendance ?? 0),
    owner_name: String(body.owner_name ?? ""),
    status: String(body.status ?? "Planned"),
    notes: String(body.notes ?? ""),
  };
}

function payloadWithoutSubEvents(payload: ReturnType<typeof schedulePayload>) {
  const { sub_events: _subEvents, ...rest } = payload;
  return rest;
}

function isMissingSubEventsColumn(error: { code?: string; message?: string } | null) {
  return Boolean(
    error &&
      (["42703", "PGRST204"].includes(error.code ?? "") ||
        error.message?.includes("'sub_events' column") ||
        error.message?.includes("sub_events")),
  );
}

async function fetchSchedule(supabase: ReturnType<typeof assertServiceSupabase>, eventId: string) {
  const columns = "id,day,activity_date,activity,sub_events,start_time,end_time,location,expected_attendance,owner_name,status,notes";
  const columnsWithoutSubEvents =
    "id,day,activity_date,activity,start_time,end_time,location,expected_attendance,owner_name,status,notes";

  // The two selects return different row shapes (the retry has no
  // `sub_events`), so `data` is widened to cover both - otherwise assigning
  // the fallback result below is a type error. The rows are passed straight
  // back out as JSON, so nothing downstream needs the narrower type.
  const primary = await supabase
    .from("event_schedule")
    .select(columns)
    .eq("event_id", eventId)
    .order("activity_date", { ascending: true })
    .order("start_time", { ascending: true });

  let data: Record<string, unknown>[] | null = primary.data;
  let error = primary.error;

  if (isMissingSubEventsColumn(error)) {
    const retryResult = await supabase
      .from("event_schedule")
      .select(columnsWithoutSubEvents)
      .eq("event_id", eventId)
      .order("activity_date", { ascending: true })
      .order("start_time", { ascending: true });
    data = retryResult.data;
    error = retryResult.error;
  }

  if (error) throw error;
  return data ?? [];
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  try {
    if (!["GET", "POST", "PATCH", "DELETE"].includes(String(req.method))) {
      sendJson(res, 405, { error: "Method not allowed" });
      return;
    }

    const supabase = assertServiceSupabase();

    if (req.method === "GET") {
      const eventId = String(req.query?.eventId ?? "");
      if (!eventId) {
        sendJson(res, 400, { error: "eventId is required" });
        return;
      }

      const schedule = await fetchSchedule(supabase, eventId);
      sendJson(res, 200, { schedule });
      return;
    }

    const { appUser } = await requireAppUser(req);
    const body = await getRequestBody(req);

    if (req.method === "POST") {
      const eventId = String(body.eventId ?? "");
      if (!eventId) {
        sendJson(res, 400, { error: "eventId is required" });
        return;
      }

      await requireScheduleEditAccess(supabase, eventId, appUser.id);
      const payload = schedulePayload(body);

      let { data, error } = await supabase
        .from("event_schedule")
        .insert({ event_id: eventId, ...payload })
        .select("id")
        .single();

      if (isMissingSubEventsColumn(error)) {
        const retryResult = await supabase
          .from("event_schedule")
          .insert({ event_id: eventId, ...payloadWithoutSubEvents(payload) })
          .select("id")
          .single();
        data = retryResult.data;
        error = retryResult.error;
      }

      if (error) throw error;
      sendJson(res, 201, { scheduleId: data.id });
      return;
    }

    const scheduleId = String(body.id ?? "");
    if (!scheduleId) {
      sendJson(res, 400, { error: "id is required" });
      return;
    }

    const { data: existingSchedule, error: existingError } = await supabase
      .from("event_schedule")
      .select("event_id")
      .eq("id", scheduleId)
      .single();

    if (existingError) throw existingError;
    await requireScheduleEditAccess(supabase, existingSchedule.event_id, appUser.id);

    if (req.method === "DELETE") {
      const { error } = await supabase.from("event_schedule").delete().eq("id", scheduleId);
      if (error) throw error;
      sendJson(res, 200, { ok: true });
      return;
    }

    const payload = schedulePayload(body);
    let { error } = await supabase.from("event_schedule").update(payload).eq("id", scheduleId);
    if (isMissingSubEventsColumn(error)) {
      const retryResult = await supabase.from("event_schedule").update(payloadWithoutSubEvents(payload)).eq("id", scheduleId);
      error = retryResult.error;
    }
    if (error) throw error;
    sendJson(res, 200, { ok: true });
  } catch (error) {
    handleApiError(res, error);
  }
}
