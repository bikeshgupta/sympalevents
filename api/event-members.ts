import {
  assertServiceSupabase,
  getRequestBody,
  handleApiError,
  requireAppUser,
  requireEventAdmin,
  sendJson,
} from "./_lib/server.js";

const validRoles = new Set(["admin", "committee", "read_only"]);
const validAccessLevels = new Set(["none", "view", "edit"]);

export default async function handler(req: any, res: any) {
  try {
    if (req.method !== "POST") {
      sendJson(res, 405, { error: "Method not allowed" });
      return;
    }

    const supabase = assertServiceSupabase();
    const { appUser } = await requireAppUser(req);
    const body = await getRequestBody(req);
    const eventId = String(body.eventId ?? "");
    const email = String(body.email ?? "").trim().toLowerCase();
    const role = String(body.role ?? "");
    const pageKey = String(body.pageKey ?? "");
    const accessLevel = String(body.accessLevel ?? "none");

    if (!eventId || !email || !validRoles.has(role) || !pageKey || !validAccessLevels.has(accessLevel)) {
      sendJson(res, 400, { error: "eventId, email, role, pageKey, and accessLevel are required" });
      return;
    }

    await requireEventAdmin(eventId, appUser.id);

    const { data: targetUser, error: targetUserError } = await supabase
      .from("app_users")
      .select("id,email")
      .eq("email", email)
      .maybeSingle();

    if (targetUserError) throw targetUserError;

    if (!targetUser) {
      sendJson(res, 404, { error: "Member must sign in with Google once before access can be granted" });
      return;
    }

    const { error: memberError } = await supabase.from("event_members").upsert(
      {
        event_id: eventId,
        user_id: targetUser.id,
        role,
      },
      { onConflict: "event_id,user_id" },
    );

    if (memberError) throw memberError;

    const { error: permissionError } = await supabase.from("event_page_permissions").upsert(
      {
        event_id: eventId,
        user_id: targetUser.id,
        page_key: pageKey,
        access_level: accessLevel,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "event_id,user_id,page_key" },
    );

    if (permissionError) throw permissionError;

    sendJson(res, 200, { ok: true });
  } catch (error) {
    handleApiError(res, error);
  }
}
