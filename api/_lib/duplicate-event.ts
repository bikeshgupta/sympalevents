import { z } from "zod";
import { audit } from "./audit.js";
import { fetchEventModules } from "./page-visibility.js";
import { publicationAccess } from "./publication.js";
import { missingColumnName } from "./schema-compat.js";
import { assertServiceSupabase, getRequestBody, requireAppUser, sendJson } from "./server.js";

/**
 * Run an event again: `POST /api/events?resource=duplicate`.
 *
 * A society runs its Navratri, its sports day, its annual function every year,
 * and re-making the same event from a blank template each time is where the
 * setup effort goes. This copies the *shape* of an event into a new draft and
 * leaves everything that happened in the old one behind.
 *
 * ## What is copied
 *
 * What the event is made of: its type, template, hours, venue, which modules it
 * has and their names and visibility, its colour, hero photograph and
 * dashboard arrangement, its registration setup (prices, capacity, payment
 * instructions - **switched off**, so it has to be opened on purpose), and its
 * programme, moved by the same number of days as the event itself.
 *
 * ## What is not, and never is
 *
 * Registrations, bookings and payments; contributions, sponsors, budgets and
 * expenses; tasks and who they were assigned to; announcements, polls and
 * questions; the closing note, gallery and reviews; auctions and their bids;
 * members and their access. A copied event starts with no money in it and no
 * people on it, and the person who made it is its only admin.
 *
 * The new event is a draft, like any other, until it is published (and
 * publishing is checked - see readiness.ts).
 */

type ApiRequest = {
  method?: string;
  query?: Record<string, unknown>;
  headers: { authorization?: string };
  body?: unknown;
};
type ApiResponse = Parameters<typeof sendJson>[0];

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

function fail(message: string, statusCode = 400): never {
  throw Object.assign(new Error(message), { statusCode });
}

const DAY = 86_400_000;
const days = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY);
const shift = (value: string, by: number) => new Date(Date.parse(`${value}T00:00:00Z`) + by * DAY).toISOString().slice(0, 10);

/** Update one row, dropping any optional column the database does not have yet. */
async function updateDegrading(table: string, id: string, fields: Record<string, unknown>) {
  const db = assertServiceSupabase();
  let current = { ...fields };
  for (let attempt = 0; attempt <= Object.keys(fields).length; attempt += 1) {
    if (!Object.keys(current).length) return;
    const { error } = await db.from(table).update(current).eq("id", id);
    if (!error) return;
    const column = missingColumnName(error);
    if (!column || !(column in current)) return; // optional, and not worth failing the copy
    const { [column]: _dropped, ...rest } = current;
    void _dropped;
    current = rest;
  }
}

export async function handleDuplicateEvent(req: ApiRequest, res: ApiResponse) {
  if (String(req.method) !== "POST") fail("Method not allowed", 405);
  const { appUser } = await requireAppUser(req);
  const db = assertServiceSupabase();

  const parsed = z
    .object({
      eventId: z.string().uuid(),
      name: z.string().trim().min(2).max(100),
      startDate: date,
    })
    .safeParse(await getRequestBody(req));
  if (!parsed.success) fail(parsed.error.issues[0].message);
  const { eventId, name, startDate } = parsed.data;

  const access = await publicationAccess(eventId, appUser.id);
  if (!access.canManage) fail("Only an admin of this event can copy it", 403);

  const sourceResult = await db.from("events").select("*").eq("id", eventId).maybeSingle();
  if (sourceResult.error) throw sourceResult.error;
  const source = sourceResult.data as Record<string, unknown> | null;
  if (!source) fail("Event not found", 404);

  const offset = days(String(source.start_date), startDate);
  const endDate = shift(String(source.end_date), offset);

  const modules = Object.values(await fetchEventModules(eventId)).map((item) => ({
    page_key: item.pageKey,
    visibility: item.visibility,
    is_enabled: item.isEnabled,
    label_override: item.labelOverride,
  }));

  const created = await db.rpc("create_event_draft", {
    p_user: appUser.id,
    p_input: {
      societyId: source.organization_id ?? undefined,
      eventName: name,
      startDate,
      endDate,
      startTime: source.start_time ? String(source.start_time).slice(0, 5) : "",
      endTime: source.end_time ? String(source.end_time).slice(0, 5) : "",
      location: source.location ?? "",
      description: source.description ?? "",
      eventType: source.event_type ?? "festival",
      templateKey: source.template_key ?? "",
      unitLabel: source.unit_label ?? "Flat",
    },
    p_modules: modules,
  });
  if (created.error) {
    if (["PGRST202", "42883"].includes(created.error.code ?? "")) {
      fail("Copying an event needs migrations 032 and 033. Run them, then try again.", 503);
    }
    if (created.error.code === "P0001") fail(created.error.message, 403);
    throw created.error;
  }
  const newId = created.data as string;

  // Appearance and arrangement. Each column is optional: an older database that
  // lacks one still gets a copy, just without it.
  await updateDegrading("events", newId, {
    theme: source.theme ?? null,
    hero_image_url: source.hero_image_url ?? null,
    hero_options: source.hero_options ?? null,
    dashboard_layout: source.dashboard_layout ?? null,
    finance_visibility: source.finance_visibility ?? undefined,
    // Which edition this is a copy of: how the new event's page can show last time's photographs (039).
    copied_from: eventId,
  });

  // Registration setup, switched off.
  const settings = await db.from("event_registration_settings").select("*").eq("event_id", eventId).maybeSingle();
  if (!settings.error && settings.data) {
    const s = settings.data as Record<string, unknown>;
    await db.rpc("save_registration_settings", {
      p_event: newId,
      p_config: {
        enabled: false,
        self_service: s.self_service ?? false,
        audience: s.audience ?? "society",
        adult_price: s.adult_price ?? 0,
        child_price: s.child_price ?? 0,
        child_age_limit: s.child_age_limit ?? 18,
        food_enabled: s.food_enabled ?? false,
        food_price: s.food_price ?? 0,
        allow_guests: s.allow_guests ?? false,
        capacity: s.capacity ?? null,
        // A deadline from last year would close the new event on arrival.
        closes_at: null,
        payment_instructions: s.payment_instructions ?? "",
        cancellation_policy: s.cancellation_policy ?? "",
      },
    });
  }

  // The programme, moved with the event, every item back to "Planned".
  const schedule = await db.from("event_schedule").select("*").eq("event_id", eventId);
  if (!schedule.error && schedule.data?.length) {
    const rows = (schedule.data as Record<string, unknown>[]).map((row) => {
      const { id: _id, event_id: _event, created_at: _created, updated_at: _updated, ...rest } = row;
      void _id; void _event; void _created; void _updated;
      return {
        ...rest,
        event_id: newId,
        activity_date: shift(String(row.activity_date), offset),
        status: "Planned",
        expected_attendance: null,
      };
    });
    await db.from("event_schedule").insert(rows);
  }

  audit(req as never, {
    action: "create",
    entityType: "event",
    entityId: newId,
    eventId: newId,
    actor: { id: appUser.id },
    after: { name, copiedFrom: eventId },
    summary: `Copied "${String(source.name)}" into a new draft "${name}"`,
  });
  sendJson(res, 201, { eventId: newId });
}
