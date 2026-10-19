import { ArrowDown, ArrowUp, ChevronDown, Eye, EyeOff, Plus, Trash2 } from "lucide-react";
import { FormEvent, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ClosingCredits, Shoutout } from "@/lib/closing";
import { initials, manualCredits } from "@/lib/closing";
import { cn } from "@/lib/utils";
import {
  cleanCreditsSettings,
  creditKey,
  defaultCreditsHeading,
  defaultGroupCopy,
  type CreditGroupKey,
  type CreditGroupSettings,
  type CreditsSettings,
} from "../../../shared/credits-settings";
import type { CreditPerson } from "@/features/closing/credits-section";

export type CreditsDraft = {
  extraCore: string[];
  extraVolunteers: string[];
  coreOrder: string[];
  shoutouts: Shoutout[];
  /** Sent only once migration 048 is in. */
  creditsSettings?: CreditsSettings;
};

/** `list` with the item at `index` moved one step in `direction`. */
function moved<T>(list: T[], index: number, direction: -1 | 1) {
  const target = index + direction;
  if (target < 0 || target >= list.length) return list;
  const next = [...list];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

const squash = (raw: string) => raw.replace(/\s+/g, " ").trim();

/**
 * The credits editor. Everything on the "It took all of us" card is the
 * committee's to change:
 *
 * - the card's heading and the line under it;
 * - which groups appear, in what order, and what each is called and says;
 * - **anybody can be hidden from any group** - including the people the app
 *   adds by itself from roles, tasks, the schedule, prasad, sponsorships and
 *   contributions. Hiding changes nothing where the name came from; it only
 *   keeps them off this card (and, for everybody but the committee, off the
 *   wire);
 * - names added by hand to the committee, the volunteers, the sponsors and the
 *   contributors, and the committee's own order;
 * - the shout-outs.
 *
 * The committee list is still **one merged list** - a name that came from a
 * member row has no Remove button (it would only come back), but it can be
 * hidden and placed anywhere. Volunteers stay alphabetical. Reordering is
 * up/down buttons, never drag-and-drop, which is close to unusable on a phone.
 *
 * Hiding, the group options, the heading and the extra sponsors/contributors
 * are stored by migration 048; until it is run those controls are off and say
 * so, and everything 020 stores still saves.
 */
export function CreditsDialog({
  credits,
  seed: useSeed = false,
  sponsors,
  contributors,
  onOpenChange,
  onSave,
}: {
  credits: ClosingCredits;
  /** Start from src/data/credits.ts while nothing is stored - only for the event it belongs to. */
  seed?: boolean;
  /** This event's sponsors and contributors, as the page builds them. */
  sponsors: CreditPerson[];
  contributors: CreditPerson[];
  onOpenChange: (open: boolean) => void;
  onSave: (draft: CreditsDraft) => Promise<unknown>;
}) {
  const seed = manualCredits(credits, useSeed);
  const settingsReady = credits.settingsReady === true;
  // Which committee names came from a real `event_members` row: everything on
  // the displayed list that is not one of the hand-kept ones. Removing one of
  // these would only bring it straight back, so it is hidden instead.
  const manualCoreKeys = new Set(seed.core.map((name) => name.toLowerCase()));
  const derivedCoreKeys = new Set(
    credits.core.filter((name) => !manualCoreKeys.has(name.toLowerCase())).map((name) => name.toLowerCase()),
  );
  const manualVolunteerKeys = new Set(seed.volunteers.map((name) => name.toLowerCase()));
  const derivedVolunteers = credits.volunteers.filter((name) => !manualVolunteerKeys.has(name.toLowerCase()));

  const [settings, setSettings] = useState<CreditsSettings>(() => cleanCreditsSettings(credits.settings));
  const [core, setCore] = useState<string[]>(credits.core.length ? credits.core : seed.core);
  const [volunteers, setVolunteers] = useState<string[]>(seed.volunteers);
  const [shoutouts, setShoutouts] = useState<Shoutout[]>(seed.shoutouts);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [open, setOpen] = useState<CreditGroupKey | null>("core");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const group = (key: CreditGroupKey) => settings.groups[key];
  const patchGroup = (key: CreditGroupKey, patch: Partial<CreditGroupSettings>) =>
    setSettings((current) => ({ ...current, groups: { ...current.groups, [key]: { ...current.groups[key], ...patch } } }));
  const isHidden = (key: CreditGroupKey, nameKey: string) => group(key).hiddenNames.includes(nameKey);
  const toggleHidden = (key: CreditGroupKey, nameKey: string) => {
    const hidden = group(key).hiddenNames;
    patchGroup(key, {
      hiddenNames: hidden.includes(nameKey) ? hidden.filter((entry) => entry !== nameKey) : [...hidden, nameKey],
    });
  };

  const draft = (id: string) => drafts[id] ?? "";
  const setDraft = (id: string, value: string) => setDrafts((current) => ({ ...current, [id]: value }));

  /** Adds a typed name to `list`, refusing a duplicate with a sentence. */
  function addName(id: string, list: string[], set: (next: string[]) => void) {
    const name = squash(draft(id));
    if (!name) return;
    if (list.some((entry) => entry.toLowerCase() === name.toLowerCase())) {
      setError(`${name} is already on that list.`);
      return;
    }
    setError(null);
    set([...list, name]);
    setDraft(id, "");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await onSave({
        // Everything on the list that is not a member row: the names added
        // here, plus any typed in this session.
        extraCore: core.filter((name) => !derivedCoreKeys.has(name.toLowerCase())),
        extraVolunteers: volunteers,
        coreOrder: core,
        shoutouts: shoutouts.filter((entry) => entry.name.trim()),
        ...(settingsReady ? { creditsSettings: cleanCreditsSettings(settings) } : {}),
      });
      onOpenChange(false);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save the credits");
    } finally {
      setSaving(false);
    }
  }

  // Every prasad sponsor named on this event, once each.
  const prasadNames = [...new Map(credits.prasad.flatMap((entry) => entry.sponsors).map((name) => [name.toLowerCase(), name])).values()];
  const sponsorExtras = group("sponsors").extraNames;
  const contributorExtras = group("contributors").extraNames;

  const groupBody: Record<CreditGroupKey, ReactNode> = {
    core: (
      <>
        <ol className="overflow-hidden rounded-lg border">
          {core.map((name, index) => {
            const hidden = isHidden("core", creditKey(name));
            return (
              <li key={`${name}-${index}`} className="flex items-center gap-1 border-b px-2 py-1.5 last:border-b-0">
                <span
                  className="mr-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary"
                  aria-hidden="true"
                >
                  {initials(name)}
                </span>
                <span className={cn("min-w-0 flex-1 truncate text-sm font-medium", hidden && "text-muted-foreground line-through")}>
                  {name}
                </span>
                <HideToggle name={name} hidden={hidden} disabled={!settingsReady} onToggle={() => toggleHidden("core", creditKey(name))} />
                <Button type="button" variant="ghost" size="icon" aria-label={`Move ${name} up`} disabled={index === 0} onClick={() => setCore(moved(core, index, -1))}>
                  <ArrowUp className="h-4 w-4" aria-hidden="true" />
                </Button>
                <Button type="button" variant="ghost" size="icon" aria-label={`Move ${name} down`} disabled={index === core.length - 1} onClick={() => setCore(moved(core, index, 1))}>
                  <ArrowDown className="h-4 w-4" aria-hidden="true" />
                </Button>
                {derivedCoreKeys.has(name.toLowerCase()) ? (
                  <span className="w-10 text-center text-xs text-muted-foreground">Member</span>
                ) : (
                  <Button type="button" variant="ghost" size="icon" aria-label={`Remove ${name}`} onClick={() => setCore(core.filter((_, position) => position !== index))}>
                    <Trash2 className="h-4 w-4 text-destructive" aria-hidden="true" />
                  </Button>
                )}
              </li>
            );
          })}
          {core.length ? null : <li className="px-3 py-2.5 text-sm text-muted-foreground">Nobody on the committee list yet.</li>}
        </ol>
        <AddRow id="credits-core" value={draft("core")} placeholder="Add a committee member" onChange={(value) => setDraft("core", value)} onAdd={() => addName("core", core, setCore)} />
        <p className="text-xs text-muted-foreground">
          "Member" names come from this event's roles. Hide one to keep it off the card, or change the role in Settings.
        </p>

        <div className="space-y-2 border-t pt-3">
          <Label>Shout-outs</Label>
          <p className="text-xs text-muted-foreground">
            Printed under the committee list. Keep it to one or two - a page where everybody is singled out singles nobody out.
          </p>
          {shoutouts.map((shoutout, index) => (
            <div key={index} className="space-y-2 rounded-lg border p-3">
              <div className="grid gap-2 sm:grid-cols-2">
                <Input
                  value={shoutout.name}
                  maxLength={80}
                  placeholder="Name"
                  aria-label="Shout-out name"
                  onChange={(event) => setShoutouts(shoutouts.map((row, position) => (position === index ? { ...row, name: event.target.value } : row)))}
                />
                <Input
                  value={shoutout.role}
                  maxLength={60}
                  placeholder="What they ran"
                  aria-label="Shout-out role"
                  onChange={(event) => setShoutouts(shoutouts.map((row, position) => (position === index ? { ...row, role: event.target.value } : row)))}
                />
              </div>
              <Input
                value={shoutout.note}
                maxLength={400}
                placeholder="One line on what it took"
                aria-label="Shout-out note"
                onChange={(event) => setShoutouts(shoutouts.map((row, position) => (position === index ? { ...row, note: event.target.value } : row)))}
              />
              <Button type="button" variant="outline" size="sm" onClick={() => setShoutouts(shoutouts.filter((_, position) => position !== index))}>
                <Trash2 className="h-4 w-4" aria-hidden="true" />
                Remove
              </Button>
            </div>
          ))}
          {shoutouts.length < 6 ? (
            <Button type="button" variant="outline" size="sm" onClick={() => setShoutouts([...shoutouts, { name: "", role: "", note: "" }])}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              Add a shout-out
            </Button>
          ) : null}
        </div>
      </>
    ),
    volunteers: (
      <>
        <NameList
          people={[...derivedVolunteers, ...volunteers]
            .sort((a, b) => a.localeCompare(b))
            .map((name) => ({ name, flat: "", removable: !derivedVolunteers.includes(name) }))}
          empty="Nobody yet. Task and schedule owners are credited automatically."
          isHidden={(person) => isHidden("volunteers", creditKey(person.name))}
          onToggle={(person) => toggleHidden("volunteers", creditKey(person.name))}
          onRemove={(person) => setVolunteers(volunteers.filter((name) => name.toLowerCase() !== person.name.toLowerCase()))}
          hideDisabled={!settingsReady}
        />
        <AddRow id="credits-volunteer" value={draft("volunteers")} placeholder="Add a volunteer" onChange={(value) => setDraft("volunteers", value)} onAdd={() => addName("volunteers", volunteers, setVolunteers)} />
      </>
    ),
    prasad: (
      <>
        <NameList
          people={prasadNames.map((name) => ({ name, flat: "", removable: false }))}
          empty="No prasad recorded. Prasad sponsors come from the Prasad page."
          isHidden={(person) => isHidden("prasad", creditKey(person.name))}
          onToggle={(person) => toggleHidden("prasad", creditKey(person.name))}
          hideDisabled={!settingsReady}
        />
        <p className="text-xs text-muted-foreground">To add a prasad or a family, add it on the Prasad page. A dish with every family hidden drops off the card.</p>
      </>
    ),
    sponsors: (
      <>
        <NameList
          people={[
            ...sponsors.map((person) => ({ ...person, removable: false })),
            ...sponsorExtras.map((name) => ({ name, flat: "", removable: true })),
          ]}
          empty="No sponsors recorded."
          isHidden={(person) => isHidden("sponsors", creditKey(person.name, person.flat))}
          onToggle={(person) => toggleHidden("sponsors", creditKey(person.name, person.flat))}
          onRemove={(person) => patchGroup("sponsors", { extraNames: sponsorExtras.filter((name) => name !== person.name) })}
          hideDisabled={!settingsReady}
        />
        <AddRow
          id="credits-sponsor"
          value={draft("sponsors")}
          placeholder="Add a sponsor by name"
          disabled={!settingsReady}
          onChange={(value) => setDraft("sponsors", value)}
          onAdd={() => addName("sponsors", sponsorExtras, (next) => patchGroup("sponsors", { extraNames: next }))}
        />
      </>
    ),
    contributors: (
      <>
        <NameList
          people={[
            ...contributors.map((person) => ({ ...person, removable: false })),
            ...contributorExtras.map((name) => ({ name, flat: "", removable: true })),
          ]}
          empty="No contributions recorded."
          isHidden={(person) => isHidden("contributors", creditKey(person.name, person.flat))}
          onToggle={(person) => toggleHidden("contributors", creditKey(person.name, person.flat))}
          onRemove={(person) => patchGroup("contributors", { extraNames: contributorExtras.filter((name) => name !== person.name) })}
          hideDisabled={!settingsReady}
        />
        <AddRow
          id="credits-contributor"
          value={draft("contributors")}
          placeholder="Add a contributor by name"
          disabled={!settingsReady}
          onChange={(value) => setDraft("contributors", value)}
          onAdd={() => addName("contributors", contributorExtras, (next) => patchGroup("contributors", { extraNames: next }))}
        />
      </>
    ),
  };

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Credits</DialogTitle>
          <p className="text-sm text-muted-foreground">
            Everything on this card is yours to change: who is on it, what each group is called, and the order.
          </p>
        </DialogHeader>

        <form className="space-y-5" onSubmit={handleSubmit}>
          {!settingsReady ? (
            <p className="rounded-md bg-amber-100 p-3 text-sm text-amber-900">
              Hiding names, renaming or reordering groups, the heading, and extra sponsors or contributors need migration
              048 (supabase/migrations/048_closing_credits_settings.sql). Until it is run you can still add committee
              members, volunteers and shout-outs.
            </p>
          ) : null}

          <fieldset disabled={!settingsReady} className="space-y-3 disabled:opacity-60">
            <div className="space-y-1.5">
              <Label htmlFor="credits-heading">Card heading</Label>
              <Input
                id="credits-heading"
                value={settings.heading}
                maxLength={80}
                placeholder={defaultCreditsHeading}
                onChange={(event) => setSettings({ ...settings, heading: event.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="credits-subheading">Line under it</Label>
              <Input
                id="credits-subheading"
                value={settings.subheading}
                maxLength={200}
                placeholder="Leave blank to count everybody: “69 people made this happen.”"
                onChange={(event) => setSettings({ ...settings, subheading: event.target.value })}
              />
            </div>
          </fieldset>

          <section className="space-y-2">
            <Label>Groups</Label>
            <p className="text-xs text-muted-foreground">Open a group to rename it, hide people in it, or add names. The arrows set the order on the page.</p>
            <ol className="space-y-2">
              {settings.order.map((key, index) => {
                const current = group(key);
                const expanded = open === key;
                const title = current.title || defaultGroupCopy[key].title;
                return (
                  <li key={key} className="rounded-lg border">
                    <div className="flex items-center gap-1 px-2 py-1.5">
                      <button
                        type="button"
                        aria-expanded={expanded}
                        aria-controls={`credits-group-${key}`}
                        onClick={() => setOpen(expanded ? null : key)}
                        className="flex min-h-10 min-w-0 flex-1 items-center gap-2 rounded-md px-1 text-left text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <ChevronDown className={cn("h-4 w-4 shrink-0 transition-transform", expanded && "rotate-180")} aria-hidden="true" />
                        <span className={cn("truncate", current.hidden && "text-muted-foreground line-through")}>{title}</span>
                        {current.hiddenNames.length ? (
                          <span className="shrink-0 text-xs font-normal text-muted-foreground">{current.hiddenNames.length} hidden</span>
                        ) : null}
                      </button>
                      <label className="inline-flex min-h-10 items-center gap-1.5 px-1 text-xs text-muted-foreground">
                        <input
                          type="checkbox"
                          className="h-4 w-4 accent-[hsl(var(--primary))]"
                          checked={!current.hidden}
                          disabled={!settingsReady}
                          onChange={(event) => patchGroup(key, { hidden: !event.target.checked })}
                        />
                        Show
                      </label>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Move ${title} up`}
                        disabled={!settingsReady || index === 0}
                        onClick={() => setSettings({ ...settings, order: moved(settings.order, index, -1) })}
                      >
                        <ArrowUp className="h-4 w-4" aria-hidden="true" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Move ${title} down`}
                        disabled={!settingsReady || index === settings.order.length - 1}
                        onClick={() => setSettings({ ...settings, order: moved(settings.order, index, 1) })}
                      >
                        <ArrowDown className="h-4 w-4" aria-hidden="true" />
                      </Button>
                    </div>
                    {expanded ? (
                      <div id={`credits-group-${key}`} className="space-y-3 border-t p-3">
                        <fieldset disabled={!settingsReady} className="grid gap-2 sm:grid-cols-2 disabled:opacity-60">
                          <Input
                            value={current.title}
                            maxLength={60}
                            placeholder={defaultGroupCopy[key].title}
                            aria-label={`${defaultGroupCopy[key].title}: title`}
                            onChange={(event) => patchGroup(key, { title: event.target.value })}
                          />
                          <Input
                            value={current.blurb}
                            maxLength={200}
                            placeholder={defaultGroupCopy[key].blurb}
                            aria-label={`${defaultGroupCopy[key].title}: description`}
                            onChange={(event) => patchGroup(key, { blurb: event.target.value })}
                          />
                        </fieldset>
                        {groupBody[key]}
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ol>
          </section>

          {error ? <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</p> : null}

          <div className="flex flex-wrap justify-between gap-2">
            <Button
              type="button"
              variant="ghost"
              disabled={!settingsReady}
              onClick={() => setSettings(cleanCreditsSettings(null))}
            >
              Reset groups and hidden names
            </Button>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "Saving..." : "Save credits"}
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

type EditablePerson = CreditPerson & { removable: boolean };

/** The people in one group, each with a show/hide switch, and Remove for a name added by hand. */
function NameList({
  people,
  empty,
  isHidden,
  onToggle,
  onRemove,
  hideDisabled,
}: {
  people: EditablePerson[];
  empty: string;
  isHidden: (person: EditablePerson) => boolean;
  onToggle: (person: EditablePerson) => void;
  onRemove?: (person: EditablePerson) => void;
  hideDisabled: boolean;
}) {
  if (!people.length) return <p className="text-sm text-muted-foreground">{empty}</p>;
  return (
    <ul className="max-h-72 overflow-y-auto rounded-lg border">
      {people.map((person, index) => {
        const hidden = isHidden(person);
        return (
          <li key={`${person.name}-${person.flat}-${index}`} className="flex items-center gap-1 border-b px-2 py-1 last:border-b-0">
            <span className={cn("min-w-0 flex-1 truncate text-sm", hidden && "text-muted-foreground line-through")}>
              {person.name}
              {person.flat ? <span className="ml-1.5 text-xs text-muted-foreground">{person.flat}</span> : null}
            </span>
            <HideToggle name={person.name} hidden={hidden} disabled={hideDisabled} onToggle={() => onToggle(person)} />
            {person.removable && onRemove ? (
              <Button type="button" variant="ghost" size="icon" aria-label={`Remove ${person.name}`} onClick={() => onRemove(person)}>
                <Trash2 className="h-4 w-4 text-destructive" aria-hidden="true" />
              </Button>
            ) : (
              <span className="w-10" aria-hidden="true" />
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** Show or hide one name on the card. The state is in the label and the icon, not the colour alone. */
function HideToggle({ name, hidden, disabled, onToggle }: { name: string; hidden: boolean; disabled: boolean; onToggle: () => void }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-pressed={hidden}
      aria-label={hidden ? `Show ${name} on the card` : `Hide ${name} from the card`}
      title={hidden ? "Hidden - tap to show" : "Shown - tap to hide"}
      disabled={disabled}
      onClick={onToggle}
    >
      {hidden ? <EyeOff className="h-4 w-4 text-muted-foreground" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
    </Button>
  );
}

function AddRow({
  id,
  value,
  placeholder,
  disabled = false,
  onChange,
  onAdd,
}: {
  id: string;
  value: string;
  placeholder: string;
  disabled?: boolean;
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
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        // Enter adds a name; it must not submit the form and close the dialog
        // half way through a list.
        onKeyDown={(event) => {
          if (event.key !== "Enter") return;
          event.preventDefault();
          onAdd();
        }}
      />
      <Button type="button" variant="outline" onClick={onAdd} disabled={disabled} className="shrink-0">
        <Plus className="h-4 w-4" aria-hidden="true" />
        Add
      </Button>
    </div>
  );
}
