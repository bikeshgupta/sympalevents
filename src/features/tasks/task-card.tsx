import { CalendarClock, ChevronDown, MessageSquare, Pencil, Tag, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/shared/status-badge";
import { formatEventDate, getDateInEventZone } from "@/features/dashboard/dashboard-utils";
import { AssigneeStack, PriorityPill } from "@/features/tasks/task-bits";
import { TaskDetailsPanel } from "@/features/tasks/task-details-panel";
import { taskStatuses, type Task, type TaskMember, type TaskStatus } from "@/lib/tasks";
import { cn } from "@/lib/utils";

/**
 * One task, mobile first.
 *
 * The header carries everything worth knowing at a glance and never collapses:
 * title, status, priority, due date (flagged when it has passed), who it is on,
 * and how many comments it has. Everything else - description, the full
 * assignee list, the thread - is behind the single "Details" toggle, because on
 * a phone that is the difference between scanning eight tasks and scrolling
 * through two.
 */

/** Due today, overdue, or neither - open tasks only; a finished task is not
 *  late, it is done. */
function dueState(task: Task) {
  if (!task.dueDate) return "none" as const;
  if (task.status === "Completed" || task.status === "Cancelled") return "settled" as const;
  const today = getDateInEventZone();
  if (task.dueDate < today) return "overdue" as const;
  if (task.dueDate === today) return "today" as const;
  return "upcoming" as const;
}

export function TaskCard({
  task,
  meId,
  members,
  canManage,
  collaborationReady,
  onEdit,
  onDelete,
  onStatusChange,
  isBusy,
}: {
  task: Task;
  meId?: string;
  members: TaskMember[];
  canManage: boolean;
  collaborationReady: boolean;
  onEdit: (task: Task) => void;
  onDelete: (task: Task) => void;
  onStatusChange: (task: Task, status: TaskStatus) => void;
  isBusy: boolean;
}) {
  const [open, setOpen] = useState(false);
  const panelId = `task-panel-${task.id}`;
  const mine = task.assignees.some((entry) => entry.userId === meId);
  const due = dueState(task);
  // An assignee who cannot manage the task can still move it along - that is
  // the point of it being assigned to them.
  const canSetStatus = canManage || mine;

  return (
    <article
      className={cn(
        "overflow-hidden rounded-lg border bg-card",
        mine && "border-primary/40",
        task.status === "Completed" && "opacity-80",
      )}
    >
      <div className="p-3 sm:p-4">
        <div className="flex items-start justify-between gap-2">
          <h3
            className={cn(
              "min-w-0 font-medium leading-snug",
              task.status === "Completed" && "text-muted-foreground line-through",
            )}
          >
            {task.task}
          </h3>
          <StatusBadge status={task.status} />
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
          <PriorityPill priority={task.priority} />

          {task.dueDate ? (
            <span
              className={cn(
                "inline-flex items-center gap-1 tabular-nums",
                due === "overdue" && "font-semibold text-destructive",
                due === "today" && "font-semibold text-foreground",
              )}
            >
              <CalendarClock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {due === "overdue" ? "Overdue " : due === "today" ? "Due today · " : "Due "}
              {formatEventDate(task.dueDate)}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1">
              <CalendarClock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              No due date
            </span>
          )}

          {task.category ? (
            <span className="inline-flex items-center gap-1">
              <Tag className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {task.category}
            </span>
          ) : null}

          {task.commentCount ? (
            <span className="inline-flex items-center gap-1 tabular-nums">
              <MessageSquare className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {task.commentCount}
            </span>
          ) : null}
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <AssigneeStack assignees={task.assignees} meId={meId} fallbackName={task.ownerName} />
            {mine ? (
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">Yours</span>
            ) : null}
          </div>

          <div className="flex items-center gap-1">
            {canSetStatus ? (
              <>
                <label className="sr-only" htmlFor={`status-${task.id}`}>
                  Status of {task.task}
                </label>
                <select
                  id={`status-${task.id}`}
                  className="h-10 rounded-md border bg-background px-2 text-xs"
                  value={task.status}
                  disabled={isBusy}
                  onChange={(event) => onStatusChange(task, event.target.value as TaskStatus)}
                >
                  {taskStatuses.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </>
            ) : null}

            {canManage ? (
              <>
                <Button type="button" variant="ghost" size="icon" aria-label={`Edit ${task.task}`} onClick={() => onEdit(task)}>
                  <Pencil className="h-4 w-4" aria-hidden="true" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Delete ${task.task}`}
                  onClick={() => onDelete(task)}
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </Button>
              </>
            ) : null}
          </div>
        </div>

        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-controls={panelId}
          className="mt-2 inline-flex min-h-10 items-center gap-1.5 text-sm font-medium text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {open ? "Hide details" : "Details, comments"}
          {task.commentCount && !open ? <span className="tabular-nums">({task.commentCount})</span> : null}
          <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} aria-hidden="true" />
        </button>
      </div>

      {/* Mounted only while open, so a collapsed card costs no comment fetch. */}
      {open ? (
        <div id={panelId}>
          <TaskDetailsPanel
            task={task}
            meId={meId}
            members={members}
            canManage={canManage}
            collaborationReady={collaborationReady}
            onEditAssignees={() => onEdit(task)}
          />
        </div>
      ) : null}
    </article>
  );
}
