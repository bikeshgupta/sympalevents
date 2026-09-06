import { FormEvent, useEffect, useState } from "react";
import { FormField } from "@/components/shared/form-field";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Avatar } from "@/features/tasks/task-bits";
import {
  taskPriorities,
  taskStatuses,
  type Task,
  type TaskInput,
  type TaskMember,
  type TaskPriority,
  type TaskStatus,
} from "@/lib/tasks";
import { cn } from "@/lib/utils";

/**
 * Create and edit in one dialog - pass a `task` to edit, omit it to create,
 * the same shape as AuctionFormDialog.
 *
 * The assignee picker is a list of toggles rather than a multi-select: a task
 * can have several people on it, and a `<select multiple>` is close to unusable
 * on a phone.
 */
export function TaskFormDialog({
  open,
  onOpenChange,
  task,
  members,
  collaborationReady,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task?: Task;
  members: TaskMember[];
  collaborationReady: boolean;
  onSubmit: (input: TaskInput) => Promise<unknown>;
}) {
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Re-seed whenever the dialog opens on a different task; the fields below are
  // uncontrolled and re-mount with it, but this one is state.
  useEffect(() => {
    if (!open) return;
    setAssigneeIds(task?.assignees.map((entry) => entry.userId) ?? []);
    setError(null);
  }, [open, task]);

  function toggle(userId: string) {
    setAssigneeIds((current) =>
      current.includes(userId) ? current.filter((value) => value !== userId) : [...current, userId],
    );
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setSaving(true);
    setError(null);

    try {
      await onSubmit({
        task: String(formData.get("task") ?? "").trim(),
        category: String(formData.get("category") ?? ""),
        notes: String(formData.get("notes") ?? ""),
        priority: String(formData.get("priority") ?? "Medium") as TaskPriority,
        dueDate: String(formData.get("dueDate") ?? "") || null,
        status: String(formData.get("status") ?? "Not Started") as TaskStatus,
        assigneeIds,
      });
      onOpenChange(false);
    } catch (item) {
      setError(item instanceof Error ? item.message : "Unable to save task");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{task ? "Edit Task" : "New Task"}</DialogTitle>
        </DialogHeader>
        <form className="space-y-4" onSubmit={submit}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <FormField label="Task" name="task" defaultValue={task?.task} required />
            </div>
            <FormField label="Category" name="category" defaultValue={task?.category} />
            <FormField label="Due Date" name="dueDate" type="date" defaultValue={task?.dueDate ?? undefined} />

            <div className="space-y-2">
              <Label htmlFor="task-priority">Priority</Label>
              <select
                id="task-priority"
                name="priority"
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                defaultValue={task?.priority ?? "Medium"}
              >
                {taskPriorities.map((priority) => (
                  <option key={priority} value={priority}>
                    {priority}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="task-status">Status</Label>
              <select
                id="task-status"
                name="status"
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                defaultValue={task?.status ?? "Not Started"}
              >
                {taskStatuses.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="task-notes">Description</Label>
              <textarea
                id="task-notes"
                name="notes"
                rows={3}
                defaultValue={task?.notes}
                placeholder="What needs doing, and anything the assignees should know."
                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>

            <fieldset className="space-y-2 sm:col-span-2">
              <legend className="text-sm font-medium">
                Assign to{" "}
                {assigneeIds.length ? (
                  <span className="font-normal text-muted-foreground">({assigneeIds.length} selected)</span>
                ) : null}
              </legend>

              {!collaborationReady ? (
                <p className="rounded-md bg-muted p-3 text-sm text-muted-foreground">
                  Assignment needs migration 016_task_collaboration.sql to be run. The task itself will still save.
                </p>
              ) : members.length ? (
                <ul className="max-h-56 space-y-1 overflow-y-auto rounded-md border p-1.5">
                  {members.map((member) => {
                    const selected = assigneeIds.includes(member.userId);
                    return (
                      <li key={member.userId}>
                        <button
                          type="button"
                          onClick={() => toggle(member.userId)}
                          aria-pressed={selected}
                          className={cn(
                            "flex min-h-10 w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                            selected ? "bg-primary/10 text-foreground" : "hover:bg-muted",
                          )}
                        >
                          <Avatar name={member.name} photoUrl={member.photoUrl} size="md" highlight={selected} />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-medium">{member.name}</span>
                            <span className="block truncate text-xs text-muted-foreground">
                              {member.role === "read_only" ? "Read-only" : member.role === "admin" ? "Admin" : "Committee"}
                            </span>
                          </span>
                          <span
                            aria-hidden="true"
                            className={cn(
                              "text-xs font-semibold",
                              selected ? "text-primary" : "text-muted-foreground",
                            )}
                          >
                            {selected ? "Assigned" : "Add"}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="rounded-md bg-muted p-3 text-sm text-muted-foreground">
                  No members on this event yet. Add them in Settings &rarr; Member Access, then assign them here.
                </p>
              )}
            </fieldset>
          </div>

          {error ? <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</p> : null}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving..." : task ? "Save Task" : "Create Task"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
