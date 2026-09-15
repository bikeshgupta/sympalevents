import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ClosingCredits, Shoutout } from "@/lib/closing";
import { initials, manualCredits } from "@/lib/closing";

export type CreditsDraft = {
  extraCore: string[];
  extraVolunteers: string[];
  coreOrder: string[];
  shoutouts: Shoutout[];
};

/** `list` with the item at `index` moved one step in `direction`. */
function moved<T>(list: T[], index: number, direction: -1 | 1) {
  const target = index + direction;
  if (target < 0 || target >= list.length) return list;
  const next = [...list];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

/**
 * The credits editor: add, remove and reorder the people the app cannot work
 * out for itself.
 *
 * It edits **one merged committee list** rather than "derived names" and
 * "your names" side by side, because that split is an implementation detail -
 * an admin reordering the committee should not have to know which names came
 * from `event_members`. What it saves is therefore two things: the order of
 * the whole list, and the subset that exists only here. A derived name has no
 * Remove button, since deleting it would only bring it straight back on the
 * next read; the hint says so rather than leaving a dead control.
 *
 * Volunteers stay alphabetical - no order there means anything - so that list
 * is add and remove only.
 */
export function CreditsDialog({
  credits,
  onOpenChange,
  onSave,
}: {
  credits: ClosingCredits;
  onOpenChange: (open: boolean) => void;
  onSave: (draft: CreditsDraft) => Promise<unknown>;
}) {
  const seed = manualCredits(credits);
  // Which committee names came from a real `event_members` row: everything on
  // the displayed list that is not one of the hand-kept ones. Removing one of
  // these would only bring it straight back on the next read, so the editor
  // does not offer to, and they are not written to `extra_core` either.
  const manualKeys = new Set(seed.core.map((name) => name.toLowerCase()));
  const derivedKeys = new Set(
    credits.core.filter((name) => !manualKeys.has(name.toLowerCase())).map((name) => name.toLowerCase()),
  );

  const [core, setCore] = useState<string[]>(credits.core.length ? credits.core : seed.core);
  const [volunteers, setVolunteers] = useState<string[]>(seed.volunteers);
  const [shoutouts, setShoutouts] = useState<Shoutout[]>(seed.shoutouts);
  const [newCore, setNewCore] = useState("");
  const [newVolunteer, setNewVolunteer] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function addTo(list: string[], set: (next: string[]) => void, raw: string, clear: () => void) {
    const name = raw.replace(/\s+/g, " ").trim();
    if (!name) return;
    if (list.some((entry) => entry.toLowerCase() === name.toLowerCase())) {
      setError(`${name} is already on that list.`);
      return;
    }
    setError(null);
    set([...list, name]);
    clear();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await onSave({
        // Everything on the list that is not a member row: the names added
        // here, plus any typed in this session.
        extraCore: core.filter((name) => !derivedKeys.has(name.toLowerCase())),
        extraVolunteers: volunteers,
        coreOrder: core,
        shoutouts: shoutouts.filter((entry) => entry.name.trim()),
      });
      onOpenChange(false);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save the credits");
    } finally {
      setSaving(false);
    }
  }

  const isRemovable = (name: string) => !derivedKeys.has(name.toLowerCase());

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Credits</DialogTitle>
          <p className="text-sm text-muted-foreground">
            Add the people the app cannot see, and put the committee in the order you want it read.
          </p>
        </DialogHeader>

        <form className="space-y-6" onSubmit={handleSubmit}>
          <section className="space-y-2">
            <Label htmlFor="credits-core">Core committee</Label>
            <ol className="overflow-hidden rounded-lg border">
              {core.map((name, index) => (
                <li key={`${name}-${index}`} className="flex items-center gap-2 border-b px-2 py-1.5 last:border-b-0">
                  <span
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary"
                    aria-hidden="true"
                  >
                    {initials(name)}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{name}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Move ${name} up`}
                    disabled={index === 0}
                    onClick={() => setCore(moved(core, index, -1))}
                  >
                    <ArrowUp className="h-4 w-4" aria-hidden="true" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Move ${name} down`}
                    disabled={index === core.length - 1}
                    onClick={() => setCore(moved(core, index, 1))}
                  >
                    <ArrowDown className="h-4 w-4" aria-hidden="true" />
                  </Button>
                  {isRemovable(name) ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Remove ${name}`}
                      onClick={() => setCore(core.filter((_, position) => position !== index))}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" aria-hidden="true" />
                    </Button>
                  ) : (
                    <span className="px-2 text-xs text-muted-foreground">Member</span>
                  )}
                </li>
              ))}
              {core.length ? null : (
                <li className="px-3 py-2.5 text-sm text-muted-foreground">Nobody on the committee list yet.</li>
              )}
            </ol>
            <AddRow
              id="credits-core"
              value={newCore}
              placeholder="Add a committee member"
              onChange={setNewCore}
              onAdd={() => addTo(core, setCore, newCore, () => setNewCore(""))}
            />
            <p className="text-xs text-muted-foreground">
              Names marked "Member" come from this event's member list and cannot be removed here - change their role in
              Settings instead. You can still put them anywhere in the order.
            </p>
          </section>

          <section className="space-y-2">
            <Label htmlFor="credits-volunteer">Volunteers you added</Label>
            {volunteers.length ? (
              <ul className="flex flex-wrap gap-1.5">
                {volunteers.map((name, index) => (
                  <li
                    key={`${name}-${index}`}
                    className="inline-flex items-center gap-1 rounded-full border bg-card py-1 pl-3 pr-1"
                  >
                    <span className="text-sm font-medium">{name}</span>
                    <button
                      type="button"
                      aria-label={`Remove ${name}`}
                      className="rounded-full p-1 text-muted-foreground hover:text-destructive focus-visible:ring-2 focus-visible:ring-ring"
                      onClick={() => setVolunteers(volunteers.filter((_, position) => position !== index))}
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">
                Nobody added by hand. Task and schedule owners are credited automatically.
              </p>
            )}
            <AddRow
              id="credits-volunteer"
              value={newVolunteer}
              placeholder="Add a volunteer"
              onChange={setNewVolunteer}
              onAdd={() => addTo(volunteers, setVolunteers, newVolunteer, () => setNewVolunteer(""))}
            />
          </section>

          <section className="space-y-2">
            <Label>Shout-outs</Label>
            <p className="text-xs text-muted-foreground">
              Printed under the committee list. Keep it to one or two - a page where everybody is singled out singles
              nobody out.
            </p>
            {shoutouts.map((shoutout, index) => (
              <div key={index} className="space-y-2 rounded-lg border p-3">
                <div className="grid gap-2 sm:grid-cols-2">
                  <Input
                    value={shoutout.name}
                    maxLength={80}
                    placeholder="Name"
                    aria-label="Shout-out name"
                    onChange={(event) =>
                      setShoutouts(
                        shoutouts.map((row, position) =>
                          position === index ? { ...row, name: event.target.value } : row,
                        ),
                      )
                    }
                  />
                  <Input
                    value={shoutout.role}
                    maxLength={60}
                    placeholder="What they ran"
                    aria-label="Shout-out role"
                    onChange={(event) =>
                      setShoutouts(
                        shoutouts.map((row, position) =>
                          position === index ? { ...row, role: event.target.value } : row,
                        ),
                      )
                    }
                  />
                </div>
                <Input
                  value={shoutout.note}
                  maxLength={400}
                  placeholder="One line on what it took"
                  aria-label="Shout-out note"
                  onChange={(event) =>
                    setShoutouts(
                      shoutouts.map((row, position) => (position === index ? { ...row, note: event.target.value } : row)),
                    )
                  }
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShoutouts(shoutouts.filter((_, position) => position !== index))}
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                  Remove
                </Button>
              </div>
            ))}
            {shoutouts.length < 6 ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShoutouts([...shoutouts, { name: "", role: "", note: "" }])}
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                Add a shout-out
              </Button>
            ) : null}
          </section>

          {error ? <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</p> : null}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving..." : "Save credits"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AddRow({
  id,
  value,
  placeholder,
  onChange,
  onAdd,
}: {
  id: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
  onAdd: () => void;
}) {
  return (
    <div className="flex gap-2">
      <Input
        id={id}
        value={value}
        maxLength={80}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        // Enter adds a name; it must not submit the form and close the dialog
        // half way through a list.
        onKeyDown={(event) => {
          if (event.key !== "Enter") return;
          event.preventDefault();
          onAdd();
        }}
      />
      <Button type="button" variant="outline" onClick={onAdd} className="shrink-0">
        <Plus className="h-4 w-4" aria-hidden="true" />
        Add
      </Button>
    </div>
  );
}
