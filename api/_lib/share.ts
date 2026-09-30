import { resolvePageAccess } from "./page-visibility.js";
import { assertServiceSupabase, requireAppUser, sendJson } from "./server.js";

/**
 * The permanent link to an event, on `/api/events?resource=share`.
 *
 *   GET  ?token=AB12CD34   public - resolves a token to an event
 *   POST { eventId }       committee - mints or rotates the token
 *
 * The GET is deliberately open. A share link has to work for somebody with
 * no account, which is the whole point of one; what they can then *see* is
 * still decided page by page by the admin's visibility settings. So this
 * returns an id and a name and nothing else - it is a redirect target, not a
 * way to read an event.
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

/** No O/0 and no I/1/L: these get read out over a phone and written on paper.
 *  Same alphabet as the society invite code, for the same reason. */
const TOKEN_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const TOKEN_LENGTH = 10;

function makeToken() {
  let token = "";
  for (let index = 0; index < TOKEN_LENGTH; index += 1) {
    token += TOKEN_ALPHABET[Math.floor(Math.random() * TOKEN_ALPHABET.length)];
  }
  return token;
}

function fail(message: string, statusCode: number) {
  const error = new Error(message);
  Object.assign(error, { statusCode });
  return error;
}

function isMissingShareColumn(error: { code?: string; message?: string } | null) {
  return Boolean(
    error && (["42703", "PGRST204"].includes(error.code ?? "") || error.message?.includes("share_token")),
  );
}

async function readBody(req: ApiRequest) {
  if (!req.body) return {} as Record<string, unknown>;
  if (typeof req.body === "string") return JSON.parse(req.body) as Record<string, unknown>;
  return req.body as Record<string, unknown>;
}

function queryValue(req: ApiRequest, key: string) {
  const raw = req.query?.[key];
  return String(Array.isArray(raw) ? raw[0] ?? "" : raw ?? "");
}

async function resolveToken(req: ApiRequest, res: ApiResponse) {
  const token = queryValue(req, "token").replace(/[\s-]/g, "").toUpperCase();
  if (!token) throw fail("A token is required", 400);

  const supabase = assertServiceSupabase();
  const { data, error } = await supabase
    .from("events")
    .select("id,name")
    .eq("share_token", token)
    .maybeSingle();

  if (error) {
    if (isMissingShareColumn(error)) {
      throw fail(
        "Share links need supabase/migrations/027_event_appearance.sql. Run it, then try again.",
        501,
      );
    }
    throw error;
  }

  if (!data) throw fail("That link does not match any event", 404);

  sendJson(res, 200, { eventId: data.id, eventName: data.name });
}

async function mintToken(req: ApiRequest, res: ApiResponse) {
  const supabase = assertServiceSupabase();
  const { appUser } = await requireAppUser(req);
  const body = await readBody(req);

  const eventId = String(body.eventId ?? "");
  if (!eventId) throw fail("eventId is required", 400);

  const access = await resolvePageAccess(eventId, appUser.id, "dashboard");
  if (!access.canEdit) throw fail("You do not have edit access to this event", 403);

  // Rotating is how an admin retires a link that went further than intended.
  // The old one stops resolving the moment this returns.
  const token = makeToken();
  const { data, error } = await supabase
    .from("events")
    .update({ share_token: token })
    .eq("id", eventId)
    .select("share_token")
    .single();

  if (error) {
    if (isMissingShareColumn(error)) {
      throw fail(
        "Share links need supabase/migrations/027_event_appearance.sql. Run it, then try again.",
        501,
      );
    }
    throw error;
  }

  sendJson(res, 200, { shareToken: data.share_token });
}

export async function handleShareLink(req: ApiRequest, res: ApiResponse) {
  if (String(req.method) === "GET") {
    await resolveToken(req, res);
    return;
  }
  if (["POST", "PATCH"].includes(String(req.method))) {
    await mintToken(req, res);
    return;
  }
  sendJson(res, 405, { error: "Method not allowed" });
}
