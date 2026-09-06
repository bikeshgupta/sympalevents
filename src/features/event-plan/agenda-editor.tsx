import { Plus, Trash2 } from "lucide-react";
import { useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { parseAgenda, serializeAgenda, type AgendaItem } from "@/lib/agenda";

/**
 * Editor for one event's agenda (`event_schedule.sub_events`).
 *
 * It is a controlled component that writes its value into a hidden input, so
 * the surrounding uncontrolled `FormData` flow on the Events page keeps
 * working unchanged - the field is still called `subEvents` and still holds
 * text. The rows only exist to make the timings easy to type; see
 * src/lib/agenda.ts for the format they serialize to.
 *
 * "Paste as text" stays available because bulk-entering a running order from
 * a WhatsApp message is the fastest way to fill this in, and losing that to
 * a nicer form would be a downgrade for the person doing the data entry.
 */
type AgendaRow = AgendaItem & { key: string };

export function AgendaField({
  label = "Agenda / Sub Events",
  name = "subEvents",
  defaultValue = "",
}: {
  label?: string;
  name?: string;
  defaultValue?: string;
}) {
  const fieldId = useId();
  // Rows carry their own key so removing one does not shift every input's
  // identity underneath the person typing - an array index would.
  const nextKey = useRef(0);
  const withKeys = (agenda: AgendaItem[]): AgendaRow[] =>
    agenda.map((item) => ({ ...item, key: `agenda-${(nextKey.current += 1)}` }));
  const [items, setItems] = useState<AgendaRow[]>(() => withKeys(parseAgenda(defaultValue)));
  const [mode, setMode] = useState<"rows" | "text">("rows");
  const [text, setText] = useState(() => serializeAgenda(parseAgenda(defaultValue)));
  const value = mode === "text" ? text : serializeAgenda(items);

  function updateItem(index: number, patch: Partial<AgendaItem>) {
    setItems((current) => current.map((item, position) => (position === index ? { ...item, ...patch } : item)));
  }

  function switchMode(next: "rows" | "text") {
    if (next === mode) return;
    if (next === "text") setText(serializeAgenda(items));
    else setItems(withKeys(parseAgenda(text)));
    setMode(next);
  }

  return (
    <div className="space-y-2 sm:col-span-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Label htmlFor={mode === "text" ? `${fieldId}-text` : undefined}>{label}</Label>
        <Button type="button" variant="ghost" size="sm" onClick={() => switchMode(mode === "rows" ? "text" : "rows")}>
          {mode === "rows" ? "Paste as text" : "Back to rows"}
        </Button>
      </div>

      {mode === "text" ? (
        <>
          <textarea
            id={`${fieldId}-text`}
            value={text}
            onChange={(event) => setText(event.target.value)}
            rows={5}
            className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
            placeholder={"08:30-10:00 | Ganesh Sthapna | Pandit ji leads\n10:00 | Pushpanjali and Arti"}
          />
          <p className="text-xs text-muted-foreground">
            One item per line, as <code>time | title | note</code>. A line with no time still works.
          </p>
        </>
      ) : (
        <div className="space-y-2">
          {items.length ? (
            <ul className="space-y-2">
              {items.map((item, index) => (
                <li key={item.key} className="rounded-md border bg-muted/40 p-2.5">
                  <div className="flex items-start gap-2">
                    {/* Start and end sit side by side even on a phone - they
                        are a pair, and stacking them doubled the row height. */}
                    <div className="grid flex-1 grid-cols-2 gap-2 sm:grid-cols-[7rem_7rem_1fr]">
                      <Input
                        type="time"
                        aria-label={`Item ${index + 1} start time`}
                        value={item.startTime}
                        onChange={(event) => updateItem(index, { startTime: event.target.value })}
                      />
                      <Input
                        type="time"
                        aria-label={`Item ${index + 1} end time`}
                        value={item.endTime}
                        onChange={(event) => updateItem(index, { endTime: event.target.value })}
                      />
                      <Input
                        className="col-span-2 sm:col-span-1"
                        aria-label={`Item ${index + 1} title`}
                        placeholder="Pushpanjali and Arti"
                        value={item.title}
                        onChange={(event) => updateItem(index, { title: event.target.value })}
                      />
                      <Input
                        className="col-span-2 sm:col-span-3"
                        aria-label={`Item ${index + 1} note`}
                        placeholder="Note (optional) - who leads it, where it happens"
                        value={item.note}
                        onChange={(event) => updateItem(index, { note: event.target.value })}
                      />
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Remove agenda item ${index + 1}`}
                      onClick={() => setItems((current) => current.filter((_, position) => position !== index))}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-md bg-muted p-3 text-sm text-muted-foreground">
              No agenda yet. Add the puja, arti, pushpanjali and prasad timings, or the running order of a cultural
              evening - they show up under this event on the dashboard timeline.
            </p>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setItems((current) => [...current, ...withKeys([{ startTime: "", endTime: "", title: "", note: "" }])])}
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Add agenda item
          </Button>
        </div>
      )}

      <input type="hidden" name={name} value={value} />
    </div>
  );
}
