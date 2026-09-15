import {
  assertServiceSupabase,
  getRequestBody,
  handleApiError,
  requireAppUser,
  requireEventCommittee,
  sendJson,
} from "./server.js";

type ApiRequest = {
  method?: string;
  query?: {
    eventId?: string | string[];
    resource?: string | string[];
  };
  headers: {
    authorization?: string;
  };
  body?: unknown;
};

type ApiResponse = {
  setHeader?: (name: string, value: string) => void;
  status: (statusCode: number) => {
    json: (body: unknown) => void;
  };
};

type Supabase = ReturnType<typeof assertServiceSupabase>;

const MAX_MESSAGE = 4000;
const MAX_COMMENT = 1500;
const MAX_CAPTION = 160;
const MAX_ALBUM = 60;
const MAX_NAME = 80;
const MAX_ROLE = 60;
const MAX_NOTE = 400;
/** A society committee is tens of people, not thousands. Generous, but finite. */
const MAX_NAMES_PER_LIST = 200;
const MAX_SHOUTOUTS = 6;

const CREDITS_MIGRATION = "supabase/migrations/020_closing_credits.sql";

/** The closing row, with the hand-kept credit lists 020 adds. */
const CLOSING_COLUMNS =
  "event_id,headline,message,is_closed,closed_at,updated_at,extra_core,extra_volunteers,core_order,shoutouts";
/** The same row before 020. Reads degrade to this; writes say so instead. */
const CLOSING_COLUMNS_LEGACY = "event_id,headline,message,is_closed,closed_at,updated_at";

/** Migration 020 has not been run: the four credit columns are missing. */
function isMissingCreditColumns(error: { code?: string; message?: string } | null) {
  if (!error) return false;
  const message = error.message ?? "";
  return (
    (["42703", "PGRST204", "PGRST116"].includes(error.code ?? "") || /does not exist|could not find/i.test(message)) &&
    /extra_core|extra_volunteers|core_order|shoutouts/.test(message)
  );
}

type Shoutout = { name: string; role: string; note: string };

/** A clean, de-duplicated, ordered list of names out of whatever jsonb holds. */
function asNames(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const names: string[] = [];
  for (const entry of value) {
    const name = String(entry ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_NAME);
    const key = name.toLowerCase();
    if (!name || name === "-" || seen.has(key)) continue;
    seen.add(key);
    names.push(name);
  }
  return names.slice(0, MAX_NAMES_PER_LIST);
}

function asShoutouts(value: unknown): Shoutout[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      const row = (entry ?? {}) as Record<string, unknown>;
      return {
        name: String(row.name ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_NAME),
        role: String(row.role ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_ROLE),
        note: String(row.note ?? "").trim().slice(0, MAX_NOTE),
      };
    })
    .filter((row) => row.name)
    .slice(0, MAX_SHOUTOUTS);
}

/**
 * `names` in the order `order` asks for, then whatever `order` never mentioned.
 *
 * Deliberately forgiving in both directions, because the order is stored as
 * names rather than ids: a member who joined after the admin last arranged the
 * list appears at the end instead of disappearing, and a name in the order
 * that no longer exists is simply skipped.
 */
function inStoredOrder(names: string[], order: string[]) {
  const rank = new Map(order.map((name, index) => [name.toLowerCase(), index]));
  return names
    .map((name, index) => ({ name, rank: rank.get(name.toLowerCase()) ?? order.length + index }))
    .sort((a, b) => a.rank - b.rank)
    .map((entry) => entry.name);
}

/** `names` plus whichever `extras` it does not already carry. */
function withExtras(names: string[], extras: string[]) {
  const seen = new Set(names.map((name) => name.toLowerCase()));
  return [...names, ...extras.filter((extra) => !seen.has(extra.toLowerCase()))];
}

/**
 * The closing page's three resources - the closing note itself, the photo
 * gallery, and the ratings/reviews - all served from `/api/events`.
 *
 * Not a style choice: Vercel turns every file directly under `api/` into its
 * own serverless function and this project is already at the plan's cap
 * (see CLAUDE.md and api/auctions.ts, which folds bids and registrations in
 * the same way). Anything under `api/_lib/` is never routed, so it is free.
 *
 * Dispatch reads `?resource=` from the query string only, never the body, so
 * each branch still consumes its own body normally.
 */
export async function handleEventClosing(req: ApiRequest, res: ApiResponse) {
  try {
    const supabase = assertServiceSupabase();
    const resource = String(req.query?.resource ?? "");

    if (req.method === "GET") {
      const eventId = String(req.query?.eventId ?? "");
      if (!eventId) {
        sendJson(res, 400, { error: "eventId is required" });
        return;
      }
      await sendClosingPayload(supabase, req, res, eventId);
      return;
    }

    // Every write needs a verified identity. Which identity is enough
    // differs per resource: the closing note and the gallery are committee
    // work, a review is the reviewer's own.
    const { appUser } = await requireAppUser(req);
    const body = (await getRequestBody(req)) as Record<string, unknown>;

    if (resource === "feedback") {
      await handleFeedbackWrite(supabase, req, res, appUser.id, body);
      return;
    }

    if (resource === "gallery") {
      await handleGalleryWrite(supabase, res, appUser.id, body, String(req.method));
      return;
    }

    await handleClosingWrite(supabase, res, appUser.id, body, String(req.method));
  } catch (error) {
    handleApiError(res, error);
  }
}

/** The signed-in app user, or null when the request carries no token.
 *  Reading the closing page is public; only "my review" needs the identity. */
async function optionalAppUser(req: ApiRequest) {
  const authHeader = String(req.headers.authorization ?? "");
  if (!authHeader.startsWith("Bearer ")) return null;
  try {
    const { appUser } = await requireAppUser(req);
    return appUser;
  } catch (error) {
    console.warn("Ignoring an unreadable token on a public closing read:", error);
    return null;
  }
}

export type PrasadCredit = {
  /** ISO date of the slot, so the client can label it "Day 3" itself. */
  date: string;
  slot: string;
  item: string;
  /** Who arranged this one. Names only - see the privacy note below. */
  sponsors: string[];
};

/** The order a day actually runs in, mirroring slotRank in src/lib/prasad.ts. */
const slotOrder: Record<string, number> = {
  "early morning": 0,
  morning: 1,
  "late morning": 2,
  noon: 3,
  afternoon: 4,
  evening: 5,
  night: 6,
};

const slotRank = (label: string) => slotOrder[label.trim().toLowerCase()] ?? 10;

/**
 * What each prasad was, and who arranged it, in the sequence it was served.
 *
 * Read here rather than through /api/event-schedule?resource=prasad because
 * that route answers to the admin's visibility for the Prasad page (which
 * seeds `restricted`) while the closing page is public. This is the
 * names-only slice of the same data, with the flat numbers left behind -
 * exactly the line the prasad route already draws for a signed-out visitor.
 *
 * The credits name the prasad and its slot, not just the sponsor, because
 * "Sharma family" on its own says nothing about what they actually did;
 * "Day 3, Morning - modak" does.
 *
 * Degrades the way every prasad read does: before migration 019 the two old
 * free-text columns are the only people a row carries, and both of them meant
 * "who arranged it". If neither read works, the credits simply have no prasad
 * group rather than the whole closing page failing over it.
 */
async function fetchPrasadCredits(supabase: Supabase, eventId: string): Promise<PrasadCredit[]> {
  const rich = await supabase
    .from("prasad_items")
    .select("prasad_date,slot,item,arrangers")
    .eq("event_id", eventId);

  let rows: Array<Record<string, unknown>> = [];
  if (!rich.error) {
    rows = (rich.data ?? []) as unknown as Array<Record<string, unknown>>;
  } else {
    console.warn("Falling back to the pre-019 prasad columns for the closing credits:", rich.error.message);
    const legacy = await supabase
      .from("prasad_items")
      .select("prasad_date,slot,item,sponsor_contributor,arranged_by")
      .eq("event_id", eventId);
    if (legacy.error) {
      console.warn("Skipping prasad sponsors in the closing credits:", legacy.error.message);
      return [];
    }
    rows = (legacy.data ?? []) as unknown as Array<Record<string, unknown>>;
  }

  return rows
    .map((row) => {
      const sponsors = Array.isArray(row.arrangers)
        ? (row.arrangers as Array<{ name?: unknown }>).map((person) => String(person?.name ?? ""))
        : [String(row.sponsor_contributor ?? ""), String(row.arranged_by ?? "")];
      return {
        date: String(row.prasad_date ?? ""),
        slot: String(row.slot ?? "").trim(),
        item: String(row.item ?? "").trim(),
        sponsors: asNames(sponsors),
      };
    })
    .filter((entry) => entry.sponsors.length)
    .sort(
      (left, right) =>
        left.date.localeCompare(right.date) ||
        slotRank(left.slot) - slotRank(right.slot) ||
        left.slot.localeCompare(right.slot) ||
        left.item.localeCompare(right.item),
    );
}

/**
 * The event's closing row, with the credit lists 020 adds when they exist.
 *
 * Read degrades, write says so - the same shape as every other migration in
 * this repo. `ready` is false when the four columns are missing, which is
 * what turns the page's credits editor off rather than letting a save 501.
 */
async function fetchClosingRow(supabase: Supabase, eventId: string) {
  const rich = await supabase.from("event_closing").select(CLOSING_COLUMNS).eq("event_id", eventId).maybeSingle();
  if (!isMissingCreditColumns(rich.error)) {
    if (rich.error) throw rich.error;
    return { row: (rich.data ?? {}) as Record<string, unknown>, ready: true };
  }

  console.warn(`event_closing is missing its credit columns. Run ${CREDITS_MIGRATION}.`);
  const plain = await supabase
    .from("event_closing")
    .select(CLOSING_COLUMNS_LEGACY)
    .eq("event_id", eventId)
    .maybeSingle();
  if (plain.error) throw plain.error;
  return { row: (plain.data ?? {}) as Record<string, unknown>, ready: false };
}

async function sendClosingPayload(supabase: Supabase, req: ApiRequest, res: ApiResponse, eventId: string) {
  const viewer = await optionalAppUser(req);

  const [closingRow, galleryResult, feedbackResult, membersResult, tasksResult, scheduleResult, prasad] =
    await Promise.all([
      fetchClosingRow(supabase, eventId),
      supabase
        .from("event_gallery_photos")
        .select("id,image_url,caption,album,sort_order,created_at")
        .eq("event_id", eventId)
        .order("album", { ascending: true })
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true }),
      supabase
        .from("event_feedback")
        .select("id,user_id,rating,comment,created_at,updated_at")
        .eq("event_id", eventId)
        .order("updated_at", { ascending: false }),
      supabase.from("event_members").select("user_id,role").eq("event_id", eventId),
      supabase.from("tasks").select("owner_name").eq("event_id", eventId),
      supabase.from("event_schedule").select("owner_name").eq("event_id", eventId),
      fetchPrasadCredits(supabase, eventId),
    ]);

  if (galleryResult.error) throw galleryResult.error;
  if (feedbackResult.error) throw feedbackResult.error;
  if (membersResult.error) throw membersResult.error;
  if (tasksResult.error) throw tasksResult.error;
  if (scheduleResult.error) throw scheduleResult.error;

  const members = membersResult.data ?? [];
  const feedbackRows = feedbackResult.data ?? [];

  // One lookup covers both the credits list and the review authors. Names
  // only for the credits - no email, no avatar, no role - because this page
  // is public the same way the dashboard is, and the ask was to credit
  // people, not to publish a directory. A review carries its author's avatar
  // because that person chose to post it under their own name.
  const userIds = [...new Set([...members.map((row) => row.user_id), ...feedbackRows.map((row) => row.user_id)])];
  const { data: users, error: usersError } = userIds.length
    ? await supabase.from("app_users").select("id,full_name,email,photo_url").in("id", userIds)
    : { data: [], error: null };
  if (usersError) throw usersError;

  const displayName = (user: { full_name: string | null; email: string } | undefined) =>
    user?.full_name?.trim() || user?.email?.split("@")[0] || "Member";
  const usersById = new Map((users ?? []).map((user) => [user.id, user]));

  // The two hand-kept slices are sent back alongside the merged lists, so the
  // editor knows which names it may remove (its own) and which are derived
  // from a real row and would only come straight back.
  const manualCore = asNames(closingRow.row.extra_core);
  const manualVolunteers = asNames(closingRow.row.extra_volunteers);

  const memberCore = members
    .filter((member) => member.role === "admin" || member.role === "committee")
    .map((member) => ({ name: displayName(usersById.get(member.user_id)), role: member.role }))
    .sort((a, b) => (a.role === b.role ? a.name.localeCompare(b.name) : a.role === "admin" ? -1 : 1))
    .map((member) => member.name);

  // Admins-first, then alphabetical, is only the starting order: whatever the
  // committee arranged for itself wins over it.
  const core = inStoredOrder(withExtras(asNames(memberCore), manualCore), asNames(closingRow.row.core_order));

  // Volunteers are the people who actually owned something - a task or a
  // slot on the schedule - plus anybody added by hand. Names only; the tables
  // hold nothing else. Alphabetical, because no ordering means anything here.
  const volunteers = withExtras(
    asNames([...(tasksResult.data ?? []), ...(scheduleResult.data ?? [])].map((row) => String(row.owner_name ?? ""))),
    manualVolunteers,
  ).sort((a, b) => a.localeCompare(b));

  const reviews = feedbackRows.map((row) => ({
    id: row.id,
    rating: Number(row.rating),
    comment: row.comment ?? "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    isMine: Boolean(viewer && row.user_id === viewer.id),
    author: {
      name: displayName(usersById.get(row.user_id)),
      photoUrl: usersById.get(row.user_id)?.photo_url ?? null,
    },
  }));

  const distribution = [1, 2, 3, 4, 5].map((stars) => ({
    stars,
    count: reviews.filter((review) => review.rating === stars).length,
  }));
  const average = reviews.length
    ? reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length
    : 0;

  sendJson(res, 200, {
    closing: {
      event_id: eventId,
      headline: String(closingRow.row.headline ?? ""),
      message: String(closingRow.row.message ?? ""),
      is_closed: Boolean(closingRow.row.is_closed),
      closed_at: (closingRow.row.closed_at as string | null) ?? null,
      updated_at: (closingRow.row.updated_at as string | null) ?? null,
    },
    credits: {
      core,
      volunteers,
      prasad,
      shoutouts: asShoutouts(closingRow.row.shoutouts),
      manual: { core: manualCore, volunteers: manualVolunteers },
      // False until 020 is run: the lists above are derived-only and the
      // page says so instead of offering an editor whose save would 501.
      editable: closingRow.ready,
    },
    gallery: galleryResult.data ?? [],
    feedback: {
      average,
      count: reviews.length,
      distribution,
      reviews,
      mine: reviews.find((review) => review.isMine) ?? null,
    },
  });
}

async function handleClosingWrite(
  supabase: Supabase,
  res: ApiResponse,
  userId: string,
  body: Record<string, unknown>,
  method: string,
) {
  const eventId = String(body.eventId ?? "");
  if (!eventId) {
    sendJson(res, 400, { error: "eventId is required" });
    return;
  }
  await requireEventCommittee(eventId, userId);

  if (method !== "POST" && method !== "PATCH") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  const updates: Record<string, unknown> = { updated_by: userId, updated_at: new Date().toISOString() };

  if (body.headline !== undefined) updates.headline = String(body.headline).slice(0, 200).trim();
  if (body.message !== undefined) updates.message = String(body.message).slice(0, MAX_MESSAGE).trim();

  if (body.action === "close" || body.action === "reopen") {
    const closing = body.action === "close";
    updates.is_closed = closing;
    updates.closed_at = closing ? new Date().toISOString() : null;
  }

  // The four credit lists 020 adds. Cleaned here rather than trusted: the
  // client sends what its editor collected, and jsonb will store anything.
  const touchesCredits =
    body.extraCore !== undefined ||
    body.extraVolunteers !== undefined ||
    body.coreOrder !== undefined ||
    body.shoutouts !== undefined;

  if (body.extraCore !== undefined) updates.extra_core = asNames(body.extraCore);
  if (body.extraVolunteers !== undefined) updates.extra_volunteers = asNames(body.extraVolunteers);
  if (body.coreOrder !== undefined) updates.core_order = asNames(body.coreOrder);
  if (body.shoutouts !== undefined) updates.shoutouts = asShoutouts(body.shoutouts);

  const { data, error } = await supabase
    .from("event_closing")
    .upsert({ event_id: eventId, ...updates }, { onConflict: "event_id" })
    .select(touchesCredits ? CLOSING_COLUMNS : CLOSING_COLUMNS_LEGACY)
    .single();

  if (error) {
    // Read degrades, write says so: a save carrying credits fails by name
    // when 020 has not been run, rather than appearing to work.
    if (touchesCredits && isMissingCreditColumns(error)) {
      sendJson(res, 501, {
        error: `The credits cannot be saved yet. Run ${CREDITS_MIGRATION} in Supabase, then try again.`,
      });
      return;
    }
    throw error;
  }
  sendJson(res, 200, { closing: data });
}

async function handleGalleryWrite(
  supabase: Supabase,
  res: ApiResponse,
  userId: string,
  body: Record<string, unknown>,
  method: string,
) {
  if (method === "POST") {
    const eventId = String(body.eventId ?? "");
    const imageUrl = String(body.imageUrl ?? "").trim();
    if (!eventId || !imageUrl) {
      sendJson(res, 400, { error: "eventId and imageUrl are required" });
      return;
    }
    await requireEventCommittee(eventId, userId);

    const { data, error } = await supabase
      .from("event_gallery_photos")
      .insert({
        event_id: eventId,
        image_url: imageUrl,
        caption: String(body.caption ?? "").slice(0, MAX_CAPTION).trim(),
        album: String(body.album ?? "").slice(0, MAX_ALBUM).trim(),
        sort_order: Number.isFinite(Number(body.sortOrder)) ? Number(body.sortOrder) : 0,
        created_by: userId,
      })
      .select("id,image_url,caption,album,sort_order,created_at")
      .single();

    if (error) throw error;
    sendJson(res, 201, { photo: data });
    return;
  }

  const photoId = String(body.photoId ?? "");
  if (!photoId) {
    sendJson(res, 400, { error: "photoId is required" });
    return;
  }

  const { data: existing, error: existingError } = await supabase
    .from("event_gallery_photos")
    .select("event_id")
    .eq("id", photoId)
    .single();

  if (existingError) throw existingError;
  await requireEventCommittee(existing.event_id, userId);

  if (method === "DELETE") {
    const { error } = await supabase.from("event_gallery_photos").delete().eq("id", photoId);
    if (error) throw error;
    sendJson(res, 200, { ok: true });
    return;
  }

  if (method !== "PATCH") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  const updates: Record<string, unknown> = {};
  if (body.caption !== undefined) updates.caption = String(body.caption).slice(0, MAX_CAPTION).trim();
  if (body.album !== undefined) updates.album = String(body.album).slice(0, MAX_ALBUM).trim();
  if (body.sortOrder !== undefined && Number.isFinite(Number(body.sortOrder))) {
    updates.sort_order = Number(body.sortOrder);
  }

  const { data, error } = await supabase
    .from("event_gallery_photos")
    .update(updates)
    .eq("id", photoId)
    .select("id,image_url,caption,album,sort_order,created_at")
    .single();

  if (error) throw error;
  sendJson(res, 200, { photo: data });
}

/**
 * A review belongs to its author. Any signed-in member of the event can
 * leave one, edit it, or delete it - and can only ever touch their own,
 * because the row is addressed by (event_id, the caller's own user id)
 * rather than by an id the client sends.
 */
async function handleFeedbackWrite(
  supabase: Supabase,
  req: ApiRequest,
  res: ApiResponse,
  userId: string,
  body: Record<string, unknown>,
) {
  const eventId = String(body.eventId ?? "");
  if (!eventId) {
    sendJson(res, 400, { error: "eventId is required" });
    return;
  }

  if (req.method === "DELETE") {
    const { error } = await supabase
      .from("event_feedback")
      .delete()
      .eq("event_id", eventId)
      .eq("user_id", userId);
    if (error) throw error;
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method !== "POST" && req.method !== "PATCH") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  const rating = Number(body.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    sendJson(res, 400, { error: "Pick a rating between 1 and 5 stars" });
    return;
  }

  const { data, error } = await supabase
    .from("event_feedback")
    .upsert(
      {
        event_id: eventId,
        user_id: userId,
        rating,
        comment: String(body.comment ?? "").slice(0, MAX_COMMENT).trim(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "event_id,user_id" },
    )
    .select("id,rating,comment,created_at,updated_at")
    .single();

  if (error) throw error;
  sendJson(res, 200, { review: data });
}
