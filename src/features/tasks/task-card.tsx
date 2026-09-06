import { CalendarClock, ChevronDown, MessageSquare, Pencil, Tag, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { formatEventDate, getDateInEventZone } from "@/features/dashboard/dashboard-utils";
import { AssigneeStack, PriorityPill } from "@/features/tasks/task-bits";
import { TaskDetailsPanel } from "@/features/tasks/task-details-panel";
import { taskStatuses, type Task, type TaskMember, type TaskStatus } from "@/lib/tasks";
import { cn } from "@/lib/utils";

/**
 * One task, mobile first and deliberately compact: **two rows**.
 *
 *   Title ........................................ [status]
 *   Priority · due · category · comments · faces .. [edit][delete][v]
 *
 * The header carries everything worth knowing at a glance and never collapses.
 * Everything else - description, the full assignee list, the thread - is behind
 * the chevron, because on a phone that is the difference between scanning eight
 * tasks and scrolling through two.
 *
 * The status control *is* the badge rather than sitting next to one, and the
 * details toggle is the chevron rather than its own full-width button; both
 * were their own rows before and neither earned one.
 *
 * This component is used only by `tasks-page.tsx`, so the compact treatment is
 * local to the Tasks screen - no other page renders a task card.
 */

/** Due today, overdue, or neither - open tasks only; a finished task is not
 *  late, it is done. */
function dueState(task: Task) {
  if (!task.dueDate) return "none" as const;
  if (task.status === "Completed" || task.status === "Cancelled" || task.status === "Invalid") {
    return "settled" as const;
  }
  const today = getDateInEventZone();
  if (task.dueDate < today) return "overdue" as const;
  if (task.dueDate === today) return "today" as const;
  return "upcoming" as const;
}

// Matches StatusBadge's palette so the select still reads as a status pill.
const statusStyles: Record<string, string> = {
  "Not Started": "bg-slate-100 text-slate-700",
  "In Progress": "bg-sky-100 text-sky-800",
  Blocked: "bg-rose-100 text-rose-800",
  Completed: "bg-emerald-100 text-emerald-800",
  Cancelled: "bg-muted text-muted-foreground",
  Invalid: "bg-muted text-muted-foreground line-through",
};

export function TaskCard({
  task,
  meId,
  members,
  canManage,
  isAdmin,
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
  isAdmin: boolean;
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
  const settled = due === "settled";
  // Narrower than `canManage`, and not implied by it: only an admin or someone
  // actually on the task may declare where it stands. The server enforces the
  // same rule - this only decides whether to render a control that would fail.
  const canSetStatus = isAdmin || mine;

  return (
    <article
      className={cn(
        "overflow-hidden rounded-lg border bg-card",
        mine && "border-primary/40",
        settled && "opacity-75",
      )}
    >
      <div className="px-2.5 py-2 sm:px-3">
        <div className="flex items-start justify-between gap-2">
          <h3
            className={cn(
              "min-w-0 pt-1 text-sm font-medium leading-snug",
              settled && "text-muted-foreground line-through",
            )}
          >
            {task.task}
          </h3>

          {canSetStatus ? (
            <>
              <label className="sr-only" htmlFor={`status-${task.id}`}>
                Status of {task.task}
              </label>
              <select
                id={`status-${task.id}`}
                value={task.status}
                disabled={isBusy}
                onChange={(event) => onStatusChange(task, event.target.value as TaskStatus)}
                className={cn(
                  "h-10 shrink-0 rounded-full border-0 px-2 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  statusStyles[task.status] ?? "bg-muted text-muted-foreground",
                )}
              >
                {taskStatuses.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </>
          ) : (
            <span
              className={cn(
                "inline-flex shrink-0 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium",
                statusStyles[task.status] ?? "bg-muted text-muted-foreground",
              )}
            >
              {task.status}
            </span>
          )}
        </div>

        <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-muted-foreground">
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
              {due === "overdue" ? "Overdue " : due === "today" ? "Today · " : ""}
              {formatEventDate(task.dueDate)}
            </span>
          ) : null}

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

          <AssigneeStack assignees={task.assignees} meId={meId} fallbackName={task.ownerName} />
          {mine ? <span className="font-medium text-primary">You</span> : null}

          <span className="ml-auto flex items-center">
            {canManage ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-10 w-9"
                aria-label={`Edit ${task.task}`}
                onClick={() => onEdit(task)}
              >
                <Pencil className="h-4 w-4" aria-hidden="true" />
              </Button>
            ) : null}

            {/* Admin only. Everyone else retires a task by marking it
                Cancelled or Invalid - deleting takes the thread with it. */}
            {isAdmin ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-10 w-9"
                aria-label={`Delete ${task.task}`}
                onClick={() => onDelete(task)}
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </Button>
            ) : null}

            <button
              type="button"
              onClick={() => setOpen((value) => !value)}
              aria-expanded={open}
              aria-controls={panelId}
              aria-label={open ? `Hide details for ${task.task}` : `Show details and comments for ${task.task}`}
              className="inline-flex h-10 w-9 items-center justify-center rounded-md text-primary hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} aria-hidden="true" />
            </button>
          </span>
        </div>
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
