import { ArrowLeft, Check, ImagePlus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, Navigate, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PersonalCover } from "@/features/personal/personal-cover";
import { useSession } from "@/lib/auth";
import { getDateInEventZone } from "@/lib/event-status";
import { useHostedEvent, usePersonalEventMutations, whenLine, type PersonalEvent, type PersonalEventInput } from "@/lib/personal-events";
import { themePresets, themeVariables } from "@/lib/themes";
import { cn } from "@/lib/utils";
import { OccasionIcon } from "@/components/shared/icon-tile";
import { prepareGalleryPhoto } from "@/lib/images";
import { useImageUpload } from "@/lib/uploads";
import { themeByKey } from "@/lib/themes";
import { KIND_ACCENT, LIMITS, PERSONAL_KINDS, isKind } from "../../../shared/personal-events";

/**
 * Create, or edit, a personal event: five short steps and a live preview of how it will look - what kind,
 * the details (title, note, cover photo, colour), when and where, who sees what, and a review. Inviting
 * happens once it exists: the host's page hands out the link and the 6-character code.
 *
 * Anybody signed in may create one; nothing needs a society or anybody's approval, and the creator is its
 * host (the only person who can manage it - there are no co-hosts yet).
 *
 * `/my/new` (optionally `?kind=birthday`, which the kind chips in My space pass) and `/my/e/<id>/edit`.
 * Signed in only. The page is drawn in the colour being chosen, so the choice is visible as it is made.
 */

const steps = ["Type", "Details", "When", "Guests", "Review"] as const;

const blank = (kind: string): PersonalEventInput => ({
  kind,
  title: "",
  description: "",
  color: "marigold",
  startsOn: "",
  startTime: "",
  endTime: "",
  venue: "",
  address: "",
  coverUrl: "",
  guestsSeeList: false,
  allowPlusOnes: true,
});

export function PersonalEventFormPage() {
  const { id } = useParams();
  const [search] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { data: session, isLoading: sessionLoading } = useSession();
  const editing = Boolean(id);
  const hosted = useHostedEvent(id);
  const { create, update } = usePersonalEventMutations();

  const initialKind = search.get("kind");
  const [draft, setDraft] = useState<PersonalEventInput>(() => blank(isKind(initialKind) ? initialKind : "birthday"));
  const [loaded, setLoaded] = useState(!editing);
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const upload = useImageUpload();
  const fileRef = useRef<HTMLInputElement>(null);
  const [photoNote, setPhotoNote] = useState<string | null>(null);

  useEffect(() => {
    const event = hosted.data?.event;
    if (!editing || !event || loaded) return;
    setDraft({
      kind: event.kind,
      title: event.title,
      description: event.description ?? "",
      color: event.color,
      startsOn: event.startsOn,
      startTime: event.startTime ?? "",
      endTime: event.endTime ?? "",
      venue: event.venue ?? "",
      address: event.address ?? "",
      coverUrl: event.coverUrl ?? "",
      guestsSeeList: event.guestsSeeList,
      allowPlusOnes: event.allowPlusOnes,
    });
    setLoaded(true);
  }, [editing, hosted.data, loaded]);

  const preview: PersonalEvent = useMemo(
    () => ({
      id: id ?? "preview",
      kind: draft.kind,
      title: draft.title.trim() || "Your event",
      description: draft.description,
      color: draft.color,
      startsOn: draft.startsOn || getDateInEventZone(new Date()),
      startTime: draft.startTime || null,
      endTime: draft.endTime || null,
      venue: draft.venue || null,
      address: draft.address || null,
      coverUrl: draft.coverUrl || null,
      code: hosted.data?.event.code ?? "",
      guestsSeeList: draft.guestsSeeList,
      allowPlusOnes: draft.allowPlusOnes,
      status: "active",
    }),
    [draft, id, hosted.data],
  );

  if (sessionLoading) return null;
  if (!session) return <Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}` }} />;
  if (editing && hosted.error) {
    return (
      <main className="mx-auto w-full max-w-2xl px-4 py-6">
        <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{(hosted.error as Error).message}</p>
      </main>
    );
  }
  if (!loaded) return null;

  const set = <K extends keyof PersonalEventInput>(key: K, value: PersonalEventInput[K]) => setDraft((d) => ({ ...d, [key]: value }));
  const today = getDateInEventZone(new Date());

  // What each step needs before Next works. The server checks all of it again.
  const problem =
    step === 1 && !draft.title.trim()
      ? "Give the event a title."
      : step === 1 && upload.isPending
        ? "Wait for the photo to finish uploading."
        : step === 2 && !draft.startsOn
          ? "Choose the date."
          : step === 2 && !editing && draft.startsOn < today
          ? "That date has already passed."
          : null;

  const next = () => {
    if (problem) return setError(problem);
    setError(null);
    setStep((s) => Math.min(s + 1, steps.length - 1));
  };

  const save = async () => {
    setError(null);
    try {
      if (editing && id) {
        await update.mutateAsync({ id, ...draft });
        navigate(`/my/e/${id}`);
      } else {
        const result = await create.mutateAsync(draft);
        navigate(`/my/e/${result.event.id}?created=1`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save. Try again.");
    }
  };
  const saving = create.isPending || update.isPending;

  // A cover photo is re-encoded on the device (1600px, JPEG) before it goes up, like the gallery's, and filed
  // under the host's own id; the API accepts no other URL.
  const pickPhoto = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    try {
      const prepared = await prepareGalleryPhoto(file);
      const url = await upload.mutateAsync({ file: prepared.file, eventId: "", folder: "personal" });
      set("coverUrl", url);
      setPhotoNote(prepared.shrunk ? "Resized for the web before uploading." : null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not upload that photo.");
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <main className="mx-auto w-full max-w-2xl px-4 pb-16 pt-4 sm:pt-6" style={themeVariables(draft.color)}>
      <Link
        to={editing && id ? `/my/e/${id}` : "/society?view=space"}
        className="inline-flex min-h-10 items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        {editing ? "Back to the event" : "My space"}
      </Link>
      <h1 className="font-display mt-2 text-2xl font-semibold sm:text-3xl">{editing ? "Edit your event" : "Create your event"}</h1>
      <p className="mt-1 text-sm text-muted-foreground">Free, private, and only for the people you invite.</p>

      <ol className="mt-5 grid grid-cols-5 gap-1.5 sm:gap-2" aria-label="Steps">
        {steps.map((label, index) => (
          <li key={label}>
            <button
              type="button"
              onClick={() => (index <= step ? setStep(index) : next())}
              aria-current={index === step ? "step" : undefined}
              className="w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className={cn("block h-1.5 rounded-full transition-colors", index <= step ? "bg-primary" : "bg-muted")} />
              <span className={cn("mt-1.5 block truncate text-xs font-medium", index === step ? "text-foreground" : "text-muted-foreground")}>{label}</span>
            </button>
          </li>
        ))}
      </ol>

      <PersonalCover event={preview} eyebrow="Preview" className="mt-5" />

      <section className="mt-6 space-y-5" aria-live="polite">
        {step === 0 ? (
          <>
            <Field label="What are you celebrating?">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="group" aria-label="Kind of event">
                {PERSONAL_KINDS.map((kind) => (
                  <button
                    key={kind.key}
                    type="button"
                    aria-pressed={draft.kind === kind.key}
                    onClick={() => set("kind", kind.key)}
                    className={cn(
                      "flex min-h-[92px] flex-col items-center justify-center gap-1.5 rounded-2xl border bg-card px-2 py-2.5 text-sm font-medium transition",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      draft.kind === kind.key ? "border-primary bg-primary/10 text-foreground" : "[@media(hover:hover)]:hover:bg-muted/50",
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className="flex h-10 w-10 items-center justify-center rounded-xl"
                      style={{ background: `hsl(${themeByKey(KIND_ACCENT[kind.key]).primary} / 0.12)`, color: `hsl(${themeByKey(KIND_ACCENT[kind.key]).primary})` }}
                    >
                      <OccasionIcon name={kind.key} className="h-5 w-5" />
                    </span>
                    {kind.name}
                  </button>
                ))}
              </div>
            </Field>
          </>
        ) : null}

        {step === 1 ? (
          <>
            <Field label="Title" htmlFor="pe-title" count={`${draft.title.length}/${LIMITS.title}`}>
              <Input id="pe-title" value={draft.title} maxLength={LIMITS.title} placeholder="Aarav turns 5" onChange={(e) => set("title", e.target.value)} />
            </Field>
            <Field label="A note for your guests" htmlFor="pe-desc" count={`${draft.description.length}/${LIMITS.description}`}>
              <textarea
                id="pe-desc"
                rows={3}
                maxLength={LIMITS.description}
                value={draft.description}
                placeholder="Come dressed as your favourite superhero!"
                onChange={(e) => set("description", e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </Field>
            <Field label="Cover photo" hint="Optional">
              <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" id="pe-cover" onChange={(e) => void pickPhoto(e.target.files?.[0])} />
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" variant="outline" onClick={() => fileRef.current?.click()} disabled={upload.isPending}>
                  <ImagePlus className="h-4 w-4" aria-hidden="true" />
                  {upload.isPending ? "Uploading…" : draft.coverUrl ? "Change photo" : "Add a photo"}
                </Button>
                {draft.coverUrl ? (
                  <Button type="button" variant="ghost" onClick={() => set("coverUrl", "")}>
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                    Remove
                  </Button>
                ) : null}
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground" role="status">
                {photoNote ?? (draft.coverUrl ? "Shown on the invitation and your page." : "Without one, the invitation uses artwork for the kind of event.")}
              </p>
            </Field>
            <Field label="Colour">
              <div className="flex flex-wrap gap-2" role="group" aria-label="Event colour">
                {themePresets.map((preset) => (
                  <button
                    key={preset.key}
                    type="button"
                    aria-pressed={draft.color === preset.key}
                    onClick={() => set("color", preset.key)}
                    className={cn(
                      "inline-flex min-h-10 items-center gap-2 rounded-full border bg-card py-1 pl-1 pr-3 text-sm font-medium",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      draft.color === preset.key && "ring-2 ring-offset-1",
                    )}
                    style={{ ["--tw-ring-color" as string]: `hsl(${preset.primary})` }}
                  >
                    <span className="flex h-8 w-8 items-center justify-center rounded-full text-white" style={{ background: `hsl(${preset.primary})` }}>
                      {draft.color === preset.key ? <Check className="h-4 w-4" aria-hidden="true" /> : null}
                    </span>
                    {preset.name}
                  </button>
                ))}
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground">Used on this event's page and invitation only.</p>
            </Field>
          </>
        ) : null}

        {step === 2 ? (
          <>
            <Field label="Date" htmlFor="pe-date">
              <Input id="pe-date" type="date" min={editing ? undefined : today} value={draft.startsOn} onChange={(e) => set("startsOn", e.target.value)} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Starts" htmlFor="pe-start" hint="Optional">
                <Input id="pe-start" type="time" value={draft.startTime} onChange={(e) => set("startTime", e.target.value)} />
              </Field>
              <Field label="Ends" htmlFor="pe-end" hint="Optional">
                <Input id="pe-end" type="time" value={draft.endTime} onChange={(e) => set("endTime", e.target.value)} />
              </Field>
            </div>
            <Field label="Venue" htmlFor="pe-venue" hint="Optional">
              <Input id="pe-venue" maxLength={LIMITS.venue} value={draft.venue} placeholder="Clubhouse, a restaurant, home…" onChange={(e) => set("venue", e.target.value)} />
            </Field>
            <Field label="Address" htmlFor="pe-address" hint="Optional">
              <Input id="pe-address" maxLength={LIMITS.address} value={draft.address} placeholder="So guests can find it on a map" onChange={(e) => set("address", e.target.value)} />
            </Field>
          </>
        ) : null}

        {step === 3 ? (
          <div className="divide-y rounded-xl border bg-card">
            <Toggle
              label="Private, invite only"
              description="Only people with your link or code can see it. It never appears on a society page or in search."
              checked
              locked
            />
            <Toggle
              label="Guests can see who's coming"
              description="Off: guests see numbers only. Phone numbers always stay with you."
              checked={draft.guestsSeeList}
              onChange={(value) => set("guestsSeeList", value)}
            />
            <Toggle
              label="Guests can bring family"
              description="They say how many are coming when they reply."
              checked={draft.allowPlusOnes}
              onChange={(value) => set("allowPlusOnes", value)}
            />
          </div>
        ) : null}

        {step === 4 ? (
          <dl className="divide-y rounded-xl border bg-card text-sm">
            {[
              ["What", PERSONAL_KINDS.find((k) => k.key === draft.kind)?.name ?? ""],
              ["Title", draft.title || "—"],
              ["When", draft.startsOn ? whenLine({ startsOn: draft.startsOn, startTime: draft.startTime || null, endTime: draft.endTime || null }) : "—"],
              ["Where", [draft.venue, draft.address].filter(Boolean).join(", ") || "—"],
              ["Who can see it", "People with the link or code"],
              ["Guest list", draft.guestsSeeList ? "Guests can see who's coming" : "Only you"],
              ["Cover", draft.coverUrl ? "Your photo" : "Artwork"],
              ["Inviting", editing ? "Your link and code stay the same" : "You'll get a link and a 6-character code to share"],
            ].map(([term, value]) => (
              <div key={term} className="flex justify-between gap-4 px-4 py-3">
                <dt className="text-muted-foreground">{term}</dt>
                <dd className="text-right font-medium">{value}</dd>
              </div>
            ))}
          </dl>
        ) : null}

        {error ? <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</p> : null}

        <div className="flex justify-between gap-3 border-t pt-4">
          {step > 0 ? (
            <Button type="button" variant="outline" onClick={() => setStep((s) => s - 1)}>
              Back
            </Button>
          ) : (
            <span />
          )}
          {step < steps.length - 1 ? (
            <Button type="button" onClick={next}>
              Next
            </Button>
          ) : (
            <Button type="button" onClick={() => void save()} disabled={saving}>
              {saving ? "Saving…" : editing ? "Save changes" : "Create event"}
            </Button>
          )}
        </div>
      </section>
    </main>
  );
}

function Field({ label, htmlFor, hint, count, children }: { label: string; htmlFor?: string; hint?: string; count?: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        {htmlFor ? (
          <label htmlFor={htmlFor} className="text-sm font-semibold">
            {label}
            {hint ? <span className="ml-1.5 font-normal text-muted-foreground">{hint}</span> : null}
          </label>
        ) : (
          <p className="text-sm font-semibold">{label}</p>
        )}
        {count ? <span className="text-xs tabular-nums text-muted-foreground">{count}</span> : null}
      </div>
      {children}
    </div>
  );
}

function Toggle({ label, description, checked, locked, onChange }: { label: string; description: string; checked: boolean; locked?: boolean; onChange?: (value: boolean) => void }) {
  return (
    <div className="flex items-start justify-between gap-4 px-4 py-3">
      <div className="min-w-0">
        <p className="text-sm font-semibold">{label}</p>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={locked}
        onClick={() => onChange?.(!checked)}
        className={cn(
          "relative mt-1 h-7 w-12 shrink-0 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60",
          checked ? "bg-primary" : "bg-muted",
        )}
      >
        <span className={cn("absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform", checked ? "translate-x-[22px]" : "translate-x-0.5")} />
      </button>
    </div>
  );
}
