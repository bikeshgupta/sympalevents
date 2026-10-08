import { z } from "zod";
import {
  bookingSchema,
  defaultRegistrationConfig,
  registrationConfigSchema,
} from "../../shared/registration.js";
import { resolvePageAccess } from "./page-visibility.js";
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
    const page = Math.max(0, Math.min(10000, Number(req.query?.page) || 0));
    if (canManage) {
      const term = String(req.query?.search ?? "")
        .replace(/[^a-zA-Z0-9 -]/g, "")
        .slice(0, 60);
      let query = db
        .from("event_registrations")
        .select("*")
        .eq("event_id", eventId)
        .order("created_at", { ascending: false })
        .order("id");
      if (term)
        query = query.or(
          `contact_name.ilike.%${term}%,flat.ilike.%${term}%,id.eq.${uuid.safeParse(term).success ? term : "00000000-0000-0000-0000-000000000000"}`,
        );
      const list = await query.range(page * 50, page * 50 + 50);
      dbError(list.error);
      hasMore = (list.data?.length ?? 0) > 50;
      registrations = list.data?.slice(0, 50) ?? [];
    }
    // Private booking rows only go to their owner or an authorised organiser.
    sendJson(res, 200, {
      config,
      mine: mineResult.data?.[0] ?? null,
      canManage,
      registrations,
      hasMore,
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
  const result = await assertServiceSupabase().rpc("set_event_publication", {
    p_event: eventId,
    p_action: body.action,
  });
  dbError(result.error);
  sendJson(res, 200, { saved: true });
}
