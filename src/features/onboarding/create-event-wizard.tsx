import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, ChevronDown, Flame, Music, PartyPopper, Plus, Trophy } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { enabledModuleCount, eventTemplates, type EventTemplate } from "@/data/event-templates";
import { DuplicateEventForm } from "@/features/settings/duplicate-event-form";
import { ModuleEditor, type ModuleDraft } from "@/features/settings/module-editor";
import { moduleLabelFor } from "@/lib/module-labels";
import { apiFetch } from "@/lib/api";
import { useSession } from "@/lib/auth";
import { useEventContext } from "@/lib/event-context";
import { cn } from "@/lib/utils";

/**
 * Creating an event: pick the kind of thing it is, say when it is, then decide
 * what it is made of.
 *
 * It replaces a five-field form at the bottom of Settings that produced an
 * event with no modules seeded at all - which meant a brand new event fell
 * through to whatever the code defaults happened to be, and nobody could tell
 * what it had until they went looking.
 *
 * Three steps, not four. An earlier sketch separated "what kind of event" from
 * "which template", but there is one template per kind, so the second step
 * would have offered a single option.
 *
 * It lives outside AppLayout: there is no event selected yet, so there is
 * nothing for the sidebar to be about.
 */

const templateIcons: Record<string, typeof Flame> = {
  garba: Music,
  festival: Flame,
  sports: Trophy,
  cultural: Music,
  mixed: PartyPopper,
  blank: Plus,
};

type Step = 1 | 2 | 3;

const stepNames: Record<Step, string> = { 1: "Type", 2: "Details", 3: "Review" };

/** A real choice in the society select, not an empty value - see the effect. */
const NEW_SOCIETY = "__new__";

function toDraft(template: EventTemplate): ModuleDraft[] {
  return template.modules.map((module) => ({
    pageKey: module.pageKey,
    isEnabled: module.isEnabled,
    visibility: module.visibility,
    labelOverride: module.labelOverride ?? null,
  }));
}

export function CreateEventWizard() {
  const { data: session, isLoading: isSessionLoading } = useSession();
  const { societies, events, setSelectedEventId } = useEventContext();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [step, setStep] = useState<Step>(1);
  const [templateKey, setTemplateKey] = useState("garba");
  const [modules, setModules] = useState<ModuleDraft[]>(() => toDraft(eventTemplates[0]));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Copying an earlier event is offered here, where somebody is deciding what to
  // start from, rather than only buried in that event's Settings.
  const [copyFrom, setCopyFrom] = useState("");
  const [showCopy, setShowCopy] = useState(false);
  const [showModules, setShowModules] = useState(false);
  const copyable = useMemo(() => events.filter((item) => item.role === "admin"), [events]);

  const [eventName, setEventName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  // Optional hours of the first and last day. Blank means the whole day.
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [location, setLocation] = useState("");
  const [societyId, setSocietyId] = useState("");
  const [societyName, setSocietyName] = useState("");

  const template = useMemo(
    () => eventTemplates.find((item) => item.key === templateKey) ?? eventTemplates[0],
    [templateKey],
  );

  // Only somewhere this person is entitled to add an event; the server checks
  // the same thing, this just avoids offering what it would refuse.
  const ownSocieties = useMemo(
    () => societies.filter((society) => society.role === "admin" || society.role === "committee"),
    [societies],
  );

  // The societies arrive after the first render, so the default is picked when
  // they land. NEW_SOCIETY is a real choice rather than an empty value, or this
  // would immediately undo somebody choosing to start a new one.
  useEffect(() => {
    if (societyId === "" && ownSocieties.length) setSocietyId(ownSocieties[0].id);
  }, [ownSocieties, societyId]);

  const creatingSociety = societyId === NEW_SOCIETY || (!ownSocieties.length && societyId === "");

  if (!isSessionLoading && !session) {
    return <Navigate to="/login" replace />;
  }

  function chooseTemplate(key: string) {
    setTemplateKey(key);
    const picked = eventTemplates.find((item) => item.key === key);
    if (picked) setModules(toDraft(picked));
  }

  const detailsComplete =
    eventName.trim() && startDate && endDate && (creatingSociety ? societyName.trim() : Boolean(societyId));
  const datesBackwards = Boolean(startDate && endDate && endDate < startDate);
  // Only a one-day event can contradict itself on times alone. A blank start is
  // the start of its day and a blank end is the end of it.
  const timesBackwards = Boolean(
    startDate && endDate && startDate === endDate && (startTime || endTime) && (endTime || "23:59") <= (startTime || "00:00"),
  );

  async function handleCreate(submitEvent: FormEvent) {
    submitEvent.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const { eventId } = await apiFetch<{ eventId: string }>("/api/events", {
        method: "POST",
        body: {
          eventName: eventName.trim(),
          startDate,
          endDate,
          startTime: startTime || undefined,
          endTime: endTime || undefined,
          location: location.trim(),
          societyId: creatingSociety ? undefined : societyId,
          societyName: creatingSociety ? societyName.trim() : undefined,
          eventType: template.eventType,
          templateKey: template.key,
          unitLabel: template.unitLabel,
          modules,
        },
      });

      await queryClient.invalidateQueries({ queryKey: ["my-events"] });
      setSelectedEventId(eventId);
      // A draft with a checklist: the command centre is where it gets finished.
      navigate(`/e/${eventId}/command`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the event");
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="flex h-16 items-center gap-3 border-b bg-card px-4 lg:px-8">
        <Link to="/dashboard" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
          Back to the app
        </Link>
      </header>

      <div className="mx-auto w-full max-w-4xl px-4 py-8 lg:py-10">
        <div className="flex items-baseline justify-between gap-4">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">New event</h1>
          <p className="shrink-0 text-xs text-muted-foreground sm:text-sm">Step {step} of 3</p>
        </div>

        <ol className="mt-5 flex items-start" aria-label="Progress">
          {([1, 2, 3] as Step[]).map((item, index) => (
            <li key={item} className={cn("flex items-start", index > 0 && "flex-1")}>
              {index > 0 ? (
                <span
                  className={cn("mt-[7px] h-0.5 flex-1", item <= step ? "bg-primary" : "bg-border")}
                  aria-hidden
                />
              ) : null}
              <span className="flex w-24 flex-col items-center gap-1.5">
                <span
                  className={cn(
                    "h-3.5 w-3.5 rounded-full border-2",
                    item <= step ? "border-primary bg-primary" : "border-border bg-card",
                  )}
                  aria-hidden
                />
                <span className={cn("text-xs", item === step ? "font-semibold text-primary" : "text-muted-foreground")}>
                  {stepNames[item]}
                </span>
              </span>
            </li>
          ))}
        </ol>

        {step === 1 ? (
          <section className="mt-8">
            <h2 className="text-lg font-semibold">What kind of event is this?</h2>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Pick the closest fit. It only sets the starting point - you can change anything afterwards, in Settings.
            </p>

            <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {eventTemplates.map((item) => {
                const Icon = templateIcons[item.key] ?? Flame;
                const selected = item.key === templateKey;
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => chooseTemplate(item.key)}
                    aria-pressed={selected}
                    className={cn(
                      "flex flex-col rounded-lg border bg-card p-4 text-left transition-colors hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      selected && "border-primary bg-accent/40 ring-1 ring-primary",
                    )}
                  >
                    <span className="flex items-start">
                      <span
                        className={cn(
                          "flex h-10 w-10 items-center justify-center rounded-md",
                          selected ? "bg-primary text-primary-foreground" : "bg-muted text-primary",
                        )}
                      >
                        <Icon className="h-5 w-5" aria-hidden />
                      </span>
                      <span className="flex-1" />
                      {selected ? <Check className="h-5 w-5 text-primary" aria-label="Selected" /> : null}
                    </span>
                    <span className="mt-3 text-base font-semibold">{item.name}</span>
                    <span className="mt-1 text-sm text-muted-foreground">{item.examples}</span>
                    <span className="mt-3 text-xs font-medium text-muted-foreground">
                      {enabledModuleCount(item)} modules on
                    </span>
                  </button>
                );
              })}
            </div>

            <p className="mt-5 text-sm text-muted-foreground">{template.tagline}</p>

            {copyable.length ? (
              <div className="mt-6 rounded-lg border bg-card">
                <button
                  type="button"
                  aria-expanded={showCopy}
                  onClick={() => setShowCopy((value) => !value)}
                  className="flex min-h-12 w-full items-center justify-between gap-3 px-4 text-left text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span>Running one of your events again? Copy it instead</span>
                  <ChevronDown className={cn("h-4 w-4 transition-transform", showCopy && "rotate-180")} aria-hidden />
                </button>
                {showCopy ? (
                  <div className="space-y-3 border-t p-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="copy-from">Which event?</Label>
                      <select
                        id="copy-from"
                        className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                        value={copyFrom}
                        onChange={(field) => setCopyFrom(field.target.value)}
                      >
                        <option value="">Choose an event</option>
                        {copyable.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    {copyFrom ? (
                      <DuplicateEventForm
                        key={copyFrom}
                        eventId={copyFrom}
                        defaultName={`${copyable.find((item) => item.id === copyFrom)?.name ?? ""} (copy)`}
                      />
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="mt-6 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => navigate(-1)}>
                Cancel
              </Button>
              <Button type="button" onClick={() => setStep(2)}>
                Next
              </Button>
            </div>
          </section>
        ) : null}

        {step === 2 ? (
          <section className="mt-8">
            <h2 className="text-lg font-semibold">When and where</h2>
            <p className="mt-1.5 text-sm text-muted-foreground">
              An event belongs to a society. Anyone who belongs to that society will find this event in their switcher.
            </p>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="event-name">Event name</Label>
                <Input
                  id="event-name"
                  value={eventName}
                  onChange={(field) => setEventName(field.target.value)}
                  placeholder={template.eventType === "sports" ? "Box Cricket Cup 2026" : "Ganesh Utsav 2026"}
                  required
                />
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="society">Society</Label>
                {ownSocieties.length ? (
                  <select
                    id="society"
                    className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                    value={societyId}
                    onChange={(field) => setSocietyId(field.target.value)}
                  >
                    {ownSocieties.map((society) => (
                      <option key={society.id} value={society.id}>
                        {society.name}
                      </option>
                    ))}
                    <option value={NEW_SOCIETY}>Create a new society</option>
                  </select>
                ) : null}
                {creatingSociety ? (
                  <Input
                    aria-label="New society name"
                    value={societyName}
                    onChange={(field) => setSocietyName(field.target.value)}
                    placeholder="Sunrise Residency"
                    className={ownSocieties.length ? "mt-2" : undefined}
                  />
                ) : null}
                <p className="text-xs text-muted-foreground">
                  {creatingSociety
                    ? "A new society is created and you become its admin. You can rename it later."
                    : "This event joins that society."}
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="start-date">Starts</Label>
                <Input
                  id="start-date"
                  type="date"
                  value={startDate}
                  onChange={(field) => setStartDate(field.target.value)}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="end-date">Ends</Label>
                <Input
                  id="end-date"
                  type="date"
                  value={endDate}
                  onChange={(field) => setEndDate(field.target.value)}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="start-time">
                  Start time <span className="font-normal text-muted-foreground">(optional)</span>
                </Label>
                <Input id="start-time" type="time" value={startTime} onChange={(field) => setStartTime(field.target.value)} />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="end-time">
                  End time <span className="font-normal text-muted-foreground">(optional)</span>
                </Label>
                <Input id="end-time" type="time" value={endTime} onChange={(field) => setEndTime(field.target.value)} />
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="location">Where</Label>
                <Input
                  id="location"
                  value={location}
                  onChange={(field) => setLocation(field.target.value)}
                  placeholder="Society ground"
                />
              </div>
            </div>

            {datesBackwards ? (
              <p className="mt-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                The end date is before the start date.
              </p>
            ) : null}

            {timesBackwards ? (
              <p className="mt-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                On a one-day event the end time has to be after the start time.
              </p>
            ) : null}

            <div className="mt-6 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setStep(1)}>
                Back
              </Button>
              <Button type="button" onClick={() => setStep(3)} disabled={!detailsComplete || datesBackwards || timesBackwards}>
                Next
              </Button>
            </div>
          </section>
        ) : null}

        {step === 3 ? (
          <form className="mt-8" onSubmit={handleCreate}>
            <h2 className="text-lg font-semibold">Review and create</h2>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Started from the <span className="font-medium text-foreground">{template.name}</span> template. Your event
              stays private - only organisers can see it - until you publish it.
            </p>

            <dl className="mt-5 divide-y rounded-lg border bg-card text-sm">
              <div className="flex flex-wrap justify-between gap-2 p-3">
                <dt className="text-muted-foreground">Event</dt>
                <dd className="font-medium">{eventName}</dd>
              </div>
              <div className="flex flex-wrap justify-between gap-2 p-3">
                <dt className="text-muted-foreground">When</dt>
                <dd className="font-medium">
                  {startDate}
                  {endDate !== startDate ? ` to ${endDate}` : ""}
                  {startTime ? `, ${startTime}${endTime ? `-${endTime}` : ""}` : ""}
                </dd>
              </div>
              <div className="flex flex-wrap justify-between gap-2 p-3">
                <dt className="text-muted-foreground">Where</dt>
                <dd className="font-medium">{location || "Not set yet"}</dd>
              </div>
              <div className="p-3">
                <dt className="text-muted-foreground">It will have</dt>
                <dd className="mt-1.5 flex flex-wrap gap-1.5">
                  {modules
                    .filter((module) => module.isEnabled)
                    .map((module) => (
                      <span key={module.pageKey} className="rounded-full bg-accent px-2.5 py-0.5 text-xs font-medium text-primary">
                        {module.labelOverride ?? moduleLabelFor(module.pageKey)}
                      </span>
                    ))}
                </dd>
              </div>
            </dl>

            <p className="mt-3 text-sm text-muted-foreground">
              After you create it, the command centre lists what is still needed before you publish.
            </p>

            <div className="mt-4 rounded-lg border bg-card">
              <button
                type="button"
                aria-expanded={showModules}
                onClick={() => setShowModules((value) => !value)}
                className="flex min-h-12 w-full items-center justify-between gap-3 px-4 text-left text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span>Customise modules (optional)</span>
                <ChevronDown className={cn("h-4 w-4 transition-transform", showModules && "rotate-180")} aria-hidden />
              </button>
              {showModules ? (
                <div className="border-t p-4">
                  <ModuleEditor modules={modules} onChange={setModules} disabled={saving} />
                </div>
              ) : null}
            </div>

            {error ? <p className="mt-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</p> : null}

            <div className="mt-6 flex flex-wrap items-center gap-2">
              <p className="text-sm text-muted-foreground">Your event stays private until you publish it.</p>
              <span className="flex-1" />
              <Button type="button" variant="outline" onClick={() => chooseTemplate(templateKey)} disabled={saving}>
                Reset to template
              </Button>
              <Button type="button" variant="outline" onClick={() => setStep(2)} disabled={saving}>
                Back
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "Creating..." : "Create draft"}
              </Button>
            </div>
          </form>
        ) : null}
      </div>
    </div>
  );
}
