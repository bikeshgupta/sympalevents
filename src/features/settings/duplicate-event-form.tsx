import { useQueryClient } from "@tanstack/react-query";
import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiFetch } from "@/lib/api";
import { useEventContext } from "@/lib/event-context";

/**
 * Run an event again: a new draft with the same shape and none of its history.
 * The server is api/_lib/duplicate-event.ts, which is where what is and is not
 * copied is written down; this just asks for a name and a start date.
 *
 * Shared by Settings (copy the event you are in) and the new-event wizard (copy
 * one of your earlier events), so the promise it makes is said in one place.
 */
export function DuplicateEventForm({ eventId, defaultName }: { eventId: string; defaultName: string }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { setSelectedEventId } = useEventContext();

  const [name, setName] = useState(defaultName);
  const [startDate, setStartDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { eventId: created } = await apiFetch<{ eventId: string }>("/api/events?resource=duplicate", {
        method: "POST",
        body: { eventId, name: name.trim(), startDate },
      });
      await queryClient.invalidateQueries({ queryKey: ["my-events"] });
      setSelectedEventId(created);
      // A draft with a checklist: the command centre is where it gets finished.
      navigate(`/e/${created}/command`);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not copy the event");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(event) => void submit(event)} className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Copies the setup - modules, appearance, registration prices and the programme (moved to the new dates) - into a
        new <span className="font-medium text-foreground">draft</span>. It does not copy registrations, payments,
        contributions, sponsors, budgets, expenses, tasks, announcements, photos or members. Registration starts
        switched off.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="dup-name">Name of the new event</Label>
          <Input id="dup-name" value={name} onChange={(event) => setName(event.target.value)} required minLength={2} maxLength={100} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="dup-start">It starts on</Label>
          <Input id="dup-start" type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} required />
        </div>
      </div>
      {error ? (
        <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <Button type="submit" disabled={busy || !name.trim() || !startDate}>
        {busy ? "Copying…" : "Create draft copy"}
      </Button>
    </form>
  );
}
