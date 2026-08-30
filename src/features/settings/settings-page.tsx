import { useQueryClient } from "@tanstack/react-query";
import { FormEvent, useState } from "react";
import { DataSourceBadge } from "@/components/shared/data-source-badge";
import { FormField } from "@/components/shared/form-field";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useSession } from "@/lib/auth";
import { useEventContext } from "@/lib/event-context";
import { useEventData } from "@/lib/event-data";
import { pageLabels } from "@/lib/page-access";
import { supabase } from "@/lib/supabase";

const grantablePages = Object.entries(pageLabels).filter(([key]) => !["dashboard", "expenses", "settings"].includes(key));

export function SettingsPage() {
  const { data } = useEventData();
  const { data: session } = useSession();
  const { selectedEventId, setSelectedEventId } = useEventContext();
  const queryClient = useQueryClient();
  const [eventMessage, setEventMessage] = useState<string | null>(null);
  const [accessMessage, setAccessMessage] = useState<string | null>(null);

  async function createEvent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;
    const formData = new FormData(event.currentTarget);
    setEventMessage("Creating event...");

    const { data: newEventId, error } = await supabase.rpc("create_event_with_admin", {
      event_name: String(formData.get("eventName")),
      event_start_date: String(formData.get("startDate")),
      event_end_date: String(formData.get("endDate")),
      event_location: String(formData.get("location") ?? ""),
      event_description: String(formData.get("description") ?? ""),
    });

    if (error) {
      setEventMessage(error.message);
      return;
    }

    await queryClient.invalidateQueries({ queryKey: ["events"] });
    await queryClient.invalidateQueries({ queryKey: ["event-data"] });
    if (newEventId) setSelectedEventId(newEventId);
    setEventMessage("Event created. You are the default admin.");
    event.currentTarget.reset();
  }

  async function grantAccess(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !selectedEventId) return;
    const formData = new FormData(event.currentTarget);
    setAccessMessage("Granting access...");

    const { error } = await supabase.rpc("grant_event_page_access", {
      target_event_id: selectedEventId,
      member_email: String(formData.get("email")),
      member_role: String(formData.get("role")),
      target_page_key: String(formData.get("page")),
      target_access_level: String(formData.get("access")),
    });

    if (error) {
      setAccessMessage(error.message);
      return;
    }

    await queryClient.invalidateQueries({ queryKey: ["page-access"] });
    setAccessMessage("Access granted.");
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
                    <option value="viewer">Viewer</option>
                    <option value="volunteer">Volunteer</option>
                    <option value="committee">Committee</option>
                    <option value="finance">Finance</option>
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
              <Button type="submit" disabled={!session || !selectedEventId}>Grant Access</Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
