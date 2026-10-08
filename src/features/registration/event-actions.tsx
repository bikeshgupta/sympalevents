import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { usePageAccess } from "@/lib/page-access";
import { useEventAccess } from "@/lib/event-access";
import { useEventPath } from "@/lib/event-path";
import { apiFetch } from "@/lib/api";
import { formatCurrency } from "@/lib/utils";
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
  async function publish(action: string, confirm = false) {
    setBusy(true);
    setError("");
    try {
      await apiFetch(`/api/events?resource=publication&eventId=${event.id}`, {
        method: "PATCH",
        body: { action, confirm },
      });
      await Promise.all([
        client.invalidateQueries({ queryKey: ["event-data"] }),
        client.invalidateQueries({ queryKey: ["society-home"] }),
        client.invalidateQueries({ queryKey: ["my-events"] }),
        client.invalidateQueries({ queryKey: ["registration"] }),
      ]);
    } catch (e) {
      const failure = e as Error & { code?: string; details?: { warnings?: { label: string; detail?: string }[] } };
      // Gaps that only need a second look are put to the organiser rather than
      // refused: plenty of events publish before the programme is final.
      if (failure.code === "readiness_warnings") {
        const list = (failure.details?.warnings ?? []).map((item) => `- ${item.label}: ${item.detail ?? "missing"}`).join("\n");
        setBusy(false);
        if (window.confirm(`${failure.message}\n\n${list}`)) await publish(action, true);
        return;
      }
      setError(e instanceof Error ? e.message : "Could not update event");
    } finally {
      setBusy(false);
    }
  }

  // Cancelling reaches other people's money, so the confirmation says how much.
  async function cancelEvent() {
    setError("");
    let text = "Cancel this event? Residents will be told it is off.";
    try {
      const { preview } = await apiFetch<{ preview: { active: number; paid: number; amount: number } }>(
        `/api/events?resource=publication&eventId=${event.id}`,
        { method: "PATCH", body: { action: "cancel", preview: true } },
      );
      if (preview.active > 0) {
        text =
          `Cancel this event? ${preview.active} active ${preview.active === 1 ? "registration" : "registrations"} will be cancelled` +
          (preview.paid > 0
            ? `, and ${preview.paid} that ${preview.paid === 1 ? "has" : "have"} paid or submitted payment (${formatCurrency(preview.amount)}) will be marked for refund review.`
            : ". None have paid.");
      }
    } catch {
      /* the plain wording stands; the cancel itself is still checked by the server */
    }
    if (window.confirm(text)) void publish("cancel");
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
                  onClick={() => void cancelEvent()}
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
