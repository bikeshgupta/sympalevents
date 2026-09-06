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

async function sendClosingPayload(supabase: Supabase, req: ApiRequest, res: ApiResponse, eventId: string) {
  const viewer = await optionalAppUser(req);

  const [closingResult, galleryResult, feedbackResult, membersResult, tasksResult, scheduleResult] = await Promise.all([
    supabase
      .from("event_closing")
      .select("event_id,headline,message,is_closed,closed_at,updated_at")
      .eq("event_id", eventId)
      .maybeSingle(),
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
  ]);

  if (closingResult.error) throw closingResult.error;
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

  const core = members
    .filter((member) => member.role === "admin" || member.role === "committee")
    .map((member) => ({ name: displayName(usersById.get(member.user_id)), role: member.role }))
    .sort((a, b) => (a.role === b.role ? a.name.localeCompare(b.name) : a.role === "admin" ? -1 : 1))
    .map((member) => member.name);

  // Volunteers are the people who actually owned something - a task or a
  // slot on the schedule. Names only; the tables hold nothing else.
  const volunteers = [
    ...new Set(
      [...(tasksResult.data ?? []), ...(scheduleResult.data ?? [])]
        .map((row) => String(row.owner_name ?? "").trim())
        .filter(Boolean),
    ),
  ].sort((a, b) => a.localeCompare(b));

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
    closing: closingResult.data ?? {
      event_id: eventId,
      headline: "",
      message: "",
      is_closed: false,
      closed_at: null,
      updated_at: null,
    },
    credits: { core, volunteers },
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

  const { data, error } = await supabase
    .from("event_closing")
    .upsert({ event_id: eventId, ...updates }, { onConflict: "event_id" })
    .select("event_id,headline,message,is_closed,closed_at,updated_at")
    .single();

  if (error) throw error;
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
