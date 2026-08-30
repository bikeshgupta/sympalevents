import {
  assertServiceSupabase,
  getRequestBody,
  handleApiError,
  requireAppUser,
  requireEventAdmin,
  sendJson,
} from "./_lib/server.js";

const validActions = new Set(["approve", "reject"]);

export default async function handler(req: any, res: any) {
  try {
    const supabase = assertServiceSupabase();
    const { appUser } = await requireAppUser(req);

    if (req.method === "GET") {
      const eventId = String(req.query.eventId ?? "");
      if (!eventId) {
        sendJson(res, 400, { error: "eventId is required" });
        return;
      }

      await requireEventAdmin(eventId, appUser.id);

      const { data, error } = await supabase
        .from("event_access_requests")
        .select("id,event_id,requested_role,status,created_at,app_users:user_id(id,email,full_name,photo_url)")
        .eq("event_id", eventId)
        .eq("status", "pending")
        .order("created_at", { ascending: true });

      if (error) throw error;
      sendJson(res, 200, { requests: data ?? [] });
      return;
    }

    if (req.method === "POST") {
      const body = await getRequestBody(req);
      const eventId = String(body.eventId ?? "");
      if (!eventId) {
        sendJson(res, 400, { error: "eventId is required" });
        return;
      }

      const { error } = await supabase.from("event_access_requests").upsert(
        {
          event_id: eventId,
          user_id: appUser.id,
          requested_role: "committee",
          status: "pending",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "event_id,user_id,requested_role" },
      );

      if (error) throw error;
      sendJson(res, 200, { ok: true });
      return;
    }

    if (req.method === "PATCH") {
      const body = await getRequestBody(req);
      const requestId = String(body.requestId ?? "");
      const action = String(body.action ?? "");

      if (!requestId || !validActions.has(action)) {
        sendJson(res, 400, { error: "requestId and valid action are required" });
        return;
      }

      const { data: request, error: requestError } = await supabase
        .from("event_access_requests")
        .select("id,event_id,user_id,requested_role,status")
        .eq("id", requestId)
        .single();

      if (requestError) throw requestError;
      await requireEventAdmin(request.event_id, appUser.id);

      if (action === "approve") {
        const { error: memberError } = await supabase.from("event_members").upsert(
          {
            event_id: request.event_id,
            user_id: request.user_id,
            role: request.requested_role,
          },
          { onConflict: "event_id,user_id" },
        );

        if (memberError) throw memberError;
      }

      const { error: updateError } = await supabase
        .from("event_access_requests")
        .update({
          status: action === "approve" ? "approved" : "rejected",
          updated_at: new Date().toISOString(),
        })
        .eq("id", requestId);

      if (updateError) throw updateError;
      sendJson(res, 200, { ok: true });
      return;
    }

    sendJson(res, 405, { error: "Method not allowed" });
  } catch (error) {
    handleApiError(res, error);
  }
}
