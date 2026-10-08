import { assertServiceSupabase, getRequestBody, handleApiError, requireAppUser, sendJson } from "./_lib/server.js";
import { audit } from "./_lib/audit.js";
import { cleanDisplayName, cleanProfileFlat, cleanProfilePhone, isOwnAvatarUrl } from "../shared/profile.js";

const MIGRATION = "supabase/migrations/041_profile.sql";
const baseColumns = "id,firebase_uid,email,full_name,photo_url";

/**
 * The signed-in person's own account.
 *
 *   GET   /api/me   who you are, and your profile
 *   PATCH /api/me   change your name, photo, flat or phone
 *
 * Only ever the caller's own row: it is addressed by the id `requireAppUser` resolved from
 * the Firebase token, never by an id the client sends. Email follows the Google account.
 *
 * `full_name` only means anything because `requireAppUser` no longer rewrites it from the
 * Google profile on every request; see the note there. A chosen photograph needs the same
 * protection, which is why it has its own column (041) rather than overwriting `photo_url`.
 *
 * **Flat and phone are private.** They come back to their owner and nobody else, and are only
 * ever used to start a form filled in. A person who has not run 041 yet simply has no
 * profile fields: reads degrade, and a write that needs them answers 501 naming the migration.
 */

const isMissingColumn = (error: { code?: string; message?: string } | null) =>
  Boolean(error && (["42703", "PGRST204"].includes(error.code ?? "") || /custom_photo_url|flat|phone/.test(error.message ?? "")));

async function readProfile(userId: string) {
  const { data, error } = await assertServiceSupabase()
    .from("app_users")
    .select("custom_photo_url,flat,phone")
    .eq("id", userId)
    .maybeSingle();
  if (error) {
    if (isMissingColumn(error)) return { ready: false, customPhotoUrl: null, flat: "", phone: "" };
    throw error;
  }
  return {
    ready: true,
    customPhotoUrl: (data?.custom_photo_url as string | null) ?? null,
    flat: String(data?.flat ?? ""),
    phone: String(data?.phone ?? ""),
  };
}

type ApiRequest = Parameters<typeof requireAppUser>[0] & Parameters<typeof getRequestBody>[0] & { method?: string };

export default async function handler(req: ApiRequest, res: Parameters<typeof sendJson>[0]) {
  try {
    const { appUser } = await requireAppUser(req);

    if (req.method === "GET") {
      const profile = await readProfile(appUser.id);
      // The photograph everything else draws is the one they chose, else Google's. Google's is
      // still returned so "use my Google photo" can show what it would go back to.
      sendJson(res, 200, {
        user: { ...appUser, photo_url: profile.customPhotoUrl || appUser.photo_url, google_photo_url: appUser.photo_url },
        profile,
      });
      return;
    }

    if (req.method !== "PATCH") {
      sendJson(res, 405, { error: "Method not allowed" });
      return;
    }

    const body = (await getRequestBody(req)) as Record<string, unknown>;
    const supabase = assertServiceSupabase();
    const now = new Date().toISOString();
    const changes: Record<string, unknown> = {};
    const profileUpdates: Record<string, unknown> = {};

    if (body.fullName !== undefined) {
      const fullName = cleanDisplayName(body.fullName);
      if (!fullName) {
        sendJson(res, 400, { error: "Your name cannot be blank" });
        return;
      }
      changes.full_name = fullName;
    }
    if (body.flat !== undefined) profileUpdates.flat = cleanProfileFlat(body.flat) || null;
    if (body.phone !== undefined) profileUpdates.phone = cleanProfilePhone(body.phone) || null;
    if (body.photoUrl !== undefined) {
      const url = String(body.photoUrl ?? "").trim();
      if (url) {
        const origin = (process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "").replace(/\/$/, "");
        if (!isOwnAvatarUrl(url, appUser.id, origin || undefined)) {
          sendJson(res, 400, { error: "A profile photo has to be one uploaded through this app" });
          return;
        }
      }
      profileUpdates.custom_photo_url = url || null;
    }

    if (!Object.keys(changes).length && !Object.keys(profileUpdates).length) {
      sendJson(res, 400, { error: "Nothing to change" });
      return;
    }

    const { error } = await supabase
      .from("app_users")
      .update({ ...changes, ...profileUpdates, updated_at: now })
      .eq("id", appUser.id);
    if (error) {
      if (isMissingColumn(error) && Object.keys(profileUpdates).length) {
        sendJson(res, 501, { error: `Saving your photo, flat or phone needs ${MIGRATION}. Run it, then try again.` });
        return;
      }
      throw error;
    }

    audit(req, {
      action: "update", entityType: "app_user", entityId: appUser.id,
      actor: { id: appUser.id, email: appUser.email as string | undefined },
      before: { full_name: appUser.full_name ?? null },
      // Which fields moved, never the values of the private ones.
      after: { ...changes, ...(Object.keys(profileUpdates).length ? { profile_fields: Object.keys(profileUpdates).join(",") } : {}) },
      summary: "Changed their own profile",
    });

    const profile = await readProfile(appUser.id);
    const { data: fresh, error: freshError } = await supabase.from("app_users").select(baseColumns).eq("id", appUser.id).single();
    if (freshError) throw freshError;
    sendJson(res, 200, {
      user: { ...fresh, photo_url: profile.customPhotoUrl || fresh.photo_url, google_photo_url: fresh.photo_url },
      profile,
    });
  } catch (error) {
    handleApiError(res, error);
  }
}
