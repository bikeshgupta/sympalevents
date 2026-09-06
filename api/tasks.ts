import { fetchPageVisibility } from "./_lib/page-visibility.js";
import {
  assertServiceSupabase,
  getRequestBody,
  handleApiError,
  requireAppUser,
  sendJson,
} from "./_lib/server.js";

/**
 * Tasks, their assignees, and their comment threads - one function, dispatched
 * on `?resource=`:
 *
 *   GET    /api/tasks?eventId=                  board: tasks + assignees + members
 *   GET    /api/tasks?resource=mine&eventId=    the caller's own tasks (dashboard)
 *   GET    /api/tasks?resource=comments&taskId= one thread
 *   POST   /api/tasks                           create a task
 *   POST   /api/tasks?resource=comments         add a comment
 *   PATCH  /api/tasks                           update a task
 *   DELETE /api/tasks                           delete a task
 *
 * This route replaced api/my-responsibilities.ts rather than joining it,
 * because Vercel routes every file directly under api/ as its own serverless
 * function and this project sits at the plan's cap - see the note in
 * CLAUDE.md. The dashboard's "My Responsibilities" card now reads
 * `?resource=mine` here.
 *
 * Every branch requires a signed-in user. A task list names people and carries
 * their conversation; there is no anonymous read of it, whatever an admin sets
 * the page's visibility to.
 */

const validPriorities = new Set(["Critical", "High", "Medium", "Low"]);
const validStatuses = new Set(["Not Started", "In Progress", "Blocked", "Completed", "Cancelled"]);

const taskColumns =
  "id,event_id,task,category,notes,owner_name,priority,start_date,due_date,status,created_at,updated_at";
// `app_users` is disambiguated by constraint name on purpose: task_assignees
// has *two* foreign keys to it (`user_id` and `assigned_by`), and a bare
// `app_users(...)` embed makes PostgREST answer 300 PGRST201 rather than pick
// one. If the migration's constraint is ever renamed, this string must follow.
const collaborationColumns =
  taskColumns +
  ",task_assignees(user_id,assigned_at,app_users!task_assignees_user_id_fkey(id,full_name,email,photo_url))" +
  ",task_comments(count)";

/** The collaboration tables are missing - migration 016 has not been run. */
function isMissingCollaboration(error: { code?: string; message?: string } | null) {
  if (!error) return false;
  if (["42P01", "PGRST205", "PGRST200"].includes(error.code ?? "")) return true;
  return Boolean(error.message?.includes("task_assignees") || error.message?.includes("task_comments"));
}

function denied(message: string, statusCode = 403) {
  const error = new Error(message);
  Object.assign(error, { statusCode });
  return error;
}

type TaskAccess = {
  role: "admin" | "committee" | "read_only" | null;
  canView: boolean;
  /** Create, edit, delete, assign. Commenting and moving your own task's
   *  status are separate and looser - see the PATCH branch. */
  canManage: boolean;
};

/**
 * Who this signed-in user is on this event's Tasks page.
 *
 * View follows the admin's page visibility exactly as every other page does,
 * with one difference: "public" can never mean anonymous here, and since the
 * caller is already signed in by this point it simply reads as "any signed-in
 * user" - the same as "authenticated".
 */
async function resolveTaskAccess(eventId: string, userId: string): Promise<TaskAccess> {
  const supabase = assertServiceSupabase();
  const [{ data: member, error: memberError }, { data: permission, error: permissionError }, visibility] =
    await Promise.all([
      supabase.from("event_members").select("role").eq("event_id", eventId).eq("user_id", userId).maybeSingle(),
      supabase
        .from("event_page_permissions")
        .select("access_level")
        .eq("event_id", eventId)
        .eq("user_id", userId)
        .eq("page_key", "tasks")
        .maybeSingle(),
      fetchPageVisibility(eventId),
    ]);

  if (memberError) throw memberError;
  if (permissionError) throw permissionError;

  const role = (member?.role ?? null) as TaskAccess["role"];
  const accessLevel = permission?.access_level ?? "none";
  const isAdmin = role === "admin";
  const openToSignedIn = visibility.tasks === "public" || visibility.tasks === "authenticated";

  return {
    role,
    canView: isAdmin || openToSignedIn || accessLevel === "view" || accessLevel === "edit",
    canManage: isAdmin || accessLevel === "edit",
  };
}

async function requireTaskAccess(eventId: string, userId: string, need: "view" | "manage") {
  const access = await resolveTaskAccess(eventId, userId);
  if (!access.canView) throw denied("You do not have access to this event's tasks");
  if (need === "manage" && !access.canManage) {
    throw denied("Only an event admin, or a member with edit access to Tasks, can do that");
  }
  return access;
}

type RawAssignee = {
  user_id: string;
  assigned_at: string;
  app_users: { id: string; full_name: string | null; email: string; photo_url: string | null } | null;
};

function shapeTask(row: Record<string, any>) {
  const assignees = ((row.task_assignees ?? []) as RawAssignee[])
    .map((entry) => ({
      userId: entry.user_id,
      name: entry.app_users?.full_name ?? entry.app_users?.email ?? "Member",
      email: entry.app_users?.email ?? "",
      photoUrl: entry.app_users?.photo_url ?? null,
      assignedAt: entry.assigned_at,
    }))
    .sort((left, right) => left.name.localeCompare(right.name));

  // PostgREST returns an embedded aggregate as [{ count: n }].
  const commentCount = Array.isArray(row.task_comments) ? Number(row.task_comments[0]?.count ?? 0) : 0;

  return {
    id: row.id as string,
    eventId: row.event_id as string,
    task: (row.task as string) ?? "",
    category: (row.category as string) ?? "",
    notes: (row.notes as string) ?? "",
    ownerName: (row.owner_name as string) ?? "",
    priority: (row.priority as string) ?? "Medium",
    startDate: (row.start_date as string) ?? null,
    dueDate: (row.due_date as string) ?? null,
    status: (row.status as string) ?? "Not Started",
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    assignees,
    commentCount,
  };
}

async function fetchTasks(eventId: string) {
  const supabase = assertServiceSupabase();
  const rich = await supabase
    .from("tasks")
    .select(collaborationColumns)
    .eq("event_id", eventId)
    .order("due_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (!isMissingCollaboration(rich.error)) {
    if (rich.error) throw rich.error;
    return { tasks: (rich.data ?? []).map(shapeTask), collaborationReady: true };
  }

  // Migration 016 has not been run. The task list itself is still worth
  // showing, so it degrades to no assignees and no comments rather than to an
  // error page - and the client says so, naming the migration.
  console.warn("task_assignees / task_comments are missing. Run migration 016_task_collaboration.sql.");
  const plain = await supabase
    .from("tasks")
    .select(taskColumns)
    .eq("event_id", eventId)
    .order("due_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (plain.error) throw plain.error;
  return { tasks: (plain.data ?? []).map(shapeTask), collaborationReady: false };
}

/** Everyone on this event, for the assignee picker. Roles are included so an
 *  admin can see who is committee before handing them a task. */
async function fetchAssignableMembers(eventId: string) {
  const supabase = assertServiceSupabase();
  const { data, error } = await supabase
    .from("event_members")
    .select("user_id,role,app_users(id,full_name,email,photo_url)")
    .eq("event_id", eventId);

  if (error) throw error;

  return (data ?? [])
    .map((row: any) => ({
      userId: row.user_id as string,
      role: row.role as string,
      name: row.app_users?.full_name ?? row.app_users?.email ?? "Member",
      email: row.app_users?.email ?? "",
      photoUrl: row.app_users?.photo_url ?? null,
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

function taskPayload(body: Record<string, unknown>) {
  const priority = String(body.priority ?? "Medium");
  const status = String(body.status ?? "Not Started");

  return {
    task: String(body.task ?? "").trim(),
    category: String(body.category ?? ""),
    notes: String(body.notes ?? ""),
    owner_name: String(body.ownerName ?? ""),
    priority: validPriorities.has(priority) ? priority : "Medium",
    due_date: body.dueDate ? String(body.dueDate) : null,
    status: validStatuses.has(status) ? status : "Not Started",
    updated_at: new Date().toISOString(),
  };
}

/** Replaces a task's assignee set wholesale - the picker sends the full list,
 *  so a removal is just an absence rather than its own call. */
async function syncAssignees(taskId: string, userIds: string[], assignedBy: string) {
  const supabase = assertServiceSupabase();
  const wanted = Array.from(new Set(userIds.filter(Boolean)));

  const { data: existing, error: existingError } = await supabase
    .from("task_assignees")
    .select("user_id")
    .eq("task_id", taskId);

  if (isMissingCollaboration(existingError)) {
    throw denied(
      "Assignees cannot be saved yet: the task_assignees table is missing. Run supabase/migrations/016_task_collaboration.sql, then try again.",
      501,
    );
  }
  if (existingError) throw existingError;

  const current = new Set((existing ?? []).map((row) => row.user_id as string));
  const toAdd = wanted.filter((userId) => !current.has(userId));
  const toRemove = [...current].filter((userId) => !wanted.includes(userId));

  if (toRemove.length) {
    const { error } = await supabase.from("task_assignees").delete().eq("task_id", taskId).in("user_id", toRemove);
    if (error) throw error;
  }

  if (toAdd.length) {
    const { error } = await supabase
      .from("task_assignees")
      .insert(toAdd.map((userId) => ({ task_id: taskId, user_id: userId, assigned_by: assignedBy })));
    if (error) throw error;
  }
}

async function taskEventId(taskId: string) {
  const supabase = assertServiceSupabase();
  const { data, error } = await supabase.from("tasks").select("event_id").eq("id", taskId).single();
  if (error) throw error;
  return data.event_id as string;
}

async function isAssignee(taskId: string, userId: string) {
  const supabase = assertServiceSupabase();
  const { data, error } = await supabase
    .from("task_assignees")
    .select("user_id")
    .eq("task_id", taskId)
    .eq("user_id", userId)
    .maybeSingle();

  if (isMissingCollaboration(error)) return false;
  if (error) throw error;
  return Boolean(data);
}

async function fetchComments(taskId: string) {
  const supabase = assertServiceSupabase();
  const { data, error } = await supabase
    .from("task_comments")
    .select("id,task_id,body,created_at,user_id,app_users(id,full_name,email,photo_url)")
    .eq("task_id", taskId)
    .order("created_at", { ascending: true });

  if (isMissingCollaboration(error)) return null;
  if (error) throw error;

  return (data ?? []).map((row: any) => ({
    id: row.id as string,
    body: (row.body as string) ?? "",
    createdAt: row.created_at as string,
    authorId: row.user_id as string,
    authorName: row.app_users?.full_name ?? row.app_users?.email ?? "Member",
    authorPhotoUrl: row.app_users?.photo_url ?? null,
  }));
}

export default async function handler(req: any, res: any) {
  try {
    if (!["GET", "POST", "PATCH", "DELETE"].includes(String(req.method))) {
      sendJson(res, 405, { error: "Method not allowed" });
      return;
    }

    // Sign-in first, on every branch and before anything is read.
    const { appUser } = await requireAppUser(req);
    const resource = String(req.query?.resource ?? "");

    if (req.method === "GET") {
      if (resource === "comments") {
        const taskId = String(req.query?.taskId ?? "");
        if (!taskId) {
          sendJson(res, 400, { error: "taskId is required" });
          return;
        }

        await requireTaskAccess(await taskEventId(taskId), appUser.id, "view");
        const comments = await fetchComments(taskId);
        sendJson(res, 200, { comments: comments ?? [], collaborationReady: comments !== null });
        return;
      }

      const eventId = String(req.query?.eventId ?? "");
      if (!eventId) {
        sendJson(res, 400, { error: "eventId is required" });
        return;
      }

      const access = await requireTaskAccess(eventId, appUser.id, "view");
      const { tasks, collaborationReady } = await fetchTasks(eventId);

      if (resource === "mine") {
        sendJson(res, 200, {
          tasks: tasks.filter(
            (task) => task.status !== "Cancelled" && task.assignees.some((entry) => entry.userId === appUser.id),
          ),
          collaborationReady,
        });
        return;
      }

      sendJson(res, 200, {
        tasks,
        collaborationReady,
        members: access.canManage ? await fetchAssignableMembers(eventId) : [],
        me: { id: appUser.id, name: appUser.full_name ?? appUser.email, email: appUser.email },
        access: { role: access.role, canManage: access.canManage },
      });
      return;
    }

    const body = await getRequestBody(req);

    if (req.method === "POST" && resource === "comments") {
      const taskId = String(body.taskId ?? "");
      const text = String(body.body ?? "").trim();

      if (!taskId || !text) {
        sendJson(res, 400, { error: "taskId and a comment body are required" });
        return;
      }

      // Commenting deliberately needs only view access: the whole point is
      // that an assignee who cannot edit the task can still say something on it.
      await requireTaskAccess(await taskEventId(taskId), appUser.id, "view");

      const supabase = assertServiceSupabase();
      const { data, error } = await supabase
        .from("task_comments")
        .insert({ task_id: taskId, user_id: appUser.id, body: text })
        .select("id,created_at")
        .single();

      if (isMissingCollaboration(error)) {
        throw denied(
          "Comments cannot be saved yet: the task_comments table is missing. Run supabase/migrations/016_task_collaboration.sql, then try again.",
          501,
        );
      }
      if (error) throw error;

      sendJson(res, 201, { comment: { id: data.id, createdAt: data.created_at } });
      return;
    }

    if (req.method === "POST") {
      const eventId = String(body.eventId ?? "");
      if (!eventId) {
        sendJson(res, 400, { error: "eventId is required" });
        return;
      }

      await requireTaskAccess(eventId, appUser.id, "manage");
      const payload = taskPayload(body);
      if (!payload.task) {
        sendJson(res, 400, { error: "A task title is required" });
        return;
      }

      const supabase = assertServiceSupabase();
      const { data, error } = await supabase
        .from("tasks")
        .insert({ event_id: eventId, ...payload })
        .select("id")
        .single();

      if (error) throw error;

      const assigneeIds = Array.isArray(body.assigneeIds) ? (body.assigneeIds as string[]) : [];
      if (assigneeIds.length) await syncAssignees(data.id, assigneeIds, appUser.id);

      sendJson(res, 201, { taskId: data.id });
      return;
    }

    const taskId = String(body.taskId ?? body.id ?? "");
    if (!taskId) {
      sendJson(res, 400, { error: "taskId is required" });
      return;
    }

    const eventId = await taskEventId(taskId);

    if (req.method === "DELETE") {
      await requireTaskAccess(eventId, appUser.id, "manage");
      const supabase = assertServiceSupabase();
      const { error } = await supabase.from("tasks").delete().eq("id", taskId);
      if (error) throw error;
      sendJson(res, 200, { ok: true });
      return;
    }

    // PATCH. An assignee who cannot manage the task can still move its status
    // - that is the whole point of assigning it to them - but nothing else.
    const access = await requireTaskAccess(eventId, appUser.id, "view");
    const statusOnly = Object.keys(body).every((key) => ["taskId", "id", "status"].includes(key));
    const supabase = assertServiceSupabase();

    if (!access.canManage) {
      if (!statusOnly || !(await isAssignee(taskId, appUser.id))) {
        throw denied("You can only change the status of a task assigned to you");
      }

      const status = String(body.status ?? "");
      if (!validStatuses.has(status)) {
        sendJson(res, 400, { error: "Unknown status" });
        return;
      }

      const { error } = await supabase
        .from("tasks")
        .update({ status, updated_at: new Date().toISOString() })
        .eq("id", taskId);
      if (error) throw error;
      sendJson(res, 200, { ok: true });
      return;
    }

    if (statusOnly && !validStatuses.has(String(body.status ?? ""))) {
      sendJson(res, 400, { error: "Unknown status" });
      return;
    }

    const { error } = await supabase
      .from("tasks")
      .update(
        statusOnly ? { status: String(body.status), updated_at: new Date().toISOString() } : taskPayload(body),
      )
      .eq("id", taskId);
    if (error) throw error;

    if (Array.isArray(body.assigneeIds)) {
      await syncAssignees(taskId, body.assigneeIds as string[], appUser.id);
    }

    sendJson(res, 200, { ok: true });
  } catch (error) {
    handleApiError(res, error);
  }
}
