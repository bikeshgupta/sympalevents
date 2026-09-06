import { cn } from "@/lib/utils";
import type { TaskAssignee, TaskPriority } from "@/lib/tasks";

/**
 * The small repeated pieces of the task board: a person's avatar, a stack of
 * them, and the priority pill. Split out of `task-card.tsx` because the create
 * dialog and the details panel need the same avatars and would otherwise
 * import the card.
 */

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

export function Avatar({
  name,
  photoUrl,
  size = "sm",
  highlight = false,
}: {
  name: string;
  photoUrl?: string | null;
  size?: "sm" | "md";
  highlight?: boolean;
}) {
  const dimensions = size === "md" ? "h-8 w-8 text-xs" : "h-6 w-6 text-[10px]";

  return (
    <span
      title={name}
      className={cn(
        "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border bg-muted font-semibold uppercase tracking-wide text-muted-foreground",
        dimensions,
        highlight && "border-primary ring-2 ring-primary/30",
      )}
    >
      {photoUrl ? (
        <img src={photoUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
      ) : (
        <span aria-hidden="true">{initials(name)}</span>
      )}
    </span>
  );
}

/**
 * Up to three faces, then "+N". The names go in one `sr-only` sentence rather
 * than on each avatar, so a screen reader hears "Assigned to Meera and Rohit"
 * instead of two disconnected images.
 */
export function AssigneeStack({
  assignees,
  meId,
  fallbackName = "",
  max = 3,
}: {
  assignees: TaskAssignee[];
  meId?: string;
  fallbackName?: string;
  max?: number;
}) {
  if (!assignees.length) {
    return (
      <span className="text-xs text-muted-foreground">
        {fallbackName ? `Owner: ${fallbackName}` : "Unassigned"}
      </span>
    );
  }

  const shown = assignees.slice(0, max);
  const extra = assignees.length - shown.length;

  return (
    <span className="inline-flex items-center">
      <span className="sr-only">Assigned to {assignees.map((entry) => entry.name).join(", ")}</span>
      <span className="flex -space-x-1.5" aria-hidden="true">
        {shown.map((entry) => (
          <Avatar key={entry.userId} name={entry.name} photoUrl={entry.photoUrl} highlight={entry.userId === meId} />
        ))}
      </span>
      {extra > 0 ? (
        <span aria-hidden="true" className="ml-1.5 text-xs font-medium tabular-nums text-muted-foreground">
          +{extra}
        </span>
      ) : null}
    </span>
  );
}

// Same convention as StatusBadge: a fixed palette per level, with the word
// always present so colour is never the only signal.
const priorityStyles: Record<TaskPriority, string> = {
  Critical: "bg-rose-100 text-rose-800",
  High: "bg-amber-100 text-amber-800",
  Medium: "bg-sky-100 text-sky-800",
  Low: "bg-slate-100 text-slate-700",
};

export function PriorityPill({ priority }: { priority: TaskPriority }) {
  return (
    <span
      className={cn(
        "inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium",
        priorityStyles[priority] ?? priorityStyles.Medium,
      )}
    >
      {priority}
    </span>
  );
}
