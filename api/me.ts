import { assertServiceSupabase, getRequestBody, handleApiError, requireAppUser, sendJson } from "./_lib/server.js";

const MAX_NAME = 80;

/**
 * The signed-in person's own account.
 *
 *   GET   /api/me   who you are
 *   PATCH /api/me   set your own display name
 *
 * The name is the one thing here a person can change, and only their own:
 * the row is addressed by the id `requireAppUser` resolved from the Firebase
 * token, never by an id the client sends. Everything else on the row - email,
 * photo - follows the Google account and is not ours to edit.
 *
 * This only means anything because `requireAppUser` no longer rewrites
 * `full_name` from the Google profile on every request; see the note there.
 */
export default async function handler(req: any, res: any) {
  try {
    const { appUser } = await requireAppUser(req);

    if (req.method === "GET") {
      sendJson(res, 200, { user: appUser });
      return;
    }

    if (req.method !== "PATCH") {
      sendJson(res, 405, { error: "Method not allowed" });
      return;
    }

    const body = (await getRequestBody(req)) as { fullName?: unknown };
    const fullName = String(body.fullName ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_NAME);

    if (!fullName) {
      sendJson(res, 400, { error: "Your name cannot be blank" });
      return;
    }

    const supabase = assertServiceSupabase();
    const { data, error } = await supabase
      .from("app_users")
      .update({ full_name: fullName, updated_at: new Date().toISOString() })
      .eq("id", appUser.id)
      .select("id,firebase_uid,email,full_name,photo_url")
      .single();

    if (error) throw error;
    sendJson(res, 200, { user: data });
  } catch (error) {
    handleApiError(res, error);
  }
}
