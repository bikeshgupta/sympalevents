import { createClient } from "@supabase/supabase-js";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const serviceSupabase =
  supabaseUrl && supabaseServiceRoleKey ? createClient(supabaseUrl, supabaseServiceRoleKey) : null;

function getFirebasePrivateKey() {
  const key = process.env.FIREBASE_PRIVATE_KEY;
  return key?.replace(/\\n/g, "\n");
}

function initFirebaseAdmin() {
  if (getApps().length) return;

  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

  if (serviceAccountJson) {
    initializeApp({
      credential: cert(JSON.parse(serviceAccountJson)),
    });
    return;
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = getFirebasePrivateKey();

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error("Firebase Admin environment variables are not configured");
  }

  initializeApp({
    credential: cert({
      projectId,
      clientEmail,
      privateKey,
    }),
  });
}

export function sendJson(res: any, status: number, body: unknown) {
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

export async function requireAppUser(req: any) {
  initFirebaseAdmin();
  const supabase = assertServiceSupabase();
  const authHeader = String(req.headers.authorization ?? "");
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : "";

  if (!token) {
    const error = new Error("Missing Firebase token");
    Object.assign(error, { statusCode: 401 });
    throw error;
  }

  const decoded = await getAuth().verifyIdToken(token);
  const email = decoded.email;

  if (!email) {
    const error = new Error("Firebase account does not have an email address");
    Object.assign(error, { statusCode: 400 });
    throw error;
  }

  const profile = {
    firebase_uid: decoded.uid,
    email,
    full_name: decoded.name ?? email,
    photo_url: decoded.picture ?? null,
    updated_at: new Date().toISOString(),
  };

  let result = await supabase
    .from("app_users")
    .upsert(profile, { onConflict: "firebase_uid" })
    .select("id,firebase_uid,email,full_name,photo_url")
    .single();

  if (result.error && result.error.code === "23505") {
    result = await supabase
      .from("app_users")
      .update(profile)
      .eq("email", email)
      .select("id,firebase_uid,email,full_name,photo_url")
      .single();
  }

  if (result.error) throw result.error;

  return {
    firebaseUser: decoded,
    appUser: result.data,
  };
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

export function handleApiError(res: any, error: unknown) {
  const item = error as { message?: string; statusCode?: number; code?: string };
  sendJson(res, item.statusCode ?? 500, {
    error: item.message ?? "Unexpected API error",
    code: item.code,
  });
}
