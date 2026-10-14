import { useQueryClient } from "@tanstack/react-query";
import { SOCIETY_REGISTRATION_OPEN, societyRegistrationClosedMessage } from "../../../shared/society-registration";
import { ArrowLeft, ChevronDown, Copy, Flame, Music, PartyPopper, Plus, SlidersHorizontal, Trophy } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { IosPage } from "@/components/ui/ios-page";
import { enabledModuleCount, eventTemplates, type EventTemplate } from "@/data/event-templates";
import { BlockRow, FieldRow, ListGroup, ListRow } from "@/features/settings/ios-list";
import { fieldInput } from "@/features/settings/ios-styles";
import type { SectionTone } from "@/features/settings/settings-sections";
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

/** Each kind of event gets its own icon colour in the list, as iOS gives every row one. */
const templateTones: Record<string, SectionTone> = {
  garba: "pink",
  festival: "orange",
  sports: "green",
  cultural: "indigo",
  mixed: "blue",
  blank: "gray",
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

  // While registration is closed nobody starts a society here: the form only ever offers one
  // the person already belongs to, and with none they are told why instead of given a blank box.
  const creatingSociety = SOCIETY_REGISTRATION_OPEN && (societyId === NEW_SOCIETY || (!ownSocieties.length && societyId === ""));
  const blockedNoSociety = !SOCIETY_REGISTRATION_OPEN && !ownSocieties.length;

  if (!isSessionLoading && !session) {
    return <Navigate to="/login" replace />;
  }

  function chooseTemplate(key: string) {
    setTemplateKey(key);
    const picked = eventTemplates.find((item) => item.key === key);
    if (picked) setModules(toDraft(picked));
  }

  const detailsComplete =
    eventName.trim() && startDate && endDate && !blockedNoSociety && (creatingSociety ? societyName.trim() : Boolean(societyId));
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

  const stepTitles: Record<Step, string> = { 1: "What kind of event is this?", 2: "When and where", 3: "Review and create" };
  const primaryButton = "h-12 flex-1 rounded-2xl text-base sm:flex-none sm:px-8";
  const secondaryButton = "h-12 rounded-2xl text-base";

  return (
    <IosPage active>
      <div className="min-h-screen bg-[hsl(42_26%_94%)]">
        {/* A frosted bar with a back pill, as on iOS. */}
        <header className="sticky top-0 z-30 flex h-16 items-center border-b border-black/[0.06] bg-[hsl(42_26%_94%/0.78)] px-4 backdrop-blur-xl backdrop-saturate-150 lg:px-8">
          <Link
            to="/dashboard"
            className="glass glass-press inline-flex h-9 items-center gap-0.5 rounded-full pl-2 pr-3.5 text-[15px] font-medium text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ArrowLeft className="h-[18px] w-[18px]" aria-hidden />
            Back to the app
          </Link>
        </header>

        <div className="mx-auto w-full max-w-2xl px-4 pb-16 pt-6">
          <h1 className="font-display text-3xl leading-tight sm:text-4xl">New event</h1>

          {/* Three bars, the way iOS onboarding shows progress. */}
          <ol className="mt-4 flex gap-2" aria-label={`Progress: step ${step} of 3`}>
            {([1, 2, 3] as Step[]).map((item) => (
              <li key={item} className="flex-1" aria-current={item === step ? "step" : undefined}>
                <span className={cn("block h-1.5 rounded-full", item <= step ? "bg-primary" : "bg-black/[0.1]")} />
                <span className={cn("mt-1.5 block text-xs", item === step ? "font-semibold text-primary" : "text-muted-foreground")}>
                  {stepNames[item]}
                </span>
              </li>
            ))}
          </ol>

          <h2 className="mt-7 text-[13px] uppercase tracking-wide text-muted-foreground">
            Step {step} of 3 · {stepTitles[step]}
          </h2>

          {step === 1 ? (
            <section>
              <ListGroup
                className="mt-2"
                footer={
                  <>
                    Pick the closest fit. It only sets the starting point - you can change anything afterwards, in Settings.{" "}
                    {template.tagline}
                  </>
                }
              >
                {eventTemplates.map((item) => (
                  <ListRow
                    key={item.key}
                    icon={templateIcons[item.key] ?? Flame}
                    tone={templateTones[item.key] ?? "gray"}
                    title={item.name}
                    sub={item.examples}
                    subWrap
                    value={`${enabledModuleCount(item)} modules`}
                    checked={item.key === templateKey}
                    onClick={() => chooseTemplate(item.key)}
                  />
                ))}
              </ListGroup>

              {copyable.length ? (
                <>
                  <ListGroup>
                    <ListRow
                      icon={Copy}
                      tone="blue"
                      title="Running one of your events again?"
                      sub="Copy it instead"
                      onClick={() => setShowCopy((value) => !value)}
                      trailing={<ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground/60 transition-transform", showCopy && "rotate-180")} aria-hidden />}
                      chevron={false}
                    />
                  </ListGroup>
                  {showCopy ? (
                    <div className="animate-in fade-in-0 slide-in-from-left-4 duration-300">
                      <ListGroup>
                        <FieldRow id="copy-from" label="Which event?">
                          <select
                            id="copy-from"
                            className={`${fieldInput} appearance-none [text-align-last:right]`}
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
                        </FieldRow>
                      </ListGroup>
                      {copyFrom ? (
                        <div className="mt-4">
                          <DuplicateEventForm
                            ios
                            key={copyFrom}
                            eventId={copyFrom}
                            defaultName={`${copyable.find((item) => item.id === copyFrom)?.name ?? ""} (copy)`}
                          />
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </>
              ) : null}

              <div className="mt-6 flex gap-3">
                <Button type="button" variant="outline" className={secondaryButton} onClick={() => navigate(-1)}>
                  Cancel
                </Button>
                <Button type="button" className={primaryButton} onClick={() => setStep(2)}>
                  Next
                </Button>
              </div>
            </section>
          ) : null}

          {step === 2 ? (
            <section>
              <ListGroup
                className="mt-2"
                footer="An event belongs to a society. Anyone who belongs to that society will find this event in their switcher."
              >
                <FieldRow id="event-name" label="Name">
                  <input
                    id="event-name"
                    className={fieldInput}
                    value={eventName}
                    onChange={(field) => setEventName(field.target.value)}
                    placeholder={template.eventType === "sports" ? "Box Cricket Cup 2026" : "Ganesh Utsav 2026"}
                    required
                  />
                </FieldRow>
                {ownSocieties.length > 1 || (ownSocieties.length === 1 && SOCIETY_REGISTRATION_OPEN) ? (
                  <FieldRow id="society" label="Society">
                    <select
                      id="society"
                      className={`${fieldInput} appearance-none [text-align-last:right]`}
                      value={societyId}
                      onChange={(field) => setSocietyId(field.target.value)}
                    >
                      {ownSocieties.map((society) => (
                        <option key={society.id} value={society.id}>
                          {society.name}
                        </option>
                      ))}
                      {SOCIETY_REGISTRATION_OPEN ? <option value={NEW_SOCIETY}>Create a new society</option> : null}
                    </select>
                  </FieldRow>
                ) : ownSocieties.length === 1 ? (
                  // One society and no way to start another: show it, fixed, rather than a one-item dropdown.
                  <ListRow title="Society" value={ownSocieties[0].name} chevron={false} />
                ) : null}
                {creatingSociety ? (
                  <FieldRow id="new-society" label="New society">
                    <input
                      id="new-society"
                      aria-label="New society name"
                      className={fieldInput}
                      value={societyName}
                      onChange={(field) => setSocietyName(field.target.value)}
                      placeholder="Sunrise Residency"
                    />
                  </FieldRow>
                ) : null}
              </ListGroup>
              {blockedNoSociety ? (
                <p role="alert" className="mt-2 rounded-2xl bg-amber-100 p-3 text-sm text-amber-900">
                  {societyRegistrationClosedMessage} Ask your society&rsquo;s committee to add you, then come back.
                </p>
              ) : (
                <p className="mt-1.5 px-4 text-[13px] text-muted-foreground">
                  {creatingSociety
                    ? "A new society is created and you become its admin. You can rename it later."
                    : "This event joins that society."}
                </p>
              )}

              <ListGroup header="When">
                <FieldRow id="start-date" label="Starts">
                  <input id="start-date" className={fieldInput} type="date" value={startDate} onChange={(field) => setStartDate(field.target.value)} required />
                </FieldRow>
                <FieldRow id="start-time" label="Start time" hint="optional">
                  <input id="start-time" className={fieldInput} type="time" value={startTime} onChange={(field) => setStartTime(field.target.value)} />
                </FieldRow>
                <FieldRow id="end-date" label="Ends">
                  <input id="end-date" className={fieldInput} type="date" value={endDate} onChange={(field) => setEndDate(field.target.value)} required />
                </FieldRow>
                <FieldRow id="end-time" label="End time" hint="optional">
                  <input id="end-time" className={fieldInput} type="time" value={endTime} onChange={(field) => setEndTime(field.target.value)} />
                </FieldRow>
              </ListGroup>

              <ListGroup header="Where">
                <FieldRow id="location" label="Venue">
                  <input id="location" className={fieldInput} value={location} onChange={(field) => setLocation(field.target.value)} placeholder="Society ground" />
                </FieldRow>
              </ListGroup>

              {datesBackwards ? (
                <p className="mt-4 rounded-2xl bg-destructive/10 p-3 text-sm text-destructive">The end date is before the start date.</p>
              ) : null}
              {timesBackwards ? (
                <p className="mt-4 rounded-2xl bg-destructive/10 p-3 text-sm text-destructive">
                  On a one-day event the end time has to be after the start time.
                </p>
              ) : null}

              <div className="mt-6 flex gap-3">
                <Button type="button" variant="outline" className={secondaryButton} onClick={() => setStep(1)}>
                  Back
                </Button>
                <Button type="button" className={primaryButton} onClick={() => setStep(3)} disabled={!detailsComplete || datesBackwards || timesBackwards}>
                  Next
                </Button>
              </div>
            </section>
          ) : null}

          {step === 3 ? (
            <form onSubmit={handleCreate}>
              <ListGroup
                className="mt-2"
                footer={
                  <>
                    Started from the <span className="font-medium text-foreground">{template.name}</span> template. Your event
                    stays private - only organisers can see it - until you publish it. After you create it, the command
                    centre lists what is still needed before you publish.
                  </>
                }
              >
                <ListRow title="Event" value={eventName} chevron={false} />
                <ListRow
                  title="When"
                  value={`${startDate}${endDate !== startDate ? ` to ${endDate}` : ""}${startTime ? `, ${startTime}${endTime ? `-${endTime}` : ""}` : ""}`}
                  chevron={false}
                />
                <ListRow title="Where" value={location || "Not set yet"} chevron={false} />
                <BlockRow>
                  <p className="text-[13px] uppercase tracking-wide text-muted-foreground">It will have</p>
                  <p className="mt-2 flex flex-wrap gap-1.5">
                    {modules
                      .filter((module) => module.isEnabled)
                      .map((module) => (
                        <span key={module.pageKey} className="rounded-full bg-accent px-2.5 py-0.5 text-xs font-medium text-primary">
                          {module.labelOverride ?? moduleLabelFor(module.pageKey)}
                        </span>
                      ))}
                  </p>
                </BlockRow>
              </ListGroup>

              <ListGroup>
                <ListRow
                  icon={SlidersHorizontal}
                  tone="gray"
                  title="Customise modules"
                  sub="Optional"
                  onClick={() => setShowModules((value) => !value)}
                  chevron={false}
                  trailing={<ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground/60 transition-transform", showModules && "rotate-180")} aria-hidden />}
                />
              </ListGroup>
              {showModules ? (
                <div className="mt-2 animate-in fade-in-0 slide-in-from-left-4 duration-300">
                  <ModuleEditor ios modules={modules} onChange={setModules} disabled={saving} />
                </div>
              ) : null}

              {error ? <p className="mt-4 rounded-2xl bg-destructive/10 p-3 text-sm text-destructive">{error}</p> : null}

              <div className="mt-6 space-y-3">
                <Button type="submit" className="h-12 w-full rounded-2xl text-base" disabled={saving}>
                  {saving ? "Creating..." : "Create draft"}
                </Button>
                <div className="flex gap-3">
                  <Button type="button" variant="outline" className={`${secondaryButton} flex-1`} onClick={() => setStep(2)} disabled={saving}>
                    Back
                  </Button>
                  <Button type="button" variant="outline" className={`${secondaryButton} flex-1`} onClick={() => chooseTemplate(templateKey)} disabled={saving}>
                    Reset to template
                  </Button>
                </div>
              </div>
            </form>
          ) : null}
        </div>
      </div>
    </IosPage>
  );
}
