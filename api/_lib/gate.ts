import { z } from "zod";
import { audit } from "./audit.js";
import { resolvePageAccess } from "./page-visibility.js";
import { assertServiceSupabase, getRequestBody, requireAppUser, sendJson } from "./server.js";

/**
 * Event-day entry: find a booking, admit people, serve their meals.
 *
 * `GET | POST /api/events?resource=gate` - folded into api/events.ts like every
 * resource since the Vercel function cap.
 *
 * ## Who
 *
 * `gate` is a module like any other, so an admin gives a volunteer **edit access
 * to the Gate page** in Member Access and nothing else. That is the scoped
 * permission the blueprint asks for, and it is the whole of what such a person
 * can do: they cannot open a ledger, the registration list, settings, or any
 * page they were not given. A registration manager (edit access to
 * Registration) can use the gate too.
 *
 * Within the gate there are two levels. **Operating** - search, check in, serve
 * food, add a walk-in - is the volunteer's. **Overriding** - admitting somebody
 * whose payment is not confirmed, or recording cash - is only for a registration
 * manager, because it is a decision about money. A volunteer who meets an
 * unpaid booking is told to fetch an organiser, not given a way round it.
 *
 * ## What it sends
 *
 * Just what is needed to admit somebody. No payment reference, no pass token,
 * no audit fields. A search that matches a QR token returns that one booking.
 *
 * ## Repeats
 *
 * Check-in and meals are idempotent in the database (037): a second scan of the
 * same pass returns the booking as it stands rather than failing on a stale
 * version. The caller is told what it now is and works out whether anything
 * changed. Nothing is ever confirmed to the person at the gate until the server
 * has answered - there is no optimistic "checked in".
 */

type ApiRequest = {
  method?: string;
  query?: Record<string, unknown>;
  headers: { authorization?: string };
  body?: unknown;
};
type ApiResponse = Parameters<typeof sendJson>[0];

const uuid = z.string().uuid();

function fail(message: string, statusCode = 400): never {
  throw Object.assign(new Error(message), { statusCode });
}

function dbError(error: { code?: string; message: string } | null) {
  if (!error) return;
  if (["42P01", "PGRST205", "PGRST202", "42883", "42703", "PGRST204"].includes(error.code ?? "")) {
    fail("Gate mode needs supabase/migrations/037_passes_and_gate.sql. Run it, then try again.", 501);
  }
  if (error.code === "P0001") fail(error.message, 409);
  throw error;
}

/** What the gate sees of a booking. Deliberately short. */
type GateRow = Record<string, unknown>;
function present(row: GateRow) {
  return {
    id: String(row.id),
    version: Number(row.version ?? 1),
    name: String(row.contact_name ?? ""),
    flat: String(row.flat ?? ""),
    bookingCode: String(row.booking_code ?? String(row.id).slice(0, 8).toUpperCase()),
    adults: Number(row.adults ?? 0),
    children: Number(row.children ?? 0),
    food: Number(row.food_count ?? 0),
    checkedIn: Number(row.checked_in_count ?? 0),
    foodServed: Number(row.food_served_count ?? 0),
    amountDue: Number(row.amount_due ?? 0),
    payment: String(row.payment_status ?? "unpaid"),
    status: String(row.status ?? "active"),
    walkIn: row.is_walk_in === true,
  };
}

const columns =
  "id,version,contact_name,flat,booking_code,adults,children,food_count,checked_in_count,food_served_count,amount_due,payment_status,status,is_walk_in";

/** A scanned pass: the opaque token, with or without the prefix the QR carries. */
export function tokenFromQuery(value: string) {
  const match = value.trim().match(/^(?:SYMPAL1:)?([0-9a-fA-F]{32})$/);
  return match ? match[1].toLowerCase() : null;
}

function cleanTerm(value: unknown) {
  return String(value ?? "")
    .replace(/[^a-zA-Z0-9 -]/g, "")
    .slice(0, 60);
}

export async function handleGate(req: ApiRequest, res: ApiResponse) {
  const eventId = String(req.query?.eventId ?? "");
  if (!uuid.safeParse(eventId).success) fail("A valid event is required");

  const { appUser } = await requireAppUser(req);
  const db = assertServiceSupabase();

  const [gate, registration] = await Promise.all([
    resolvePageAccess(eventId, appUser.id, "gate"),
    resolvePageAccess(eventId, appUser.id, "registration"),
  ]);
  const canOverride = registration.canEdit;
  // A registration manager can use the gate even where Gate itself has not been
  // switched on as a module - but a volunteer needs the module and the grant.
  const canOperate = gate.canEdit || registration.canEdit;
  if (!canOperate) fail("You do not have access to the gate for this event", 403);

  if (req.method === "GET") {
    const term = String(req.query?.q ?? "").trim();

    const [summary, walkIns, unpaid, submitted] = await Promise.all([
      db.rpc("event_registration_summary", { p_event: eventId }),
      db.from("event_registrations").select("id", { count: "exact", head: true }).eq("event_id", eventId).eq("is_walk_in", true).eq("status", "active"),
      db.from("event_registrations").select("id", { count: "exact", head: true }).eq("event_id", eventId).eq("status", "active").eq("payment_status", "unpaid"),
      db.from("event_registrations").select("id", { count: "exact", head: true }).eq("event_id", eventId).eq("status", "active").eq("payment_status", "submitted"),
    ]);
    dbError(summary.error);
    dbError(walkIns.error);
    const totals = (summary.data ?? {}) as Record<string, number>;

    let results: ReturnType<typeof present>[] = [];
    if (term.length >= 2) {
      const token = tokenFromQuery(term);
      let query = db.from("event_registrations").select(columns).eq("event_id", eventId);
      if (token) {
        query = query.eq("pass_token", token);
      } else {
        const safe = cleanTerm(term);
        if (!safe) fail("Search by name, flat or booking code");
        const clauses = [`contact_name.ilike.%${safe}%`, `flat.ilike.%${safe}%`];
        if (/^[a-zA-Z0-9]{8}$/.test(safe)) clauses.push(`booking_code.eq.${safe.toUpperCase()}`);
        query = query.or(clauses.join(","));
      }
      const found = await query.order("status", { ascending: true }).order("contact_name").limit(15);
      dbError(found.error);
      results = ((found.data ?? []) as unknown as GateRow[]).map(present);
    }

    sendJson(res, 200, {
      stats: {
        checkedIn: Number(totals.checkedIn ?? 0),
        attendees: Number(totals.attendees ?? 0),
        foodServed: Number(totals.foodServed ?? 0),
        food: Number(totals.food ?? 0),
        walkIns: walkIns.count ?? 0,
        pendingPayment: (unpaid.count ?? 0) + (submitted.count ?? 0),
      },
      results,
      canOverride,
    });
    return;
  }

  if (req.method !== "POST") fail("Method not allowed", 405);
  const body = await getRequestBody(req);
  const action = String(body.action ?? "");

  if (action === "walk_in") {
    const parsed = z
      .object({
        name: z.string().trim().min(2).max(100),
        flat: z.string().trim().min(1).max(40),
        adults: z.number().int().min(0).max(20),
        children: z.number().int().min(0).max(20),
        food: z.number().int().min(0).max(40).optional(),
        idempotency_key: uuid,
      })
      .safeParse(body);
    if (!parsed.success) fail(parsed.error.issues[0].message);
    const input = parsed.data;
    const made = await db.rpc("gate_walk_in", {
      p_event: eventId,
      p_actor: appUser.id,
      p_input: {
        contact_name: input.name,
        flat: input.flat,
        adults: input.adults,
        children: input.children,
        food_count: input.food ?? 0,
        idempotency_key: input.idempotency_key,
      },
    });
    dbError(made.error);
    audit(req as never, {
      action: "create",
      entityType: "registration",
      entityId: (made.data as GateRow).id as string,
      eventId,
      actor: { id: appUser.id },
      summary: `Added a walk-in at the gate: ${input.name}, ${input.flat}`,
    });
    sendJson(res, 201, { registration: present(made.data as GateRow) });
    return;
  }

  const parsed = z
    .object({
      id: uuid,
      version: z.number().int().positive(),
      count: z.number().int().min(1).max(40).optional(),
      override: z.boolean().optional(),
    })
    .safeParse(body);
  if (!parsed.success) fail(parsed.error.issues[0].message);
  const { id, version, count } = parsed.data;
  // Whatever the request says, an override is only ever honoured for somebody
  // who is allowed to make that call.
  const override = parsed.data.override === true && canOverride;

  if (action === "check_in" || action === "serve_food") {
    if (!count) fail("How many?");
    const done = await db.rpc(action === "check_in" ? "gate_check_in" : "gate_serve_food", {
      p_event: eventId,
      p_id: id,
      p_actor: appUser.id,
      p_count: count,
      p_override: override,
      p_version: version,
    });
    dbError(done.error);
    const row = done.data as GateRow;
    if (override && !["verified", "free"].includes(String(row.payment_status))) {
      audit(req as never, {
        action: "override",
        entityType: "registration",
        entityId: id,
        eventId,
        actor: { id: appUser.id },
        summary: `Admitted ${String(row.contact_name)} at the gate without confirmed payment`,
      });
    }
    sendJson(res, 200, { registration: present(row) });
    return;
  }

  if (action === "cash") {
    if (!canOverride) fail("Only a registration manager can record cash received", 403);
    const done = await db.rpc("gate_cash_received", { p_event: eventId, p_id: id, p_actor: appUser.id, p_version: version });
    dbError(done.error);
    audit(req as never, {
      action: "verify",
      entityType: "registration",
      entityId: id,
      eventId,
      actor: { id: appUser.id },
      summary: `Recorded cash received at the gate for ${String((done.data as GateRow).contact_name)}`,
    });
    sendJson(res, 200, { registration: present(done.data as GateRow) });
    return;
  }

  fail("Unknown action");
}
