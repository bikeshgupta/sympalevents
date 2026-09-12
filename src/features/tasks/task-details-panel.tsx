import { MessageSquare, Send, Users } from "lucide-react";
import { FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { formatEventDate } from "@/features/dashboard/dashboard-utils";
import { Avatar } from "@/features/tasks/task-bits";
import { useTaskComments, type Task, type TaskMember } from "@/lib/tasks";

/**
 * Everything about a task that is not needed at a glance: the description, the
 * full assignee list, and the comment thread.
 *
 * Rendered only while its card is expanded, which is what keeps the comment
 * fetch off the board - thirty collapsed cards make zero comment requests, and
 * the counts on their headers come from the board response itself.
 */

function relativeTime(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diffMs / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? "" : "s"} ago`;
  return formatEventDate(iso.slice(0, 10));
}

export function TaskDetailsPanel({
  task,
  meId,
  members,
  canManage,
  collaborationReady,
  onEditAssignees,
}: {
  task: Task;
  meId?: string;
  members: TaskMember[];
  canManage: boolean;
  collaborationReady: boolean;
  onEditAssignees: () => void;
}) {
  const { query, add } = useTaskComments(task.id, collaborationReady);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const comments = query.data?.comments ?? [];

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = draft.trim();
    if (!body) return;
    setError(null);

    try {
      await add.mutateAsync(body);
      setDraft("");
    } catch (item) {
      setError(item instanceof Error ? item.message : "Unable to post comment");
    }
  }

  return (
    <div className="space-y-4 border-t bg-muted/30 p-3 sm:p-4">
      <section>
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Description</h4>
        {task.notes ? (
          <p className="mt-1 whitespace-pre-line text-sm leading-relaxed">{task.notes}</p>
        ) : (
          <p className="mt-1 text-sm text-muted-foreground">No description added.</p>
        )}
      </section>

      <section>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <Users className="h-4 w-4" aria-hidden="true" />
            Assigned to
          </h4>
          {canManage ? (
            <Button type="button" variant="ghost" size="sm" onClick={onEditAssignees}>
              {task.assignees.length ? "Change" : "Assign people"}
            </Button>
          ) : null}
        </div>
        {task.assignees.length ? (
          <ul className="mt-2 flex flex-wrap gap-2">
            {task.assignees.map((entry) => (
              <li
                key={entry.userId}
                className="inline-flex items-center gap-2 rounded-full border bg-background py-1 pl-1 pr-3 text-sm"
              >
                <Avatar name={entry.name} photoUrl={entry.photoUrl} highlight={entry.userId === meId} />
                <span className="max-w-40 truncate">{entry.name}</span>
                {entry.userId === meId ? <span className="text-xs font-medium text-primary">You</span> : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-sm text-muted-foreground">
            {task.ownerName
              ? `No one assigned yet. Listed owner: ${task.ownerName}.`
              : members.length || !canManage
                ? "No one assigned yet."
                : "No one assigned yet. Add members to this event in Settings first."}
          </p>
        )}
      </section>

      <section>
        <h4 className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <MessageSquare className="h-4 w-4" aria-hidden="true" />
          Comments
          {comments.length ? <span className="tabular-nums">({comments.length})</span> : null}
        </h4>

        {!collaborationReady ? (
          <p className="mt-2 rounded-md bg-muted p-3 text-sm text-muted-foreground">
            Comments need migration 016_task_collaboration.sql to be run.
          </p>
        ) : query.isLoading ? (
          <p className="mt-2 text-sm text-muted-foreground">Loading comments...</p>
        ) : (
          <>
            {comments.length ? (
              <ul className="mt-2 space-y-2.5">
                {comments.map((comment) => (
                  <li key={comment.id} className="flex gap-2.5">
                    <Avatar name={comment.authorName} photoUrl={comment.authorPhotoUrl} size="md" />
                    <div className="min-w-0 flex-1 rounded-md border bg-background px-3 py-2">
                      <p className="flex flex-wrap items-baseline gap-x-2 text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">
                          {comment.authorId === meId ? "You" : comment.authorName}
                        </span>
                        <span>{relativeTime(comment.createdAt)}</span>
                      </p>
                      <p className="mt-1 whitespace-pre-line text-sm leading-relaxed">{comment.body}</p>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">
                No comments yet. Post an update so everyone on this task knows where it stands.
              </p>
            )}

            <form className="mt-3 flex items-end gap-2" onSubmit={submit}>
              <textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                rows={2}
                aria-label={`Add a comment on ${task.task}`}
                placeholder="Add a comment..."
                className="flex min-h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
              />
              <Button type="submit" size="icon" aria-label="Post comment" disabled={!draft.trim() || add.isPending}>
                <Send className="h-4 w-4" aria-hidden="true" />
              </Button>
            </form>
            {error ? <p className="mt-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</p> : null}
          </>
        )}
      </section>
    </div>
  );
}
