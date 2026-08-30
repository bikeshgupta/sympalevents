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

async function requireExpenseEditAccess(supabase: ReturnType<typeof assertServiceSupabase>, eventId: string, userId: string) {
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
      .eq("page_key", "expenses")
      .maybeSingle(),
  ]);

  if (memberError) throw memberError;
  if (permissionError) throw permissionError;

  const canEdit = member?.role === "admin" || permission?.access_level === "edit";
  if (!canEdit) {
    const error = new Error("You do not have edit access for expenses");
    Object.assign(error, { statusCode: 403 });
    throw error;
  }
}

function expensePayload(body: Record<string, unknown>) {
  return {
    expense_date: String(body.expense_date ?? ""),
    category: String(body.category ?? ""),
    item: String(body.item ?? ""),
    amount: Number(body.amount ?? 0),
    paid_by: String(body.paid_by ?? ""),
    payment_mode: String(body.payment_mode ?? "UPI"),
    expense_type: String(body.expense_type ?? "Purchase"),
    notes: String(body.notes ?? ""),
  };
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  try {
    if (!["POST", "PATCH", "DELETE"].includes(String(req.method))) {
      sendJson(res, 405, { error: "Method not allowed" });
      return;
    }

    const supabase = assertServiceSupabase();
    const { appUser } = await requireAppUser(req);
    const body = await getRequestBody(req);

    if (req.method === "POST") {
      const eventId = String(body.eventId ?? "");
      if (!eventId) {
        sendJson(res, 400, { error: "eventId is required" });
        return;
      }

      await requireExpenseEditAccess(supabase, eventId, appUser.id);

      const { data, error } = await supabase
        .from("expenses")
        .insert({ event_id: eventId, ...expensePayload(body) })
        .select("id")
        .single();

      if (error) throw error;
      sendJson(res, 201, { expenseId: data.id });
      return;
    }

    const expenseId = String(body.id ?? "");
    if (!expenseId) {
      sendJson(res, 400, { error: "id is required" });
      return;
    }

    const { data: existingExpense, error: existingError } = await supabase
      .from("expenses")
      .select("event_id")
      .eq("id", expenseId)
      .single();

    if (existingError) throw existingError;
    await requireExpenseEditAccess(supabase, existingExpense.event_id, appUser.id);

    if (req.method === "DELETE") {
      const { error } = await supabase.from("expenses").delete().eq("id", expenseId);
      if (error) throw error;
      sendJson(res, 200, { ok: true });
      return;
    }

    const { error } = await supabase.from("expenses").update(expensePayload(body)).eq("id", expenseId);
    if (error) throw error;
    sendJson(res, 200, { ok: true });
  } catch (error) {
    handleApiError(res, error);
  }
}
