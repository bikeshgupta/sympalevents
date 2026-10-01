import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";
import { useEventContext } from "@/lib/event-context";
import { useEventData } from "@/lib/event-data";
import { usePageAccess } from "@/lib/page-access";

/**
 * The event's readable address.
 *
 * Migration 029 derives one from the event's name - "Ganesh Chaturthi 2026"
 * becomes `ganesh-chaturthi-2026` - which is correct but long. This is where a
 * committee shortens it to `ganesh-2026`.
 *
 * The warning is the point of the card as much as the field is: changing this
 * breaks every link already shared, and the honest answer sits beside it, since
 * `/s/<token>` is the permanent address and does not move.
 */
export function AddressCard() {
  const { data } = useEventData({ includeTasks: false });
  const { selectedEventId } = useEventContext();
  const access = usePageAccess("settings");
  const queryClient = useQueryClient();

  const [draft, setDraft] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: (slug: string) =>
      apiFetch("/api/events?resource=appearance", {
        method: "PATCH",
        body: { eventId: selectedEventId, slug },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["event-data"] });
      queryClient.invalidateQueries({ queryKey: ["my-events"] });
      queryClient.invalidateQueries({ queryKey: ["resolve-event"] });
    },
  });

  if (!selectedEventId || access.role !== "admin") return null;

  const current = data.event.slug ?? "";
  const societySlug = data.event.societySlug ?? "";
  const value = draft ?? current;

  async function submit(formEvent: React.FormEvent) {
    formEvent.preventDefault();
    setMessage(null);
    try {
      await save.mutateAsync(value);
      setDraft(null);
      setMessage("Address updated. Links using the old one will no longer work.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not change the address");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Event address</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          The readable part of this event&rsquo;s web address. Letters, numbers and hyphens.
        </p>

        {current || societySlug ? (
          <form onSubmit={submit} className="space-y-2">
            <label className="block text-sm font-medium" htmlFor="event-slug">
              Address
            </label>
            {/* The whole URL, so somebody editing one segment can see what they
                are editing it inside. */}
            <div className="flex flex-wrap items-center gap-1 text-sm">
              <span className="truncate text-muted-foreground">/society/{societySlug || "…"}/events/</span>
              <Input
                id="event-slug"
                value={value}
                onChange={(item) => setDraft(item.target.value)}
                className="h-10 w-full sm:w-56"
                autoComplete="off"
                spellCheck={false}
              />
            </div>

            <Button type="submit" size="sm" disabled={save.isPending || !value.trim() || value === current}>
              {save.isPending ? "Saving..." : "Save address"}
            </Button>
          </form>
        ) : (
          <p className="rounded-md bg-amber-100 p-3 text-sm text-amber-900">
            Readable addresses need <code className="font-mono">supabase/migrations/029_society_home.sql</code>.
            Until it is run this event uses its id in the address.
          </p>
        )}

        <p className="text-xs text-muted-foreground">
          Changing this <strong>breaks links already shared</strong>. For anything going into a residents&rsquo;
          group, use the share link above instead &mdash; that one never moves, even if the address changes.
        </p>

        {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
      </CardContent>
    </Card>
  );
}
