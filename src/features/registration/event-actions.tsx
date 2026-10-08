import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { usePageAccess } from "@/lib/page-access";
import { useEventAccess } from "@/lib/event-access";
import { useEventPath } from "@/lib/event-path";
import { apiFetch } from "@/lib/api";
import type { AppEvent } from "@/lib/event-data";

export function EventActions({ event }: { event: AppEvent }) {
  const admin = usePageAccess("settings");
  const { data: access } = useEventAccess();
  const path = useEventPath();
  const client = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const registration = access?.pages.some(
    (p) => p.pageKey === "registration" && p.canView,
  );
  async function publish(action: string) {
    setBusy(true);
    setError("");
    try {
      await apiFetch(`/api/events?resource=publication&eventId=${event.id}`, {
        method: "PATCH",
        body: { action },
      });
      await Promise.all([
        client.invalidateQueries({ queryKey: ["event-data"] }),
        client.invalidateQueries({ queryKey: ["society-home"] }),
        client.invalidateQueries({ queryKey: ["my-events"] }),
        client.invalidateQueries({ queryKey: ["registration"] }),
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update event");
    } finally {
      setBusy(false);
    }
  }
  if (!event.id) return null;
  return (
    <section className="rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold">
            {event.statusOverride === "draft"
              ? "Draft · only organisers can preview"
              : event.statusOverride === "cancelled"
                ? "This event has been cancelled"
                : "Join the event"}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {event.statusOverride === "draft"
              ? "Set up registration and the programme, then publish when ready."
              : event.statusOverride === "cancelled"
                ? "Contact the organiser about any pending refund."
                : "Registration and entry details for your household."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {registration && (
            <Button asChild>
              <Link to={path("/registration")}>
                {admin.canEdit ? "Manage registration" : "Registration details"}
              </Link>
            </Button>
          )}
          {admin.canEdit && (
            <>
              {event.statusOverride === "draft" && (
                <Button disabled={busy} onClick={() => void publish("publish")}>
                  Publish event
                </Button>
              )}
              {event.statusOverride === null && (
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => {
                    if (
                      window.confirm(
                        "Cancel this event and all active registrations? Paid bookings will be marked for refund review.",
                      )
                    )
                      void publish("cancel");
                  }}
                >
                  Cancel event
                </Button>
              )}
            </>
          )}
        </div>
      </div>
      {error && (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {error}
        </p>
      )}
    </section>
  );
}
