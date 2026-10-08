import { publicationAccess } from "./publication.js";
import { resolvePageAccess } from "./page-visibility.js";
import { selectDegrading } from "./schema-compat.js";
import { assertServiceSupabase } from "./server.js";
import { describeEventForPreview, injectMeta } from "./og-meta.js";

/**
 * Link previews for one event: `GET /api/events?resource=og`.
 *
 * A crawler (WhatsApp, Telegram, Slack, iMessage) reads the raw HTML and never
 * runs the app, so the static tags in index.html describe the app, not the
 * event somebody pasted into the residents' group. vercel.json sends **only
 * crawler user agents** for the three address shapes here, so a person opening
 * a page never pays for this function.
 *
 * What it will say is what an anonymous visitor could already see: it speaks
 * for an event only when the event is not a draft **and** its dashboard is open
 * to anyone with the link. Otherwise the response is index.html untouched - the
 * same generic card as before - so a restricted event is never named to a
 * crawler. Name, dates, venue and the society are all on the public dashboard
 * already; nothing else is read.
 *
 * The picture is the event's own hero when it has one (the server only accepts
 * an https URL from this app's storage, see appearance.ts), otherwise the app
 * icon - never the bundled Ganesh photograph, which would put the wrong
 * festival on somebody's Garba night.
 */

type ApiRequest = { method?: string; query?: Record<string, unknown>; headers: Record<string, string | string[] | undefined> };
type ApiResponse = {
  setHeader?: (name: string, value: string) => void;
  status: (code: number) => { send?: (body: string) => void; end?: (body?: string) => void; json?: (body: unknown) => void };
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const slugPattern = /^[a-z0-9][a-z0-9-]{0,80}$/;
const tokenPattern = /^[A-Z0-9]{6,16}$/;

function one(req: ApiRequest, key: string) {
  const raw = req.query?.[key];
  return String(Array.isArray(raw) ? raw[0] ?? "" : raw ?? "");
}

function header(req: ApiRequest, name: string) {
  const raw = req.headers[name];
  return String(Array.isArray(raw) ? raw[0] ?? "" : raw ?? "");
}

/** The address this request was served on, only if it looks like a host. */
function originOf(req: ApiRequest) {
  const host = (header(req, "x-forwarded-host") || header(req, "host")).split(",")[0].trim().toLowerCase();
  if (!/^[a-z0-9.-]+(:\d{1,5})?$/.test(host)) return "https://sympalevents.vercel.app";
  const local = /^(localhost|127\.0\.0\.1)(:|$)/.test(host);
  return `${local ? "http" : "https"}://${host}`;
}

const coreColumns = ["id", "name", "start_date", "end_date", "location", "organization_id"];
const columns = [...coreColumns, "hero_image_url"];

async function findEvent(req: ApiRequest) {
  const db = assertServiceSupabase();
  const id = one(req, "id");
  const token = one(req, "token").replace(/[\s-]/g, "").toUpperCase();
  const societySlug = one(req, "society").toLowerCase();
  const eventSlug = one(req, "event").toLowerCase();

  let societyId: string | null = null;
  if (societySlug || eventSlug) {
    if (!slugPattern.test(societySlug) || !slugPattern.test(eventSlug)) return null;
    const society = await db.from("organizations").select("id").eq("slug", societySlug).maybeSingle();
    if (society.error || !society.data) return null;
    societyId = String(society.data.id);
  } else if (token) {
    if (!tokenPattern.test(token)) return null;
  } else if (!uuidPattern.test(id)) {
    return null;
  }

  const result = await selectDegrading("events", columns, coreColumns, (select) => {
    let query = db.from("events").select(select);
    if (societyId) query = query.eq("organization_id", societyId).eq("slug", eventSlug);
    else if (token) query = query.eq("share_token", token);
    else query = query.eq("id", id);
    return query.maybeSingle();
  });
  if (result.error || !result.data) return null;
  return result.data as unknown as Record<string, unknown>;
}

async function baseHtml(origin: string) {
  try {
    const response = await fetch(`${origin}/index.html`);
    if (response.ok) return await response.text();
  } catch {
    // fall through
  }
  return "<!doctype html><html><head><meta charset=\"UTF-8\" /></head><body></body></html>";
}

export async function handleOg(req: ApiRequest, res: ApiResponse) {
  const origin = originOf(req);
  const html = await baseHtml(origin);
  let out = html;

  try {
    const row = await findEvent(req);
    if (row) {
      const eventId = String(row.id);
      const [publication, dashboard] = await Promise.all([
        publicationAccess(eventId, null),
        resolvePageAccess(eventId, null, "dashboard"),
      ]);
      if (publication.canRead && dashboard.canView) {
        const society = row.organization_id
          ? await assertServiceSupabase().from("organizations").select("name").eq("id", row.organization_id).maybeSingle()
          : null;
        const name = String(row.name ?? "").trim() || "SymPal Events";
        const hero = String(row.hero_image_url ?? "");
        const url = `${origin}${one(req, "path").startsWith("/") ? one(req, "path").slice(0, 300) : ""}`;
        out = injectMeta(html, {
          title: name,
          description: describeEventForPreview({
            name,
            start: String(row.start_date ?? ""),
            end: String(row.end_date ?? ""),
            location: String(row.location ?? ""),
            society: String(society?.data?.name ?? ""),
          }),
          url,
          image: /^https:\/\//.test(hero) ? hero : `${origin}/icon-512.png`,
          imageAlt: /^https:\/\//.test(hero) ? `${name}` : "SymPal Events",
        });
      }
    }
  } catch {
    // A preview is never worth an error page: serve the generic card.
  }

  res.setHeader?.("Content-Type", "text/html; charset=utf-8");
  // Crawlers cache this themselves; the CDN absorbs a group of people pasting
  // the same link at once without a database read each.
  res.setHeader?.("Cache-Control", "public, s-maxage=300, stale-while-revalidate=3600");
  const sent = res.status(200);
  if (sent.send) sent.send(out);
  else sent.end?.(out);
}
