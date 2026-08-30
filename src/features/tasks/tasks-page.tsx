import { DataSourceBadge } from "@/components/shared/data-source-badge";
import { FormField } from "@/components/shared/form-field";
import { StatusBadge } from "@/components/shared/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getFirstEventId, useEventData } from "@/lib/event-data";
import { usePageAccess } from "@/lib/page-access";
import { supabase } from "@/lib/supabase";
import { CrudDialog, formString } from "@/features/shared/crud-dialog";
import { PageTools } from "@/features/shared/page-tools";
import { RowActions } from "@/features/shared/row-actions";

const columns = ["Not Started", "In Progress", "Blocked", "Completed"];

export function TasksPage() {
  const { data } = useEventData();
  const access = usePageAccess("tasks");
  const queryClient = useQueryClient();
  const taskRows = data.tasks;

  return (
    <div className="space-y-5">
      <div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-2xl font-semibold">Tasks</h2>
            <p className="text-sm text-muted-foreground">Kanban-style tracker for owners, priorities, dates, and blockers.</p>
          </div>
          <DataSourceBadge source={data.source} />
        </div>
      </div>
      <PageTools
        action={
          access.canEdit ? <CrudDialog title="Add Task" triggerLabel="Add Task" onSubmit={addTask}>
            <FormField label="Task" name="task" required />
            <FormField label="Category" name="category" />
            <FormField label="Owner" name="owner" />
            <FormField label="Priority" name="priority" defaultValue="Medium" />
            <FormField label="Due Date" name="due" type="date" />
            <FormField label="Status" name="status" defaultValue="Not Started" />
          </CrudDialog> : <span className="text-sm text-muted-foreground">View-only access</span>
        }
      />
      <div className="grid gap-4 xl:grid-cols-4">
        {columns.map((column) => (
          <Card key={column}>
            <CardHeader>
              <CardTitle>{column}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {taskRows.filter((task) => task.status === column).map((task) => (
                <div key={task.task} className="rounded-md border bg-background p-4">
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-medium">{task.task}</p>
                    <StatusBadge status={task.status} />
                  </div>
                  <p className="mt-3 text-sm text-muted-foreground">Owner: {task.owner}</p>
                  <p className="text-sm text-muted-foreground">Due: {task.due}</p>
                  <p className="mt-2 text-xs font-medium uppercase text-primary">{task.priority}</p>
                  {task.id && access.canEdit ? (
                    <div className="mt-3">
                      <RowActions
                        onEdit={async () => {
                          const status = window.prompt("Status", task.status);
                          if (status === null) return;
                          await updateTask(task.id!, status);
                          await queryClient.invalidateQueries({ queryKey: ["event-data"] });
                        }}
                        onDelete={async () => {
                          if (!window.confirm("Delete this task?")) return;
                          await deleteTask(task.id!);
                          await queryClient.invalidateQueries({ queryKey: ["event-data"] });
                        }}
                      />
                    </div>
                  ) : null}
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
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

async function updateTask(id: string, status: string) {
  if (!supabase) throw new Error("Supabase is not configured");
  const { error } = await supabase.from("tasks").update({ status }).eq("id", id);
  if (error) throw error;
}

async function deleteTask(id: string) {
  if (!supabase) throw new Error("Supabase is not configured");
  const { error } = await supabase.from("tasks").delete().eq("id", id);
  if (error) throw error;
}
import { useQueryClient } from "@tanstack/react-query";
