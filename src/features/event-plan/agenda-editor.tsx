import { useId } from "react";
import { Label } from "@/components/ui/label";
import { parseAgenda } from "@/lib/agenda";

/**
 * Editor for one event's agenda points (`event_schedule.sub_events`).
 *
 * One plain textarea, one point per line. It stays an uncontrolled field with
 * the same `subEvents` name the surrounding `FormData` flow on the Events page
 * already reads, so nothing about submitting changed - only that a committee
 * member now types a list instead of filling two time inputs per row.
 */
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

  return (
    <div className="space-y-2 sm:col-span-2">
      <Label htmlFor={fieldId}>{label}</Label>
      <textarea
        id={fieldId}
        name={name}
        // Normalised through the parser so a row saved in the older
        // "time | title | note" shape opens as the same bullets it renders as.
        defaultValue={parseAgenda(defaultValue).join("\n")}
        rows={5}
        className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
        placeholder={"Idol arrival and welcome at the gate\nSankalp and sthapana - Pandit ji leads\nPrasad counter opens"}
      />
      <p className="text-xs text-muted-foreground">
        One point per line. Each line shows as a bullet under this event on the dashboard timeline.
      </p>
    </div>
  );
}
