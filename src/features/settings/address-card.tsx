import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";
import { useSettingsDirty } from "@/features/settings/settings-dirty-state";
import { useEventContext } from "@/lib/event-context";
import { useEventData } from "@/lib/event-data";
import { usePageAccess } from "@/lib/page-access";
import { BlockRow, FieldRow, ListGroup } from "@/features/settings/ios-list";
import { fieldInput } from "@/features/settings/ios-styles";

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

  const currentSociety = data.event.societySlug ?? "";
  const currentEvent = data.event.slug ?? "";
  const societyValue = societyDraft ?? currentSociety;
  const eventValue = eventDraft ?? currentEvent;
  const dirty = societyValue !== currentSociety || eventValue !== currentEvent;
  useSettingsDirty("address", dirty);

  if (!selectedEventId || access.role !== "admin") return null;

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

  return (
    <div>
      {!ready ? (
        <p className="rounded-2xl bg-amber-100 p-3 text-sm text-amber-900">
          Readable addresses need <code className="break-all font-mono">supabase/migrations/029_society_home.sql</code>.
          Until it is run, this event uses its id in the address.
        </p>
      ) : (
        <form onSubmit={submit}>
          <ListGroup
            header="Web address"
            footer={
              <>
                {message ? <span className="mb-1 block">{message}</span> : null}
                The society part is shared by every event in this society, so changing it moves all of them. Changing an
                address <strong>breaks links already shared</strong>. For anything going into a residents&rsquo; group,
                use the share link above instead &mdash; that one never moves.
              </>
            }
          >
            {/* Shown as the URL it actually is, so somebody editing one segment can see what they are editing it inside. */}
            <FieldRow id="society-slug" label="Society">
              <span className="shrink-0 text-sm text-muted-foreground">/society/</span>
              <input
                id="society-slug"
                className={`${fieldInput} text-left`}
                value={societyValue}
                onChange={(item) => setSocietyDraft(item.target.value)}
                autoComplete="off"
                spellCheck={false}
              />
            </FieldRow>
            <FieldRow id="event-slug" label="Event">
              <span className="shrink-0 text-sm text-muted-foreground">/events/</span>
              <input
                id="event-slug"
                className={`${fieldInput} text-left`}
                value={eventValue}
                onChange={(item) => setEventDraft(item.target.value)}
                autoComplete="off"
                spellCheck={false}
              />
            </FieldRow>
            <BlockRow>
              <p className="break-all font-mono text-xs text-muted-foreground">
                /society/{societyValue || "…"}/events/{eventValue || "…"}/dashboard
              </p>
            </BlockRow>
          </ListGroup>
          <div className="mt-4 px-1">
            <Button type="submit" className="h-12 w-full rounded-2xl text-base" disabled={busy || !dirty || !societyValue.trim() || !eventValue.trim()}>
              {busy ? "Saving..." : "Save address"}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
