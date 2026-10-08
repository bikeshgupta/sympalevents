import {
  canSeeResults,
  isClosed,
  MAX_ANSWER,
  MAX_PENDING_PER_PERSON,
  MAX_QUESTION,
  MIN_QUESTION,
  readPayload,
  tally,
  type PollPayload,
} from "./announcement-payload.js";
import { audit } from "./audit.js";
import { resolvePageAccess } from "./page-visibility.js";
import { assertServiceSupabase, getRequestBody, optionalAppUser, requireAppUser, sendJson } from "./server.js";

/**
 * What people do with a poll or an ask-me-anything: read the results, vote,
 * ask, upvote, and (for an organiser) approve, answer or hide a question.
 *
 * Dispatched from `handleAnnouncements` when the request carries `?part=`, on
 * the same `?resource=announcements` route, so none of it costs a function.
 *
 *   GET   part=poll&id=             options, and the counts if this viewer may see them
 *   POST  part=vote      { id, optionId }
 *   GET   part=questions&id=        the questions this viewer may see
 *   POST  part=question  { id, body, anonymous }
 *   POST  part=upvote    { questionId }       toggles
 *   PATCH part=question  { questionId, action: approve | hide | answer, answer }
 *
 * ## Who
 *
 * Reading follows the dashboard: anybody who may open it. Voting, asking and
 * upvoting need a signed-in account - one per Google account, which is the
 * limit of what "one person, one vote" can mean without a resident roll; the
 * poll says "signed-in", never "residents". Moderating needs edit access to
 * the dashboard, the same rule as writing the post.
 *
 * ## What is never sent
 *
 * Who voted for what. Results are counts; the vote rows are read only to count
 * them and to tell one person which option is theirs. A question's author is
 * named only when they chose not to be anonymous - and never by flat, because
 * this is a public page.
 */

type ApiRequest = {
  method?: string;
  body?: unknown;
  query?: Record<string, unknown>;
  headers: { authorization?: string };
};
type ApiResponse = Parameters<typeof sendJson>[0];

const interactiveMigration =
  "Polls and questions need supabase/migrations/036_polls_and_questions.sql (after 034). Run it, then try again.";

function fail(message: string, statusCode: number): never {
  throw Object.assign(new Error(message), { statusCode });
}

function missing(error: { code?: string; message?: string } | null) {
  if (!error) return;
  if (["42P01", "PGRST205", "42703", "PGRST204"].includes(error.code ?? "")) fail(interactiveMigration, 501);
  throw error;
}

type PostRow = {
  id: string;
  event_id: string;
  kind: string;
  status: string;
  title: string;
  payload: unknown;
};

async function loadPost(id: string, kind: "poll" | "ask"): Promise<PostRow> {
  if (!id) fail("id is required", 400);
  const supabase = assertServiceSupabase();
  const { data, error } = await supabase
    .from("event_announcements")
    .select("id,event_id,kind,status,title,payload")
    .eq("id", id)
    .maybeSingle();
  missing(error);
  if (!data) fail("That post no longer exists", 404);
  const post = data as PostRow;
  if (post.kind !== kind) fail(kind === "poll" ? "That is not a poll" : "That is not an ask-me-anything", 400);
  return post;
}

/** Who this is, for this post's event. A draft is invisible to anybody who
 *  cannot edit it, answered the same way as one that does not exist. */
async function accessFor(post: PostRow, viewerId: string | null) {
  const access = await resolvePageAccess(post.event_id, viewerId, "dashboard");
  if (!access.canView) fail("You cannot open this event", viewerId ? 403 : 401);
  if (post.status === "draft" && !access.canEdit) fail("That post no longer exists", 404);
  return { isEditor: access.canEdit };
}

async function readBody(req: ApiRequest) {
  const body = await getRequestBody(req);
  return (body ?? {}) as Record<string, unknown>;
}

// ---- polls ----------------------------------------------------------------

async function pollResult(post: PostRow, viewerId: string | null, isEditor: boolean) {
  const supabase = assertServiceSupabase();
  const payload = readPayload("poll", post.payload) as unknown as PollPayload;

  const { data, error } = await supabase
    .from("announcement_poll_votes")
    .select("option_id,user_id")
    .eq("announcement_id", post.id);
  missing(error);

  const rows = (data ?? []) as { option_id: string; user_id: string }[];
  const mine = viewerId ? rows.find((row) => row.user_id === viewerId)?.option_id ?? null : null;
  const closed = isClosed(payload);
  const visible = canSeeResults(payload.showResults, { isEditor, hasVoted: mine !== null, closed });
  const counts = tally(payload.options, rows.map((row) => row.option_id));

  return {
    options: counts.options.map((option) => ({
      id: option.id,
      label: option.label,
      // Withheld, not merely not drawn: a number hidden by the page is still in
      // the response for anybody who opens the network tab.
      votes: visible ? option.votes : null,
    })),
    total: visible ? counts.total : null,
    myVote: mine,
    canSeeResults: visible,
    showResults: payload.showResults,
    closesAt: payload.closesAt,
    closed,
  };
}

async function readPoll(req: ApiRequest, res: ApiResponse) {
  const viewer = await optionalAppUser(req);
  const post = await loadPost(String(req.query?.id ?? ""), "poll");
  const { isEditor } = await accessFor(post, viewer?.id ?? null);
  sendJson(res, 200, await pollResult(post, viewer?.id ?? null, isEditor));
}

async function castVote(req: ApiRequest, res: ApiResponse) {
  const { appUser } = await requireAppUser(req);
  const body = await readBody(req);
  const post = await loadPost(String(body.id ?? ""), "poll");
  const { isEditor } = await accessFor(post, appUser.id);

  const payload = readPayload("poll", post.payload) as unknown as PollPayload;
  if (isClosed(payload)) fail("Voting on this poll has closed", 409);

  const optionId = String(body.optionId ?? "");
  if (!payload.options.some((option) => option.id === optionId)) fail("That is not one of the options", 400);

  const supabase = assertServiceSupabase();
  // The primary key is (poll, person): this is a vote, or a change of mind.
  const { error } = await supabase
    .from("announcement_poll_votes")
    .upsert(
      { announcement_id: post.id, user_id: appUser.id, option_id: optionId, updated_at: new Date().toISOString() },
      { onConflict: "announcement_id,user_id" },
    );
  missing(error);

  sendJson(res, 200, await pollResult(post, appUser.id, isEditor));
}

// ---- questions --------------------------------------------------------------

type QuestionRow = {
  id: string;
  announcement_id: string;
  event_id: string;
  user_id: string | null;
  body: string;
  anonymous: boolean;
  status: "pending" | "approved" | "answered" | "hidden";
  answer: string | null;
  answered_at: string | null;
  created_at: string;
};

async function readQuestions(req: ApiRequest, res: ApiResponse) {
  const viewer = await optionalAppUser(req);
  const viewerId = viewer?.id ?? null;
  const post = await loadPost(String(req.query?.id ?? ""), "ask");
  const { isEditor } = await accessFor(post, viewerId);
  const supabase = assertServiceSupabase();

  const { data, error } = await supabase
    .from("announcement_questions")
    .select("id,announcement_id,event_id,user_id,body,anonymous,status,answer,answered_at,created_at")
    .eq("announcement_id", post.id)
    .order("created_at", { ascending: false })
    .limit(200);
  missing(error);

  // Everybody sees what an organiser has let through. The asker also sees their
  // own while it waits - otherwise a question seems to vanish after it is sent.
  // An organiser sees what waits, which is what they came to act on. A hidden
  // question is nobody's to see: it was refused.
  const visible = ((data ?? []) as QuestionRow[]).filter((row) => {
    if (row.status === "hidden") return false;
    if (row.status === "approved" || row.status === "answered") return true;
    return isEditor || (viewerId !== null && row.user_id === viewerId);
  });

  const ids = visible.map((row) => row.id);
  const votes = ids.length
    ? await supabase.from("announcement_question_votes").select("question_id,user_id").in("question_id", ids)
    : { data: [], error: null };
  missing(votes.error);
  const upvotes = new Map<string, { count: number; mine: boolean }>();
  for (const vote of (votes.data ?? []) as { question_id: string; user_id: string }[]) {
    const entry = upvotes.get(vote.question_id) ?? { count: 0, mine: false };
    entry.count += 1;
    if (viewerId && vote.user_id === viewerId) entry.mine = true;
    upvotes.set(vote.question_id, entry);
  }

  // A name only where the asker chose to give one.
  const named = [...new Set(visible.filter((row) => !row.anonymous && row.user_id).map((row) => row.user_id as string))];
  const names = new Map<string, string>();
  if (named.length) {
    const { data: people } = await supabase.from("app_users").select("id,full_name").in("id", named);
    for (const person of (people ?? []) as { id: string; full_name: string | null }[]) {
      if (person.full_name) names.set(person.id, person.full_name);
    }
  }

  const payload = readPayload("ask", post.payload) as { closesAt: string | null };
  const questions = visible
    .map((row) => ({
      id: row.id,
      body: row.body,
      status: row.status,
      answer: row.answer,
      answeredAt: row.answered_at,
      askedBy: !row.anonymous && row.user_id ? names.get(row.user_id) ?? null : null,
      mine: viewerId !== null && row.user_id === viewerId,
      upvotes: upvotes.get(row.id)?.count ?? 0,
      iUpvoted: upvotes.get(row.id)?.mine ?? false,
      createdAt: row.created_at,
    }))
    // Waiting first (it is what an organiser acts on), then the most upvoted,
    // then the newest.
    .sort((a, b) => {
      const rank = (status: string) => (status === "pending" ? 0 : 1);
      if (rank(a.status) !== rank(b.status)) return rank(a.status) - rank(b.status);
      if (a.upvotes !== b.upvotes) return b.upvotes - a.upvotes;
      return b.createdAt.localeCompare(a.createdAt);
    });

  sendJson(res, 200, {
    questions,
    canModerate: isEditor,
    closesAt: payload.closesAt,
    closed: isClosed(payload),
    pending: isEditor ? questions.filter((q) => q.status === "pending").length : 0,
  });
}

async function askQuestion(req: ApiRequest, res: ApiResponse) {
  const { appUser } = await requireAppUser(req);
  const body = await readBody(req);
  const post = await loadPost(String(body.id ?? ""), "ask");
  const { isEditor } = await accessFor(post, appUser.id);
  if (post.status !== "published" && !isEditor) fail("That post no longer exists", 404);

  const payload = readPayload("ask", post.payload) as { closesAt: string | null };
  if (isClosed(payload)) fail("Questions are closed", 409);

  const text = String(body.body ?? "").replace(/\s+/g, " ").trim();
  if (text.length < MIN_QUESTION) fail("Write your question first", 400);
  if (text.length > MAX_QUESTION) fail(`Keep it under ${MAX_QUESTION} characters`, 400);

  const supabase = assertServiceSupabase();
  if (!isEditor) {
    const pending = await supabase
      .from("announcement_questions")
      .select("id", { count: "exact", head: true })
      .eq("announcement_id", post.id)
      .eq("user_id", appUser.id)
      .eq("status", "pending");
    missing(pending.error);
    if ((pending.count ?? 0) >= MAX_PENDING_PER_PERSON) {
      fail("You already have questions waiting for the organisers. Please wait for those to be answered.", 429);
    }
  }

  const { data, error } = await supabase
    .from("announcement_questions")
    .insert({
      announcement_id: post.id,
      event_id: post.event_id,
      user_id: appUser.id,
      body: text,
      // Anonymous unless they say otherwise: the name is what is sensitive.
      anonymous: body.anonymous !== false,
      // An organiser's own question needs nobody's approval.
      status: isEditor ? "approved" : "pending",
    })
    .select("id,status")
    .single();
  missing(error);

  audit(req, {
    action: "create",
    entityType: "announcement_question",
    entityId: (data as { id: string }).id,
    eventId: post.event_id,
    actor: { id: appUser.id },
    summary: `Asked a question on "${post.title}"`,
  });
  sendJson(res, 200, { id: (data as { id: string }).id, status: (data as { status: string }).status });
}

async function toggleUpvote(req: ApiRequest, res: ApiResponse) {
  const { appUser } = await requireAppUser(req);
  const body = await readBody(req);
  const questionId = String(body.questionId ?? "");
  if (!questionId) fail("questionId is required", 400);

  const supabase = assertServiceSupabase();
  const found = await supabase
    .from("announcement_questions")
    .select("id,announcement_id,status")
    .eq("id", questionId)
    .maybeSingle();
  missing(found.error);
  const question = found.data as { id: string; announcement_id: string; status: string } | null;
  if (!question || !["approved", "answered"].includes(question.status)) fail("That question is not open for votes", 404);

  const post = await loadPost(question.announcement_id, "ask");
  await accessFor(post, appUser.id);

  const existing = await supabase
    .from("announcement_question_votes")
    .select("question_id")
    .eq("question_id", questionId)
    .eq("user_id", appUser.id)
    .maybeSingle();
  missing(existing.error);

  if (existing.data) {
    const { error } = await supabase
      .from("announcement_question_votes")
      .delete()
      .eq("question_id", questionId)
      .eq("user_id", appUser.id);
    missing(error);
  } else {
    const { error } = await supabase
      .from("announcement_question_votes")
      .insert({ question_id: questionId, user_id: appUser.id });
    missing(error);
  }

  const count = await supabase
    .from("announcement_question_votes")
    .select("question_id", { count: "exact", head: true })
    .eq("question_id", questionId);
  missing(count.error);
  sendJson(res, 200, { upvotes: count.count ?? 0, iUpvoted: !existing.data });
}

async function moderateQuestion(req: ApiRequest, res: ApiResponse) {
  const { appUser } = await requireAppUser(req);
  const body = await readBody(req);
  const questionId = String(body.questionId ?? "");
  if (!questionId) fail("questionId is required", 400);

  const supabase = assertServiceSupabase();
  const found = await supabase
    .from("announcement_questions")
    .select("id,announcement_id,event_id,status,body")
    .eq("id", questionId)
    .maybeSingle();
  missing(found.error);
  const question = found.data as { id: string; announcement_id: string; event_id: string; status: string; body: string } | null;
  if (!question) fail("That question no longer exists", 404);

  // The event comes from the question's own row, never from the request.
  const access = await resolvePageAccess(question.event_id, appUser.id, "dashboard");
  if (!access.canEdit) fail("You do not have edit access to this event's announcements", 403);

  const action = String(body.action ?? "");
  const update: Record<string, unknown> = {};
  if (action === "approve") {
    if (question.status === "answered") fail("That question is already answered", 409);
    update.status = "approved";
  } else if (action === "hide") {
    update.status = "hidden";
  } else if (action === "answer") {
    const answer = String(body.answer ?? "").replace(/\r\n/g, "\n").trim();
    if (!answer) fail("Write the answer first", 400);
    if (answer.length > MAX_ANSWER) fail(`Keep the answer under ${MAX_ANSWER} characters`, 400);
    update.status = "answered";
    update.answer = answer;
    update.answered_by = appUser.id;
    update.answered_at = new Date().toISOString();
  } else {
    fail("Unknown action", 400);
  }

  const { error } = await supabase.from("announcement_questions").update(update).eq("id", questionId);
  missing(error);

  audit(req, {
    action: action === "answer" ? "answer" : action,
    entityType: "announcement_question",
    entityId: questionId,
    eventId: question.event_id,
    actor: { id: appUser.id },
    before: { status: question.status },
    after: update,
    summary: `${action === "answer" ? "Answered" : action === "approve" ? "Approved" : "Hid"} a question: "${question.body.slice(0, 60)}"`,
  });
  sendJson(res, 200, { ok: true, status: update.status });
}

export async function handleAnnouncementInteraction(req: ApiRequest, res: ApiResponse) {
  const part = String(req.query?.part ?? "");
  const method = String(req.method);

  if (part === "poll" && method === "GET") return readPoll(req, res);
  if (part === "vote" && method === "POST") return castVote(req, res);
  if (part === "questions" && method === "GET") return readQuestions(req, res);
  if (part === "question" && method === "POST") return askQuestion(req, res);
  if (part === "upvote" && method === "POST") return toggleUpvote(req, res);
  if (part === "question" && method === "PATCH") return moderateQuestion(req, res);

  sendJson(res, 405, { error: "Method not allowed" });
}
