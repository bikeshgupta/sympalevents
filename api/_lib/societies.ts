import { assertServiceSupabase, optionalAppUser, requireAppUser, sendJson } from "./server.js";

/**
 * Societies - the tenant an event belongs to. Served from api/events.ts on
 * `?resource=societies` and `?resource=join`, with the handlers here because
 * Vercel routes every file directly under api/ as its own function and this
 * project is at the plan's cap (see CLAUDE.md).
 *
 * The stored table is still called `organizations` (023 explains why it keeps
 * the name). In the product it is a Society, and everything user-facing says
 * so.
 *
 * Belonging to a society is DISCOVERY, not authority: it is what puts an
 * event in your switcher. What you may do on that event is still your
 * `event_members` role plus the admin's page visibility. Nothing in this file
 * grants access to an event's data.
 */

type ApiRequest = {
  method?: string;
  body?: unknown;
  query?: Record<string, unknown>;
  headers: { authorization?: string };
};

type ApiResponse = {
  setHeader?: (name: string, value: string) => void;
  status: (statusCode: number) => { json: (body: unknown) => void };
};

export type SocietyRole = "admin" | "committee" | "read_only";

const MAX_NAME = 80;
const MAX_CITY = 60;

/** Unambiguous in handwriting and over the phone: no O/0, no I/1/L. */
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function makeInviteCode() {
  let code = "";
  for (let index = 0; index < 8; index += 1) {
    code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return code;
}

function cleanText(value: unknown, max: number) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function fail(message: string, statusCode: number) {
  const error = new Error(message);
  Object.assign(error, { statusCode });
  return error;
}

/**
 * 023 has not been run yet. Every read here degrades to "no societies" and
 * every write says which file to run, the same shape as every other pending
 * migration in this project.
 */
function isMissingSocietySchema(error: { code?: string; message?: string } | null) {
  return Boolean(
    error && (["42P01", "42703", "PGRST205", "PGRST204"].includes(error.code ?? "") || error.message?.includes("invite_code")),
  );
}

function notMigrated(): never {
  throw fail(
    "Societies are not set up yet. Run supabase/migrations/023_societies.sql, then try again.",
    501,
  );
}

async function getRequestBody(req: ApiRequest) {
  if (!req.body) return {} as Record<string, unknown>;
  if (typeof req.body === "string") return JSON.parse(req.body) as Record<string, unknown>;
  return req.body as Record<string, unknown>;
}

type SupabaseClient = ReturnType<typeof assertServiceSupabase>;

/** Every society this person belongs to, with their role on it. */
export async function fetchMySocieties(supabase: SupabaseClient, userId: string) {
  const { data, error } = await supabase
    .from("organization_members")
    .select("organization_id,role")
    .eq("user_id", userId);

  if (error) {
    if (isMissingSocietySchema(error)) return null;
    throw error;
  }

  const ids = (data ?? []).map((row) => row.organization_id);
  if (!ids.length) return [];

  const roleById = new Map((data ?? []).map((row) => [row.organization_id, row.role as SocietyRole]));

  const societies = await supabase
    .from("organizations")
    .select("id,name,city,logo_url,invite_code")
    .in("id", ids)
    .order("name", { ascending: true });

  if (societies.error) {
    if (isMissingSocietySchema(societies.error)) return null;
    throw societies.error;
  }

  return (societies.data ?? []).map((society) => ({
    id: society.id as string,
    name: (society.name as string) ?? "",
    city: (society.city as string) ?? "",
    logoUrl: (society.logo_url as string) ?? null,
    role: roleById.get(society.id) ?? "read_only",
    // Only an admin has any use for the code, and it is a join credential.
    inviteCode: roleById.get(society.id) === "admin" ? ((society.invite_code as string) ?? null) : null,
  }));
}

async function requireSocietyAdmin(supabase: SupabaseClient, societyId: string, userId: string) {
  const { data, error } = await supabase
    .from("organization_members")
    .select("role")
    .eq("organization_id", societyId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    if (isMissingSocietySchema(error)) notMigrated();
    throw error;
  }

  if (data?.role !== "admin") {
    throw fail("Only a society admin can do that", 403);
  }
}

async function listSocieties(req: ApiRequest, res: ApiResponse) {
  const supabase = assertServiceSupabase();
  const viewer = await optionalAppUser(req);

  if (!viewer) {
    sendJson(res, 200, { societies: [], societiesReady: true });
    return;
  }

  const societies = await fetchMySocieties(supabase, viewer.id);
  if (societies === null) {
    sendJson(res, 200, { societies: [], societiesReady: false });
    return;
  }

  sendJson(res, 200, { societies, societiesReady: true });
}

async function createSociety(req: ApiRequest, res: ApiResponse) {
  const supabase = assertServiceSupabase();
  const { appUser } = await requireAppUser(req);
  const body = await getRequestBody(req);

  const name = cleanText(body.name, MAX_NAME);
  if (!name) throw fail("A society needs a name", 400);

  const { data, error } = await supabase
    .from("organizations")
    .insert({
      name,
      city: cleanText(body.city, MAX_CITY) || null,
      invite_code: makeInviteCode(),
      created_by_user: appUser.id,
    })
    .select("id,name,city,invite_code")
    .single();

  if (error) {
    if (isMissingSocietySchema(error)) notMigrated();
    throw error;
  }

  const membership = await supabase.from("organization_members").insert({
    organization_id: data.id,
    user_id: appUser.id,
    role: "admin",
  });

  if (membership.error) {
    // Leaving a society nobody belongs to would strand it, and its admin
    // could never be added - nothing in this app can mint one after the fact.
    await supabase.from("organizations").delete().eq("id", data.id);
    if (isMissingSocietySchema(membership.error)) notMigrated();
    throw membership.error;
  }

  sendJson(res, 201, {
    society: {
      id: data.id,
      name: data.name,
      city: data.city ?? "",
      role: "admin" as SocietyRole,
      inviteCode: data.invite_code,
      logoUrl: null,
    },
  });
}

async function updateSociety(req: ApiRequest, res: ApiResponse) {
  const supabase = assertServiceSupabase();
  const { appUser } = await requireAppUser(req);
  const body = await getRequestBody(req);

  const societyId = String(body.societyId ?? "");
  if (!societyId) throw fail("societyId is required", 400);

  await requireSocietyAdmin(supabase, societyId, appUser.id);

  const patch: Record<string, unknown> = {};
  if (body.name !== undefined) {
    const name = cleanText(body.name, MAX_NAME);
    if (!name) throw fail("A society needs a name", 400);
    patch.name = name;
  }
  if (body.city !== undefined) patch.city = cleanText(body.city, MAX_CITY) || null;
  // Rotating the code is how an admin shuts out a code that got passed around.
  if (body.rotateInviteCode === true) patch.invite_code = makeInviteCode();

  if (!Object.keys(patch).length) throw fail("Nothing to change", 400);

  const { data, error } = await supabase
    .from("organizations")
    .update(patch)
    .eq("id", societyId)
    .select("id,name,city,logo_url,invite_code")
    .single();

  if (error) {
    if (isMissingSocietySchema(error)) notMigrated();
    throw error;
  }

  sendJson(res, 200, {
    society: {
      id: data.id,
      name: data.name,
      city: data.city ?? "",
      logoUrl: data.logo_url ?? null,
      role: "admin" as SocietyRole,
      inviteCode: data.invite_code,
    },
  });
}

/**
 * Join a society with the code its admin handed out.
 *
 * This adds a society membership and nothing else. The joiner's events are
 * then whatever that society runs, opened according to each event's page
 * visibility - it does not make them a committee member of anything.
 */
async function joinSociety(req: ApiRequest, res: ApiResponse) {
  const supabase = assertServiceSupabase();
  const { appUser } = await requireAppUser(req);
  const body = await getRequestBody(req);

  const code = String(body.inviteCode ?? "").replace(/[\s-]/g, "").toUpperCase();
  if (!code) throw fail("An invite code is required", 400);

  const { data: society, error } = await supabase
    .from("organizations")
    .select("id,name,city")
    .eq("invite_code", code)
    .maybeSingle();

  if (error) {
    if (isMissingSocietySchema(error)) notMigrated();
    throw error;
  }

  if (!society) throw fail("That invite code does not match any society", 404);

  const { error: joinError } = await supabase
    .from("organization_members")
    .upsert(
      { organization_id: society.id, user_id: appUser.id, role: "read_only" },
      { onConflict: "organization_id,user_id", ignoreDuplicates: true },
    );

  if (joinError) {
    if (isMissingSocietySchema(joinError)) notMigrated();
    throw joinError;
  }

  sendJson(res, 200, {
    society: { id: society.id, name: society.name, city: society.city ?? "", role: "read_only" as SocietyRole },
  });
}

export async function handleSocieties(req: ApiRequest, res: ApiResponse) {
  const resource = String(req.query?.resource ?? "");

  if (resource === "join") {
    if (String(req.method) !== "POST") {
      sendJson(res, 405, { error: "Method not allowed" });
      return;
    }
    await joinSociety(req, res);
    return;
  }

  if (String(req.method) === "GET") {
    await listSocieties(req, res);
    return;
  }
  if (String(req.method) === "POST") {
    await createSociety(req, res);
    return;
  }
  if (String(req.method) === "PATCH") {
    await updateSociety(req, res);
    return;
  }

  sendJson(res, 405, { error: "Method not allowed" });
}
