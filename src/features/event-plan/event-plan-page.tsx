import { useQueryClient } from "@tanstack/react-query";
import { CalendarDays, ListChecks, MapPin } from "lucide-react";
import { FormEvent, useState } from "react";
import { DataSourceBadge } from "@/components/shared/data-source-badge";
import { FormField } from "@/components/shared/form-field";
import { StatCard } from "@/components/shared/stat-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { CrudDialog, formNumber, formString } from "@/features/shared/crud-dialog";
import { PageTools } from "@/features/shared/page-tools";
import { RowActions } from "@/features/shared/row-actions";
import { ColumnFilter, SortableHeader, TableColumn, TableToolbar, useFilteredSortedRows } from "@/features/shared/table-tools";
import { apiFetch } from "@/lib/api";
import { EventPlanRow, getFirstEventId, useEventData } from "@/lib/event-data";
import { useEventContext } from "@/lib/event-context";
import { usePageAccess } from "@/lib/page-access";

function todayDateInputValue() {
  return new Date().toISOString().slice(0, 10);
}

const eventPlanColumns: TableColumn<EventPlanRow>[] = [
  { key: "day", label: "Day", getValue: (row) => row.day },
  { key: "date", label: "Date", getValue: (row) => row.date },
  { key: "activity", label: "Event", getValue: (row) => row.activity },
  { key: "subEvents", label: "Sub Events", getValue: (row) => row.subEvents },
  { key: "startTime", label: "Start", getValue: (row) => row.startTime },
  { key: "endTime", label: "End", getValue: (row) => row.endTime },
  { key: "location", label: "Location", getValue: (row) => row.location },
  { key: "attendance", label: "Attendance", getValue: (row) => row.attendance },
  { key: "owner", label: "Owner", getValue: (row) => row.owner },
  { key: "status", label: "Status", getValue: (row) => row.status },
];

function splitSubEvents(value: string) {
  return value
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function TextareaField({ label, name, defaultValue }: { label: string; name: string; defaultValue?: string }) {
  return (
    <div className="space-y-2 sm:col-span-2">
      <Label htmlFor={name}>{label}</Label>
      <textarea
        id={name}
        name={name}
        defaultValue={defaultValue}
        rows={3}
        className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
      />
    </div>
  );
}

function EventPlanFields({ plan }: { plan?: EventPlanRow }) {
  return (
    <>
      <FormField label="Day" name="day" defaultValue={plan?.day} />
      <FormField label="Date" name="date" type="date" defaultValue={plan?.date && plan.date !== "-" ? plan.date : todayDateInputValue()} required />
      <FormField label="Event" name="activity" defaultValue={plan?.activity} required />
      <FormField label="Start Time" name="startTime" type="time" defaultValue={plan?.startTime} />
      <FormField label="End Time" name="endTime" type="time" defaultValue={plan?.endTime} />
      <FormField label="Location" name="location" defaultValue={plan?.location} />
      <FormField label="Expected Attendance" name="attendance" type="number" defaultValue={plan?.attendance ?? 0} />
      <FormField label="Owner" name="owner" defaultValue={plan?.owner} />
      <FormField label="Status" name="status" defaultValue={plan?.status ?? "Planned"} />
      <TextareaField label="Sub Events" name="subEvents" defaultValue={plan?.subEvents} />
      <TextareaField label="Notes" name="notes" defaultValue={plan?.notes} />
    </>
  );
}

export function EventPlanPage() {
  const { data } = useEventData();
  const { selectedEventId } = useEventContext();
  const access = usePageAccess("event-plan");
  const planRows = data.eventPlan;
  const planTable = useFilteredSortedRows(planRows, eventPlanColumns, "date");
  const locations = new Set(planRows.map((row) => row.location).filter(Boolean)).size;
  const subEventCount = planRows.reduce((sum, row) => sum + splitSubEvents(row.subEvents).length, 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Events</h2>
          <p className="text-sm text-muted-foreground">Plan event timings, owners, locations, and optional sub-events for the dashboard timeline.</p>
        </div>
        <DataSourceBadge source={data.source} reason={data.fallbackReason} />
      </div>
      <section className="grid gap-3 sm:grid-cols-3">
        <StatCard title="Events" value={String(planRows.length)} icon={CalendarDays} />
        <StatCard title="Sub Events" value={String(subEventCount)} icon={ListChecks} />
        <StatCard title="Locations" value={String(locations)} icon={MapPin} />
      </section>
      <PageTools
        action={
          access.canEdit ? <CrudDialog title="Add Event" triggerLabel="Add Event" onSubmit={(formData) => addEventPlan(formData, selectedEventId)}><EventPlanFields /></CrudDialog> : <span className="text-sm text-muted-foreground">View-only access</span>
        }
      />
      <Card className="overflow-x-auto">
        <TableToolbar resultCount={planTable.rows.length} totalCount={planRows.length} />
        <table className="min-w-[1240px] w-full text-sm">
          <thead className="bg-muted text-left text-muted-foreground">
            <tr>
              {eventPlanColumns.map((column) => (
                <th key={column.key} className="px-4 py-3 font-medium">
                  <SortableHeader label={column.label} columnKey={column.key} sortKey={planTable.sortKey} sortDirection={planTable.sortDirection} onSort={planTable.toggleSort} />
                  <ColumnFilter column={column} rows={planRows} filters={planTable.filters} onFilterChange={planTable.setColumnFilter} />
                </th>
              ))}
              <th className="px-4 py-3 font-medium" />
            </tr>
          </thead>
          <tbody>
            {planTable.rows.map((plan) => (
              <tr key={plan.id ?? `${plan.date}-${plan.activity}`} className="border-t">
                <td className="px-4 py-3">{plan.day}</td>
                <td className="px-4 py-3">{plan.date}</td>
                <td className="px-4 py-3 font-medium">{plan.activity}</td>
                <td className="px-4 py-3">
                  <div className="flex max-w-56 flex-wrap gap-1.5">
                    {splitSubEvents(plan.subEvents).map((subEvent) => (
                      <span key={subEvent} className="rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">{subEvent}</span>
                    ))}
                  </div>
                </td>
                <td className="px-4 py-3">{plan.startTime}</td>
                <td className="px-4 py-3">{plan.endTime}</td>
                <td className="px-4 py-3">{plan.location}</td>
                <td className="px-4 py-3">{plan.attendance}</td>
                <td className="px-4 py-3">{plan.owner}</td>
                <td className="px-4 py-3"><StatusBadge status={plan.status} /></td>
                <td className="px-4 py-3">{plan.id && access.canEdit ? <EventPlanActions plan={plan} /> : null}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function EventPlanActions({ plan }: { plan: EventPlanRow }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await updateEventPlan(plan.id!, new FormData(event.currentTarget));
      await queryClient.invalidateQueries({ queryKey: ["event-data"] });
      setOpen(false);
    } catch (item) {
      setError(item instanceof Error ? item.message : "Unable to update activity");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <RowActions
        onEdit={() => setOpen(true)}
        onDelete={async () => {
          if (!window.confirm("Delete this activity?")) return;
          await deleteEventPlan(plan.id!);
          await queryClient.invalidateQueries({ queryKey: ["event-data"] });
        }}
      />
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Event</DialogTitle></DialogHeader>
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="grid gap-4 sm:grid-cols-2"><EventPlanFields plan={plan} /></div>
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

function eventPlanPayload(formData: FormData) {
  return {
    day: formString(formData, "day"),
    activity_date: formString(formData, "date", todayDateInputValue()),
    activity: formString(formData, "activity"),
    sub_events: formString(formData, "subEvents"),
    start_time: formString(formData, "startTime") || null,
    end_time: formString(formData, "endTime") || null,
    location: formString(formData, "location"),
    expected_attendance: formNumber(formData, "attendance"),
    owner_name: formString(formData, "owner"),
    status: formString(formData, "status", "Planned"),
    notes: formString(formData, "notes"),
  };
}

async function addEventPlan(formData: FormData, selectedEventId?: string) {
  const eventId = selectedEventId ?? await getFirstEventId();
  await apiFetch("/api/event-schedule", {
    method: "POST",
    body: { eventId, ...eventPlanPayload(formData) },
  });
}

async function updateEventPlan(id: string, formData: FormData) {
  await apiFetch("/api/event-schedule", {
    method: "PATCH",
    body: { id, ...eventPlanPayload(formData) },
  });
}

async function deleteEventPlan(id: string) {
  await apiFetch("/api/event-schedule", {
    method: "DELETE",
    body: { id },
  });
}
