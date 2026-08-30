import {
  assertServiceSupabase,
  getRequestBody,
  handleApiError,
  requireAppUser,
  requireEventAdmin,
  sendJson,
} from "./_lib/server";

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
    const permissions = Array.isArray(body.permissions) ? body.permissions : [];

    if (!eventId || !email || !validRoles.has(role)) {
      sendJson(res, 400, { error: "eventId, email, and role are required" });
      return;
    }

    const normalizedPermissions = permissions
      .map((permission) => ({
        pageKey: String(permission?.pageKey ?? ""),
        accessLevel: String(permission?.accessLevel ?? "none"),
      }))
      .filter((permission) => permission.pageKey && validAccessLevels.has(permission.accessLevel));

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

    const { error: deletePermissionError } = await supabase
      .from("event_page_permissions")
      .delete()
      .eq("event_id", eventId)
      .eq("user_id", targetUser.id);

    if (deletePermissionError) throw deletePermissionError;

    const permissionRows = normalizedPermissions
      .filter((permission) => permission.accessLevel !== "none")
      .map((permission) => ({
        event_id: eventId,
        user_id: targetUser.id,
        page_key: permission.pageKey,
        access_level: permission.accessLevel,
        updated_at: new Date().toISOString(),
      }));

    if (permissionRows.length) {
      const { error: permissionError } = await supabase.from("event_page_permissions").insert(permissionRows);
      if (permissionError) throw permissionError;
    }

    sendJson(res, 200, { ok: true });
  } catch (error) {
    handleApiError(res, error);
  }
}
