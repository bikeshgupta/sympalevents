import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";
import { useEventContext } from "@/lib/event-context";
import { useEventData } from "@/lib/event-data";
import { usePageAccess } from "@/lib/page-access";

/**
 * The event's web address, both halves of it.
 *
 * Migration 029 derives each from a name - "Tru WindChimes Committee" becomes
 * `tru-windchimes-committee` and "Ganesh Chaturthi 2026" becomes
 * `ganesh-chaturthi-2026`. Both are correct and both are longer than anybody
 * wants to read out. This is where they become `tru-windchimes` and
 * `ganesh-2026`.
 *
 * The two halves are not the same kind of thing and the card says so:
 *
 *  - the **society** half is the first path segment, so it is unique across
 *    the whole app, and changing it moves *every* event in the society;
 *  - the **event** half is unique only within its society, and changing it
 *    moves one event.
 *
 * The warning earns its place as much as the fields do: either change breaks
 * links already shared. The honest answer sits beside it, because `/s/<token>`
 * is the permanent address and does not move.
 */
export function AddressCard() {
  const { data } = useEventData({ includeTasks: false });
  const { selectedEventId, selectedEvent } = useEventContext();
  const access = usePageAccess("settings");
  const queryClient = useQueryClient();

  const [societyDraft, setSocietyDraft] = useState<string | null>(null);
  const [eventDraft, setEventDraft] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ["event-data"] });
    queryClient.invalidateQueries({ queryKey: ["my-events"] });
    queryClient.invalidateQueries({ queryKey: ["society-home"] });
    queryClient.invalidateQueries({ queryKey: ["resolve-event"] });
  }

  const saveEvent = useMutation({
    mutationFn: (slug: string) =>
      apiFetch("/api/events?resource=appearance", {
        method: "PATCH",
        body: { eventId: selectedEventId, slug },
      }),
    onSuccess: refresh,
  });

  const saveSociety = useMutation({
    mutationFn: (slug: string) =>
      apiFetch("/api/events?resource=societies", {
        method: "PATCH",
        body: { societyId: selectedEvent?.societyId, slug },
      }),
    onSuccess: refresh,
  });

  if (!selectedEventId || access.role !== "admin") return null;

  const currentSociety = data.event.societySlug ?? "";
  const currentEvent = data.event.slug ?? "";
  const societyValue = societyDraft ?? currentSociety;
  const eventValue = eventDraft ?? currentEvent;
  const ready = Boolean(currentSociety || currentEvent);
  const busy = saveEvent.isPending || saveSociety.isPending;

  async function submit(formEvent: FormEvent) {
    formEvent.preventDefault();
    setMessage(null);
    try {
      // Society first: if both moved, the event's new address is the one the
      // admin ends up looking at, and it has to be built on the new society.
      if (societyValue !== currentSociety) await saveSociety.mutateAsync(societyValue);
      if (eventValue !== currentEvent) await saveEvent.mutateAsync(eventValue);
      setSocietyDraft(null);
      setEventDraft(null);
      setMessage("Address updated. Links using the old one will no longer work.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not change the address");
    }
  }

  const dirty = societyValue !== currentSociety || eventValue !== currentEvent;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Web address</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {!ready ? (
          <p className="rounded-md bg-amber-100 p-3 text-sm text-amber-900">
            Readable addresses need <code className="break-all font-mono">supabase/migrations/029_society_home.sql</code>.
            Until it is run, this event uses its id in the address.
          </p>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            {/* Shown as the URL it actually is, so somebody editing one segment
                can see what they are editing it inside. */}
            <div className="space-y-2">
              <label className="block text-sm font-medium" htmlFor="society-slug">
                Society
              </label>
              <div className="flex items-center gap-1 text-sm">
                <span className="shrink-0 text-muted-foreground">/society/</span>
                <Input
                  id="society-slug"
                  value={societyValue}
                  onChange={(item) => setSocietyDraft(item.target.value)}
                  className="h-10 w-full sm:w-64"
                  autoComplete="off"
                  spellCheck={false}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Shared by every event in this society &mdash; changing it moves all of them.
              </p>
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium" htmlFor="event-slug">
                Event
              </label>
              <div className="flex items-center gap-1 text-sm">
                <span className="shrink-0 text-muted-foreground">/events/</span>
                <Input
                  id="event-slug"
                  value={eventValue}
                  onChange={(item) => setEventDraft(item.target.value)}
                  className="h-10 w-full sm:w-64"
                  autoComplete="off"
                  spellCheck={false}
                />
              </div>
            </div>

            <p className="break-all rounded-md bg-muted p-2.5 font-mono text-xs text-muted-foreground">
              /society/{societyValue || "…"}/events/{eventValue || "…"}/dashboard
            </p>

            <Button type="submit" size="sm" disabled={busy || !dirty || !societyValue.trim() || !eventValue.trim()}>
              {busy ? "Saving..." : "Save address"}
            </Button>
          </form>
        )}

        <p className="text-xs text-muted-foreground">
          Changing an address <strong>breaks links already shared</strong>. For anything going into a
          residents&rsquo; group, use the share link above instead &mdash; that one never moves.
        </p>

        {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
      </CardContent>
    </Card>
  );
}
