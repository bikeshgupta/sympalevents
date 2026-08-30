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
    if (req.method !== "GET" && req.method !== "POST" && req.method !== "DELETE") {
      sendJson(res, 405, { error: "Method not allowed" });
      return;
    }

    const supabase = assertServiceSupabase();
    const { appUser } = await requireAppUser(req);

    if (req.method === "GET") {
      const eventId = String(req.query.eventId ?? "");
      const role = String(req.query.role ?? "");
      const userId = String(req.query.userId ?? "");

      if (!eventId) {
        sendJson(res, 400, { error: "eventId is required" });
        return;
      }

      await requireEventAdmin(eventId, appUser.id);

      if (userId) {
        const [
          { data: user, error: userError },
          { data: member, error: memberError },
          { data: permissions, error: permissionsError },
        ] = await Promise.all([
          supabase
            .from("app_users")
            .select("id,email,full_name,photo_url")
            .eq("id", userId)
            .single(),
          supabase
            .from("event_members")
            .select("role")
            .eq("event_id", eventId)
            .eq("user_id", userId)
            .maybeSingle(),
          supabase
            .from("event_page_permissions")
            .select("page_key,access_level")
            .eq("event_id", eventId)
            .eq("user_id", userId),
        ]);

        if (userError) throw userError;
        if (memberError) throw memberError;
        if (permissionsError) throw permissionsError;

        sendJson(res, 200, {
          member: {
            role: member?.role ?? null,
            app_users: user,
          },
          permissions: permissions ?? [],
        });
        return;
      }

      const [{ data: users, error: usersError }, { data: memberships, error: membershipsError }] = await Promise.all([
        supabase
          .from("app_users")
          .select("id,email,full_name,photo_url")
          .order("email", { ascending: true }),
        supabase
          .from("event_members")
          .select("user_id,role,created_at")
          .eq("event_id", eventId),
      ]);

      if (usersError) throw usersError;
      if (membershipsError) throw membershipsError;

      const membershipsByUserId = new Map((memberships ?? []).map((member) => [member.user_id, member]));
      const members = (users ?? [])
        .map((user) => {
          const membership = membershipsByUserId.get(user.id);
          return {
            role: membership?.role ?? null,
            created_at: membership?.created_at ?? null,
            app_users: user,
          };
        })
        .filter((member) => {
          if (!role || role === "all") return true;
          if (role === "unassigned") return !member.role;
          return member.role === role;
        });

      sendJson(res, 200, { members });
      return;
    }

    if (req.method === "DELETE") {
      const body = await getRequestBody(req);
      const eventId = String(body.eventId ?? "");
      const userId = String(body.userId ?? "");

      if (!eventId || !userId) {
        sendJson(res, 400, { error: "eventId and userId are required" });
        return;
      }

      await requireEventAdmin(eventId, appUser.id);

      const { error: permissionError } = await supabase
        .from("event_page_permissions")
        .delete()
        .eq("event_id", eventId)
        .eq("user_id", userId);

      if (permissionError) throw permissionError;

      const { error: memberError } = await supabase
        .from("event_members")
        .delete()
        .eq("event_id", eventId)
        .eq("user_id", userId);

      if (memberError) throw memberError;
      sendJson(res, 200, { ok: true });
      return;
    }

    const body = await getRequestBody(req);
    const eventId = String(body.eventId ?? "");
    const email = String(body.email ?? "").trim().toLowerCase();
    const userId = String(body.userId ?? "");
    const role = String(body.role ?? "");
    const permissions = Array.isArray(body.permissions) ? body.permissions : [];

    if (!eventId || (!email && !userId) || !validRoles.has(role)) {
      sendJson(res, 400, { error: "eventId, user/email, and role are required" });
      return;
    }

    const normalizedPermissions = permissions
      .map((permission) => ({
        pageKey: String(permission?.pageKey ?? ""),
        accessLevel: String(permission?.accessLevel ?? "none"),
      }))
      .filter((permission) => permission.pageKey && validAccessLevels.has(permission.accessLevel));

    await requireEventAdmin(eventId, appUser.id);

    const targetUserQuery = supabase
      .from("app_users")
      .select("id,email");
    const { data: targetUser, error: targetUserError } = await (userId
      ? targetUserQuery.eq("id", userId)
      : targetUserQuery.eq("email", email)
    ).maybeSingle();

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
