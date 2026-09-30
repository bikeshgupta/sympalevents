import { resolvePageAccess } from "./page-visibility.js";
import { assertServiceSupabase, requireAppUser, sendJson } from "./server.js";

/**
 * Saving a dashboard arrangement, on `PUT /api/events?resource=layout`.
 *
 * There is no GET here on purpose: the layout already travels with the event
 * in `?resource=data`, which every screen loads anyway. A second round trip to
 * fetch an array of ten short objects would be a request for nothing.
 *
 * Editing needs edit access to the dashboard - admin, or an explicit grant.
 * Reading needs nothing beyond what reading the dashboard already needs.
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

/** Mirrors the catalogue in src/lib/widgets.ts. The server does not need to
 *  know what a widget draws, only that the key is one the app has - otherwise
 *  a layout is a free-text column somebody could put anything in. */
const widgetKeys = new Set([
  "hero",
  "closing-summary",
  "closing-reviews",
  "auctions",
  "announcements",
  "financial-summary",
  "funding-progress",
  "schedule",
  "my-responsibilities",
  "gallery",
]);

const variants = new Set(["basic", "detailed"]);

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

export async function handleDashboardLayout(req: ApiRequest, res: ApiResponse) {
  if (!["PUT", "POST"].includes(String(req.method))) {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  const supabase = assertServiceSupabase();
  const { appUser } = await requireAppUser(req);
  const body = await readBody(req);

  const eventId = String(body.eventId ?? "");
  if (!eventId) throw fail("eventId is required", 400);

  const access = await resolvePageAccess(eventId, appUser.id, "dashboard");
  if (!access.canEdit) throw fail("You do not have edit access to this dashboard", 403);

  // `null` is a real value and means "back to the default", which is why the
  // reset button sends it rather than a snapshot of today's defaults.
  let layout: unknown = null;

  if (body.layout !== null && body.layout !== undefined) {
    if (!Array.isArray(body.layout)) throw fail("layout has to be a list of widgets", 400);

    const seen = new Set<string>();
    layout = body.layout
      .filter((raw): raw is Record<string, unknown> => Boolean(raw) && typeof raw === "object")
      .map((raw) => ({
        key: String(raw.key ?? ""),
        variant: String(raw.variant ?? "basic"),
        isVisible: raw.isVisible !== false,
      }))
      .filter((entry) => {
        if (!widgetKeys.has(entry.key) || seen.has(entry.key)) return false;
        seen.add(entry.key);
        return true;
      })
      .map((entry) => ({
        ...entry,
        variant: variants.has(entry.variant) ? entry.variant : "basic",
      }));

    if (!(layout as unknown[]).length) throw fail("A dashboard needs at least one widget", 400);
  }

  const { error } = await supabase
    .from("events")
    .update({ dashboard_layout: layout })
    .eq("id", eventId);

  if (error) {
    const missingColumn =
      ["42703", "PGRST204"].includes(error.code ?? "") || error.message?.includes("dashboard_layout");
    if (missingColumn) {
      throw fail(
        "Arranging the dashboard needs supabase/migrations/026_dashboard_layout.sql. Run it, then try again.",
        501,
      );
    }
    throw error;
  }

  sendJson(res, 200, { layout });
}
