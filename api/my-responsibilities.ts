import { assertServiceSupabase, handleApiError, requireAppUser, sendJson } from "./_lib/server.js";

type ApiRequest = {
  method?: string;
  query?: {
    eventId?: string | string[];
  };
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

function uniqueValues(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value))));
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  try {
    if (req.method !== "GET") {
      sendJson(res, 405, { error: "Method not allowed" });
      return;
    }

    const { appUser } = await requireAppUser(req);
    const supabase = assertServiceSupabase();
    const eventId = typeof req.query?.eventId === "string" ? req.query.eventId : undefined;
    const emailLocalPart = appUser.email?.split("@")[0];
    const ownerValues = uniqueValues([appUser.full_name, appUser.email, emailLocalPart]);

    if (!ownerValues.length) {
      sendJson(res, 200, { responsibilities: [] });
      return;
    }

    let query = supabase
      .from("tasks")
      .select("id,task,owner_name,priority,due_date,status")
      .neq("status", "Cancelled")
      .order("due_date", { ascending: true, nullsFirst: false });

    if (eventId) {
      query = query.eq("event_id", eventId);
    }

    query = query.or(ownerValues.map((value) => `owner_name.ilike.${value.replaceAll(",", "\\,")}`).join(","));

    const { data, error } = await query;
    if (error) throw error;

    sendJson(res, 200, {
      responsibilities: (data ?? []).map((row) => ({
        id: row.id,
        task: row.task ?? "-",
        owner: row.owner_name ?? "",
        priority: row.priority ?? "Medium",
        due: row.due_date ?? "-",
        status: row.status ?? "Not Started",
      })),
    });
  } catch (error) {
    handleApiError(res, error);
  }
}
