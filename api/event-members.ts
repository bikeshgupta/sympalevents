import {
  assertServiceSupabase,
  getRequestBody,
  handleApiError,
  requireAppUser,
  requireEventAdmin,
  sendJson,
} from "./_lib/server.js";
import { assertCanManageEventRole } from "./_lib/authority.js";
import { audit, newRequestId } from "./_lib/audit.js";

const validRoles = new Set(["admin", "committee", "read_only"]);
const validAccessLevels = new Set(["none", "view", "edit"]);

/**
 * Refuse a change that would leave the event with no admin at all.
 *
 * An admin stepping down or being removed is perfectly normal - handing the
 * committee over is the point. Being the *last* one is the problem: nothing
 * else in this app can create an admin for an existing event, so an event
 * with zero admins has no way back. Settings, member access and page
 * visibility would all be locked for everyone, including the person who did
 * it.
 *
 * `nextRole` is the role the target is being moved to, or null for removal.
 */
async function assertAdminRemains(
  supabase: ReturnType<typeof assertServiceSupabase>,
  eventId: string,
  userId: string,
  nextRole: string | null,
) {
  if (nextRole === "admin") return;

  const { data: current, error } = await supabase
    .from("event_members")
    .select("role")
    .eq("event_id", eventId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (current?.role !== "admin") return;

  const { count, error: countError } = await supabase
    .from("event_members")
    .select("user_id", { count: "exact", head: true })
    .eq("event_id", eventId)
    .eq("role", "admin");
  if (countError) throw countError;
  if ((count ?? 0) > 1) return;

  const failure = new Error(
    nextRole
      ? "This is the event's only admin. Make somebody else an admin first, then change this role."
      : "This is the event's only admin. Make somebody else an admin first, then remove this one.",
  );
  Object.assign(failure, { statusCode: 409 });
  throw failure;
}

export default async function handler(req: any, res: any) {
  try {
    if (req.method !== "GET" && req.method !== "POST" && req.method !== "PATCH" && req.method !== "DELETE") {
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
          // Everyone who actually has a role on this event - the roster, as
          // opposed to every person who has ever signed in to the app.
          if (role === "assigned") return Boolean(member.role);
          return member.role === role;
        });

      sendJson(res, 200, { members });
      return;
    }

    // An admin correcting somebody's name. Separate from the role/permissions
    // POST below on purpose: that one rewrites every page grant from the form
    // it was submitted with, and a rename must not have to carry all of that.
    //
    // An admin may do this because the names on this event - the credits, the
    // task board, the prasad roster - go out over the committee's name, and
    // "Rohan D." as Google spells it is theirs to correct. The person can
    // always set it back themselves via PATCH /api/me.
    if (req.method === "PATCH") {
      const body = await getRequestBody(req);
      const eventId = String(body.eventId ?? "");
      const userId = String(body.userId ?? "");
      const fullName = String(body.fullName ?? "").replace(/\s+/g, " ").trim().slice(0, 80);

      if (!eventId || !userId || !fullName) {
        sendJson(res, 400, { error: "eventId, userId and a name are required" });
        return;
      }

      await requireEventAdmin(eventId, appUser.id);

      const { data: priorUser } = await supabase.from("app_users").select("full_name").eq("id", userId).maybeSingle();
      const priorName = (priorUser?.full_name as string | null) ?? null;

      const { error } = await supabase
        .from("app_users")
        .update({ full_name: fullName, updated_at: new Date().toISOString() })
        .eq("id", userId);

      if (error) throw error;

      audit(req, {
        action: "update",
        entityType: "app_user",
        entityId: userId,
        eventId,
        actor: { id: appUser.id },
        before: { full_name: priorName },
        after: { full_name: fullName },
        summary: `Corrected a member's display name`,
      });

      sendJson(res, 200, { ok: true });
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
      // Who may do the removing - a society admin outranks an event admin, and
      // an event admin may not remove one. Separate from assertAdminRemains
      // below, which is about the event not being left without any admin.
      await assertCanManageEventRole(supabase, eventId, appUser.id, userId, null);
      await assertAdminRemains(supabase, eventId, userId, null);

      // Read before removing, so the audit row can say what they were.
      const { data: removedMember } = await supabase
        .from("event_members")
        .select("role")
        .eq("event_id", eventId)
        .eq("user_id", userId)
        .maybeSingle();
      const removedRole = (removedMember?.role as string | null) ?? null;

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

      audit(req, {
        action: "delete",
        entityType: "event_member",
        entityId: userId,
        eventId,
        actor: { id: appUser.id },
        before: { user_id: userId, role: removedRole },
        summary: `Removed a member (${removedRole ?? "no role"}) and every page permission they had`,
      });

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

    // Granting or revoking event admin is the society's call, and nobody
    // below a society admin may change a society admin's role.
    await assertCanManageEventRole(supabase, eventId, appUser.id, targetUser.id, role);
    await assertAdminRemains(supabase, eventId, targetUser.id, role);

    // One id for the role change and the page grants that come with it, so
    // they read back as a single action rather than five unrelated rows.
    const requestId = newRequestId();
    const { data: priorMember } = await supabase
      .from("event_members")
      .select("role")
      .eq("event_id", eventId)
      .eq("user_id", targetUser.id)
      .maybeSingle();
    const priorRole = (priorMember?.role as string | null) ?? null;

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

    audit(req, {
      action: priorRole ? "update" : "create",
      entityType: "event_member",
      entityId: targetUser.id,
      eventId,
      actor: { id: appUser.id },
      requestId,
      before: priorRole ? { role: priorRole } : null,
      after: { user_id: targetUser.id, role },
      summary: priorRole ? `Changed a member's role from ${priorRole} to ${role}` : `Added a member as ${role}`,
    });

    audit(req, {
      action: "update",
      entityType: "event_page_permissions",
      entityId: targetUser.id,
      eventId,
      actor: { id: appUser.id },
      requestId,
      after: { permissions: normalizedPermissions },
      summary: `Set page access for a member (${normalizedPermissions.length} page grants)`,
    });

    sendJson(res, 200, { ok: true });
  } catch (error) {
    handleApiError(res, error);
  }
}
