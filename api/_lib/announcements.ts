import type { SupabaseClient } from "@supabase/supabase-js";
import { cleanAskPayload, cleanPollPayload, readPayload, sameOptions, type PollOption } from "./announcement-payload.js";
import { handleAnnouncementInteraction } from "./announcement-interactions.js";
import { audit } from "./audit.js";
import { resolvePageAccess } from "./page-visibility.js";
import { isMissingColumnError, selectDegrading } from "./schema-compat.js";
import { assertServiceSupabase, requireAppUser, sendJson } from "./server.js";

/**
 * Announcements an organiser writes and publishes - the notices on the
 * dashboard card and in the header bell.
 *
 * ## Reading
 *
 * There is no GET here. Announcements travel with the event in
 * `?resource=data` (`loadAnnouncements` below, called from event-data.ts), so
 * a post adds no request: the header bell is on every screen and would
 * otherwise make one of its own on every page load. Only the writes need a
 * route, on `POST | PATCH | DELETE /api/events?resource=announcements`.
 *
 * ## Who
 *
 * Writing needs edit access to the dashboard - an event admin, or somebody
 * given an explicit `edit` grant on it - which is the rule appearance and
 * layout already use for the same screen. Drafts are returned only to those
 * same people. Readers get published posts and nothing else; what they may
 * read at all is still decided by whether they can open the dashboard.
 *
 * ## Kinds
 *
 * `kind` is how this grows into polls, questions and auction posts: a new kind
 * is an entry in `kinds` here and a renderer on the client, not a migration.
 * `message`, `poll` and `ask` (ask-me-anything) exist; what is particular to a
 * poll or an ask is its `payload` (api/_lib/announcement-payload.ts), and what
 * people do with them - voting, asking, answering - is in
 * api/_lib/announcement-interactions.ts.
 *
 * ## Degrading
 *
 * Needs 029 (the table) and 034 (status, pinned, kind). A read against a
 * database without them returns no posts rather than failing the dashboard; a
 * write answers 501 naming the migration, the same read-degrades-write-says-so
 * shape as the rest of this app.
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

const kinds = new Set(["message", "poll", "ask"]);
const tones = new Set(["info", "alert", "spotlight"]);
const statuses = new Set(["draft", "published"]);

const migrationMessage =
  "Announcements need supabase/migrations/029_society_home.sql and 034_announcement_posts.sql. Run them, then try again.";
const interactiveMigrationMessage =
  "Polls and questions need supabase/migrations/036_polls_and_questions.sql (after 034). Run it, then try again.";

/** Every column this feature reads, in the order they arrived. The first
 *  group is 029's table; the rest are 034's, and each can be absent alone. */
const columns = [
  "id",
  "event_id",
  "tag",
  "title",
  "body",
  "tone",
  "day",
  "announce_date",
  "announce_time",
  "location",
  "created_at",
  "status",
  "published_at",
  "pinned",
  "kind",
  "payload",
];
const coreColumns = ["id", "event_id", "tag", "title", "body", "tone", "created_at"];

export type AnnouncementPayload = {
  id: string;
  kind: string;
  tag: string;
  title: string;
  body: string;
  tone: string;
  day: string | null;
  date: string | null;
  time: string | null;
  location: string | null;
  status: "draft" | "published";
  pinned: boolean;
  /** For a poll, when the viewer is signed in: whether they have voted. Lets the
   *  resident's checklist say "vote" without a request per poll. Never who or what. */
  viewerVoted?: boolean;
  /** What is particular to a poll or an ask; empty for a message. */
  payload: Record<string, unknown>;
  createdAt: string;
  publishedAt: string | null;
};

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

function isMissingTable(error: { code?: string; message?: string } | null) {
  // 42P01 is Postgres's own; PGRST205 is PostgREST's "not in the schema cache".
  return Boolean(error && ["42P01", "PGRST205"].includes(error.code ?? ""));
}

/** `HH:MM` out of whatever `announce_time` holds ("18:30" or "18:30:00"). */
function clock(value: unknown) {
  const match = String(value ?? "").trim().match(/^(\d{1,2}):(\d{2})/);
  return match ? `${match[1].padStart(2, "0")}:${match[2]}` : null;
}

function toPayload(row: Record<string, unknown>): AnnouncementPayload {
  // A row from before 034 has no `status` and was always visible, so absence
  // reads as published rather than as a draft nobody can see.
  const status = row.status === "draft" ? "draft" : "published";
  const kind = typeof row.kind === "string" && row.kind ? row.kind : "message";
  return {
    id: String(row.id),
    kind,
    tag: String(row.tag ?? ""),
    title: String(row.title ?? ""),
    body: String(row.body ?? ""),
    tone: tones.has(String(row.tone)) ? String(row.tone) : "info",
    day: (row.day as string | null) ?? null,
    date: (row.announce_date as string | null) ?? null,
    time: clock(row.announce_time),
    location: (row.location as string | null) ?? null,
    status,
    pinned: row.pinned === true,
    payload: readPayload(kind, row.payload),
    createdAt: String(row.created_at ?? ""),
    publishedAt: (row.published_at as string | null) ?? (status === "published" ? String(row.created_at ?? "") : null),
  };
}

/** Pinned first, then the most recently published. */
function byFeedOrder(a: AnnouncementPayload, b: AnnouncementPayload) {
  if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
  return String(b.publishedAt ?? b.createdAt).localeCompare(String(a.publishedAt ?? a.createdAt));
}

/**
 * The posts to send with an event.
 *
 * Never throws: an unmigrated database, or any read failure, is "no posts" -
 * a dashboard must not fail to load because a notice board did.
 */
export async function loadAnnouncements(
  supabase: SupabaseClient,
  eventId: string,
  includeDrafts: boolean,
  viewerId: string | null = null,
): Promise<AnnouncementPayload[]> {
  try {
    const result = await selectDegrading("event_announcements", columns, coreColumns, (select) =>
      supabase.from("event_announcements").select(select).eq("event_id", eventId),
    );
    if (result.error) return [];
    const posts = ((result.data ?? []) as unknown as Record<string, unknown>[])
      .map(toPayload)
      .filter((post) => includeDrafts || post.status === "published")
      .sort(byFeedOrder);

    // One query for the viewer's votes across every poll, and only for somebody
    // signed in with a poll to ask about. Read as "did they vote", nothing more.
    const polls = posts.filter((post) => post.kind === "poll");
    if (viewerId && polls.length) {
      const voted = await supabase
        .from("announcement_poll_votes")
        .select("announcement_id")
        .eq("user_id", viewerId)
        .in("announcement_id", polls.map((post) => post.id));
      if (!voted.error) {
        const ids = new Set(((voted.data ?? []) as { announcement_id: string }[]).map((row) => row.announcement_id));
        for (const post of polls) post.viewerVoted = ids.has(post.id);
      }
    }
    return posts;
  } catch {
    return [];
  }
}

function text(value: unknown, max: number) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

/** A message keeps its line breaks - collapsing them would flatten a list. */
function message(value: unknown, max: number) {
  return String(value ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, max);
}

/**
 * Only the fields the body actually carries, cleaned.
 *
 * A PATCH of `{ status: "published" }` must not blank the title, so an absent
 * key is left out of the update rather than defaulted - which is also why this
 * returns a partial object and `create` fills in what it needs afterwards.
 */
function cleanFields(body: Record<string, unknown>) {
  const out: Record<string, unknown> = {};

  if (body.kind !== undefined) {
    const kind = String(body.kind);
    if (!kinds.has(kind)) throw fail("That kind of post is not available yet", 400);
    out.kind = kind;
  }
  if (body.title !== undefined) {
    const title = text(body.title, 120);
    if (!title) throw fail("Give the announcement a title", 400);
    out.title = title;
  }
  if (body.body !== undefined) out.body = message(body.body, 1500);
  if (body.tag !== undefined) out.tag = text(body.tag, 30) || "Update";
  if (body.tone !== undefined) {
    const tone = String(body.tone);
    if (!tones.has(tone)) throw fail("That is not a style this app has", 400);
    out.tone = tone;
  }
  if (body.date !== undefined) {
    const date = String(body.date ?? "").trim();
    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw fail("The date is not valid", 400);
    out.announce_date = date || null;
  }
  if (body.time !== undefined) {
    const time = String(body.time ?? "").trim();
    if (time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw fail("The time is not valid", 400);
    out.announce_time = time || null;
  }
  if (body.location !== undefined) out.location = text(body.location, 120) || null;
  if (body.pinned !== undefined) out.pinned = body.pinned === true;
  if (body.status !== undefined) {
    const status = String(body.status);
    if (!statuses.has(status)) throw fail("An announcement is either a draft or published", 400);
    out.status = status;
    out.published_at = status === "published" ? new Date().toISOString() : null;
  }
  return out;
}

async function assertCanEdit(eventId: string, userId: string) {
  const access = await resolvePageAccess(eventId, userId, "dashboard");
  if (!access.canEdit) throw fail("You do not have edit access to this event's announcements", 403);
}

/** The columns to read back after a write. `payload` belongs to 036, so a plain
 *  message does not ask for it: a database that has 034 but not 036 must still
 *  be able to post one. */
function returning(kind: string) {
  return (kind === "message" ? columns.filter((column) => column !== "payload") : columns).join(",");
}

function migrationError(error: { code?: string; message?: string }, kind = "message") {
  if (isMissingTable(error) || isMissingColumnError(error)) {
    // A poll or a question needs 036; a plain message only ever needed 034, and
    // must not be told to run something it has no use for.
    return fail(kind === "message" ? migrationMessage : interactiveMigrationMessage, 501);
  }
  return error;
}

export async function handleAnnouncements(req: ApiRequest, res: ApiResponse) {
  // Voting, asking, answering and reading a poll's results are not edits of
  // the post, and some are open to people who are not signed in.
  if (req.query?.part) return handleAnnouncementInteraction(req, res);

  const method = String(req.method);
  if (!["POST", "PATCH", "DELETE"].includes(method)) {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  const supabase = assertServiceSupabase();
  const { appUser } = await requireAppUser(req);

  if (method === "POST") {
    const body = await readBody(req);
    const eventId = String(body.eventId ?? "");
    if (!eventId) throw fail("eventId is required", 400);
    await assertCanEdit(eventId, appUser.id);

    const fields = cleanFields(body);
    if (!fields.title) throw fail("Give the announcement a title", 400);

    const kind = String(fields.kind ?? "message");
    const interactive = kind !== "message";
    // A poll or an ask has no date, time or place of its own - it has a closing
    // time, which lives in its payload - so those are not carried over.
    if (interactive) {
      delete fields.announce_date;
      delete fields.announce_time;
      delete fields.location;
    }

    const status = fields.status === "published" ? "published" : "draft";
    const row = {
      event_id: eventId,
      kind,
      ...(kind === "poll" ? { payload: cleanPollPayload(body.payload) } : {}),
      ...(kind === "ask" ? { payload: cleanAskPayload(body.payload) } : {}),
      tag: "Update",
      body: "",
      tone: "info",
      pinned: false,
      ...fields,
      status,
      published_at: status === "published" ? (fields.published_at ?? new Date().toISOString()) : null,
      created_by: appUser.id,
    };

    const { data, error } = await supabase.from("event_announcements").insert(row).select(returning(kind)).single();
    if (error) throw migrationError(error, kind);

    const created = toPayload(data as unknown as Record<string, unknown>);
    audit(req, {
      action: "create",
      entityType: "announcement",
      entityId: created.id,
      eventId,
      actor: { id: appUser.id },
      after: row,
      summary: `${status === "published" ? "Published" : "Drafted"} announcement "${created.title}"`,
    });
    sendJson(res, 200, { announcement: created });
    return;
  }

  // PATCH and DELETE address a post by id; its event is read from the row, never
  // taken from the request, so a caller cannot edit another event's post by
  // claiming to be editing their own.
  const body = method === "PATCH" ? await readBody(req) : {};
  const id = String((method === "PATCH" ? body.id : req.query?.id) ?? "");
  if (!id) throw fail("id is required", 400);

  const existing = await supabase.from("event_announcements").select("*").eq("id", id).maybeSingle();
  if (existing.error) throw migrationError(existing.error);
  if (!existing.data) throw fail("That announcement no longer exists", 404);
  const before = existing.data as Record<string, unknown>;
  const eventId = String(before.event_id);
  await assertCanEdit(eventId, appUser.id);

  if (method === "DELETE") {
    const { error } = await supabase.from("event_announcements").delete().eq("id", id);
    if (error) throw migrationError(error);
    audit(req, {
      action: "delete",
      entityType: "announcement",
      entityId: id,
      eventId,
      actor: { id: appUser.id },
      before,
      summary: `Deleted announcement "${String(before.title ?? "")}"`,
    });
    sendJson(res, 200, { ok: true });
    return;
  }

  const fields = cleanFields(body);
  // What kind of post this is is fixed when it is written: a poll that became
  // a message would orphan its votes.
  delete fields.kind;

  const kind = String(before.kind ?? "message");
  if (kind === "poll" && body.payload !== undefined) {
    const next = cleanPollPayload(body.payload);
    const current = readPayload("poll", before.payload) as unknown as { options: PollOption[] };
    if (!sameOptions(current.options, next.options)) {
      // Once anybody has voted the options are what they voted on. Fixing a
      // typo is a different edit from changing the choices.
      const { count, error: countError } = await supabase
        .from("announcement_poll_votes")
        .select("announcement_id", { count: "exact", head: true })
        .eq("announcement_id", id);
      if (countError && !isMissingTable(countError)) throw countError;
      if ((count ?? 0) > 0) throw fail("Voting has started, so the options cannot change. You can still change the wording of the question.", 409);
    }
    fields.payload = next;
  } else if (kind === "ask" && body.payload !== undefined) {
    fields.payload = cleanAskPayload(body.payload);
  }
  if (kind !== "message") {
    delete fields.announce_date;
    delete fields.announce_time;
    delete fields.location;
  }

  if (fields.status === "published" && before.status !== "draft" && "status" in before) {
    // Already live: publishing again must not move it to the top of the feed.
    delete fields.published_at;
  }
  if (!Object.keys(fields).length) throw fail("Nothing to change", 400);

  const { data, error } = await supabase
    .from("event_announcements")
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select(returning(kind))
    .single();
  if (error) throw migrationError(error, kind);

  const updated = toPayload(data as unknown as Record<string, unknown>);
  const published = fields.status === "published";
  const unpublished = fields.status === "draft";
  audit(req, {
    action: published ? "publish" : unpublished ? "unpublish" : "update",
    entityType: "announcement",
    entityId: id,
    eventId,
    actor: { id: appUser.id },
    before,
    after: { ...before, ...fields },
    summary: `${published ? "Published" : unpublished ? "Unpublished" : "Edited"} announcement "${updated.title}"`,
  });
  sendJson(res, 200, { announcement: updated });
}
