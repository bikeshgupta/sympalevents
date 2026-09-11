import { resolvePageAccess } from "./page-visibility.js";
import { assertServiceSupabase, getRequestBody, requireAppUser, sendJson } from "./server.js";

/**
 * Prasad slots, served by api/event-schedule.ts on `?resource=prasad` - a
 * slot is part of the event's schedule, and this project sits at the Vercel
 * function cap, so it folds into that route instead of adding a function.
 *
 *   GET    /api/event-schedule?resource=prasad&eventId=   slots + whether you can edit
 *   POST   /api/event-schedule?resource=prasad            create a slot
 *   PATCH  /api/event-schedule?resource=prasad            edit a slot (whole-slot save)
 *   DELETE /api/event-schedule?resource=prasad            delete a slot
 *
 * A slot is one row of `prasad_items`: a date, a label ("Morning", "Noon",
 * "Evening", or anything else), what prasad is served, and two lists of
 * people - who arranges it (the prasad sponsors) and who distributes it.
 * Several people on either list is the normal case.
 *
 * View follows the admin's visibility for the "prasad" page; every write needs
 * admin or an edit grant on it. A signed-out visitor (page set public) gets
 * names but never flat numbers.
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

export type PrasadPerson = { name: string; flat: string };

const MIGRATION = "supabase/migrations/019_prasad_slots.sql";
const MAX_PEOPLE_PER_LIST = 30;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const columns = "id,event_id,prasad_date,slot,item,notes,arrangers,distributors,created_at,updated_at";
const legacyColumns = "id,event_id,prasad_date,slot,item,notes,sponsor_contributor,arranged_by,created_at,updated_at";

type SlotRecord = Record<string, unknown>;

function fail(message: string, statusCode = 400) {
  const error = new Error(message);
  Object.assign(error, { statusCode });
  return error;
}

/** Migration 019 has not been run: the two list columns are missing. */
function isMissingLists(error: { code?: string; message?: string } | null) {
  if (!error) return false;
  const message = error.message ?? "";
  return (
    (["42703", "PGRST204"].includes(error.code ?? "") || /does not exist|could not find/i.test(message)) &&
    /arrangers|distributors/.test(message)
  );
}

function listsMissing() {
  return fail(`Prasad slots cannot be saved yet. Run ${MIGRATION} in Supabase, then try again.`, 501);
}

function asPeople(value: unknown): PrasadPerson[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => ({
      name: String((entry as PrasadPerson | null)?.name ?? "").trim(),
      flat: String((entry as PrasadPerson | null)?.flat ?? "").trim(),
    }))
    .filter((person) => person.name);
}

/** Before migration 019 the only people a row can carry are the two old
 *  free-text columns, and both of them meant "who arranged it". */
function legacyArrangers(row: SlotRecord): PrasadPerson[] {
  const names = [row.sponsor_contributor, row.arranged_by]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean);
  return Array.from(new Set(names)).map((name) => ({ name, flat: "" }));
}

function shapeSlot(row: SlotRecord, signedIn: boolean) {
  const hideFlat = (people: PrasadPerson[]) => (signedIn ? people : people.map(({ name }) => ({ name, flat: "" })));
  const hasLists = "arrangers" in row;

  return {
    id: row.id as string,
    date: (row.prasad_date as string | null) ?? "",
    slot: (row.slot as string | null) ?? "",
    item: (row.item as string | null) ?? "",
    notes: (row.notes as string | null) ?? "",
    arrangers: hideFlat(hasLists ? asPeople(row.arrangers) : legacyArrangers(row)),
    distributors: hideFlat(hasLists ? asPeople(row.distributors) : []),
    createdAt: (row.created_at as string) ?? "",
    updatedAt: (row.updated_at as string) ?? "",
  };
}

async function fetchSlots(eventId: string) {
  const supabase = assertServiceSupabase();
  const rich = await supabase
    .from("prasad_items")
    .select(columns)
    .eq("event_id", eventId)
    .order("prasad_date", { ascending: true })
    .order("created_at", { ascending: true });

  if (!isMissingLists(rich.error)) {
    if (rich.error) throw rich.error;
    return { rows: (rich.data ?? []) as unknown as SlotRecord[], ready: true };
  }

  // Read degrades, write says so - the same shape as every other migration here.
  console.warn("prasad_items.arrangers / distributors are missing. Run migration 019_prasad_slots.sql.");
  const plain = await supabase
    .from("prasad_items")
    .select(legacyColumns)
    .eq("event_id", eventId)
    .order("prasad_date", { ascending: true })
    .order("created_at", { ascending: true });
  if (plain.error) throw plain.error;
  return { rows: (plain.data ?? []) as unknown as SlotRecord[], ready: false };
}

function readPeople(value: unknown, label: string): PrasadPerson[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw fail(`${label} has to be a list of people.`);

  const seen = new Set<string>();
  const people: PrasadPerson[] = [];
  for (const entry of value) {
    const raw = (entry ?? {}) as { name?: unknown; flat?: unknown };
    const name = String(raw.name ?? "").trim().replace(/\s+/g, " ");
    // Flats are written every way ("b-402", "B 402"); one spelling keeps the
    // list tidy and lets the same family match across slots.
    const flat = String(raw.flat ?? "").trim().replace(/\s+/g, " ").toUpperCase();
    if (!name) continue; // an empty row left in the form, not an error
    if (name.length > 80) throw fail(`Keep each name in ${label.toLowerCase()} under 80 characters.`);
    if (flat.length > 20) throw fail(`Keep each flat number under 20 characters.`);
    const key = `${name.toLowerCase()}|${flat}`;
    if (seen.has(key)) continue;
    seen.add(key);
    people.push({ name, flat });
  }

  if (people.length > MAX_PEOPLE_PER_LIST) {
    throw fail(`${label} can have at most ${MAX_PEOPLE_PER_LIST} people.`);
  }
  return people;
}

function readSlotFields(body: Record<string, unknown>) {
  const date = String(body.date ?? "").trim();
  const slot = String(body.slot ?? "").trim().replace(/\s+/g, " ");
  const item = String(body.item ?? "").trim();
  const notes = String(body.notes ?? "").trim();

  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(`${date}T00:00:00Z`) : null;
  if (!parsed || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    throw fail("Pick the day of this prasad slot.");
  }
  if (!slot) throw fail("Pick a slot - morning, noon, evening, or name your own.");
  if (slot.length > 40) throw fail("Keep the slot name under 40 characters.");
  if (item.length > 120) throw fail("Keep the prasad description under 120 characters.");
  if (notes.length > 500) throw fail("Keep the note under 500 characters.");

  return {
    prasad_date: date,
    slot,
    item,
    notes,
    arrangers: readPeople(body.arrangers, "Arranged by"),
    distributors: readPeople(body.distributors, "Distributed by"),
    updated_at: new Date().toISOString(),
  };
}

/** One slot per label per day: two "Morning" slots on the same date is almost
 *  always a second person adding themselves in the wrong place. */
async function assertSlotIsFree(eventId: string, date: string, slot: string, exceptId?: string) {
  const supabase = assertServiceSupabase();
  const { data, error } = await supabase
    .from("prasad_items")
    .select("id,slot")
    .eq("event_id", eventId)
    .eq("prasad_date", date);
  if (error) throw error;

  const clash = (data ?? []).find(
    (row) => row.id !== exceptId && String(row.slot ?? "").trim().toLowerCase() === slot.toLowerCase(),
  );
  if (clash) {
    throw fail(`There is already a ${slot} slot on that day. Add the people to that slot instead.`, 409);
  }
}

async function optionalUserId(req: ApiRequest) {
  const header = String(req.headers.authorization ?? "");
  if (!header.startsWith("Bearer ")) return null;
  const { appUser } = await requireAppUser(req);
  return appUser.id as string;
}

async function requireEditor(eventId: string, userId: string) {
  const access = await resolvePageAccess(eventId, userId, "prasad");
  if (!access.canEdit) {
    throw fail("Only an event admin, or a member with edit access to Prasad, can change prasad slots.", 403);
  }
}

export async function handlePrasad(req: ApiRequest, res: ApiResponse) {
  const method = String(req.method);
  if (!["GET", "POST", "PATCH", "DELETE"].includes(method)) {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  if (method === "GET") {
    const eventId = String(req.query?.eventId ?? "");
    if (!uuidPattern.test(eventId)) {
      sendJson(res, 400, { error: "eventId is required" });
      return;
    }

    const userId = await optionalUserId(req);
    const access = await resolvePageAccess(eventId, userId, "prasad");
    if (!access.canView) {
      throw userId
        ? fail("You do not have access to this event's prasad slots.", 403)
        : fail("Sign in to see this event's prasad slots.", 401);
    }

    const { rows, ready } = await fetchSlots(eventId);
    sendJson(res, 200, {
      slots: rows.map((row) => shapeSlot(row, Boolean(userId))),
      ready,
      access: { canEdit: access.canEdit },
    });
    return;
  }

  const { appUser } = await requireAppUser(req);
  const body = (await getRequestBody(req)) as Record<string, unknown>;
  const supabase = assertServiceSupabase();

  if (method === "POST") {
    const eventId = String(body.eventId ?? "");
    if (!uuidPattern.test(eventId)) {
      sendJson(res, 400, { error: "eventId is required" });
      return;
    }
    await requireEditor(eventId, appUser.id);

    const fields = readSlotFields(body);
    await assertSlotIsFree(eventId, fields.prasad_date, fields.slot);

    const { data, error } = await supabase
      .from("prasad_items")
      .insert({ event_id: eventId, ...fields })
      .select("id")
      .single();
    if (error) {
      if (isMissingLists(error)) throw listsMissing();
      throw error;
    }

    sendJson(res, 201, { slotId: data.id });
    return;
  }

  const slotId = String(body.id ?? "");
  if (!uuidPattern.test(slotId)) {
    sendJson(res, 400, { error: "id is required" });
    return;
  }

  const { data: existing, error: existingError } = await supabase
    .from("prasad_items")
    .select("id,event_id")
    .eq("id", slotId)
    .maybeSingle();
  if (existingError) throw existingError;
  if (!existing) throw fail("That prasad slot no longer exists. Refresh the page.", 404);

  await requireEditor(existing.event_id, appUser.id);

  if (method === "DELETE") {
    const { error } = await supabase.from("prasad_items").delete().eq("id", slotId);
    if (error) throw error;
    sendJson(res, 200, { ok: true });
    return;
  }

  // PATCH saves the whole slot. It is conditional on the `updatedAt` the
  // editor loaded, so two coordinators editing the same slot cannot silently
  // overwrite each other's lists - the second one is asked to look again.
  const fields = readSlotFields(body);
  await assertSlotIsFree(existing.event_id, fields.prasad_date, fields.slot, slotId);

  let query = supabase.from("prasad_items").update(fields).eq("id", slotId);
  if (body.updatedAt) query = query.eq("updated_at", String(body.updatedAt));
  const { data, error } = await query.select("id");

  if (error) {
    if (isMissingLists(error)) throw listsMissing();
    throw error;
  }
  if (!data?.length) {
    throw fail("Someone else changed this slot while you were editing. Close it, check the latest, and try again.", 409);
  }

  sendJson(res, 200, { ok: true });
}
