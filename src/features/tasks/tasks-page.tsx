import { AlertTriangle, CircleCheck, ListChecks, LogIn, Plus, Printer, Timer, UserCheck } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { TasksNoticeDialog } from "@/features/notices/tasks-notice";
import { signInWithGoogle, useSession } from "@/lib/auth";
import { useEventContext } from "@/lib/event-context";
import { useEventData } from "@/lib/event-data";
import { canPrintNotices } from "@/lib/notices";
import { TaskCard } from "@/features/tasks/task-card";
import { TaskFormDialog } from "@/features/tasks/task-form-dialog";
import { isOpenTask, useTaskBoard, type Task, type TaskInput, type TaskMember, type TaskStatus } from "@/lib/tasks";
import { cn } from "@/lib/utils";

/**
 * The task board.
 *
 * Three deliberate shapes here:
 *
 * 1. **Sign-in only.** A task list names people and carries their conversation,
 *    so there is no signed-out view of it at all - not a partial one. The
 *    server enforces the same thing on every branch of /api/tasks.
 * 2. **Yours first.** The first thing a committee member wants on opening this
 *    on a phone is what is on *them*; "Assigned to you" is its own section
 *    above everything else, not a filter they have to find.
 * 3. **Cards, not a table, at every width.** The old table needed a 760px
 *    minimum and horizontal scrolling on a phone. Each card shows what matters
 *    at a glance and hides description, assignees and comments behind one
 *    toggle - see task-card.tsx.
 */

type Filter = "open" | "all" | "done";

const filters: Array<{ key: Filter; label: string }> = [
  { key: "open", label: "Open" },
  { key: "all", label: "All" },
  { key: "done", label: "Done" },
];

function matchesFilter(task: Task, filter: Filter) {
  if (filter === "all") return true;
  if (filter === "done") return !isOpenTask(task);
  return isOpenTask(task);
}

function matchesSearch(task: Task, term: string) {
  if (!term) return true;
  const haystack = [task.task, task.category, task.notes, task.ownerName, ...task.assignees.map((entry) => entry.name)]
    .join(" ")
    .toLowerCase();
  return haystack.includes(term);
}

/** Critical first, then earliest due date, then oldest - the order someone
 *  working through a list actually wants. Undated tasks sort last. */
const priorityRank: Record<string, number> = { Critical: 0, High: 1, Medium: 2, Low: 3 };

function byUrgency(left: Task, right: Task) {
  const priority = (priorityRank[left.priority] ?? 9) - (priorityRank[right.priority] ?? 9);
  if (priority !== 0) return priority;
  if (left.dueDate && right.dueDate) return left.dueDate.localeCompare(right.dueDate);
  if (left.dueDate) return -1;
  if (right.dueDate) return 1;
  return left.createdAt.localeCompare(right.createdAt);
}

export function TasksPage() {
  const { data: session, isLoading: isSessionLoading } = useSession();
  const { selectedEventId } = useEventContext();
  // Only for the event's name and dates on a printed roster. Called with no
  // options so it shares the layout's cached query rather than starting a
  // second one under a different key.
  const { data } = useEventData();
  const { query, create, update, setStatus, remove } = useTaskBoard(selectedEventId);
  const [filter, setFilter] = useState<Filter>("open");
  const [search, setSearch] = useState("");
  const [dialogTask, setDialogTask] = useState<Task | undefined>();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [noticeOpen, setNoticeOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const board = query.data;
  const tasks = useMemo(() => board?.tasks ?? [], [board]);
  const meId = board?.me.id;
  const canManage = board?.access.canManage ?? false;
  const isAdmin = board?.access.isAdmin ?? false;
  // The roster names people and their duties, so it is the committee's to
  // print - an assignee with view-only access does not get the button.
  const canPrint = canPrintNotices(board?.access.role);
  const collaborationReady = board?.collaborationReady ?? false;

  const { mine, others } = useMemo(() => {
    const term = search.trim().toLowerCase();
    const visible = tasks.filter((task) => matchesFilter(task, filter) && matchesSearch(task, term)).sort(byUrgency);
    return {
      mine: visible.filter((task) => task.assignees.some((entry) => entry.userId === meId)),
      others: visible.filter((task) => !task.assignees.some((entry) => entry.userId === meId)),
    };
  }, [tasks, filter, search, meId]);

  const counts = useMemo(() => {
    const open = tasks.filter(isOpenTask);
    return {
      mineOpen: open.filter((task) => task.assignees.some((entry) => entry.userId === meId)).length,
      open: open.length,
      blocked: tasks.filter((task) => task.status === "Blocked").length,
      done: tasks.filter((task) => task.status === "Completed").length,
    };
  }, [tasks, meId]);

  async function handleStatusChange(task: Task, status: TaskStatus) {
    setActionError(null);
    try {
      await setStatus.mutateAsync({ taskId: task.id, status });
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Unable to update status");
    }
  }

  async function handleDelete(task: Task) {
    if (!window.confirm(`Delete "${task.task}"? Its comments go with it, and this cannot be undone. To retire it without losing the thread, set its status to Cancelled or Invalid instead.`)) return;
    setActionError(null);
    try {
      await remove.mutateAsync(task.id);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Unable to delete task");
    }
  }

  function handleSubmit(input: TaskInput) {
    return dialogTask ? update.mutateAsync({ taskId: dialogTask.id, ...input }) : create.mutateAsync(input);
  }

  function openDialog(task?: Task) {
    setDialogTask(task);
    setDialogOpen(true);
  }

  if (isSessionLoading) {
    return <div className="rounded-lg border bg-card p-5 text-sm text-muted-foreground">Loading tasks...</div>;
  }

  if (!session) {
    return (
      <div className="space-y-5">
        <PageHeading />
        <Card>
          <CardContent className="space-y-3 p-5">
            <p className="text-sm text-muted-foreground">
              Tasks are for the committee, so this page needs a sign-in. Once you are in, anything assigned to you
              appears at the top.
            </p>
            <Button type="button" onClick={() => void signInWithGoogle()}>
              <LogIn className="h-4 w-4" aria-hidden="true" />
              Sign in with Google
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <PageHeading />
        <div className="flex flex-wrap items-center gap-2">
          {canPrint ? (
            <Button type="button" variant="outline" onClick={() => setNoticeOpen(true)}>
              <Printer className="h-4 w-4" aria-hidden="true" />
              Roster
            </Button>
          ) : null}
          {canManage ? (
            <Button type="button" onClick={() => openDialog()}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              New Task
            </Button>
          ) : (
            <span className="text-sm text-muted-foreground">
              View-only access &mdash; you can still comment, and update tasks assigned to you.
            </span>
          )}
        </div>
      </div>

      {canPrint ? (
        <TasksNoticeDialog open={noticeOpen} onOpenChange={setNoticeOpen} event={data.event} tasks={tasks} />
      ) : null}

      {query.isError ? (
        <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {query.error instanceof Error ? query.error.message : "Unable to load tasks"}
        </p>
      ) : null}

      {board && !collaborationReady ? (
        <p className="flex items-start gap-2 rounded-md bg-amber-100 p-3 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            Assignment and comments are switched off until{" "}
            <code className="font-mono text-xs">016_task_collaboration.sql</code> has been run in Supabase. The task
            list below still works.
          </span>
        </p>
      ) : null}

      {/* One row at every width - four short counts read as a single glance;
          two rows of two read as two separate things to parse. */}
      <section className="grid grid-cols-4 gap-1.5 sm:gap-3">
        <CountTile label="Yours" value={counts.mineOpen} icon={UserCheck} tone="primary" />
        <CountTile label="Open" value={counts.open} icon={Timer} />
        <CountTile label="Blocked" value={counts.blocked} icon={AlertTriangle} tone={counts.blocked ? "alert" : "default"} />
        <CountTile label="Done" value={counts.done} icon={CircleCheck} />
      </section>

      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
        <div role="tablist" aria-label="Filter tasks" className="flex rounded-md border p-0.5">
          {filters.map((item) => (
            <button
              key={item.key}
              role="tab"
              type="button"
              aria-selected={filter === item.key}
              onClick={() => setFilter(item.key)}
              className={cn(
                "min-h-10 flex-1 rounded px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:flex-none",
                filter === item.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
        <Input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search tasks, people, notes"
          aria-label="Search tasks"
          className="sm:max-w-xs"
        />
      </div>

      {actionError ? <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{actionError}</p> : null}

      {query.isLoading ? (
        <div className="space-y-2.5" aria-busy="true">
          {[0, 1, 2].map((key) => (
            <div key={key} className="h-28 animate-pulse rounded-lg border bg-muted/50" />
          ))}
        </div>
      ) : (
        <div role="tabpanel" className="space-y-6">
          <TaskSection
            title="Assigned to you"
            hint="What is on you right now."
            tasks={mine}
            emptyMessage={
              tasks.length
                ? "Nothing is assigned to you in this view."
                : "No tasks on this event yet."
            }
            meId={meId}
            members={board?.members ?? []}
            canManage={canManage}
            isAdmin={isAdmin}
            collaborationReady={collaborationReady}
            onEdit={openDialog}
            onDelete={handleDelete}
            onStatusChange={handleStatusChange}
            isBusy={setStatus.isPending}
          />

          <TaskSection
            title={mine.length ? "Everything else" : "All tasks"}
            hint="The rest of the committee's board."
            tasks={others}
            emptyMessage={
              tasks.length
                ? "No other tasks match this view."
                : canManage
                  ? "No tasks yet. Create the first one and assign it to someone."
                  : "No tasks yet."
            }
            meId={meId}
            members={board?.members ?? []}
            canManage={canManage}
            isAdmin={isAdmin}
            collaborationReady={collaborationReady}
            onEdit={openDialog}
            onDelete={handleDelete}
            onStatusChange={handleStatusChange}
            isBusy={setStatus.isPending}
          />
        </div>
      )}

      {canManage ? (
        <TaskFormDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          task={dialogTask}
          members={board?.members ?? []}
          collaborationReady={collaborationReady}
          canSetStatus={
            !dialogTask || isAdmin || dialogTask.assignees.some((entry) => entry.userId === meId)
          }
          onSubmit={handleSubmit}
        />
      ) : null}
    </div>
  );
}

function PageHeading() {
  return (
    <div>
      <h2 className="text-2xl font-semibold">Tasks</h2>
      <p className="text-sm text-muted-foreground">
        Who is doing what, by when - with the conversation on each task kept alongside it.
      </p>
    </div>
  );
}

function CountTile({
  label,
  value,
  icon: Icon,
  tone = "default",
}: {
  label: string;
  value: number;
  icon: typeof ListChecks;
  tone?: "default" | "primary" | "alert";
}) {
  return (
    <div
      className={cn(
        "rounded-lg border bg-card px-2 py-2 sm:px-3",
        tone === "primary" && "border-primary/40 bg-primary/5",
        tone === "alert" && "border-destructive/30",
      )}
    >
      <div className="flex items-baseline gap-1.5">
        <p className="text-xl font-semibold tabular-nums sm:text-2xl">{value}</p>
        {/* The icon is decoration next to a labelled number; it is the first
            thing to go when four tiles have to share a phone's width. */}
        <Icon
          className={cn(
            "hidden h-4 w-4 shrink-0 self-center sm:block",
            tone === "primary" ? "text-primary" : "text-muted-foreground",
          )}
          aria-hidden="true"
        />
      </div>
      <p className="truncate text-[11px] font-medium uppercase tracking-wide text-muted-foreground sm:text-xs">
        {label}
      </p>
    </div>
  );
}

function TaskSection({
  title,
  hint,
  tasks,
  emptyMessage,
  ...cardProps
}: {
  title: string;
  hint: string;
  tasks: Task[];
  emptyMessage: string;
  meId?: string;
  members: TaskMember[];
  canManage: boolean;
  isAdmin: boolean;
  collaborationReady: boolean;
  onEdit: (task: Task) => void;
  onDelete: (task: Task) => void;
  onStatusChange: (task: Task, status: TaskStatus) => void;
  isBusy: boolean;
}) {
  return (
    <section className="space-y-2.5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <h3 className="text-base font-semibold">
          {title}
          {tasks.length ? (
            <span className="ml-2 text-sm font-normal tabular-nums text-muted-foreground">{tasks.length}</span>
          ) : null}
        </h3>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>

      {tasks.length ? (
        <div className="space-y-2.5">
          {tasks.map((task) => (
            <TaskCard key={task.id} task={task} {...cardProps} />
          ))}
        </div>
      ) : (
        <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">{emptyMessage}</p>
      )}
    </section>
  );
}
