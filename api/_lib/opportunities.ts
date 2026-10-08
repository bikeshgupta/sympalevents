import { z } from "zod";
import { audit } from "./audit.js";
import { resolvePageAccess } from "./page-visibility.js";
import { assertServiceSupabase, getRequestBody, optionalAppUser, requireAppUser, sendJson } from "./server.js";
import { cleanContact, cleanNote, cleanPerformanceDetails, placesLeft, type OpportunityKind } from "../../shared/opportunities.js";

/**
 * "Get involved": things the event needs people for, and people saying yes.
 *
 * `GET | POST /api/events?resource=opportunities` - folded into api/events.ts.
 *
 * Two kinds. A **volunteer** role ("Parking help, 4 people") confirms at once
 * while a place is free. A **performance** call ("open mic for the cultural
 * evening") is a request: it lands as pending and an organiser decides, because
 * a running order is the committee's to set.
 *
 * ## Who sees what
 *
 * - Anybody who may open the page sees what is wanted and how many places are
 *   left. **Never who signed up** - a public list of residents is a directory.
 * - A signed-in person sees their own entry.
 * - Managers (admin, or an edit grant on the page) see every entry: name,
 *   contact, what they offered. The contact number is private to them and to
 *   the person who gave it.
 * - Signing up needs an account; everything else about the page does not.
 */

type ApiRequest = Parameters<typeof requireAppUser>[0] & { method?: string; query?: Record<string, unknown> };
type ApiResponse = Parameters<typeof sendJson>[0];

const uuid = z.string().uuid();

function fail(message: string, statusCode = 400): never {
  throw Object.assign(new Error(message), { statusCode });
}

const missing = ["42P01", "PGRST205", "PGRST202", "42883", "42703", "PGRST204"];
const MIGRATION = "supabase/migrations/040_opportunities.sql";

function dbError(error: { code?: string; message: string } | null) {
  if (!error) return;
  if (missing.includes(error.code ?? "")) fail(`Get involved needs ${MIGRATION}. Run it, then try again.`, 501);
  if (error.code === "P0001") fail(error.message, 409);
  throw error;
}

type Row = Record<string, unknown>;

export async function handleOpportunities(req: ApiRequest, res: ApiResponse) {
  const eventId = String(req.query?.eventId ?? "");
  if (!uuid.safeParse(eventId).success) fail("A valid event is required");
  const db = assertServiceSupabase();

  const viewer = req.method === "GET" ? await optionalAppUser(req) : (await requireAppUser(req)).appUser;
  const access = await resolvePageAccess(eventId, viewer?.id ?? null, "volunteers");
  if (!access.canView) fail("You cannot open this page for this event", viewer ? 403 : 401);
  const canManage = access.canEdit;

  if (req.method === "GET") {
    const listed = await db
      .from("event_opportunities")
      .select("id,kind,title,description,slots,closes_at,status,sort_order,created_at")
      .eq("event_id", eventId)
      .order("kind")
      .order("sort_order")
      .order("created_at");
    if (listed.error && missing.includes(listed.error.code ?? "")) {
      sendJson(res, 200, { ready: false, canManage, signedIn: Boolean(viewer), items: [] });
      return;
    }
    dbError(listed.error);

    const signups = await db
      .from("event_signups")
      .select("id,opportunity_id,user_id,details,note,contact,status,created_at")
      .eq("event_id", eventId)
      .order("created_at");
    dbError(signups.error);
    const entries = (signups.data ?? []) as Row[];

    // Names only for managers, and only when there is somebody to name.
    const names = new Map<string, string>();
    if (canManage && entries.length) {
      const users = await db.from("app_users").select("id,full_name,email").in("id", [...new Set(entries.map((e) => String(e.user_id)))]);
      for (const user of (users.data ?? []) as Row[]) {
        names.set(String(user.id), String(user.full_name ?? "").trim() || String(user.email ?? "").split("@")[0] || "Member");
      }
    }

    const items = ((listed.data ?? []) as Row[]).map((o) => {
      const kind = String(o.kind) as OpportunityKind;
      const mine = entries.filter((e) => e.opportunity_id === o.id);
      const confirmed = mine.filter((e) => e.status === "confirmed").length;
      const pending = mine.filter((e) => e.status === "pending").length;
      const slots = o.slots === null || o.slots === undefined ? null : Number(o.slots);
      const closesAt = o.closes_at ? String(o.closes_at) : null;
      const closed = o.status !== "open" || (closesAt !== null && Date.parse(closesAt) <= Date.now());
      const own = viewer ? mine.find((e) => e.user_id === viewer.id) : null;
      return {
        id: String(o.id),
        kind,
        title: String(o.title),
        description: String(o.description ?? ""),
        slots,
        closesAt,
        closed,
        ...placesLeft(kind, slots, confirmed, pending),
        mine: own
          ? { id: String(own.id), status: String(own.status), details: own.details ?? {}, note: String(own.note ?? ""), contact: String(own.contact ?? "") }
          : null,
        signups: canManage
          ? mine.map((e) => ({
              id: String(e.id),
              name: names.get(String(e.user_id)) ?? "Member",
              status: String(e.status),
              details: e.details ?? {},
              note: String(e.note ?? ""),
              contact: String(e.contact ?? ""),
              createdAt: String(e.created_at),
            }))
          : null,
      };
    });
    sendJson(res, 200, { ready: true, canManage, signedIn: Boolean(viewer), items });
    return;
  }

  if (req.method !== "POST") fail("Method not allowed", 405);
  const body = await getRequestBody(req);
  const action = String(body.action ?? "");
  const actor = { id: viewer!.id };

  // -- Anyone signed in ------------------------------------------------------

  if (action === "join") {
    const parsed = z.object({ opportunityId: uuid }).safeParse(body);
    if (!parsed.success) fail("Which one?");
    const target = await db.from("event_opportunities").select("id,kind,event_id").eq("id", parsed.data.opportunityId).maybeSingle();
    dbError(target.error);
    if (!target.data || target.data.event_id !== eventId) fail("That no longer exists", 404);
    const performance = target.data.kind === "performance";
    const details = performance ? cleanPerformanceDetails(body.details) : {};
    if (performance && !(details as { act: string }).act) fail("Tell us what you would like to perform");
    const contact = cleanContact(body.contact);
    if (performance && contact.replace(/\D/g, "").length < 7) fail("Add a phone number so the organisers can reach you");
    const joined = await db.rpc("join_opportunity", {
      p_opportunity: parsed.data.opportunityId,
      p_user: viewer!.id,
      p_details: details,
      p_note: cleanNote(body.note),
      p_contact: contact,
    });
    dbError(joined.error);
    sendJson(res, 200, { status: String((joined.data as Row).status) });
    return;
  }

  if (action === "withdraw") {
    const parsed = z.object({ opportunityId: uuid }).safeParse(body);
    if (!parsed.success) fail("Which one?");
    const removed = await db.from("event_signups").delete().eq("opportunity_id", parsed.data.opportunityId).eq("user_id", viewer!.id).eq("event_id", eventId);
    dbError(removed.error);
    sendJson(res, 200, { saved: true });
    return;
  }

  // -- Managers --------------------------------------------------------------

  if (!canManage) fail("Only the organisers can do that", 403);

  const shape = z.object({
    kind: z.enum(["volunteer", "performance"]),
    title: z.string().trim().min(2, "Give it a name").max(100),
    description: z.string().trim().max(1000).optional().default(""),
    slots: z.number().int().min(1).max(500).nullable().optional(),
    closesAt: z.string().datetime({ offset: true }).nullable().optional(),
  });

  if (action === "create") {
    const parsed = shape.safeParse(body);
    if (!parsed.success) fail(parsed.error.issues[0].message);
    const made = await db
      .from("event_opportunities")
      .insert({
        event_id: eventId,
        kind: parsed.data.kind,
        title: parsed.data.title,
        description: parsed.data.description,
        slots: parsed.data.slots ?? null,
        closes_at: parsed.data.closesAt ?? null,
        created_by: viewer!.id,
      })
      .select("id")
      .single();
    dbError(made.error);
    audit(req as never, { action: "create", entityType: "opportunity", entityId: String(made.data!.id), eventId, actor, summary: `Asked for ${parsed.data.kind === "volunteer" ? "volunteers" : "performers"}: ${parsed.data.title}` });
    sendJson(res, 201, { id: made.data!.id });
    return;
  }

  if (action === "update") {
    const parsed = shape.partial().extend({ id: uuid, status: z.enum(["open", "closed"]).optional() }).safeParse(body);
    if (!parsed.success) fail(parsed.error.issues[0].message);
    // `kind` is deliberately not editable: it would turn volunteers into pending performers.
    const { id } = parsed.data;
    const rest = parsed.data;
    const patch: Row = { updated_at: new Date().toISOString() };
    if (rest.title !== undefined) patch.title = rest.title;
    if (rest.description !== undefined) patch.description = rest.description;
    if (rest.slots !== undefined) patch.slots = rest.slots;
    if (rest.closesAt !== undefined) patch.closes_at = rest.closesAt;
    if (rest.status !== undefined) patch.status = rest.status;
    const saved = await db.from("event_opportunities").update(patch).eq("id", id).eq("event_id", eventId).select("id");
    dbError(saved.error);
    if (!saved.data?.length) fail("That no longer exists", 404);
    audit(req as never, { action: "update", entityType: "opportunity", entityId: id, eventId, actor, summary: rest.status ? `${rest.status === "closed" ? "Closed" : "Reopened"} sign-up` : "Edited a sign-up" });
    sendJson(res, 200, { saved: true });
    return;
  }

  if (action === "delete") {
    const parsed = z.object({ id: uuid }).safeParse(body);
    if (!parsed.success) fail("Which one?");
    const gone = await db.from("event_opportunities").delete().eq("id", parsed.data.id).eq("event_id", eventId);
    dbError(gone.error);
    audit(req as never, { action: "delete", entityType: "opportunity", entityId: parsed.data.id, eventId, actor, summary: "Removed a sign-up and its entries" });
    sendJson(res, 200, { saved: true });
    return;
  }

  if (action === "decide") {
    const parsed = z.object({ signupId: uuid, status: z.enum(["confirmed", "declined"]) }).safeParse(body);
    if (!parsed.success) fail("Choose confirm or decline");
    const saved = await db.from("event_signups").update({ status: parsed.data.status }).eq("id", parsed.data.signupId).eq("event_id", eventId).select("id");
    dbError(saved.error);
    if (!saved.data?.length) fail("That entry no longer exists", 404);
    audit(req as never, { action: "update", entityType: "signup", entityId: parsed.data.signupId, eventId, actor, summary: `${parsed.data.status === "confirmed" ? "Confirmed" : "Declined"} an entry` });
    sendJson(res, 200, { saved: true });
    return;
  }

  fail("Unknown action");
}
