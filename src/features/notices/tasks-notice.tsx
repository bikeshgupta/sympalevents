import { useMemo, useState } from "react";
import { formatEventDate } from "@/features/dashboard/dashboard-utils";
import {
  NoticeBlock,
  NoticeDialog,
  NoticeEmpty,
  NoticeSheet,
  type NoticeAudience,
} from "@/features/notices/notice-sheet";
import type { AppEvent } from "@/lib/event-data";
import { isOpenTask, type Task } from "@/lib/tasks";

/**
 * The duty roster - who is doing what, by when.
 *
 * Defaults to the committee copy, because that is what this list is: it
 * carries priorities, status and the committee's own notes. The external copy
 * is the version worth pinning up - the job, who is on it, and when - and it
 * drops notes, priorities and anything already finished. Comment threads are
 * never printed in either.
 */
function assigneeNames(task: Task) {
  if (task.assignees.length) return task.assignees.map((entry) => entry.name).join(", ");
  return task.ownerName || "";
}

function TaskLine({ task, audience }: { task: Task; audience: NoticeAudience }) {
  return (
    <div className="notice-block text-sm">
      <p className="flex flex-wrap items-baseline gap-x-2">
        <span className="font-medium">{task.task}</span>
        {task.dueDate ? <span className="tabular-nums text-muted-foreground">by {formatEventDate(task.dueDate)}</span> : null}
        {audience === "internal" ? <span className="text-xs text-muted-foreground">{task.status}</span> : null}
      </p>
      <p className="text-sm">
        {assigneeNames(task) ? (
          assigneeNames(task)
        ) : (
          <span className="italic text-muted-foreground">Nobody assigned yet</span>
        )}
      </p>
      {audience === "internal" ? (
        <p className="text-xs text-muted-foreground">
          {[task.priority, task.category, task.notes].filter(Boolean).join(" · ")}
        </p>
      ) : null}
    </div>
  );
}

export function TasksNoticeDialog({
  open,
  onOpenChange,
  event,
  tasks,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  event: AppEvent;
  tasks: Task[];
}) {
  const [audience, setAudience] = useState<NoticeAudience>("internal");

  const { openTasks, doneTasks } = useMemo(() => {
    const byDue = [...tasks].sort((left, right) => {
      if (left.dueDate && right.dueDate) return left.dueDate.localeCompare(right.dueDate);
      if (left.dueDate) return -1;
      if (right.dueDate) return 1;
      return left.task.localeCompare(right.task);
    });
    return { openTasks: byDue.filter(isOpenTask), doneTasks: byDue.filter((task) => task.status === "Completed") };
  }, [tasks]);

  return (
    <NoticeDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Duty roster"
      documentTitle={`${event.name} - Duty roster`}
      audience={audience}
      onAudienceChange={setAudience}
    >
      <NoticeSheet
        eventName={event.name}
        eventDates={event.dates}
        location={event.location}
        title="Duty roster"
        intro={audience === "external" ? "Who is looking after what. Please reach out to the person named." : undefined}
        audience={audience}
      >
        {openTasks.length ? (
          <NoticeBlock heading="Still to do" meta={`${openTasks.length}`}>
            {openTasks.map((task) => (
              <TaskLine key={task.id} task={task} audience={audience} />
            ))}
          </NoticeBlock>
        ) : (
          <NoticeEmpty>Nothing is outstanding.</NoticeEmpty>
        )}

        {audience === "internal" && doneTasks.length ? (
          <NoticeBlock heading="Done" meta={`${doneTasks.length}`}>
            {doneTasks.map((task) => (
              <TaskLine key={task.id} task={task} audience={audience} />
            ))}
          </NoticeBlock>
        ) : null}
      </NoticeSheet>
    </NoticeDialog>
  );
}
