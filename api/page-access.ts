import {
  eventPageKeys,
  fetchPageVisibility,
  normalizeVisibility,
  type PageVisibility,
} from "./_lib/page-visibility.js";
import {
  assertServiceSupabase,
  getRequestBody,
  handleApiError,
  requireAppUser,
  requireEventAdmin,
  sendJson,
} from "./_lib/server.js";

/**
 * Two resources on one function, dispatched on `?resource=` - the same
 * deployment constraint api/auctions.ts documents: Vercel routes every file
 * directly under api/ as its own serverless function and this project sits at
 * the plan's cap, so a new resource folds into a related route instead.
 *
 *   GET  /api/page-access?eventId=&pageKey=           one page, for the caller
 *   GET  /api/page-access?eventId=&resource=visibility  the admin's setting map
 *   POST /api/page-access  { eventId, visibility }      admin saves that map
 */

type PageAccessResult = {
  canView: boolean;
  canEdit: boolean;
  role: "admin" | "committee" | "read_only" | null;
  accessLevel: "none" | "view" | "edit";
  visibility: PageVisibility | "admin-only";
  requiresLogin: boolean;
  isReadOnly: boolean;
};

function anonymousResult(visibility: PageVisibility): PageAccessResult {
  const canView = visibility === "public";
  return {
    canView,
    canEdit: false,
    role: null,
    accessLevel: canView ? "view" : "none",
    visibility,
    // Signing in is only worth offering when it could actually help. A
    // restricted page still needs the admin to grant that person access, but
    // a sign-in is the first step, so both non-public levels ask for it.
    requiresLogin: !canView,
    isReadOnly: true,
  };
}

async function readVisibility(eventId: string, req: any, res: any) {
  const authHeader = String(req.headers.authorization ?? "");
  const visibility = await fetchPageVisibility(eventId);

  // The map itself is not a secret - it is what the nav and the route guard
  // need to know before a sign-in even happens. Only writing it is gated.
  let canEdit = false;
  if (authHeader.startsWith("Bearer ")) {
    const { appUser } = await requireAppUser(req);
    const supabase = assertServiceSupabase();
    const { data, error } = await supabase
      .from("event_members")
      .select("role")
      .eq("event_id", eventId)
      .eq("user_id", appUser.id)
      .maybeSingle();
    if (error) throw error;
    canEdit = data?.role === "admin";
  }

  sendJson(res, 200, { visibility, pageKeys: eventPageKeys, canEdit });
}

async function saveVisibility(req: any, res: any) {
  const body = await getRequestBody(req);
  const eventId = String(body.eventId ?? "");
  if (!eventId) {
    sendJson(res, 400, { error: "eventId is required" });
    return;
  }

  const { appUser } = await requireAppUser(req);
  await requireEventAdmin(eventId, appUser.id);

  const submitted = (body.visibility ?? {}) as Record<string, unknown>;
  const rows = eventPageKeys
    .filter((pageKey) => pageKey in submitted)
    .map((pageKey) => ({
      event_id: eventId,
      page_key: pageKey,
      visibility: normalizeVisibility(submitted[pageKey], pageKey),
      updated_at: new Date().toISOString(),
    }));

  if (rows.length) {
    const supabase = assertServiceSupabase();
    const { error } = await supabase
      .from("event_page_visibility")
      .upsert(rows, { onConflict: "event_id,page_key" });

    if (error && ["42P01", "PGRST205"].includes(error.code ?? "")) {
      const missing = new Error(
        "Page visibility cannot be saved yet: the event_page_visibility table is missing. Run supabase/migrations/015_event_page_visibility.sql, then try again.",
      );
      Object.assign(missing, { statusCode: 501 });
      throw missing;
    }
    if (error) throw error;
  }

  sendJson(res, 200, { visibility: await fetchPageVisibility(eventId) });
}

export default async function handler(req: any, res: any) {
  try {
    if (req.method === "POST") {
      await saveVisibility(req, res);
      return;
    }

    if (req.method !== "GET") {
      sendJson(res, 405, { error: "Method not allowed" });
      return;
    }

    const eventId = String(req.query.eventId ?? "");
    if (!eventId) {
      sendJson(res, 400, { error: "eventId is required" });
      return;
    }

    if (String(req.query.resource ?? "") === "visibility") {
      await readVisibility(eventId, req, res);
      return;
    }

    const pageKey = String(req.query.pageKey ?? "");
    if (!pageKey) {
      sendJson(res, 400, { error: "pageKey is required" });
      return;
    }

    const authHeader = String(req.headers.authorization ?? "");
    const isSettings = pageKey === "settings";
    const visibility = isSettings ? "restricted" : (await fetchPageVisibility(eventId))[pageKey] ?? "restricted";

    if (!authHeader.startsWith("Bearer ")) {
      sendJson(res, 200, isSettings ? anonymousResult("restricted") : anonymousResult(visibility));
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
    const grantedView = accessLevel === "view" || accessLevel === "edit";

    // Settings is never something an admin can open up - it is the screen that
    // controls all the others.
    const canView = isSettings
      ? isAdmin
      : isAdmin || visibility === "public" || visibility === "authenticated" || grantedView;
    const canEdit = isSettings ? isAdmin : isAdmin || accessLevel === "edit";

    const result: PageAccessResult = {
      canView,
      canEdit,
      role,
      accessLevel,
      visibility: isSettings ? "admin-only" : visibility,
      requiresLogin: false,
      isReadOnly: role === "read_only",
    };

    sendJson(res, 200, result);
  } catch (error) {
    handleApiError(res, error);
  }
}
