import { audit, newRequestId } from "./audit.js";
import { resolvePageAccess } from "./page-visibility.js";
import { assertServiceSupabase, getRequestBody, requireAppUser, sendJson } from "./server.js";

/**
 * Contributions, sponsorships and budget lines.
 *
 *   POST   /api/events?resource=contributions|sponsors|budgets
 *   PATCH  ...&id=<row>
 *   DELETE ...&id=<row>
 *
 * ## Why these moved
 *
 * These three pages were the last in the app writing to Supabase **directly
 * from the browser** with the anon key. That had two consequences:
 *
 *  - **Nothing could be logged.** A server-side audit helper cannot see a
 *    write it never receives, so the money pages - the ones where a record of
 *    who changed what matters most - were the only ones with no trail.
 *  - **They depended on anon write grants**, the last writes doing so. Routing
 *    them through the service-role client here means permission is decided by
 *    `resolvePageAccess` like every other screen, rather than by an RLS grant
 *    that has to stay exactly right.
 *
 * The forms, validation and query invalidation on those pages are unchanged;
 * only the transport is.
 *
 * ## A contribution is two rows
 *
 * `residents` carries who somebody is (flat, name, owner or tenant) and
 * `contributions` carries what they gave. The page presents them as one thing,
 * so creating a contribution writes both, and they are audited under one
 * `requestId` so they read back as the single action the user actually took.
 */

type ApiRequest = {
  method?: string;
  body?: unknown;
  query?: Record<string, unknown>;
  headers: Record<string, unknown> & { authorization?: string };
};

type ApiResponse = {
  setHeader?: (name: string, value: string) => void;
  status: (statusCode: number) => { json: (body: unknown) => void };
};

/** Which page's edit rights govern which table. */
const pageKeyByResource: Record<string, string> = {
  contributions: "contributions",
  sponsors: "sponsors",
  budgets: "budget",
};

const tableByResource: Record<string, string> = {
  contributions: "contributions",
  sponsors: "sponsors",
  budgets: "budgets",
};

/** Columns each resource accepts. Anything else in the body is ignored rather
 *  than written - the client does not get to choose which columns exist. */
const fieldsByResource: Record<string, string[]> = {
  contributions: [
    "expected_amount",
    "received_amount",
    "received_date",
    "payment_mode",
    "status",
    "reference",
  ],
  sponsors: [
    "sponsor_name",
    "flat_no",
    "contact",
    "category",
    "item_slot",
    "committed_amount",
    "received_amount",
    "status",
  ],
  budgets: ["category", "item", "estimated_qty", "unit", "unit_cost", "actual_cost", "funding_type", "status"],
};

const residentFields = ["flat_no", "resident_name", "resident_type"];

function fail(message: string, statusCode: number) {
  const error = new Error(message);
  Object.assign(error, { statusCode });
  return error;
}

function queryValue(req: ApiRequest, key: string) {
  const raw = req.query?.[key];
  return String(Array.isArray(raw) ? raw[0] ?? "" : raw ?? "");
}

function pick(body: Record<string, unknown>, allowed: string[]) {
  const out: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in body) out[key] = body[key];
  }
  return out;
}

async function assertCanEdit(eventId: string, userId: string, resource: string) {
  const access = await resolvePageAccess(eventId, userId, pageKeyByResource[resource]);
  if (!access.canEdit) {
    throw fail("You do not have edit access to this page", 403);
  }
}

export async function handleLedger(req: ApiRequest, res: ApiResponse, resource: string) {
  const table = tableByResource[resource];
  if (!table) throw fail("Unknown resource", 400);

  const supabase = assertServiceSupabase();
  const { appUser } = await requireAppUser(req);
  const method = String(req.method ?? "");
  const requestId = newRequestId();

  // ---- create -------------------------------------------------------------
  if (method === "POST") {
    const body = (await getRequestBody(req)) as Record<string, unknown>;
    const eventId = String(body.eventId ?? "");
    if (!eventId) throw fail("eventId is required", 400);
    await assertCanEdit(eventId, appUser.id, resource);

    const fields = pick(body, fieldsByResource[resource]);
    let residentId: string | null = null;

    // A contribution needs the person it came from.
    if (resource === "contributions") {
      const resident = pick(body, residentFields);
      const { data, error } = await supabase
        .from("residents")
        .insert({ event_id: eventId, ...resident, interested: true })
        .select("id")
        .single();
      if (error) throw error;
      residentId = data.id as string;

      audit(req, {
        action: "create",
        entityType: "resident",
        entityId: residentId,
        eventId,
        actor: { id: appUser.id },
        requestId,
        after: { event_id: eventId, ...resident },
        summary: `Added ${String(resident.resident_name ?? "a resident")} (${String(resident.flat_no ?? "")})`,
      });
    }

    const row: Record<string, unknown> = { event_id: eventId, ...fields };
    if (residentId) row.resident_id = residentId;

    const { data, error } = await supabase.from(table).insert(row).select("id").single();
    if (error) throw error;

    audit(req, {
      action: "create",
      entityType: resource,
      entityId: String(data.id),
      eventId,
      actor: { id: appUser.id },
      requestId,
      after: row,
      summary: describe("Recorded", resource, row),
    });

    sendJson(res, 201, { id: data.id });
    return;
  }

  const id = queryValue(req, "id");
  if (!id) throw fail("id is required", 400);

  // Read it first: for the permission check, and so the audit row can say what
  // moved rather than only what it became.
  const { data: before, error: beforeError } = await supabase
    .from(table)
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (beforeError) throw beforeError;
  if (!before) throw fail("That row no longer exists", 404);

  const eventId = String(before.event_id ?? "");
  await assertCanEdit(eventId, appUser.id, resource);

  // ---- update -------------------------------------------------------------
  if (method === "PATCH") {
    const body = (await getRequestBody(req)) as Record<string, unknown>;
    const fields = pick(body, fieldsByResource[resource]);

    if (resource === "contributions" && before.resident_id) {
      const resident = pick(body, residentFields);
      if (Object.keys(resident).length) {
        const { data: residentBefore } = await supabase
          .from("residents")
          .select("*")
          .eq("id", before.resident_id)
          .maybeSingle();

        const { error } = await supabase.from("residents").update(resident).eq("id", before.resident_id);
        if (error) throw error;

        audit(req, {
          action: "update",
          entityType: "resident",
          entityId: String(before.resident_id),
          eventId,
          actor: { id: appUser.id },
          requestId,
          before: residentBefore as Record<string, unknown>,
          after: { ...(residentBefore as Record<string, unknown>), ...resident },
          summary: "Corrected a resident's details",
        });
      }
    }

    const { error } = await supabase.from(table).update(fields).eq("id", id);
    if (error) throw error;

    audit(req, {
      action: "update",
      entityType: resource,
      entityId: id,
      eventId,
      actor: { id: appUser.id },
      requestId,
      before: before as Record<string, unknown>,
      after: { ...(before as Record<string, unknown>), ...fields },
      summary: describe("Edited", resource, { ...(before as Record<string, unknown>), ...fields }),
    });

    sendJson(res, 200, { ok: true });
    return;
  }

  // ---- delete -------------------------------------------------------------
  if (method === "DELETE") {
    const { error } = await supabase.from(table).delete().eq("id", id);
    if (error) throw error;

    audit(req, {
      action: "delete",
      entityType: resource,
      entityId: id,
      eventId,
      actor: { id: appUser.id },
      requestId,
      before: before as Record<string, unknown>,
      summary: describe("Deleted", resource, before as Record<string, unknown>),
    });

    sendJson(res, 200, { ok: true });
    return;
  }

  sendJson(res, 405, { error: "Method not allowed" });
}

/** A readable line for the log, so the table can be scanned without decoding
 *  jsonb. Money is included because it is the thing somebody checking the log
 *  is almost always looking for. */
function describe(verb: string, resource: string, row: Record<string, unknown>) {
  if (resource === "sponsors") {
    return `${verb} sponsorship from ${String(row.sponsor_name ?? "a sponsor")} (${String(row.committed_amount ?? 0)})`;
  }
  if (resource === "budgets") {
    return `${verb} budget line "${String(row.item ?? row.category ?? "")}" (${String(row.unit_cost ?? 0)})`;
  }
  return `${verb} a contribution of ${String(row.received_amount ?? 0)}`;
}
