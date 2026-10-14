import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Sparkles } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";
import { useSettingsDirty } from "@/features/settings/settings-dirty-state";
import { useEventContext } from "@/lib/event-context";
import { useEventData } from "@/lib/event-data";
import { MAX_ITEMS, MAX_TEXT, MAX_TITLE, suggestedTitles, type GoodToKnow } from "@/lib/good-to-know";
import { usePageAccess } from "@/lib/page-access";
import { BlockRow, FieldRow, ListGroup, ListRow } from "@/features/settings/ios-list";
import { fieldInput } from "@/features/settings/ios-styles";

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

  const dirty =
    directionsUrl !== (saved?.directionsUrl ?? "") || JSON.stringify(items) !== JSON.stringify(saved?.items ?? []);
  useSettingsDirty("good-to-know", dirty);

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
    <div>
      <ListGroup
        header="Good to know"
        footer="The practical things residents ask in the group: parking, what to bring, who to call. Shown on the event page. Anyone with the link may read it, so write what you would post in the society group."
      >
        <FieldRow id="gtk-directions" label="Directions" hint="optional">
          <input
            id="gtk-directions"
            type="url"
            inputMode="url"
            className={fieldInput}
            placeholder="Add a Maps link"
            value={directionsUrl}
            onChange={(event) => setDirectionsUrl(event.target.value)}
          />
        </FieldRow>
      </ListGroup>
      <p className="mt-1.5 px-4 text-[13px] leading-snug text-muted-foreground">
        A Google Maps link to the exact spot. Without one, residents get a search for the venue&apos;s name.
      </p>

      {items.map((item, index) => (
        <ListGroup key={index} header={`Entry ${index + 1}`}>
          <FieldRow id={`gtk-title-${index}`} label="Heading">
            <input
              id={`gtk-title-${index}`}
              aria-label={`Heading ${index + 1}`}
              className={fieldInput}
              placeholder="Parking"
              value={item.title}
              maxLength={MAX_TITLE}
              onChange={(event) => setItems((all) => all.map((row, at) => (at === index ? { ...row, title: event.target.value } : row)))}
            />
          </FieldRow>
          <BlockRow>
            <textarea
              aria-label={`Text for ${item.title || `entry ${index + 1}`}`}
              placeholder="What residents need to know"
              value={item.text}
              maxLength={MAX_TEXT}
              onChange={(event) => setItems((all) => all.map((row, at) => (at === index ? { ...row, text: event.target.value } : row)))}
              className="min-h-20 w-full resize-y bg-transparent text-base outline-none placeholder:text-muted-foreground/70"
            />
          </BlockRow>
          <ListRow
            title="Remove entry"
            destructive
            chevron={false}
            onClick={() => setItems((all) => all.filter((_, at) => at !== index))}
          />
        </ListGroup>
      ))}

      {items.length < MAX_ITEMS || !items.length ? (
        <ListGroup>
          {items.length < MAX_ITEMS ? (
            <ListRow icon={Plus} title="Add an entry" chevron={false} onClick={() => setItems((all) => [...all, { title: "", text: "" }])} />
          ) : null}
          {!items.length ? (
            <ListRow
              icon={Sparkles}
              title="Add suggestions"
              chevron={false}
              onClick={() => setItems(suggestedTitles.map((title) => ({ title, text: "" })))}
            />
          ) : null}
        </ListGroup>
      ) : null}

      {unfinished ? (
        <p className="mt-3 px-4 text-[13px] text-muted-foreground">
          {unfinished} {unfinished === 1 ? "heading has" : "headings have"} no text yet, so {unfinished === 1 ? "it" : "they"} will not be shown.
        </p>
      ) : null}
      {message ? (
        <p
          role={message.tone === "error" ? "alert" : "status"}
          className={message.tone === "error" ? "mt-3 rounded-2xl bg-destructive/10 p-3 text-sm text-destructive" : "mt-3 px-4 text-sm text-emerald-800"}
        >
          {message.text}
        </p>
      ) : null}

      <div className="mt-6 px-1">
        <Button type="button" className="h-12 w-full rounded-2xl text-base" disabled={save.isPending} onClick={() => void submit()}>
          {save.isPending ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  );
}
