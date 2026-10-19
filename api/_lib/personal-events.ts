import { createHash } from "node:crypto";
import { z } from "zod";
import { audit } from "./audit.js";
import { assertServiceSupabase, getRequestBody, optionalAppUser, requireAppUser, sendJson } from "./server.js";
import { getDateInEventZone } from "../../shared/event-status.js";
import {
  LIMITS,
  cleanParagraphs,
  cleanPhone,
  cleanText,
  firstName,
  isColor,
  isIsoDate,
  isKind,
  isTime,
  newInviteCode,
  normaliseCode,
  peopleFor,
  repliesOpen,
  rsvpCounts,
  type RsvpStatus,
} from "../../shared/personal-events.js";

/**
 * Personal events: `/api/events?resource=personal&part=...` - folded into api/events.ts, so the function
 * count is still 12. Rules in shared/personal-events.ts; tables in migration 049.
 *
 *   GET    part=mine            signed in: what I host, and what I have replied to
 *   GET    part=invite&code=    anyone with the code: the invitation, counts, wishes, my own reply
 *   GET    part=event&id=       the host only: the event and every reply, phone numbers included
 *   POST   part=create          signed in: a new event (at most 20 upcoming per host)
 *   POST   part=rsvp            anyone with the code: reply, or change a reply
 *   PATCH  part=event           the host only: edit, cancel, reopen, or a new code
 *
 * **Who can read an event is whoever has its code.** There is no list of personal events anywhere else. A
 * guest without an account is recognised by a random token their browser keeps (`x-guest-token`); only its
 * SHA-256 is stored. A phone number goes to the host and nobody else.
 */

type ApiRequest = Parameters<typeof requireAppUser>[0] & { method?: string; query?: Record<string, unknown>; headers?: Record<string, unknown> };
type ApiResponse = Parameters<typeof sendJson>[0];

const MIGRATION = "supabase/migrations/049_personal_events.sql";
const missing = ["42P01", "PGRST205", "PGRST202", "42703", "PGRST204"];
const uuid = z.string().uuid();

function fail(message: string, statusCode = 400): never {
  throw Object.assign(new Error(message), { statusCode });
}

function isMissing(error: { code?: string } | null | undefined) {
  return Boolean(error && missing.includes(error.code ?? ""));
}

function dbError(error: { code?: string; message: string } | null) {
  if (!error) return;
  if (isMissing(error)) fail(`Personal events need ${MIGRATION}. Run it, then try again.`, 501);
  throw error;
}

const EVENT_COLUMNS =
  "id,host_user_id,kind,title,description,color,starts_on,start_time,end_time,venue,address,invite_code,guests_see_list,allow_plus_ones,status,created_at";

type EventRow = {
  id: string;
  host_user_id: string;
  kind: string;
  title: string;
  description: string | null;
  color: string;
  starts_on: string;
  start_time: string | null;
  end_time: string | null;
  venue: string | null;
  address: string | null;
  invite_code: string;
  guests_see_list: boolean;
  allow_plus_ones: boolean;
  status: string;
  created_at: string;
};

type RsvpRow = {
  id: string;
  event_id: string;
  user_id: string | null;
  guest_token_hash: string | null;
  name: string;
  status: RsvpStatus;
  people: number;
  phone: string | null;
  wish: string | null;
  created_at: string;
  updated_at: string;
};

/** "16:00:00" -> "16:00". */
const hhmm = (time: string | null) => (time ? time.slice(0, 5) : null);

function eventView(row: EventRow) {
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    description: row.description,
    color: row.color,
    startsOn: row.starts_on,
    startTime: hhmm(row.start_time),
    endTime: hhmm(row.end_time),
    venue: row.venue,
    address: row.address,
    code: row.invite_code,
    guestsSeeList: row.guests_see_list,
    allowPlusOnes: row.allow_plus_ones,
    status: row.status,
  };
}

function guestTokenHash(req: ApiRequest) {
  const raw = String(req.headers?.["x-guest-token"] ?? "");
  if (!/^[A-Za-z0-9_-]{24,128}$/.test(raw)) return null;
  return createHash("sha256").update(raw).digest("hex");
}

const today = () => getDateInEventZone(new Date());

/** The fields a host may set. On create every required one must be there; on edit only what is sent. */
function cleanEventInput(body: Record<string, unknown>, mode: "create" | "edit") {
  const out: Record<string, unknown> = {};
  const has = (key: string) => mode === "create" || key in body;

  if (has("title")) {
    const title = cleanText(body.title, LIMITS.title);
    if (!title) fail("Give the event a title");
    out.title = title;
  }
  if (has("kind")) out.kind = isKind(body.kind) ? body.kind : "other";
  if (has("color")) out.color = isColor(body.color) ? body.color : "teal";
  if (has("description")) out.description = cleanParagraphs(body.description, LIMITS.description);
  if (has("startsOn")) {
    if (!isIsoDate(body.startsOn)) fail("Choose the date");
    if (mode === "create" && String(body.startsOn) < today()) fail("The date has already passed");
    out.starts_on = body.startsOn;
  }
  for (const [key, column] of [["startTime", "start_time"], ["endTime", "end_time"]] as const) {
    if (!has(key)) continue;
    const value = body[key];
    if (value === null || value === "" || value === undefined) out[column] = null;
    else if (isTime(value)) out[column] = value;
    else fail("A time looks like 16:30");
  }
  if (has("venue")) out.venue = cleanText(body.venue, LIMITS.venue);
  if (has("address")) out.address = cleanText(body.address, LIMITS.address);
  if (has("guestsSeeList")) out.guests_see_list = body.guestsSeeList === true;
  if (has("allowPlusOnes")) out.allow_plus_ones = body.allowPlusOnes !== false;
  return out;
}

async function loadEventByCode(code: string) {
  const db = assertServiceSupabase();
  const { data, error } = await db.from("personal_events").select(EVENT_COLUMNS).eq("invite_code", code).maybeSingle();
  dbError(error);
  if (!data) fail("That invitation does not exist. Check the code with the person who sent it.", 404);
  return data as unknown as EventRow;
}

async function loadHostedEvent(id: string, userId: string) {
  if (!uuid.safeParse(id).success) fail("A valid event is required");
  const db = assertServiceSupabase();
  const { data, error } = await db.from("personal_events").select(EVENT_COLUMNS).eq("id", id).maybeSingle();
  dbError(error);
  if (!data) fail("That event does not exist", 404);
  const row = data as unknown as EventRow;
  if (row.host_user_id !== userId) fail("Only the host can open this", 403);
  return row;
}

async function rsvpsFor(eventIds: string[], columns = "event_id,status,people") {
  if (!eventIds.length) return [] as RsvpRow[];
  const db = assertServiceSupabase();
  const { data, error } = await db.from("personal_event_rsvps").select(columns).in("event_id", eventIds);
  dbError(error);
  return (data ?? []) as unknown as RsvpRow[];
}

/** Inserts with a fresh code, trying again on the rare clash with an existing one. */
async function withFreshCode<T>(write: (code: string) => Promise<{ data: T | null; error: { code?: string; message: string } | null }>) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const { data, error } = await write(newInviteCode());
    if (error?.code === "23505") continue;
    dbError(error);
    return data as T;
  }
  fail("Could not make an invite code. Try again.", 503);
}

export async function handlePersonalEvents(req: ApiRequest, res: ApiResponse) {
  const part = String(req.query?.part ?? "");
  const db = assertServiceSupabase();

  // ---- reads --------------------------------------------------------------
  if (req.method === "GET" && part === "mine") {
    const { appUser } = await requireAppUser(req);
    const hosted = await db.from("personal_events").select(EVENT_COLUMNS).eq("host_user_id", appUser.id).order("starts_on");
    if (isMissing(hosted.error)) {
      sendJson(res, 200, { ready: false, migration: MIGRATION, hosting: [], invited: [] });
      return;
    }
    dbError(hosted.error);

    const replies = await db.from("personal_event_rsvps").select("event_id,status,people").eq("user_id", appUser.id);
    dbError(replies.error);
    const myReplies = new Map(((replies.data ?? []) as unknown as RsvpRow[]).map((row) => [row.event_id, row]));
    const hostedRows = (hosted.data ?? []) as unknown as EventRow[];
    const hostedIds = new Set(hostedRows.map((row) => row.id));
    const invitedIds = [...myReplies.keys()].filter((id) => !hostedIds.has(id));

    let invitedRows: EventRow[] = [];
    if (invitedIds.length) {
      const invited = await db.from("personal_events").select(EVENT_COLUMNS).in("id", invitedIds).order("starts_on");
      dbError(invited.error);
      invitedRows = (invited.data ?? []) as unknown as EventRow[];
    }

    const all = await rsvpsFor([...hostedIds, ...invitedIds]);
    const countsFor = (id: string) => rsvpCounts(all.filter((row) => row.event_id === id));
    sendJson(res, 200, {
      ready: true,
      hosting: hostedRows.map((row) => ({ ...eventView(row), counts: countsFor(row.id) })),
      // A guest's list shows numbers only when the host keeps the guest list private, as here.
      invited: invitedRows.map((row) => ({ ...eventView(row), counts: countsFor(row.id), myStatus: myReplies.get(row.id)?.status ?? null })),
    });
    return;
  }

  if (req.method === "GET" && part === "invite") {
    const code = normaliseCode(req.query?.code);
    if (!code) fail("An invite code has six letters and numbers.");
    const [viewer, event] = await Promise.all([optionalAppUser(req), loadEventByCode(code)]);
    const tokenHash = guestTokenHash(req);
    const rows = await rsvpsFor([event.id], "id,event_id,user_id,guest_token_hash,name,status,people,wish,created_at,updated_at");

    const host = await db.from("app_users").select("full_name").eq("id", event.host_user_id).maybeSingle();
    const mine = rows.find((row) => (viewer && row.user_id === viewer.id) || (tokenHash && row.guest_token_hash === tokenHash));
    const isHost = viewer?.id === event.host_user_id;

    sendJson(res, 200, {
      ready: true,
      event: eventView(event),
      host: { firstName: firstName((host.data as { full_name?: string } | null)?.full_name ?? "") },
      isHost,
      repliesOpen: repliesOpen(event.starts_on, today(), event.status),
      counts: rsvpCounts(rows),
      wishes: rows
        .filter((row) => row.wish)
        .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
        .slice(0, 100)
        .map((row) => ({ name: firstName(row.name), wish: row.wish })),
      // Names of who is coming, only when the host has chosen to show them. Never a phone number.
      guests: event.guests_see_list ? rows.filter((row) => row.status === "going").map((row) => firstName(row.name)) : null,
      mine: mine ? { name: mine.name, status: mine.status, people: mine.people, wish: mine.wish } : null,
    });
    return;
  }

  if (req.method === "GET" && part === "event") {
    const { appUser } = await requireAppUser(req);
    const event = await loadHostedEvent(String(req.query?.id ?? ""), appUser.id);
    const rows = await rsvpsFor([event.id], "id,event_id,user_id,name,status,people,phone,wish,created_at,updated_at");
    sendJson(res, 200, {
      event: eventView(event),
      counts: rsvpCounts(rows),
      rsvps: rows
        .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
        .map((row) => ({ id: row.id, name: row.name, status: row.status, people: row.people, phone: row.phone, wish: row.wish, signedIn: Boolean(row.user_id), updatedAt: row.updated_at })),
    });
    return;
  }

  // ---- writes -------------------------------------------------------------
  if (req.method === "POST" && part === "create") {
    const { appUser } = await requireAppUser(req);
    const body = (await getRequestBody(req)) as Record<string, unknown>;
    const values = cleanEventInput(body ?? {}, "create");

    const active = await db
      .from("personal_events")
      .select("id", { count: "exact", head: true })
      .eq("host_user_id", appUser.id)
      .eq("status", "active")
      .gte("starts_on", today());
    dbError(active.error);
    if ((active.count ?? 0) >= LIMITS.activePerHost) {
      fail(`You can host up to ${LIMITS.activePerHost} upcoming events at a time.`, 409);
    }

    const row = await withFreshCode<EventRow>(async (code) => {
      const { data, error } = await db
        .from("personal_events")
        .insert({ ...values, host_user_id: appUser.id, invite_code: code })
        .select(EVENT_COLUMNS)
        .single();
      return { data: data as unknown as EventRow | null, error };
    });
    audit(req, { action: "create", entityType: "personal_event", entityId: row.id, actor: appUser, after: row, summary: `Created personal event "${row.title}"` });
    sendJson(res, 201, { event: eventView(row) });
    return;
  }

  if (req.method === "POST" && part === "rsvp") {
    const viewer = await optionalAppUser(req);
    const tokenHash = guestTokenHash(req);
    if (!viewer && !tokenHash) fail("Your browser could not keep your reply. Allow site data, or sign in, then try again.");

    const body = ((await getRequestBody(req)) ?? {}) as Record<string, unknown>;
    const code = normaliseCode(body.code);
    if (!code) fail("An invite code has six letters and numbers.");
    const event = await loadEventByCode(code);
    if (viewer?.id === event.host_user_id) fail("You're the host of this event.", 409);
    if (!repliesOpen(event.starts_on, today(), event.status)) {
      fail(event.status === "cancelled" ? "This event has been cancelled." : "Replies have closed for this event.", 409);
    }

    const status = body.status;
    if (status !== "going" && status !== "maybe" && status !== "declined") fail("Choose going, maybe or can't come");
    const name = cleanText(body.name, LIMITS.name);
    if (!name) fail("Add your name so the host knows who's replying.");
    const values = {
      name,
      status,
      people: peopleFor(status, body.people, event.allow_plus_ones),
      phone: cleanPhone(body.phone),
      wish: cleanText(body.wish, LIMITS.wish),
      updated_at: new Date().toISOString(),
    };

    const rows = await rsvpsFor([event.id], "id,event_id,user_id,guest_token_hash,status,people");
    const existing =
      (viewer && rows.find((row) => row.user_id === viewer.id)) || (tokenHash && rows.find((row) => row.guest_token_hash === tokenHash)) || null;

    if (existing) {
      // A guest who replied without an account and later signs in keeps the one reply.
      const patch = { ...values, ...(viewer && !existing.user_id ? { user_id: viewer.id } : {}) };
      const { error } = await db.from("personal_event_rsvps").update(patch).eq("id", existing.id);
      dbError(error);
    } else {
      if (rows.length >= LIMITS.rsvpsPerEvent) fail("This event has all the replies it can take.", 409);
      const { error } = await db
        .from("personal_event_rsvps")
        .insert({ ...values, event_id: event.id, user_id: viewer?.id ?? null, guest_token_hash: tokenHash });
      dbError(error);
    }

    const after = await rsvpsFor([event.id]);
    sendJson(res, 200, { mine: { name: values.name, status: values.status, people: values.people, wish: values.wish }, counts: rsvpCounts(after) });
    return;
  }

  if (req.method === "PATCH" && part === "event") {
    const { appUser } = await requireAppUser(req);
    const body = ((await getRequestBody(req)) ?? {}) as Record<string, unknown>;
    const before = await loadHostedEvent(String(body.id ?? ""), appUser.id);
    const action = String(body.action ?? "");

    let row: EventRow;
    if (action === "new-code") {
      row = await withFreshCode<EventRow>(async (code) => {
        const { data, error } = await db
          .from("personal_events")
          .update({ invite_code: code, updated_at: new Date().toISOString() })
          .eq("id", before.id)
          .select(EVENT_COLUMNS)
          .single();
        return { data: data as unknown as EventRow | null, error };
      });
    } else {
      const values =
        action === "cancel" ? { status: "cancelled" } : action === "reopen" ? { status: "active" } : cleanEventInput(body, "edit");
      const { data, error } = await db
        .from("personal_events")
        .update({ ...values, updated_at: new Date().toISOString() })
        .eq("id", before.id)
        .select(EVENT_COLUMNS)
        .single();
      dbError(error);
      row = data as unknown as EventRow;
    }
    audit(req, { action: action || "update", entityType: "personal_event", entityId: row.id, actor: appUser, before, after: row, summary: `Personal event "${row.title}": ${action || "edited"}` });
    sendJson(res, 200, { event: eventView(row) });
    return;
  }

  fail("Unknown personal events request", 400);
}
