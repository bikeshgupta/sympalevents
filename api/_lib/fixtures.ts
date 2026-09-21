import { resolvePageAccess } from "./page-visibility.js";
import { assertServiceSupabase, optionalAppUser, requireAppUser, sendJson } from "./server.js";

/**
 * Teams and fixtures, served from api/event-schedule.ts on
 * `?resource=teams` and `?resource=fixtures`.
 *
 * They live on that route because a fixture is a scheduled thing and because
 * Vercel routes every file directly under api/ as its own function - this
 * project is at the plan's cap, so a new resource folds into a related route
 * instead of becoming a thirteenth file. See CLAUDE.md.
 *
 * View follows the admin's visibility for the `teams` / `fixtures` modules,
 * resolved by the same `resolvePageAccess` the route guard answers to. Every
 * write needs admin or an `edit` grant on that module.
 *
 * The points table is not here. It is derived from these rows in the client
 * (src/lib/fixtures.ts) rather than stored, because a stored standings table
 * is a second copy of the same truth that goes stale the moment a score is
 * corrected.
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

const TEAMS_PAGE = "teams";
const FIXTURES_PAGE = "fixtures";

const MAX_NAME = 60;
const MAX_TEXT = 120;
const MAX_NOTES = 500;
const MAX_MEMBERS = 40;

const fixtureStatuses = new Set(["scheduled", "in_progress", "completed", "cancelled"]);

function fail(message: string, statusCode: number) {
  const error = new Error(message);
  Object.assign(error, { statusCode });
  return error;
}

/**
 * 025 has not been run. Reads come back empty with `ready: false` so the page
 * can name the migration instead of looking broken, and writes say which file
 * to run - the same shape as every other pending migration here.
 */
function isMissingSportsSchema(error: { code?: string; message?: string } | null) {
  return Boolean(
    error &&
      (["42P01", "PGRST205"].includes(error.code ?? "") ||
        error.message?.includes("event_teams") ||
        error.message?.includes("event_fixtures")),
  );
}

function notMigrated(): never {
  throw fail(
    "Teams and fixtures need supabase/migrations/025_sports_fixtures.sql. Run it, then try again.",
    501,
  );
}

function text(value: unknown, max: number) {
  const cleaned = String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned ? cleaned.slice(0, max) : null;
}

function queryValue(req: ApiRequest, key: string) {
  const raw = req.query?.[key];
  return String(Array.isArray(raw) ? raw[0] ?? "" : raw ?? "");
}

async function readBody(req: ApiRequest) {
  if (!req.body) return {} as Record<string, unknown>;
  if (typeof req.body === "string") return JSON.parse(req.body) as Record<string, unknown>;
  return req.body as Record<string, unknown>;
}

/** Squad lists are cleaned server-side; jsonb stores anything. */
function cleanMembers(value: unknown) {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const members: { name: string; unit: string | null }[] = [];

  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const name = text((entry as Record<string, unknown>).name, MAX_NAME);
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const unit = text((entry as Record<string, unknown>).unit, MAX_TEXT);
    members.push({ name, unit: unit ? unit.toUpperCase() : null });
    if (members.length >= MAX_MEMBERS) break;
  }

  return members;
}

async function requireView(eventId: string, req: ApiRequest, pageKey: string) {
  const viewer = await optionalAppUser(req);
  const access = await resolvePageAccess(eventId, viewer?.id ?? null, pageKey);
  if (!access.canView) {
    throw fail(
      viewer ? "You do not have access to this page" : "Sign in to see this page",
      viewer ? 403 : 401,
    );
  }
  return { viewer, access };
}

async function requireEdit(eventId: string, req: ApiRequest, pageKey: string) {
  const { appUser } = await requireAppUser(req);
  const access = await resolvePageAccess(eventId, appUser.id, pageKey);
  if (!access.canEdit) throw fail("You do not have edit access to this page", 403);
  return appUser;
}

// --------------------------------------------------------------------- teams

async function listTeams(eventId: string, req: ApiRequest, res: ApiResponse) {
  const { access } = await requireView(eventId, req, TEAMS_PAGE);
  const supabase = assertServiceSupabase();

  const { data, error } = await supabase
    .from("event_teams")
    .select("id,name,captain_name,unit,members,created_at,updated_at")
    .eq("event_id", eventId)
    .order("name", { ascending: true });

  if (error) {
    if (isMissingSportsSchema(error)) {
      sendJson(res, 200, { teams: [], ready: false, canEdit: access.canEdit });
      return;
    }
    throw error;
  }

  sendJson(res, 200, {
    teams: (data ?? []).map((team) => ({
      id: team.id,
      name: team.name,
      captainName: team.captain_name ?? "",
      unit: team.unit ?? "",
      members: Array.isArray(team.members) ? team.members : [],
      updatedAt: team.updated_at,
    })),
    ready: true,
    canEdit: access.canEdit,
  });
}

async function writeTeam(eventId: string, req: ApiRequest, res: ApiResponse) {
  const appUser = await requireEdit(eventId, req, TEAMS_PAGE);
  const supabase = assertServiceSupabase();
  const body = await readBody(req);

  const name = text(body.name, MAX_NAME);
  if (!name) throw fail("A team needs a name", 400);

  const payload = {
    event_id: eventId,
    name,
    captain_name: text(body.captainName, MAX_NAME),
    unit: text(body.unit, MAX_TEXT),
    members: cleanMembers(body.members),
    updated_at: new Date().toISOString(),
  };

  const id = String(body.id ?? "");
  const result = id
    ? await supabase
        .from("event_teams")
        .update(payload)
        .eq("id", id)
        .eq("event_id", eventId)
        .select("id")
        .single()
    : await supabase
        .from("event_teams")
        .insert({ ...payload, created_by: appUser.id })
        .select("id")
        .single();

  if (result.error) {
    if (isMissingSportsSchema(result.error)) notMigrated();
    // The case-insensitive unique index in 025.
    if (result.error.code === "23505") {
      throw fail(`There is already a team called ${name}. Open that one instead of adding a second.`, 409);
    }
    throw result.error;
  }

  sendJson(res, id ? 200 : 201, { teamId: result.data.id });
}

async function deleteTeam(eventId: string, req: ApiRequest, res: ApiResponse) {
  await requireEdit(eventId, req, TEAMS_PAGE);
  const supabase = assertServiceSupabase();
  const id = queryValue(req, "id");
  if (!id) throw fail("id is required", 400);

  // The fixture keeps its row and loses the side, rather than disappearing
  // with the team - `on delete set null` in 025. A match that was played
  // happened, whoever has since left.
  const { error } = await supabase.from("event_teams").delete().eq("id", id).eq("event_id", eventId);
  if (error) {
    if (isMissingSportsSchema(error)) notMigrated();
    throw error;
  }

  sendJson(res, 200, { deleted: true });
}

// ------------------------------------------------------------------ fixtures

async function listFixtures(eventId: string, req: ApiRequest, res: ApiResponse) {
  const { access } = await requireView(eventId, req, FIXTURES_PAGE);
  const supabase = assertServiceSupabase();

  const { data, error } = await supabase
    .from("event_fixtures")
    .select(
      "id,stage,round_number,home_team_id,away_team_id,home_label,away_label,scheduled_at,venue,home_score,away_score,winner_team_id,is_draw,status,notes",
    )
    .eq("event_id", eventId)
    .order("scheduled_at", { ascending: true, nullsFirst: false });

  if (error) {
    if (isMissingSportsSchema(error)) {
      sendJson(res, 200, { fixtures: [], ready: false, canEdit: access.canEdit });
      return;
    }
    throw error;
  }

  sendJson(res, 200, {
    fixtures: (data ?? []).map((fixture) => ({
      id: fixture.id,
      stage: fixture.stage ?? "",
      roundNumber: fixture.round_number ?? null,
      homeTeamId: fixture.home_team_id ?? null,
      awayTeamId: fixture.away_team_id ?? null,
      homeLabel: fixture.home_label ?? "",
      awayLabel: fixture.away_label ?? "",
      scheduledAt: fixture.scheduled_at ?? null,
      venue: fixture.venue ?? "",
      homeScore: fixture.home_score ?? "",
      awayScore: fixture.away_score ?? "",
      winnerTeamId: fixture.winner_team_id ?? null,
      isDraw: Boolean(fixture.is_draw),
      status: fixture.status ?? "scheduled",
      notes: fixture.notes ?? "",
    })),
    ready: true,
    canEdit: access.canEdit,
  });
}

async function writeFixture(eventId: string, req: ApiRequest, res: ApiResponse) {
  const appUser = await requireEdit(eventId, req, FIXTURES_PAGE);
  const supabase = assertServiceSupabase();
  const body = await readBody(req);

  const status = String(body.status ?? "scheduled");
  if (!fixtureStatuses.has(status)) throw fail("That is not a fixture status", 400);

  const homeTeamId = String(body.homeTeamId ?? "") || null;
  const awayTeamId = String(body.awayTeamId ?? "") || null;

  if (homeTeamId && awayTeamId && homeTeamId === awayTeamId) {
    throw fail("A team cannot play itself", 400);
  }

  const winnerTeamId = String(body.winnerTeamId ?? "") || null;
  const isDraw = body.isDraw === true;

  if (winnerTeamId && isDraw) throw fail("A match is either drawn or won, not both", 400);
  if (winnerTeamId && winnerTeamId !== homeTeamId && winnerTeamId !== awayTeamId) {
    throw fail("The winner has to be one of the two sides", 400);
  }

  const payload = {
    event_id: eventId,
    stage: text(body.stage, MAX_TEXT),
    round_number: Number.isFinite(Number(body.roundNumber)) && body.roundNumber !== null && body.roundNumber !== ""
      ? Number(body.roundNumber)
      : null,
    home_team_id: homeTeamId,
    away_team_id: awayTeamId,
    // Only worth keeping while the side is genuinely unknown; once a team is
    // picked the label would just contradict it.
    home_label: homeTeamId ? null : text(body.homeLabel, MAX_TEXT),
    away_label: awayTeamId ? null : text(body.awayLabel, MAX_TEXT),
    scheduled_at: body.scheduledAt ? new Date(String(body.scheduledAt)).toISOString() : null,
    venue: text(body.venue, MAX_TEXT),
    home_score: text(body.homeScore, MAX_TEXT),
    away_score: text(body.awayScore, MAX_TEXT),
    winner_team_id: winnerTeamId,
    is_draw: isDraw,
    status,
    notes: text(body.notes, MAX_NOTES),
    updated_at: new Date().toISOString(),
  };

  const id = String(body.id ?? "");
  const result = id
    ? await supabase
        .from("event_fixtures")
        .update(payload)
        .eq("id", id)
        .eq("event_id", eventId)
        .select("id")
        .single()
    : await supabase
        .from("event_fixtures")
        .insert({ ...payload, created_by: appUser.id })
        .select("id")
        .single();

  if (result.error) {
    if (isMissingSportsSchema(result.error)) notMigrated();
    throw result.error;
  }

  sendJson(res, id ? 200 : 201, { fixtureId: result.data.id });
}

async function deleteFixture(eventId: string, req: ApiRequest, res: ApiResponse) {
  await requireEdit(eventId, req, FIXTURES_PAGE);
  const supabase = assertServiceSupabase();
  const id = queryValue(req, "id");
  if (!id) throw fail("id is required", 400);

  const { error } = await supabase.from("event_fixtures").delete().eq("id", id).eq("event_id", eventId);
  if (error) {
    if (isMissingSportsSchema(error)) notMigrated();
    throw error;
  }

  sendJson(res, 200, { deleted: true });
}

// -------------------------------------------------------------------- router

export async function handleSports(req: ApiRequest, res: ApiResponse) {
  const resource = queryValue(req, "resource");
  const eventId = queryValue(req, "eventId");
  if (!eventId) {
    sendJson(res, 400, { error: "eventId is required" });
    return;
  }

  const isTeams = resource === "teams";
  const method = String(req.method);

  if (method === "GET") {
    await (isTeams ? listTeams(eventId, req, res) : listFixtures(eventId, req, res));
    return;
  }
  if (method === "POST" || method === "PATCH") {
    await (isTeams ? writeTeam(eventId, req, res) : writeFixture(eventId, req, res));
    return;
  }
  if (method === "DELETE") {
    await (isTeams ? deleteTeam(eventId, req, res) : deleteFixture(eventId, req, res));
    return;
  }

  sendJson(res, 405, { error: "Method not allowed" });
}
