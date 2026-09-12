import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useSession } from "@/lib/auth";

/**
 * The Tasks board for one event - see api/tasks.ts for the resource dispatch.
 *
 * Unlike every other screen's data, tasks do **not** come through
 * `useEventData()`. Assignees and comments live in tables with RLS on and zero
 * policies, so the browser's Supabase client cannot read them; the whole board
 * comes from the service-role API instead, which also means the task list is
 * never served to a signed-out visitor.
 */
export type TaskAssignee = {
  userId: string;
  name: string;
  email: string;
  photoUrl: string | null;
  assignedAt: string;
};

export type Task = {
  id: string;
  eventId: string;
  task: string;
  category: string;
  notes: string;
  /** Free-text owner from before assignment existed. Shown only when a task
   *  has no real assignees, so old rows do not read as unowned. */
  ownerName: string;
  priority: TaskPriority;
  startDate: string | null;
  dueDate: string | null;
  status: TaskStatus;
  createdAt: string;
  updatedAt: string;
  assignees: TaskAssignee[];
  commentCount: number;
};

export type TaskMember = {
  userId: string;
  role: string;
  name: string;
  email: string;
  photoUrl: string | null;
};

export type TaskComment = {
  id: string;
  body: string;
  createdAt: string;
  authorId: string;
  authorName: string;
  authorPhotoUrl: string | null;
};

export type TaskStatus = "Not Started" | "In Progress" | "Blocked" | "Completed" | "Cancelled" | "Invalid";
export type TaskPriority = "Critical" | "High" | "Medium" | "Low";

/** "Invalid" needs migration 017. It exists because deleting a task is
 *  admin-only and rare - everyone else retires one by marking it. */
export const taskStatuses: TaskStatus[] = [
  "Not Started",
  "In Progress",
  "Blocked",
  "Completed",
  "Cancelled",
  "Invalid",
];
export const taskPriorities: TaskPriority[] = ["Critical", "High", "Medium", "Low"];

const closedStatuses = new Set<TaskStatus>(["Completed", "Cancelled", "Invalid"]);

/** Everything that is not finished, called off, or marked invalid. */
export function isOpenTask(task: Task) {
  return !closedStatuses.has(task.status);
}

export type TaskInput = {
  task: string;
  category?: string;
  notes?: string;
  ownerName?: string;
  priority: TaskPriority;
  dueDate?: string | null;
  status: TaskStatus;
  assigneeIds: string[];
};

type BoardResponse = {
  tasks: Task[];
  members: TaskMember[];
  me: { id: string; name: string | null; email: string | null };
  access: { role: "admin" | "committee" | "read_only" | null; canManage: boolean; isAdmin: boolean };
  /** False until migration 016 has been run: the list still renders, but
   *  without assignees or comments. The page says so rather than looking
   *  broken. */
  collaborationReady: boolean;
};

export function useTaskBoard(eventId?: string) {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const queryKey = ["task-board", eventId, session?.user.appUserId ?? "guest"];

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["task-board"] }),
      queryClient.invalidateQueries({ queryKey: ["my-tasks"] }),
      // The dashboard's task counts still come from useEventData.
      queryClient.invalidateQueries({ queryKey: ["event-data"] }),
    ]);
  };

  const query = useQuery({
    queryKey,
    enabled: Boolean(eventId && session),
    queryFn: () => apiFetch<BoardResponse>(`/api/tasks?eventId=${encodeURIComponent(eventId!)}`),
    retry: false,
  });

  const create = useMutation({
    mutationFn: (input: TaskInput) => apiFetch<{ taskId: string }>("/api/tasks", { method: "POST", body: { eventId, ...input } }),
    onSuccess: invalidate,
  });

  const update = useMutation({
    mutationFn: ({ taskId, ...input }: Partial<TaskInput> & { taskId: string }) =>
      apiFetch<{ ok: true }>("/api/tasks", { method: "PATCH", body: { taskId, ...input } }),
    onSuccess: invalidate,
  });

  /** Status on its own is the one change an assignee can make without edit
   *  rights, so it is its own mutation rather than a partial update. */
  const setStatus = useMutation({
    mutationFn: ({ taskId, status }: { taskId: string; status: TaskStatus }) =>
      apiFetch<{ ok: true }>("/api/tasks", { method: "PATCH", body: { taskId, status } }),
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: (taskId: string) => apiFetch<{ ok: true }>("/api/tasks", { method: "DELETE", body: { taskId } }),
    onSuccess: invalidate,
  });

  return { query, create, update, setStatus, remove };
}

/** One task's thread. Fetched only when its panel is open - a board of thirty
 *  tasks must not fetch thirty threads to show a count the list already has. */
export function useTaskComments(taskId: string, enabled: boolean) {
  const queryClient = useQueryClient();
  const queryKey = ["task-comments", taskId];

  const query = useQuery({
    queryKey,
    enabled: enabled && Boolean(taskId),
    queryFn: () =>
      apiFetch<{ comments: TaskComment[]; collaborationReady: boolean }>(
        `/api/tasks?resource=comments&taskId=${encodeURIComponent(taskId)}`,
      ),
    retry: false,
  });

  const add = useMutation({
    mutationFn: (body: string) =>
      apiFetch<{ comment: { id: string; createdAt: string } }>("/api/tasks?resource=comments", {
        method: "POST",
        body: { taskId, body },
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey }),
        // The card's comment count lives on the board response.
        queryClient.invalidateQueries({ queryKey: ["task-board"] }),
      ]);
    },
  });

  return { query, add };
}

/** The dashboard's "My Responsibilities" card. */
export function useMyTasks(eventId?: string, enabled = true) {
  const { data: session } = useSession();

  return useQuery({
    queryKey: ["my-tasks", eventId, session?.user.appUserId ?? "guest"],
    enabled: enabled && Boolean(eventId && session),
    queryFn: () => apiFetch<{ tasks: Task[] }>(`/api/tasks?resource=mine&eventId=${encodeURIComponent(eventId!)}`),
    retry: false,
  });
}
