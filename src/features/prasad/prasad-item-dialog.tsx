import { HandHeart, Plus, Users, X } from "lucide-react";
import { FormEvent, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { personKey, slotPresets, type PrasadItem, type PrasadItemInput, type PrasadPerson } from "@/lib/prasad";
import { cn } from "@/lib/utils";

/** `label` is "Day 1"; `sub`, when given, sits under it ("Mon, 14 Sept"). */
export type EventDay = { date: string; label: string; sub?: string };

type Row = PrasadPerson & { key: number };

let nextRowKey = 0;
const toRows = (people: PrasadPerson[]): Row[] => people.map((person) => ({ ...person, key: ++nextRowKey }));
const blankRow = (): Row => ({ name: "", flat: "", key: ++nextRowKey });

/**
 * Add or edit one prasad in one slot - pass `item` to edit, omit it to add.
 *
 * A slot holds as many prasad items as the committee likes, so this dialog is
 * about **one** of them: what it is, and the people on it. Opened from a
 * slot's "Add prasad" it arrives with that day and slot already chosen, which
 * is how a second prasad joins an existing slot.
 *
 * The two people lists are the point of the screen: several families often
 * sponsor one prasad, and several volunteers hand it out. Each list is rows of
 * name + flat that grow with "Add person"; an empty row is ignored on save.
 * Names already used elsewhere are suggested, and picking one fills its flat.
 */
export function PrasadItemDialog({
  open,
  onOpenChange,
  item,
  defaultDate,
  defaultSlot,
  eventDays,
  knownPeople,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item?: PrasadItem;
  defaultDate: string;
  /** Set when adding into an existing slot, so it starts on that slot. */
  defaultSlot?: string;
  eventDays: EventDay[];
  knownPeople: PrasadPerson[];
  onSubmit: (input: PrasadItemInput) => Promise<unknown>;
}) {
  const [date, setDate] = useState(defaultDate);
  const [slotChoice, setSlotChoice] = useState<string>(slotPresets[0]);
  const [customSlot, setCustomSlot] = useState("");
  const [arrangers, setArrangers] = useState<Row[]>([blankRow()]);
  const [distributors, setDistributors] = useState<Row[]>([blankRow()]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const slot = item?.slot ?? defaultSlot ?? slotPresets[0];
    const preset = slotPresets.find((entry) => entry.toLowerCase() === slot.trim().toLowerCase());
    setDate(item?.date ?? defaultDate);
    setSlotChoice(preset ?? "Other");
    setCustomSlot(preset ? "" : slot);
    setArrangers(item?.arrangers.length ? toRows(item.arrangers) : [blankRow()]);
    setDistributors(item?.distributors.length ? toRows(item.distributors) : [blankRow()]);
    setError(null);
  }, [open, item, defaultDate, defaultSlot]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const label = slotChoice === "Other" ? customSlot.trim() : slotChoice;
    if (!label) {
      setError("Name the slot, or pick Morning, Noon, Evening or Night.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await onSubmit({
        date,
        slot: label,
        item: String(formData.get("item") ?? "").trim(),
        notes: String(formData.get("notes") ?? "").trim(),
        arrangers: arrangers.map(({ name, flat }) => ({ name, flat })).filter((person) => person.name.trim()),
        distributors: distributors.map(({ name, flat }) => ({ name, flat })).filter((person) => person.name.trim()),
      });
      onOpenChange(false);
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "Unable to save this prasad");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{item ? "Edit prasad" : "Add prasad"}</DialogTitle>
          <p className="text-sm text-muted-foreground">
            One prasad and the people on it. A slot can hold as many as you need - add them one at a time.
          </p>
        </DialogHeader>

        <form className="space-y-4" onSubmit={submit}>
          <div className="space-y-2">
            <Label htmlFor="prasad-item">Prasad</Label>
            <Input
              id="prasad-item"
              name="item"
              required
              maxLength={120}
              defaultValue={item?.item}
              placeholder="e.g. Modak"
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="prasad-date">
              Day
              {eventDays.length ? (
                <span className="font-normal text-muted-foreground"> - or any other date below</span>
              ) : null}
            </Label>
            {eventDays.length ? (
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Event days">
                {eventDays.map((day) => (
                  <button
                    key={day.date}
                    type="button"
                    onClick={() => setDate(day.date)}
                    aria-pressed={date === day.date}
                    className={cn(
                      "flex min-h-10 flex-col items-start justify-center rounded-md border px-3 py-1 text-left text-sm font-medium leading-tight transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      date === day.date ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted",
                    )}
                  >
                    {day.label}
                    {day.sub ? (
                      <span
                        className={cn(
                          "text-xs font-normal",
                          date === day.date ? "text-primary-foreground/85" : "text-muted-foreground",
                        )}
                      >
                        {day.sub}
                      </span>
                    ) : null}
                  </button>
                ))}
              </div>
            ) : null}
            <Input
              id="prasad-date"
              type="date"
              required
              value={date}
              onChange={(event) => setDate(event.target.value)}
              className="sm:max-w-[12rem]"
            />
          </div>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Slot</legend>
            <div className="flex flex-wrap gap-1.5">
              {[...slotPresets, "Other"].map((choice) => (
                <label
                  key={choice}
                  className={cn(
                    "flex min-h-10 cursor-pointer items-center rounded-md border px-3 text-sm font-medium transition-colors focus-within:ring-2 focus-within:ring-ring",
                    slotChoice === choice ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted",
                  )}
                >
                  <input
                    type="radio"
                    name="slotChoice"
                    value={choice}
                    checked={slotChoice === choice}
                    onChange={() => setSlotChoice(choice)}
                    className="sr-only"
                  />
                  {choice}
                </label>
              ))}
            </div>
            {slotChoice === "Other" ? (
              <Input
                aria-label="Slot name"
                value={customSlot}
                onChange={(event) => setCustomSlot(event.target.value)}
                maxLength={40}
                placeholder="e.g. After aarti, Visarjan"
              />
            ) : null}
          </fieldset>

          <PeopleEditor
            legend="Sponsored by"
            hint="Who arranges or brings this prasad. Add everyone sharing it."
            icon={HandHeart}
            rows={arrangers}
            onChange={setArrangers}
            knownPeople={knownPeople}
            listId="prasad-known-arrangers"
          />

          <PeopleEditor
            legend="Distributed by"
            hint="Who hands this one out."
            icon={Users}
            rows={distributors}
            onChange={setDistributors}
            knownPeople={knownPeople}
            listId="prasad-known-distributors"
          />

          <div className="space-y-2">
            <Label htmlFor="prasad-notes">
              Note <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <textarea
              id="prasad-notes"
              name="notes"
              rows={2}
              maxLength={500}
              defaultValue={item?.notes}
              placeholder="e.g. quantity, where the counter is"
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>

          {error ? <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</p> : null}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving..." : item ? "Save prasad" : "Add prasad"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function PeopleEditor({
  legend,
  hint,
  icon: Icon,
  rows,
  onChange,
  knownPeople,
  listId,
}: {
  legend: string;
  hint: string;
  icon: typeof Users;
  rows: Row[];
  onChange: (rows: Row[]) => void;
  knownPeople: PrasadPerson[];
  listId: string;
}) {
  const lastNameRef = useRef<HTMLInputElement>(null);
  const [focusLast, setFocusLast] = useState(false);
  const named = rows.filter((row) => row.name.trim()).length;

  useEffect(() => {
    if (!focusLast) return;
    lastNameRef.current?.focus();
    setFocusLast(false);
  }, [focusLast, rows.length]);

  function update(key: number, patch: Partial<PrasadPerson>) {
    onChange(
      rows.map((row) => {
        if (row.key !== key) return row;
        const next = { ...row, ...patch };
        // Picking a name used elsewhere brings its flat along, unless one has
        // already been typed.
        if (patch.name !== undefined && !row.flat) {
          const match = knownPeople.find((person) => person.name.toLowerCase() === patch.name!.trim().toLowerCase());
          if (match?.flat) next.flat = match.flat;
        }
        return next;
      }),
    );
  }

  function remove(key: number) {
    const remaining = rows.filter((row) => row.key !== key);
    onChange(remaining.length ? remaining : [blankRow()]);
  }

  function add() {
    onChange([...rows, blankRow()]);
    setFocusLast(true);
  }

  const uniqueNames = Array.from(new Map(knownPeople.map((person) => [personKey(person), person])).values());

  return (
    <fieldset className="space-y-2 rounded-md border p-3">
      <legend className="flex items-center gap-1.5 px-1 text-sm font-medium">
        <Icon className="h-4 w-4 text-primary" aria-hidden="true" />
        {legend}
        {named ? <span className="font-normal tabular-nums text-muted-foreground">({named})</span> : null}
      </legend>
      <p className="text-xs text-muted-foreground">{hint}</p>

      <datalist id={listId}>
        {uniqueNames.map((person) => (
          <option key={personKey(person)} value={person.name}>
            {person.flat || undefined}
          </option>
        ))}
      </datalist>

      <ul className="space-y-1.5">
        {rows.map((row, index) => (
          <li key={row.key} className="flex items-center gap-1.5">
            <Input
              ref={index === rows.length - 1 ? lastNameRef : undefined}
              aria-label={`${legend}: name ${index + 1}`}
              value={row.name}
              onChange={(event) => update(row.key, { name: event.target.value })}
              list={listId}
              maxLength={80}
              placeholder="Name"
              className="min-w-0 flex-1"
            />
            <Input
              aria-label={`${legend}: flat ${index + 1}`}
              value={row.flat}
              onChange={(event) => update(row.key, { flat: event.target.value })}
              maxLength={20}
              placeholder="Flat"
              className="w-20 shrink-0 uppercase sm:w-24"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="shrink-0"
              aria-label={`Remove ${row.name.trim() || `row ${index + 1}`} from ${legend.toLowerCase()}`}
              onClick={() => remove(row.key)}
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </Button>
          </li>
        ))}
      </ul>

      <Button type="button" variant="outline" size="sm" onClick={add}>
        <Plus className="h-4 w-4" aria-hidden="true" />
        Add person
      </Button>
    </fieldset>
  );
}
