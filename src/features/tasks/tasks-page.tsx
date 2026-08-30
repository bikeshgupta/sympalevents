import { useQueryClient } from "@tanstack/react-query";
import { CalendarClock, ListChecks, Timer } from "lucide-react";
import { FormEvent, useState } from "react";
import { DataSourceBadge } from "@/components/shared/data-source-badge";
import { FormField } from "@/components/shared/form-field";
import { StatCard } from "@/components/shared/stat-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CrudDialog, formString } from "@/features/shared/crud-dialog";
import { PageTools } from "@/features/shared/page-tools";
import { RowActions } from "@/features/shared/row-actions";
import { ColumnFilter, SortableHeader, TableColumn, TableToolbar, useFilteredSortedRows } from "@/features/shared/table-tools";
import { getFirstEventId, TaskRow, useEventData } from "@/lib/event-data";
import { usePageAccess } from "@/lib/page-access";
import { supabase } from "@/lib/supabase";

const taskColumns: TableColumn<TaskRow>[] = [
  { key: "task", label: "Task", getValue: (row) => row.task },
  { key: "owner", label: "Owner", getValue: (row) => row.owner },
  { key: "priority", label: "Priority", getValue: (row) => row.priority },
  { key: "due", label: "Due", getValue: (row) => row.due },
  { key: "status", label: "Status", getValue: (row) => row.status },
];

function TaskFields({ task }: { task?: TaskRow }) {
  return (
    <>
      <FormField label="Task" name="task" defaultValue={task?.task} required />
      <FormField label="Category" name="category" />
      <FormField label="Owner" name="owner" defaultValue={task?.owner} />
      <div className="space-y-2">
        <label className="text-sm font-medium" htmlFor={task ? `priority-${task.id}` : "priority"}>Priority</label>
        <select id={task ? `priority-${task.id}` : "priority"} name="priority" className="h-10 w-full rounded-md border bg-background px-3 text-sm" defaultValue={task?.priority ?? "Medium"}>
          {["Critical", "High", "Medium", "Low"].map((priority) => <option key={priority} value={priority}>{priority}</option>)}
        </select>
      </div>
      <FormField label="Due Date" name="due" type="date" defaultValue={task?.due !== "-" ? task?.due : undefined} />
      <div className="space-y-2">
        <label className="text-sm font-medium" htmlFor={task ? `status-${task.id}` : "status"}>Status</label>
        <select id={task ? `status-${task.id}` : "status"} name="status" className="h-10 w-full rounded-md border bg-background px-3 text-sm" defaultValue={task?.status ?? "Not Started"}>
          {["Not Started", "In Progress", "Blocked", "Completed", "Cancelled"].map((status) => <option key={status} value={status}>{status}</option>)}
        </select>
      </div>
    </>
  );
}

export function TasksPage() {
  const { data } = useEventData();
  const access = usePageAccess("tasks");
  const taskRows = data.tasks;
  const taskTable = useFilteredSortedRows(taskRows, taskColumns, "due");
  const openTasks = taskRows.filter((task) => task.status !== "Completed" && task.status !== "Cancelled").length;
  const completedTasks = taskRows.filter((task) => task.status === "Completed").length;
  const criticalTasks = taskRows.filter((task) => task.priority === "Critical").length;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Tasks</h2>
          <p className="text-sm text-muted-foreground">Track owners, priorities, due dates, and completion status.</p>
        </div>
        <DataSourceBadge source={data.source} reason={data.fallbackReason} />
      </div>
      <section className="grid gap-3 sm:grid-cols-3">
        <StatCard title="Open" value={String(openTasks)} icon={Timer} />
        <StatCard title="Completed" value={String(completedTasks)} icon={ListChecks} />
        <StatCard title="Critical" value={String(criticalTasks)} icon={CalendarClock} />
      </section>
      <PageTools
        action={
          access.canEdit ? <CrudDialog title="Add Task" triggerLabel="Add Task" onSubmit={addTask}><TaskFields /></CrudDialog> : <span className="text-sm text-muted-foreground">View-only access</span>
        }
      />
      <Card className="overflow-x-auto">
        <TableToolbar resultCount={taskTable.rows.length} totalCount={taskRows.length} />
        <table className="min-w-[760px] w-full text-sm">
          <thead className="bg-muted text-left text-muted-foreground">
            <tr>
              {taskColumns.map((column) => (
                <th key={column.key} className="px-4 py-3 font-medium">
                  <SortableHeader label={column.label} columnKey={column.key} sortKey={taskTable.sortKey} sortDirection={taskTable.sortDirection} onSort={taskTable.toggleSort} />
                  <ColumnFilter column={column} rows={taskRows} filters={taskTable.filters} onFilterChange={taskTable.setColumnFilter} />
                </th>
              ))}
              <th className="px-4 py-3 font-medium" />
            </tr>
          </thead>
          <tbody>
            {taskTable.rows.map((task) => (
              <tr key={task.id ?? task.task} className="border-t">
                <td className="px-4 py-3 font-medium">{task.task}</td>
                <td className="px-4 py-3">{task.owner}</td>
                <td className="px-4 py-3">{task.priority}</td>
                <td className="px-4 py-3">{task.due}</td>
                <td className="px-4 py-3"><StatusBadge status={task.status} /></td>
                <td className="px-4 py-3">{task.id && access.canEdit ? <TaskActions task={task} /> : null}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function TaskActions({ task }: { task: TaskRow }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await updateTask(task.id!, new FormData(event.currentTarget));
      await queryClient.invalidateQueries({ queryKey: ["event-data"] });
      setOpen(false);
    } catch (item) {
      setError(item instanceof Error ? item.message : "Unable to update task");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <RowActions
        onEdit={() => setOpen(true)}
        onDelete={async () => {
          if (!window.confirm("Delete this task?")) return;
          await deleteTask(task.id!);
          await queryClient.invalidateQueries({ queryKey: ["event-data"] });
        }}
      />
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Task</DialogTitle></DialogHeader>
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="grid gap-4 sm:grid-cols-2"><TaskFields task={task} /></div>
            {error ? <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</p> : null}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={saving}>{saving ? "Saving..." : "Save"}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

async function addTask(formData: FormData) {
  if (!supabase) throw new Error("Supabase is not configured");
  const eventId = await getFirstEventId();
  const { error } = await supabase.from("tasks").insert({
    event_id: eventId,
    task: formString(formData, "task"),
    category: formString(formData, "category"),
    owner_name: formString(formData, "owner"),
    priority: formString(formData, "priority", "Medium"),
    due_date: formString(formData, "due") || null,
    status: formString(formData, "status", "Not Started"),
  });

  if (error) throw error;
}

async function updateTask(id: string, formData: FormData) {
  if (!supabase) throw new Error("Supabase is not configured");
  const { error } = await supabase
    .from("tasks")
    .update({
      task: formString(formData, "task"),
      category: formString(formData, "category"),
      owner_name: formString(formData, "owner"),
      priority: formString(formData, "priority", "Medium"),
      due_date: formString(formData, "due") || null,
      status: formString(formData, "status", "Not Started"),
    })
    .eq("id", id);
  if (error) throw error;
}

async function deleteTask(id: string) {
  if (!supabase) throw new Error("Supabase is not configured");
  const { error } = await supabase.from("tasks").delete().eq("id", id);
  if (error) throw error;
}
