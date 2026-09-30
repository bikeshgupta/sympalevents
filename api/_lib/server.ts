import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const firebaseProjectId =
  readEnvValue(process.env.FIREBASE_PROJECT_ID) ?? readEnvValue(process.env.VITE_FIREBASE_PROJECT_ID);
const firebaseJwksUrl = new URL(
  "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com",
);

export const serviceSupabase =
  supabaseUrl && supabaseServiceRoleKey ? createClient(supabaseUrl, supabaseServiceRoleKey) : null;

function readEnvValue(value: string | undefined) {
  return value?.trim().replace(/^["']|["']$/g, "");
}

export function sendJson(res: any, status: number, body: unknown) {
  res.setHeader?.("Cache-Control", "no-store");
  res.status(status).json(body);
}

export function assertServiceSupabase() {
  if (!serviceSupabase) {
    throw new Error("Supabase service role environment variables are not configured");
  }
  return serviceSupabase;
}

export async function getRequestBody(req: any) {
  if (!req.body) return {};
  if (typeof req.body === "string") return JSON.parse(req.body);
  return req.body;
}

async function verifyFirebaseIdToken(token: string) {
  if (!firebaseProjectId) {
    throw new Error("Firebase project id is not configured. Missing FIREBASE_PROJECT_ID.");
  }

  const { createRemoteJWKSet, jwtVerify } = await import("jose");
  const jwks = createRemoteJWKSet(firebaseJwksUrl);
  const { payload } = await jwtVerify(token, jwks, {
    audience: firebaseProjectId,
    issuer: `https://securetoken.google.com/${firebaseProjectId}`,
  });
  const uid = typeof payload.user_id === "string" ? payload.user_id : payload.sub;

  if (!uid) {
    const error = new Error("Invalid Firebase token");
    Object.assign(error, { statusCode: 401 });
    throw error;
  }

  return {
    uid,
    email: typeof payload.email === "string" ? payload.email : undefined,
    name: typeof payload.name === "string" ? payload.name : undefined,
    picture: typeof payload.picture === "string" ? payload.picture : undefined,
  };
}

export async function requireAppUser(req: any) {
  const supabase = assertServiceSupabase();
  const authHeader = String(req.headers.authorization ?? "");
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : "";

  if (!token) {
    const error = new Error("Missing Firebase token");
    Object.assign(error, { statusCode: 401 });
    throw error;
  }

  const decoded = await verifyFirebaseIdToken(token);
  const email = decoded.email;

  if (!email) {
    const error = new Error("Firebase account does not have an email address");
    Object.assign(error, { statusCode: 400 });
    throw error;
  }

  // `full_name` is deliberately NOT in here. It used to be, set from the
  // Google profile on every single authenticated request - which meant a name
  // somebody corrected in this app was overwritten again within seconds, and
  // silently. Google's name seeds the row once, below, and after that the name
  // belongs to the person it names (PATCH /api/me). Their photo and email do
  // still follow the Google account; those are not ours to hold stale.
  const profile = {
    firebase_uid: decoded.uid,
    email,
    photo_url: decoded.picture ?? null,
    updated_at: new Date().toISOString(),
  };

  const columns = "id,firebase_uid,email,full_name,photo_url";

  let result = await supabase
    .from("app_users")
    .upsert(profile, { onConflict: "firebase_uid" })
    .select(columns)
    .single();

  if (result.error && result.error.code === "23505") {
    result = await supabase.from("app_users").update(profile).eq("email", email).select(columns).single();
  }

  if (result.error) throw result.error;

  // Seed the name on the very first sign-in, and repair a row that somehow has
  // none. One extra write per account, ever - not one per request.
  if (!String(result.data.full_name ?? "").trim()) {
    const seeded = await supabase
      .from("app_users")
      .update({ full_name: decoded.name ?? email })
      .eq("id", result.data.id)
      .select(columns)
      .single();
    if (seeded.error) throw seeded.error;
    result = seeded;
  }

  return {
    firebaseUser: decoded,
    appUser: result.data,
  };
}

/**
 * The caller when there is one, and null when there is not - for a route that
 * serves a page an admin may have opened to anyone. A token that is present
 * but unreadable is treated as absent rather than as an error, so an expired
 * session degrades a public page to its signed-out view instead of breaking it.
 */
export async function optionalAppUser(req: { headers?: { authorization?: string } }) {
  const authHeader = String(req.headers?.authorization ?? "");
  if (!authHeader.startsWith("Bearer ")) return null;
  try {
    const { appUser } = await requireAppUser(req);
    return appUser;
  } catch (error) {
    console.warn("Ignoring an unreadable token on a public read:", error);
    return null;
  }
}

export async function requireEventAdmin(eventId: string, userId: string) {
  const supabase = assertServiceSupabase();
  const { data, error } = await supabase
    .from("event_members")
    .select("role")
    .eq("event_id", eventId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;

  if (data?.role !== "admin") {
    const denied = new Error("Only event admins can perform this action");
    Object.assign(denied, { statusCode: 403 });
    throw denied;
  }
}

/** Admin OR committee - the bar for auction management and (so far) uploads.
 *  Shared so every caller checks the same role set the same way. */
export async function requireEventCommittee(eventId: string, userId: string) {
  const supabase = assertServiceSupabase();
  const { data, error } = await supabase
    .from("event_members")
    .select("role")
    .eq("event_id", eventId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;

  if (data?.role !== "admin" && data?.role !== "committee") {
    const denied = new Error("Only event admins or committee members can perform this action");
    Object.assign(denied, { statusCode: 403 });
    throw denied;
  }
}

export function handleApiError(res: any, error: unknown) {
  const item = error as { message?: string; statusCode?: number; code?: string };
  console.error("API error", item);
  sendJson(res, item.statusCode ?? 500, {
    error: item.message ?? "Unexpected API error",
    code: item.code,
  });
}
