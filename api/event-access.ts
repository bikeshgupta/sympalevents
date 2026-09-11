import { eventPageKeys, fetchPageVisibility, isCommitteeOpenPage } from "./_lib/page-visibility.js";
import { assertServiceSupabase, handleApiError, requireAppUser, sendJson } from "./_lib/server.js";

/**
 * Every page the caller may see for one event, with edit rights - this is
 * what the sidebar and bottom nav filter on.
 *
 * Which pages are open to whom is no longer hardcoded here; it comes from
 * event_page_visibility, set by the admin in Settings. See
 * api/_lib/page-visibility.ts.
 */
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

    const visibility = await fetchPageVisibility(eventId);
    const authHeader = String(req.headers.authorization ?? "");

    if (!authHeader.startsWith("Bearer ")) {
      sendJson(res, 200, {
        role: null,
        pages: eventPageKeys
          .filter((pageKey) => visibility[pageKey] === "public")
          .map((pageKey) => ({
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

    const granted = new Map(
      (permissions ?? [])
        .filter((permission) => permission.access_level === "view" || permission.access_level === "edit")
        .map((permission) => [permission.page_key, permission.access_level as "view" | "edit"]),
    );

    // A signed-in user sees every page the admin opened up to "public" or
    // "authenticated", plus anything granted to them personally. A page the
    // admin left "restricted" needs that personal grant - except a
    // committee-open page (Expenses), which every committee member can reach
    // to file their own claims.
    const pages = eventPageKeys
      .map((pageKey) => {
        const accessLevel = granted.get(pageKey);
        const openToSignedIn = visibility[pageKey] === "public" || visibility[pageKey] === "authenticated";
        const openToCommittee = role === "committee" && isCommitteeOpenPage(pageKey);
        if (!accessLevel && !openToSignedIn && !openToCommittee) return null;
        return {
          pageKey,
          canView: true,
          canEdit: accessLevel === "edit",
          accessLevel: accessLevel ?? ("view" as const),
        };
      })
      .filter(Boolean);

    sendJson(res, 200, { role, pages });
  } catch (error) {
    handleApiError(res, error);
  }
}
