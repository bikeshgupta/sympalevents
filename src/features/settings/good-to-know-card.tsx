import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiFetch } from "@/lib/api";
import { useEventContext } from "@/lib/event-context";
import { useEventData } from "@/lib/event-data";
import { MAX_ITEMS, MAX_TEXT, MAX_TITLE, suggestedTitles, type GoodToKnow } from "@/lib/good-to-know";
import { usePageAccess } from "@/lib/page-access";

/**
 * Settings -> Good to know: the practical things residents ask in the group.
 *
 * Where to park, what to bring, who to call. Written once here, shown on the
 * event page - which is cheaper than answering it forty times on WhatsApp and
 * is also what stops a resident's home page being a poster with a button.
 *
 * Nothing is published until it has both a heading and some words and is saved,
 * so "Add suggestions" can put headings in place without putting empty boxes in
 * front of residents. It is text on a page that may be public: no phone number
 * or detail the committee would not post in the society group.
 */
export function GoodToKnowCard() {
  const { data } = useEventData({ includeTasks: false });
  const { selectedEventId } = useEventContext();
  const saved = data.event.goodToKnow ?? null;
  // Re-seeded whenever what is stored changes - the first read arrives after
  // the first render, and a form that kept its first (empty) state would
  // quietly show nothing where there is something.
  return <GoodToKnowEditor key={`${selectedEventId}|${JSON.stringify(saved)}`} saved={saved} />;
}

function GoodToKnowEditor({ saved }: { saved: GoodToKnow | null }) {
  const { selectedEventId } = useEventContext();
  const access = usePageAccess("dashboard");
  const queryClient = useQueryClient();

  const [items, setItems] = useState<{ title: string; text: string }[]>(saved?.items ?? []);
  const [directionsUrl, setDirectionsUrl] = useState(saved?.directionsUrl ?? "");
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const save = useMutation({
    mutationFn: (value: GoodToKnow | null) =>
      apiFetch("/api/events?resource=appearance", { method: "PATCH", body: { eventId: selectedEventId, goodToKnow: value } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["event-data"] }),
  });

  if (!selectedEventId || !access.canEdit) return null;

  async function submit() {
    setMessage(null);
    const complete = items.filter((item) => item.title.trim() && item.text.trim());
    try {
      await save.mutateAsync(
        complete.length || directionsUrl.trim()
          ? { items: complete, ...(directionsUrl.trim() ? { directionsUrl: directionsUrl.trim() } : {}) }
          : null,
      );
      setMessage({ tone: "ok", text: "Saved. Residents see this on the event page." });
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "Could not save" });
    }
  }

  const unfinished = items.filter((item) => item.title.trim() && !item.text.trim()).length;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Good to know</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          The practical things residents ask in the group: parking, what to bring, who to call. Shown on the event page.
          Anyone with the link may read it, so write what you would post in the society group.
        </p>

        <div className="space-y-1.5">
          <Label htmlFor="gtk-directions">Directions link (optional)</Label>
          <Input
            id="gtk-directions"
            type="url"
            inputMode="url"
            placeholder="https://maps.app.goo.gl/…"
            value={directionsUrl}
            onChange={(event) => setDirectionsUrl(event.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            A Google Maps link to the exact spot. Without one, residents get a search for the venue's name.
          </p>
        </div>

        <ul className="space-y-3">
          {items.map((item, index) => (
            <li key={index} className="space-y-2 rounded-md border p-3">
              <div className="flex items-center gap-2">
                <Input
                  aria-label={`Heading ${index + 1}`}
                  placeholder="Heading, e.g. Parking"
                  value={item.title}
                  maxLength={MAX_TITLE}
                  onChange={(event) => setItems((all) => all.map((row, at) => (at === index ? { ...row, title: event.target.value } : row)))}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove ${item.title || `entry ${index + 1}`}`}
                  onClick={() => setItems((all) => all.filter((_, at) => at !== index))}
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </Button>
              </div>
              <textarea
                aria-label={`Text for ${item.title || `entry ${index + 1}`}`}
                placeholder="What residents need to know"
                value={item.text}
                maxLength={MAX_TEXT}
                onChange={(event) => setItems((all) => all.map((row, at) => (at === index ? { ...row, text: event.target.value } : row)))}
                className="min-h-20 w-full rounded-md border border-input bg-background p-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </li>
          ))}
        </ul>

        <div className="flex flex-wrap gap-2">
          {items.length < MAX_ITEMS ? (
            <Button type="button" variant="outline" className="h-10" onClick={() => setItems((all) => [...all, { title: "", text: "" }])}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              Add an entry
            </Button>
          ) : null}
          {!items.length ? (
            <Button
              type="button"
              variant="outline"
              className="h-10"
              onClick={() => setItems(suggestedTitles.map((title) => ({ title, text: "" })))}
            >
              Add suggestions
            </Button>
          ) : null}
        </div>

        {unfinished ? (
          <p className="text-xs text-muted-foreground">
            {unfinished} {unfinished === 1 ? "heading has" : "headings have"} no text yet, so {unfinished === 1 ? "it" : "they"} will not be shown.
          </p>
        ) : null}
        {message ? (
          <p role={message.tone === "error" ? "alert" : "status"} className={message.tone === "error" ? "rounded-md bg-destructive/10 p-3 text-sm text-destructive" : "text-sm text-emerald-800"}>
            {message.text}
          </p>
        ) : null}

        <Button type="button" disabled={save.isPending} onClick={() => void submit()}>
          {save.isPending ? "Saving…" : "Save"}
        </Button>
      </CardContent>
    </Card>
  );
}
