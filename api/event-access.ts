import { assertServiceSupabase, handleApiError, requireAppUser, sendJson } from "./_lib/server.js";

const publicPageKeys = ["dashboard", "budget", "auctions"];
const eventPageKeys = [
  "dashboard",
  "contributions",
  "sponsors",
  "budget",
  "expenses",
  "auctions",
  "prasad",
  "tasks",
  "volunteers",
  "event-plan",
  "contacts",
];

export default async function handler(req: any, res: any) {
  try {
    if (req.method !== "GET") {
      sendJson(res, 405, { error: "Method not allowed" });
      return;
    }

    const eventId = String(req.query.eventId ?? "");

    if (!eventId) {
      sendJson(res, 400, { error: "eventId is required" });
      return;
    }

    const authHeader = String(req.headers.authorization ?? "");

    if (!authHeader.startsWith("Bearer ")) {
      sendJson(res, 200, {
        role: null,
        pages: publicPageKeys.map((pageKey) => ({
          pageKey,
          canView: true,
          canEdit: false,
          accessLevel: "view",
        })),
      });
      return;
    }

    const supabase = assertServiceSupabase();
    const { appUser } = await requireAppUser(req);

    const [{ data: member, error: memberError }, { data: permissions, error: permissionsError }] = await Promise.all([
      supabase
        .from("event_members")
        .select("role")
        .eq("event_id", eventId)
        .eq("user_id", appUser.id)
        .maybeSingle(),
      supabase
        .from("event_page_permissions")
        .select("page_key,access_level")
        .eq("event_id", eventId)
        .eq("user_id", appUser.id),
    ]);

    if (memberError) throw memberError;
    if (permissionsError) throw permissionsError;

    const role = member?.role ?? null;

    if (role === "admin") {
      sendJson(res, 200, {
        role,
        pages: [...eventPageKeys, "settings"].map((pageKey) => ({
          pageKey,
          canView: true,
          canEdit: true,
          accessLevel: "edit",
        })),
      });
      return;
    }

    const assignedPages = new Map(
      (permissions ?? [])
        .filter((permission) => permission.access_level === "view" || permission.access_level === "edit")
        .map((permission) => [permission.page_key, permission.access_level]),
    );

    for (const pageKey of publicPageKeys) {
      if (!assignedPages.has(pageKey)) assignedPages.set(pageKey, "view");
    }

    sendJson(res, 200, {
      role,
      pages: [...assignedPages.entries()].map(([pageKey, accessLevel]) => ({
        pageKey,
        canView: true,
        canEdit: accessLevel === "edit",
        accessLevel,
      })),
    });
  } catch (error) {
    handleApiError(res, error);
  }
}
