import {
  isSocietyRole,
  lastAdminMessage,
  societyRoleLabels,
  wouldLeaveNoAdmin,
  type SocietyRole,
} from "../../shared/society-members.js";
import { getEventStatus } from "../../shared/event-status.js";
import { audit } from "./audit.js";
import { clearSocietyAdminMemo, requireSocietyAdmin } from "./authority.js";
import { selectDegrading } from "./schema-compat.js";
import { assertServiceSupabase, requireAppUser, sendJson } from "./server.js";

/**
 * Society Management - the private admin area of one society.
 * `/api/events?resource=societies&part=overview|members|access`.
 *
 * EVERY part starts with requireSocietyAdmin(): the caller must be an admin of
 * THIS society. An event admin alone does not pass, and neither does a society
 * committee member. The React route guarding the page is a convenience; this is
 * the control. Nothing here is ever returned to an ordinary resident.
 *
 * What it will not return, on purpose: emails (the roster is for roles, not a
 * directory of contact details) and phone numbers (the profile promises those
 * stay private). A flat/unit IS returned, to society admins only - the profile
 * page says so.
 *
 * Member REMOVAL is not here yet. It has to revoke access without erasing
 * anybody's historical credit, and the closing page's credits are derived from
 * the very rows removal would delete - see docs/society-platform-plan-v2.1.txt.
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

type Supabase = ReturnType<typeof assertServiceSupabase>;

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

const isMissing = (error: { code?: string; message?: string } | null) =>
  Boolean(error && ["42P01", "PGRST205", "42703", "PGRST204"].includes(error.code ?? ""));

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function societyIdFrom(req: ApiRequest, body?: Record<string, unknown>) {
  const value = String(body?.societyId ?? req.query?.societyId ?? "");
  if (!uuidPattern.test(value)) throw fail("A valid society is required", 400);
  return value;
}

/** Every membership of one society. The single read the role rules are applied to. */
async function readMembers(supabase: Supabase, societyId: string) {
  const { data, error } = await supabase
    .from("organization_members")
    .select("user_id,role,created_at")
    .eq("organization_id", societyId);
  if (error) throw error;
  return (data ?? []).map((row) => ({
    userId: row.user_id as string,
    role: row.role as SocietyRole,
    joinedAt: (row.created_at as string | null) ?? null,
  }));
}

/** Names and flats for a set of users - and nothing else about them. */
async function readPeople(supabase: Supabase, userIds: string[]) {
  const people = new Map<string, { name: string; flat: string | null }>();
  if (!userIds.length) return people;
  const result = await selectDegrading("app_users", ["id", "full_name", "flat"], ["id", "full_name"], (select) =>
    supabase.from("app_users").select(select).in("id", userIds),
  );
  if (result.error) throw result.error;
  for (const row of (result.data ?? []) as unknown as Record<string, unknown>[]) {
    const name = String(row.full_name ?? "").trim();
    const flat = String(row.flat ?? "").trim();
    people.set(String(row.id), { name: name || "Member (no name yet)", flat: flat || null });
  }
  return people;
}

async function overview(req: ApiRequest, res: ApiResponse, supabase: Supabase, societyId: string) {
  const societyResult = await supabase
    .from("organizations")
    .select("id,name,slug,city,logo_url,invite_code")
    .eq("id", societyId)
    .maybeSingle();
  if (societyResult.error) throw societyResult.error;
  if (!societyResult.data) throw fail("That society does not exist", 404);

  const members = await readMembers(supabase, societyId);

  const eventsResult = await selectDegrading(
    "events",
    ["id", "start_date", "end_date", "start_time", "end_time", "status_override"],
    ["id", "start_date", "end_date"],
    (select) => supabase.from("events").select(select).eq("organization_id", societyId),
  );
  if (eventsResult.error) throw eventsResult.error;
  const events = (eventsResult.data ?? []) as unknown as Record<string, unknown>[];

  const closedIds = new Set<string>();
  if (events.length) {
    const closing = await supabase
      .from("event_closing")
      .select("event_id,is_closed")
      .in("event_id", events.map((row) => String(row.id)));
    // A society whose closing table is absent simply has nothing closed.
    if (!closing.error) {
      for (const row of closing.data ?? []) if (row.is_closed) closedIds.add(String(row.event_id));
    }
  }

  const tally = { total: events.length, draft: 0, upcoming: 0, live: 0, completed: 0, cancelled: 0 };
  for (const row of events) {
    const status = getEventStatus({
      startDate: String(row.start_date),
      endDate: String(row.end_date),
      startTime: (row.start_time as string | null) ?? null,
      endTime: (row.end_time as string | null) ?? null,
      statusOverride: (row.status_override as "draft" | "cancelled" | null) ?? null,
      isClosed: closedIds.has(String(row.id)),
    });
    tally[status] += 1;
  }

  // Event proposals waiting for this admin. The table arrives with migration
  // 043; until then this is null (not zero - "unknown", not "none"), and the
  // overview draws nothing for it.
  let pendingProposals: number | null = null;
  const proposals = await supabase
    .from("event_proposals")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", societyId)
    .eq("status", "pending");
  if (!proposals.error) pendingProposals = proposals.count ?? 0;
  else if (!isMissing(proposals.error)) throw proposals.error;

  const society = societyResult.data;
  sendJson(res, 200, {
    society: {
      id: society.id,
      name: society.name,
      slug: society.slug ?? null,
      city: society.city ?? "",
      logoUrl: society.logo_url ?? null,
      inviteCode: society.invite_code ?? null,
    },
    members: {
      total: members.length,
      admins: members.filter((member) => member.role === "admin").length,
      committee: members.filter((member) => member.role === "committee").length,
      residents: members.filter((member) => member.role === "read_only").length,
    },
    events: tally,
    pendingProposals,
  });
}

const roleOrder: Record<SocietyRole, number> = { admin: 0, committee: 1, read_only: 2 };

async function listMembers(req: ApiRequest, res: ApiResponse, supabase: Supabase, societyId: string, viewerId: string) {
  const members = await readMembers(supabase, societyId);
  const people = await readPeople(supabase, members.map((member) => member.userId));

  const rows = members
    .map((member) => {
      const person = people.get(member.userId);
      return {
        userId: member.userId,
        name: person?.name ?? "Member (no name yet)",
        // The one private profile field society admins are shown. Phone and
        // email are never put in this response.
        flat: person?.flat ?? null,
        role: member.role,
        joinedAt: member.joinedAt,
        isYou: member.userId === viewerId,
      };
    })
    .sort((a, b) => roleOrder[a.role] - roleOrder[b.role] || a.name.localeCompare(b.name));

  sendJson(res, 200, { members: rows });
}

async function changeRole(req: ApiRequest, res: ApiResponse, supabase: Supabase, societyId: string, actorId: string) {
  const body = await readBody(req);
  const userId = String(body.userId ?? "");
  if (!uuidPattern.test(userId)) throw fail("Choose a member", 400);
  if (!isSocietyRole(body.role)) throw fail("Choose a role", 400);
  const nextRole = body.role;

  const members = await readMembers(supabase, societyId);
  const target = members.find((member) => member.userId === userId);
  if (!target) throw fail("That person is not a member of this society", 404);
  if (target.role === nextRole) {
    sendJson(res, 200, { ok: true, unchanged: true });
    return;
  }

  // The society must always keep an admin - including when an admin demotes
  // themselves. This is the API's check; two admins acting in the same instant
  // can both pass it, which is what migration 042's trigger is for. Society role
  // management is not production-ready until that has been applied.
  if (wouldLeaveNoAdmin(members, userId, nextRole)) throw fail(lastAdminMessage, 409);

  // Conditional on the role we read, so two admins editing the same member get
  // one change and one refusal rather than the last write silently winning.
  const updated = await supabase
    .from("organization_members")
    .update({ role: nextRole })
    .eq("organization_id", societyId)
    .eq("user_id", userId)
    .eq("role", target.role)
    .select("user_id");
  if (updated.error) throw updated.error;
  if (!updated.data?.length) throw fail("That member's role was just changed by somebody else. Reload and try again.", 409);

  // `isSocietyAdminForEvent` is memoised for 15 seconds; a role that just moved
  // must not be answered from a stale yes.
  clearSocietyAdminMemo();

  const people = await readPeople(supabase, [userId]);
  audit(req as never, {
    action: "update",
    entityType: "society_member",
    entityId: userId,
    organizationId: societyId,
    actor: { id: actorId },
    before: { role: target.role },
    after: { role: nextRole },
    summary: `Changed ${people.get(userId)?.name ?? "a member"} from ${societyRoleLabels[target.role]} to ${societyRoleLabels[nextRole]}`,
  });

  sendJson(res, 200, { ok: true });
}

async function addMember(req: ApiRequest, res: ApiResponse, supabase: Supabase, societyId: string, actorId: string) {
  const body = await readBody(req);
  const email = String(body.email ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw fail("Enter the person's email address", 400);
  const role = isSocietyRole(body.role) ? body.role : "read_only";

  const found = await supabase.from("app_users").select("id,full_name").ilike("email", email.replace(/[%_\\]/g, (c) => `\\${c}`)).maybeSingle();
  if (found.error) throw found.error;
  if (!found.data) {
    throw fail(
      "Nobody with that email has signed in to Sympal yet. Ask them to sign in once, or give them the society's invite code.",
      404,
    );
  }

  const existing = await supabase
    .from("organization_members")
    .select("role")
    .eq("organization_id", societyId)
    .eq("user_id", found.data.id)
    .maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data) {
    throw fail(
      `${found.data.full_name || "That person"} is already a member (${societyRoleLabels[existing.data.role as SocietyRole]}). Change their role from the list.`,
      409,
    );
  }

  const inserted = await supabase
    .from("organization_members")
    .insert({ organization_id: societyId, user_id: found.data.id, role });
  if (inserted.error) throw inserted.error;

  clearSocietyAdminMemo();
  audit(req as never, {
    action: "create",
    entityType: "society_member",
    entityId: found.data.id,
    organizationId: societyId,
    actor: { id: actorId },
    after: { role },
    summary: `Added ${found.data.full_name || "a member"} to the society as ${societyRoleLabels[role]}`,
  });

  sendJson(res, 201, { ok: true });
}

/**
 * The society's events at a glance: who runs each, how many pages it has, and
 * where to manage it. Not a second Settings - it links to the real one.
 */
async function eventsAndAccess(req: ApiRequest, res: ApiResponse, supabase: Supabase, societyId: string) {
  const societyResult = await supabase.from("organizations").select("slug").eq("id", societyId).maybeSingle();
  if (societyResult.error) throw societyResult.error;

  const eventsResult = await selectDegrading(
    "events",
    ["id", "name", "slug", "start_date", "end_date", "start_time", "end_time", "status_override"],
    ["id", "name", "start_date", "end_date"],
    (select) =>
      supabase.from("events").select(select).eq("organization_id", societyId).order("start_date", { ascending: false }),
  );
  if (eventsResult.error) throw eventsResult.error;
  const events = (eventsResult.data ?? []) as unknown as Record<string, unknown>[];
  const ids = events.map((row) => String(row.id));

  const roles = new Map<string, { admins: number; committee: number; viewers: number }>();
  const pages = new Map<string, number>();
  const closed = new Set<string>();

  if (ids.length) {
    const [memberRows, pageRows, closingRows] = await Promise.all([
      supabase.from("event_members").select("event_id,role").in("event_id", ids),
      supabase.from("event_page_visibility").select("event_id,is_enabled").in("event_id", ids),
      supabase.from("event_closing").select("event_id,is_closed").in("event_id", ids),
    ]);
    if (memberRows.error) throw memberRows.error;
    for (const row of memberRows.data ?? []) {
      const entry = roles.get(String(row.event_id)) ?? { admins: 0, committee: 0, viewers: 0 };
      if (row.role === "admin") entry.admins += 1;
      else if (row.role === "committee") entry.committee += 1;
      else entry.viewers += 1;
      roles.set(String(row.event_id), entry);
    }
    if (!pageRows.error) {
      for (const row of pageRows.data ?? []) {
        if (row.is_enabled) pages.set(String(row.event_id), (pages.get(String(row.event_id)) ?? 0) + 1);
      }
    }
    if (!closingRows.error) for (const row of closingRows.data ?? []) if (row.is_closed) closed.add(String(row.event_id));
  }

  sendJson(res, 200, {
    societySlug: societyResult.data?.slug ?? null,
    events: events.map((row) => {
      const id = String(row.id);
      const counts = roles.get(id) ?? { admins: 0, committee: 0, viewers: 0 };
      return {
        id,
        name: String(row.name ?? ""),
        slug: (row.slug as string | null) ?? null,
        status: getEventStatus({
          startDate: String(row.start_date),
          endDate: String(row.end_date),
          startTime: (row.start_time as string | null) ?? null,
          endTime: (row.end_time as string | null) ?? null,
          statusOverride: (row.status_override as "draft" | "cancelled" | null) ?? null,
          isClosed: closed.has(id),
        }),
        startDate: String(row.start_date),
        endDate: String(row.end_date),
        admins: counts.admins,
        committee: counts.committee,
        pages: pages.get(id) ?? null,
      };
    }),
  });
}

export async function handleSocietyAdmin(req: ApiRequest, res: ApiResponse) {
  const part = String(req.query?.part ?? "");
  const method = String(req.method);
  const supabase = assertServiceSupabase();
  const { appUser } = await requireAppUser(req);

  // The body carries the society for writes, the query for reads.
  const body = method === "GET" ? undefined : await readBody(req);
  const societyId = societyIdFrom(req, body);
  await requireSocietyAdmin(supabase, societyId, appUser.id);

  if (part === "overview" && method === "GET") return overview(req, res, supabase, societyId);
  if (part === "access" && method === "GET") return eventsAndAccess(req, res, supabase, societyId);
  if (part === "members") {
    if (method === "GET") return listMembers(req, res, supabase, societyId, appUser.id);
    if (method === "PATCH") {
      // The body was already read above; hand it back as the request's body.
      req.body = body;
      return changeRole(req, res, supabase, societyId, appUser.id);
    }
    if (method === "POST") {
      req.body = body;
      return addMember(req, res, supabase, societyId, appUser.id);
    }
  }

  sendJson(res, 405, { error: "Method not allowed" });
}
