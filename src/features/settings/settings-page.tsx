import { useQueryClient } from "@tanstack/react-query";
import { FormEvent, useState } from "react";
import { DataSourceBadge } from "@/components/shared/data-source-badge";
import { FormField } from "@/components/shared/form-field";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiFetch } from "@/lib/api";
import { useSession } from "@/lib/auth";
import { useEventContext } from "@/lib/event-context";
import { useEventData } from "@/lib/event-data";
import { pageLabels, usePageAccess } from "@/lib/page-access";

const grantablePages = Object.entries(pageLabels).filter(([key]) => !["dashboard", "expenses", "settings"].includes(key));

export function SettingsPage() {
  const { data } = useEventData();
  const { data: session } = useSession();
  const access = usePageAccess("settings");
  const { selectedEventId, setSelectedEventId } = useEventContext();
  const queryClient = useQueryClient();
  const [eventMessage, setEventMessage] = useState<string | null>(null);
  const [accessMessage, setAccessMessage] = useState<string | null>(null);

  async function createEvent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session) return;
    const formData = new FormData(event.currentTarget);
    setEventMessage("Creating event...");

    try {
      const { eventId } = await apiFetch<{ eventId: string }>("/api/events", {
        method: "POST",
        body: {
          eventName: String(formData.get("eventName")),
          startDate: String(formData.get("startDate")),
          endDate: String(formData.get("endDate")),
          location: String(formData.get("location") ?? ""),
          description: String(formData.get("description") ?? ""),
        },
      });

      await queryClient.invalidateQueries({ queryKey: ["events"] });
      await queryClient.invalidateQueries({ queryKey: ["event-data"] });
      await queryClient.invalidateQueries({ queryKey: ["page-access"] });
      setSelectedEventId(eventId);
      setEventMessage("Event created. You are the event admin.");
      event.currentTarget.reset();
    } catch (error) {
      setEventMessage(error instanceof Error ? error.message : "Unable to create event");
      return;
    }
  }

  async function grantAccess(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedEventId) return;
    const formData = new FormData(event.currentTarget);
    setAccessMessage("Granting access...");

    try {
      await apiFetch("/api/event-members", {
        method: "POST",
        body: {
          eventId: selectedEventId,
          email: String(formData.get("email")),
          role: String(formData.get("role")),
          pageKey: String(formData.get("page")),
          accessLevel: String(formData.get("access")),
        },
      });

      await queryClient.invalidateQueries({ queryKey: ["page-access"] });
      setAccessMessage("Access granted.");
    } catch (error) {
      setAccessMessage(error instanceof Error ? error.message : "Unable to grant access");
      return;
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Settings</h2>
          <p className="text-sm text-muted-foreground">Create events and manage member access for the active event.</p>
        </div>
        <DataSourceBadge source={data.source} />
      </div>

      {!session ? (
        <Card>
          <CardContent className="p-5 text-sm text-muted-foreground">Sign in with Google to create events and manage access.</CardContent>
        </Card>
      ) : null}

      {session && !access.canEdit ? (
        <Card>
          <CardContent className="p-5 text-sm text-muted-foreground">
            You are signed in, but only an event admin can create events or manage member access.
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Create Event</CardTitle>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={createEvent}>
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField label="Event Name" name="eventName" required />
                <FormField label="Location" name="location" />
                <FormField label="Start Date" name="startDate" type="date" required />
                <FormField label="End Date" name="endDate" type="date" required />
                <FormField label="Description" name="description" />
              </div>
              {eventMessage ? <p className="text-sm text-muted-foreground">{eventMessage}</p> : null}
              <Button type="submit" disabled={!session}>Create Event</Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Grant Page Access</CardTitle>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={grantAccess}>
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField label="Member Gmail" name="email" type="email" required />
                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="role">Role</label>
                  <select id="role" name="role" className="h-10 w-full rounded-md border bg-background px-3 text-sm">
                    <option value="read_only">Read-only</option>
                    <option value="committee">Committee</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="page">Page</label>
                  <select id="page" name="page" className="h-10 w-full rounded-md border bg-background px-3 text-sm">
                    {grantablePages.map(([key, label]) => (
                      <option key={key} value={key}>{label}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="access">Access</label>
                  <select id="access" name="access" className="h-10 w-full rounded-md border bg-background px-3 text-sm">
                    <option value="view">View</option>
                    <option value="edit">Edit</option>
                    <option value="none">No access</option>
                  </select>
                </div>
              </div>
              {accessMessage ? <p className="text-sm text-muted-foreground">{accessMessage}</p> : null}
              <Button type="submit" disabled={!access.canEdit || !selectedEventId}>Grant Access</Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
