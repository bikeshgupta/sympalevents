import { assertServiceSupabase, handleApiError, requireAppUser, sendJson } from "./_lib/server";

const publicPageKeys = new Set(["dashboard", "expenses"]);

export default async function handler(req: any, res: any) {
  try {
    if (req.method !== "GET") {
      sendJson(res, 405, { error: "Method not allowed" });
      return;
    }

    const eventId = String(req.query.eventId ?? "");
    const pageKey = String(req.query.pageKey ?? "");

    if (!eventId || !pageKey) {
      sendJson(res, 400, { error: "eventId and pageKey are required" });
      return;
    }

    if (publicPageKeys.has(pageKey)) {
      sendJson(res, 200, {
        canView: true,
        canEdit: false,
        role: null,
        accessLevel: "view",
        isReadOnly: true,
      });
      return;
    }

    const supabase = assertServiceSupabase();
    const { appUser } = await requireAppUser(req);

    const [{ data: member, error: memberError }, { data: permission, error: permissionError }] = await Promise.all([
      supabase
        .from("event_members")
        .select("role")
        .eq("event_id", eventId)
        .eq("user_id", appUser.id)
        .maybeSingle(),
      supabase
        .from("event_page_permissions")
        .select("access_level")
        .eq("event_id", eventId)
        .eq("user_id", appUser.id)
        .eq("page_key", pageKey)
        .maybeSingle(),
    ]);

    if (memberError) throw memberError;
    if (permissionError) throw permissionError;

    const role = member?.role ?? null;
    const accessLevel = permission?.access_level ?? "none";
    const isAdmin = role === "admin";
    const isCommittee = role === "committee";
    const isReadOnly = role === "read_only";
    const isSettings = pageKey === "settings";
    const canView =
      isSettings
        ? isAdmin
        : publicPageKeys.has(pageKey) ||
          isAdmin ||
          isCommittee ||
          accessLevel === "view" ||
          accessLevel === "edit";
    const canEdit = isSettings ? isAdmin : isAdmin || isCommittee || accessLevel === "edit";

    sendJson(res, 200, {
      canView,
      canEdit,
      role,
      accessLevel,
      isReadOnly,
    });
  } catch (error) {
    handleApiError(res, error);
  }
}
