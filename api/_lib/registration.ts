import { z } from "zod";
import {
  bookingSchema,
  defaultRegistrationConfig,
  registrationConfigSchema,
} from "../../shared/registration.js";
import { audit } from "./audit.js";
import { toCsv } from "./csv.js";
import { resolvePageAccess } from "./page-visibility.js";
import { publishGaps, readEventReadiness } from "./readiness.js";
import { publicationAccess } from "./publication.js";
import {
  assertServiceSupabase,
  getRequestBody,
  optionalAppUser,
  requireAppUser,
  sendJson,
} from "./server.js";

type Request = {
  method?: string;
  query?: Record<string, unknown>;
  headers: { authorization?: string };
  body?: unknown;
};
type Response = Parameters<typeof sendJson>[0];
const uuid = z.string().uuid();
const actionSchema = z.object({
  id: uuid,
  version: z.number().int().positive(),
  action: z.enum([
    "edit",
    "submit_payment",
    "cancel",
    "verify",
    "reject",
    "refund",
    "check_in",
    "serve_food",
  ]),
  value: z.string().max(1500).optional(),
});
function fail(message: string, statusCode = 400): never {
  throw Object.assign(new Error(message), { statusCode });
}
function dbError(error: { code?: string; message: string } | null) {
  if (!error) return;
  if (
    ["42P01", "PGRST205", "PGRST202", "42703", "PGRST204"].includes(
      error.code ?? "",
    )
  )
    fail(
      "Registration setup is not available yet. Ask the event organiser to finish setup.",
      503,
    );
  if (error.code === "23505")
    fail("You already have an active registration. Open My registration.", 409);
  if (error.code === "P0001") fail(error.message, 409);
  throw error;
}
/**
 * The filter chips on the organiser's list, as conditions on the table.
 *
 * `all` means every booking that is still on - a cancelled one has its own chip
 * rather than cluttering the default view. Written as a function over the query
 * builder so the list, the counts and the export cannot disagree about what a
 * chip means.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyFilter(query: any, filter: string) {
  switch (filter) {
    case "unpaid":
      return query.eq("status", "active").eq("payment_status", "unpaid");
    case "submitted":
      return query.eq("status", "active").eq("payment_status", "submitted");
    case "confirmed":
      return query.eq("status", "active").in("payment_status", ["verified", "free"]);
    case "checked_in":
      return query.eq("status", "active").gt("checked_in_count", 0);
    case "cancelled":
      return query.eq("status", "cancelled");
    case "refunds":
      return query.eq("payment_status", "refund_pending");
    case "walk_in":
      return query.eq("is_walk_in", true);
    default:
      return query.eq("status", "active");
  }
}

const filters = ["all", "unpaid", "submitted", "confirmed", "checked_in", "cancelled", "refunds"] as const;

/** What a search box may contain. Anything else is dropped, so it can never
 *  change the shape of the `or(...)` filter it is spliced into. */
function cleanTerm(value: unknown) {
  return String(value ?? "")
    .replace(/[^a-zA-Z0-9 -]/g, "")
    .slice(0, 60);
}

const paymentWords: Record<string, string> = {
  unpaid: "Payment due",
  submitted: "Awaiting verification",
  verified: "Payment verified",
  free: "Free entry",
  refund_pending: "Refund pending",
  refunded: "Refund recorded",
};
const paymentLabelFor = (status: string) => paymentWords[status] ?? status;

const columnMissing = (error: { code?: string } | null) => ["42703", "PGRST204"].includes(error?.code ?? "");

export async function handleRegistration(req: Request, res: Response) {
  const parsedId = uuid.safeParse(String(req.query?.eventId ?? ""));
  if (!parsedId.success) fail("A valid event is required");
  const eventId = parsedId.data;
  const db = assertServiceSupabase();
  const viewer =
    req.method === "GET"
      ? await optionalAppUser(req)
      : (await requireAppUser(req)).appUser;
  const access = await resolvePageAccess(
    eventId,
    viewer?.id ?? null,
    "registration",
  );
  if (!access.canView)
    fail("You cannot access registration for this event", viewer ? 403 : 401);
  const canManage = access.canEdit;
  if (req.method === "GET") {
    const configResult = await db
      .from("event_registration_settings")
      .select("*")
      .eq("event_id", eventId)
      .maybeSingle();
    dbError(configResult.error);
    const config = configResult.data ?? defaultRegistrationConfig;
    const mineResult = viewer
      ? await db
          .from("event_registrations")
          .select("*")
          .eq("event_id", eventId)
          .eq("user_id", viewer.id)
          .order("created_at", { ascending: false })
          .limit(1)
      : { data: [], error: null };
    dbError(mineResult.error);
    const summary = await db.rpc("event_registration_summary", {
      p_event: eventId,
    });
    dbError(summary.error);
    let registrations = null;
    let hasMore = false;
    let counts: Record<string, number> | null = null;
    const page = Math.max(0, Math.min(10000, Number(req.query?.page) || 0));
    const filter = filters.includes(String(req.query?.filter) as (typeof filters)[number])
      ? String(req.query?.filter)
      : "all";

    // One search, used by the list and by the export so they cannot differ.
    const search = (term: string, withCode: boolean) => {
      let query = applyFilter(
        db.from("event_registrations").select("*").eq("event_id", eventId),
        filter,
      )
        .order("created_at", { ascending: false })
        .order("id");
      if (term) {
        const clauses = [
          `contact_name.ilike.%${term}%`,
          `flat.ilike.%${term}%`,
          `id.eq.${uuid.safeParse(term).success ? term : "00000000-0000-0000-0000-000000000000"}`,
        ];
        // The eight-character code a volunteer reads aloud. Only tried for
        // something shaped like one, and only once 037 has added the column.
        if (withCode && /^[a-zA-Z0-9]{8}$/.test(term)) clauses.push(`booking_code.eq.${term.toUpperCase()}`);
        query = query.or(clauses.join(","));
      }
      return query;
    };

    if (canManage) {
      const term = cleanTerm(req.query?.search);

      if (req.query?.export === "csv") {
        // Server-generated, event-scoped and organiser-only, so a spreadsheet
        // is never built from whatever the browser happened to have loaded.
        const rows: Record<string, unknown>[] = [];
        for (let from = 0; from < 10000; from += 1000) {
          let batch = await search(term, true).range(from, from + 999);
          if (batch.error && columnMissing(batch.error)) batch = await search(term, false).range(from, from + 999);
          dbError(batch.error);
          rows.push(...((batch.data ?? []) as Record<string, unknown>[]));
          if ((batch.data?.length ?? 0) < 1000) break;
        }
        const csv = toCsv(
          [
            "Booking code", "Name", "Flat", "Adults", "Children", "Guests", "Food portions", "Amount (INR)",
            "Payment", "Payment reference", "Checked in", "Meals served", "Booking", "Walk-in", "Booked at",
          ],
          rows.map((row) => [
            String(row.id ?? "").slice(0, 8).toUpperCase(),
            row.contact_name, row.flat, row.adults, row.children, row.guests, row.food_count,
            Number(row.amount_due ?? 0) / 100,
            paymentLabelFor(String(row.payment_status ?? "")), row.payment_reference,
            row.checked_in_count, row.food_served_count,
            row.status === "cancelled" ? "Cancelled" : "Active",
            row.is_walk_in === true, row.created_at,
          ]),
        );
        audit(req as never, {
          action: "export",
          entityType: "registrations",
          eventId,
          actor: { id: viewer!.id },
          summary: `Exported ${rows.length} registrations as CSV (${filter})`,
        });
        sendJson(res, 200, { filename: `registrations-${filter}.csv`, csv, count: rows.length });
        return;
      }

      let list = await search(term, true).range(page * 50, page * 50 + 50);
      if (list.error && columnMissing(list.error)) list = await search(term, false).range(page * 50, page * 50 + 50);
      dbError(list.error);
      hasMore = (list.data?.length ?? 0) > 50;
      // A pass token is the secret behind somebody's QR code. An organiser
      // searching a list has no use for it, and it must not sit in a response
      // body or a browser cache for the sake of one.
      registrations = (list.data?.slice(0, 50) ?? []).map((row: Record<string, unknown>) => {
        const { pass_token: _token, ...rest } = row;
        void _token;
        return rest;
      });

      // The number on each chip, taken the way the list is taken.
      const counted = await Promise.all(
        filters.map((name) =>
          applyFilter(
            db.from("event_registrations").select("id", { count: "exact", head: true }).eq("event_id", eventId),
            name,
          ),
        ),
      );
      counts = Object.fromEntries(filters.map((name, index) => [name, counted[index].count ?? 0]));
    }
    // Private booking rows only go to their owner or an authorised organiser.
    sendJson(res, 200, {
      config,
      mine: mineResult.data?.[0] ?? null,
      canManage,
      registrations,
      hasMore,
      counts,
      summary: canManage
        ? summary.data
        : { attendees: summary.data?.attendees ?? 0 },
      signedIn: Boolean(viewer),
    });
    return;
  }
  const body = await getRequestBody(req);
  if (req.method === "PUT") {
    if (!canManage) fail("Only registration managers can change setup", 403);
    const parsed = registrationConfigSchema.safeParse(body);
    if (!parsed.success) fail(parsed.error.issues[0].message);
    const saved = await db.rpc("save_registration_settings", {
      p_event: eventId,
      p_config: parsed.data,
    });
    dbError(saved.error);
    sendJson(res, 200, { saved: true });
    return;
  }
  if (req.method === "POST") {
    const parsed = bookingSchema.safeParse(body);
    if (!parsed.success) fail(parsed.error.issues[0].message);

    // An organiser adding a household for somebody: warn when that flat already
    // has a booking, but never block it. Two families can share a flat number
    // (a tenant and an owner, a wing's naming), so this asks once and goes on
    // when told to.
    if (canManage && parsed.data.on_behalf && body.confirm_duplicate !== true) {
      const flat = parsed.data.flat.trim().replace(/[%_\\]/g, (c) => `\\${c}`);
      const existing = await db
        .from("event_registrations")
        .select("contact_name,flat")
        .eq("event_id", eventId)
        .eq("status", "active")
        .ilike("flat", flat)
        .limit(3);
      if (!existing.error && existing.data?.length) {
        sendJson(res, 409, {
          error: `Flat ${parsed.data.flat.trim()} already has a booking (${existing.data.map((row) => row.contact_name).join(", ")}).`,
          code: "duplicate_flat",
          existing: existing.data,
        });
        return;
      }
    }
    const result = await db.rpc("book_event", {
      p_event: eventId,
      p_user: viewer!.id,
      p_manager: canManage,
      p_input: parsed.data,
    });
    dbError(result.error);
    sendJson(res, 201, { registration: result.data });
    return;
  }
  if (req.method === "PATCH" && body.action === "verify_many") {
    if (!canManage) fail("Organiser access required", 403);
    const items = z
      .array(z.object({ id: uuid, version: z.number().int().positive() }))
      .min(1)
      .max(100)
      .safeParse(body.items);
    if (!items.success) fail("Choose up to 100 bookings to verify");

    // One at a time and independent: each is its own version-checked write, so
    // one that changed since the list was loaded is reported rather than
    // sinking the rest, and nothing is verified that the organiser did not see.
    const results: { id: string; ok: boolean; error?: string }[] = [];
    for (const item of items.data) {
      const done = await db.rpc("update_event_registration", {
        p_event: eventId,
        p_id: item.id,
        p_actor: viewer!.id,
        p_manager: true,
        p_action: "verify",
        p_version: item.version,
        p_value: "",
      });
      results.push(done.error ? { id: item.id, ok: false, error: done.error.message } : { id: item.id, ok: true });
    }
    const verified = results.filter((item) => item.ok).length;
    audit(req as never, {
      action: "verify",
      entityType: "registrations",
      eventId,
      actor: { id: viewer!.id },
      summary: `Verified ${verified} of ${results.length} payments in one go`,
    });
    sendJson(res, 200, { results });
    return;
  }
  if (req.method === "PATCH") {
    const parsed = actionSchema.safeParse(body);
    if (!parsed.success) fail(parsed.error.issues[0].message);
    const value = parsed.data;
    if (value.action === "edit") {
      if (!canManage) fail("Organiser access required", 403);
      let input;
      try {
        input = JSON.parse(value.value ?? "{}");
      } catch {
        fail("Invalid booking details");
      }
      const checked = bookingSchema.safeParse({
        ...input,
        idempotency_key: value.id,
      });
      if (!checked.success) fail(checked.error.issues[0].message);
      value.value = JSON.stringify(checked.data);
    }
    if (
      ["verify", "reject", "refund", "check_in", "serve_food"].includes(
        value.action,
      ) &&
      !canManage
    )
      fail("Organiser access required", 403);
    const result = await db.rpc("update_event_registration", {
      p_event: eventId,
      p_id: value.id,
      p_actor: viewer!.id,
      p_manager: canManage,
      p_action: value.action,
      p_version: value.version,
      p_value: value.value ?? "",
    });
    dbError(result.error);
    sendJson(res, 200, { registration: result.data });
    return;
  }
  fail("Method not allowed", 405);
}

export async function handlePublication(req: Request, res: Response) {
  const eventId = String(req.query?.eventId ?? "");
  if (!uuid.safeParse(eventId).success) fail("A valid event is required");
  const { appUser } = await requireAppUser(req);
  const access = await publicationAccess(eventId, appUser.id);
  if (!access.canManage)
    fail("Only event or society admins can publish events", 403);
  if (req.method !== "PATCH") fail("Method not allowed", 405);
  const body = await getRequestBody(req);
  if (!["publish", "draft", "cancel"].includes(body.action))
    fail("Unknown action");
  const db = assertServiceSupabase();

  // Cancelling is the one thing here that reaches other people's money, so the
  // confirmation says what it will do: how many bookings, how many are paid, how
  // much. Asked first with `preview`, and nothing changes.
  if (body.action === "cancel" && body.preview === true) {
    const rows = await db
      .from("event_registrations")
      .select("payment_status,amount_due")
      .eq("event_id", eventId)
      .eq("status", "active");
    // No registration tables yet means nothing to refund.
    const list = rows.error ? [] : ((rows.data ?? []) as { payment_status: string; amount_due: number }[]);
    const paid = list.filter((row) => ["verified", "submitted"].includes(row.payment_status));
    sendJson(res, 200, {
      preview: {
        active: list.length,
        paid: paid.length,
        amount: paid.reduce((sum, row) => sum + Number(row.amount_due ?? 0), 0) / 100,
      },
    });
    return;
  }

  // Publishing is checked, not just clicked: see api/_lib/readiness.ts.
  if (body.action === "publish") {
    const gaps = publishGaps(await readEventReadiness(db, eventId));
    if (gaps.blocking.length) {
      sendJson(res, 422, {
        error: `Before this can be published: ${gaps.blocking.map((item) => `${item.label.toLowerCase()} (${item.detail ?? "missing"})`).join("; ")}.`,
        code: "readiness_blocking",
        blocking: gaps.blocking,
      });
      return;
    }
    if (gaps.warnings.length && body.confirm !== true) {
      sendJson(res, 409, {
        error: "This event is missing a few things. Publish anyway?",
        code: "readiness_warnings",
        warnings: gaps.warnings,
      });
      return;
    }
  }

  const result = await db.rpc("set_event_publication", {
    p_event: eventId,
    p_action: body.action,
  });
  dbError(result.error);
  audit(req as never, {
    action: body.action === "publish" ? "publish" : body.action === "cancel" ? "cancel" : "unpublish",
    entityType: "event",
    entityId: eventId,
    eventId,
    actor: { id: appUser.id },
    summary: body.action === "publish" ? "Published the event" : body.action === "cancel" ? "Cancelled the event" : "Returned the event to draft",
  });
  sendJson(res, 200, { saved: true });
}
