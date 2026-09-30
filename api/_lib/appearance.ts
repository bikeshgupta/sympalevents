import { resolvePageAccess } from "./page-visibility.js";
import { assertServiceSupabase, requireAppUser, sendJson } from "./server.js";

/**
 * What an event looks like, on `PATCH /api/events?resource=appearance`.
 *
 * Reading is not here - the theme and the hero photograph travel with the
 * event in `?resource=data`, which every screen loads. Only the write needs
 * a route, and it needs edit access to the dashboard, because that is the
 * screen the appearance is mostly about.
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

/** Mirrors src/lib/themes.ts. The server does not need to know what a preset
 *  looks like, only that it is one the app actually has - otherwise `theme`
 *  is a free-text column somebody can put a stylesheet in. */
const themeKeys = new Set(["teal", "marigold", "indigo", "rose", "forest"]);

function fail(message: string, statusCode: number) {
  const error = new Error(message);
  Object.assign(error, { statusCode });
  return error;
}

async function readBody(req: ApiRequest) {
  if (!req.body) return {} as Record<string, unknown>;
  if (typeof req.body === "string") return JSON.parse(req.body) as Record<string, unknown>;
  return req.body as Record<string, unknown>;
}

/**
 * The hero has to be an image this app stored. Accepting any URL would let an
 * admin point the dashboard at a third party, which quietly tells that third
 * party who opens a public event page and when.
 */
function cleanHeroUrl(value: unknown): string | null {
  const url = String(value ?? "").trim();
  if (!url) return null;
  if (!/^https:\/\/[^/]+\/storage\/v1\/object\/public\/uploads\/events\//.test(url)) {
    throw fail("A hero image has to be one uploaded through this app", 400);
  }
  return url.slice(0, 500);
}

export async function handleAppearance(req: ApiRequest, res: ApiResponse) {
  if (!["PATCH", "POST"].includes(String(req.method))) {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  const supabase = assertServiceSupabase();
  const { appUser } = await requireAppUser(req);
  const body = await readBody(req);

  const eventId = String(body.eventId ?? "");
  if (!eventId) throw fail("eventId is required", 400);

  const access = await resolvePageAccess(eventId, appUser.id, "dashboard");
  if (!access.canEdit) throw fail("You do not have edit access to this event", 403);

  const updates: Record<string, unknown> = {};

  if (body.theme !== undefined) {
    const theme = String(body.theme ?? "");
    // An empty theme is "back to the app's own colours", not an error.
    if (theme && !themeKeys.has(theme)) throw fail("That is not a theme this app has", 400);
    updates.theme = theme || null;
  }

  if (body.heroImageUrl !== undefined) {
    updates.hero_image_url = cleanHeroUrl(body.heroImageUrl);
  }

  if (!Object.keys(updates).length) throw fail("Nothing to change", 400);

  const { data, error } = await supabase
    .from("events")
    .update(updates)
    .eq("id", eventId)
    .select("theme,hero_image_url")
    .single();

  if (error) {
    const missingColumn =
      ["42703", "PGRST204"].includes(error.code ?? "") ||
      error.message?.includes("hero_image_url") ||
      error.message?.includes("theme");
    if (missingColumn) {
      throw fail(
        "Changing how an event looks needs supabase/migrations/027_event_appearance.sql. Run it, then try again.",
        501,
      );
    }
    throw error;
  }

  sendJson(res, 200, { theme: data.theme ?? null, heroImageUrl: data.hero_image_url ?? null });
}
