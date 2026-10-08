import { ArrowLeft, Camera } from "lucide-react";
import { useRef, useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSession } from "@/lib/auth";
import { uploadAvatar, useProfile } from "@/lib/profile";

/**
 * "My profile": the one place a person makes their account their own.
 *
 * Name and photograph appear beside everything they do - credits, reviews, task lists - so
 * they are theirs to set. Flat and phone are not shown to anybody; they only start forms
 * filled in (registration, sign-ups), so nobody types the same thing twice.
 */
export function ProfilePage() {
  const { data: session, isLoading } = useSession();
  const { query, save } = useProfile();
  const navigate = useNavigate();

  if (!isLoading && !session) return <Navigate to="/login" replace state={{ from: "/profile" }} />;
  if (isLoading || !session || query.isLoading) {
    return (
      <main className="mx-auto max-w-lg px-4 py-6" aria-busy="true">
        <div className="h-64 animate-pulse rounded-xl bg-muted" />
      </main>
    );
  }

  const me = query.data;
  // Keyed by what was last saved, so saving elsewhere never leaves the form showing stale values.
  const formKey = `${me?.user.full_name ?? ""}|${me?.profile.flat ?? ""}|${me?.profile.phone ?? ""}|${me?.profile.customPhotoUrl ?? ""}`;

  return (
    <main className="mx-auto w-full max-w-lg px-4 pb-16 pt-5 sm:pt-8">
      <button
        type="button"
        onClick={() => navigate(-1)}
        className="mb-4 inline-flex min-h-10 items-center gap-1.5 rounded-md text-sm font-medium text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Back
      </button>
      <h1 className="text-2xl font-semibold sm:text-3xl">My profile</h1>
      <p className="mt-1 text-sm text-muted-foreground">{session.user.email}</p>

      {query.isError ? (
        <p role="alert" className="mt-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {query.error instanceof Error ? query.error.message : "Could not load your profile."}
        </p>
      ) : null}

      <ProfileForm
        key={formKey}
        name={me?.user.full_name ?? session.user.name ?? ""}
        flat={me?.profile.flat ?? ""}
        phone={me?.profile.phone ?? ""}
        photoUrl={me?.user.photo_url ?? null}
        googlePhotoUrl={me?.user.google_photo_url ?? null}
        customPhoto={Boolean(me?.profile.customPhotoUrl)}
        ready={me?.profile.ready ?? false}
        save={(changes) => save.mutateAsync(changes).then(() => undefined)}
      />

      <p className="mt-6 text-sm text-muted-foreground">
        Your email follows your Google account. <Link to="/dashboard" className="text-primary underline-offset-2 hover:underline">Back to the event</Link>
      </p>
    </main>
  );
}

function ProfileForm({
  name: initialName,
  flat: initialFlat,
  phone: initialPhone,
  photoUrl,
  googlePhotoUrl,
  customPhoto,
  ready,
  save,
}: {
  name: string;
  flat: string;
  phone: string;
  photoUrl: string | null;
  googlePhotoUrl: string | null;
  customPhoto: boolean;
  ready: boolean;
  save: (changes: { fullName?: string; flat?: string; phone?: string; photoUrl?: string | null }) => Promise<void>;
}) {
  const [name, setName] = useState(initialName);
  const [flat, setFlat] = useState(initialFlat);
  const [phone, setPhone] = useState(initialPhone);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  async function run(work: () => Promise<void>) {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      await work();
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "That did not save. Try again.");
    } finally {
      setBusy(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void run(() => save({ fullName: name, ...(ready ? { flat, phone } : {}) }));
  }

  function chooseFile(file: File | undefined) {
    if (!file) return;
    void run(async () => {
      const url = await uploadAvatar(file);
      await save({ photoUrl: url });
    });
  }

  const initial = (name.trim()[0] ?? "U").toUpperCase();

  return (
    <form onSubmit={submit} className="mt-6 space-y-5">
      <div className="flex items-center gap-4">
        {photoUrl ? (
          <img src={photoUrl} alt="" referrerPolicy="no-referrer" className="h-20 w-20 shrink-0 rounded-full border object-cover" />
        ) : (
          <span aria-hidden="true" className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full border bg-muted text-2xl font-semibold">
            {initial}
          </span>
        )}
        <div className="space-y-2">
          <input
            ref={fileInput}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            className="sr-only"
            tabIndex={-1}
            aria-label="Choose a profile photo"
            onChange={(e) => {
              chooseFile(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" className="h-10" disabled={busy || !ready} onClick={() => fileInput.current?.click()}>
              <Camera className="h-4 w-4" aria-hidden="true" />
              {customPhoto ? "Change photo" : "Add photo"}
            </Button>
            {customPhoto ? (
              <Button type="button" variant="ghost" className="h-10" disabled={busy} onClick={() => void run(() => save({ photoUrl: null }))}>
                {googlePhotoUrl ? "Use my Google photo" : "Remove photo"}
              </Button>
            ) : null}
          </div>
          {!customPhoto ? <p className="text-xs text-muted-foreground">Right now this is your Google photo.</p> : null}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="profile-name">Your name</Label>
        <Input id="profile-name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} autoComplete="name" />
        <p className="text-xs text-muted-foreground">This is the name on credits, reviews and task lists.</p>
      </div>

      {ready ? (
        <>
          <div className="space-y-1.5">
            <Label htmlFor="profile-flat">Flat / household</Label>
            <Input id="profile-flat" value={flat} onChange={(e) => setFlat(e.target.value)} maxLength={40} placeholder="D104" autoComplete="off" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="profile-phone">Phone</Label>
            <Input id="profile-phone" type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={40} autoComplete="tel" />
            <p className="text-xs text-muted-foreground">
              Private. Nobody sees your flat or phone from here - they only fill in registration and sign-up forms for you.
            </p>
          </div>
        </>
      ) : (
        <p role="status" className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          Photo, flat and phone need supabase/migrations/041_profile.sql. You can still change your name.
        </p>
      )}

      {error ? (
        <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {saved ? (
        <p role="status" className="rounded-md bg-accent/60 p-3 text-sm text-accent-foreground">
          Saved.
        </p>
      ) : null}

      <Button type="submit" className="h-11" disabled={busy || !name.trim()}>
        {busy ? "Saving…" : "Save"}
      </Button>
    </form>
  );
}
