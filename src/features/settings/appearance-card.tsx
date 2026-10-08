import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, ImageUp, Trash2 } from "lucide-react";
import { ChangeEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiFetch } from "@/lib/api";
import { HeroOptionsForm } from "@/features/settings/hero-options-form";
import { useEventContext } from "@/lib/event-context";
import { useEventData } from "@/lib/event-data";
import type { HeroOptions } from "@/lib/hero";
import { usesBundledPhoto } from "@/lib/hero-artwork";
import { prepareGalleryPhoto } from "@/lib/images";
import { usePageAccess } from "@/lib/page-access";
import { themePresets } from "@/lib/themes";
import { useImageUpload } from "@/lib/uploads";
import { cn } from "@/lib/utils";

/**
 * How this event looks: its colour, and the photograph behind its hero.
 *
 * Colour is five named presets, never a picker. The UI rules set a 4.5:1
 * floor for body text; a free hex field lets a committee pick something that
 * fails it and there is no good way to stop them after the fact. Each preset
 * sits at 38% lightness or darker, which is what keeps white text on it
 * legible - see src/lib/themes.ts.
 */
export function AppearanceCard() {
  const { data } = useEventData({ includeTasks: false });
  const { selectedEventId } = useEventContext();
  const access = usePageAccess("dashboard");
  const upload = useImageUpload();
  const queryClient = useQueryClient();

  const [message, setMessage] = useState<string | null>(null);
  // A failed upload used to read as quiet grey text under the card, which is
  // easy to scroll past - and "uploaded but nothing changed" is exactly what
  // that looks like. A failure now wears the standard error treatment.
  const [failed, setFailed] = useState(false);

  const save = useMutation({
    mutationFn: (input: { theme?: string | null; heroImageUrl?: string | null; heroOptions?: HeroOptions | null }) =>
      apiFetch<{ theme: string | null; heroImageUrl: string | null }>("/api/events?resource=appearance", {
        method: "PATCH",
        body: { eventId: selectedEventId, ...input },
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["event-data"] }),
  });

  if (!selectedEventId || !access.canEdit) return null;

  const currentTheme = data.event.theme ?? "teal";
  const heroImageUrl = data.event.heroImageUrl ?? null;

  function succeed(text: string | null) {
    setFailed(false);
    setMessage(text);
  }

  function fail(error: unknown, fallback: string) {
    setFailed(true);
    setMessage(error instanceof Error ? error.message : fallback);
  }

  async function chooseTheme(key: string) {
    succeed(null);
    try {
      await save.mutateAsync({ theme: key });
    } catch (error) {
      fail(error, "Could not change the colour");
    }
  }

  async function chooseHero(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !selectedEventId) return;

    succeed("Preparing the photograph...");
    try {
      // Re-encoded on the device, as gallery photographs are: a hero read on
      // a phone never needs more than ~1600px, and a 12MP original would
      // otherwise be sent, stored and downloaded at full size by everyone who
      // opens the dashboard.
      const prepared = await prepareGalleryPhoto(file);
      succeed("Uploading...");
      const url = await upload.mutateAsync({ file: prepared.file, eventId: selectedEventId, folder: "events" });
      await save.mutateAsync({ heroImageUrl: url });
      // `prepareGalleryPhoto` always re-encodes, so say so when it actually
      // saved something worth mentioning - a silently altered file is a
      // surprise, which is the same reason the gallery dialog says it too.
      succeed(
        prepared.shrunk
          ? `Hero photograph updated, resized from ${Math.round(prepared.originalBytes / 1024)}KB to ${Math.round(prepared.bytes / 1024)}KB.`
          : "Hero photograph updated.",
      );
    } catch (error) {
      fail(error, "Could not set the photograph");
    }
  }

  async function saveHeroOptions(next: HeroOptions | null) {
    succeed(null);
    try {
      await save.mutateAsync({ heroOptions: next });
      succeed(next ? "Hero details saved." : "Hero details reset.");
    } catch (error) {
      fail(error, "Could not save the hero details");
    }
  }

  async function clearHero() {
    succeed(null);
    try {
      // The focal point and the hidden title were chosen for that photograph;
      // left behind they would be applied to whatever comes next. The subtitle
      // is just words, so it stays.
      const { subtitle } = data.event.heroOptions ?? {};
      await save.mutateAsync({ heroImageUrl: null, ...(data.event.heroOptions ? { heroOptions: subtitle ? { subtitle } : null } : {}) });
      succeed("Back to the standard photograph.");
    } catch (error) {
      fail(error, "Could not clear the photograph");
    }
  }

  const busy = save.isPending || upload.isPending;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Appearance</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div>
          <p className="text-sm font-medium">Colour</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Used for buttons, links, focus rings and the funding bar. Five to choose from rather than any colour at
            all, so text on them stays readable.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {themePresets.map((preset) => {
              const active = preset.key === currentTheme;
              return (
                <button
                  key={preset.key}
                  type="button"
                  disabled={busy}
                  onClick={() => void chooseTheme(preset.key)}
                  aria-pressed={active}
                  aria-label={`${preset.name}. ${preset.description}`}
                  className={cn(
                    "flex items-center gap-2 rounded-md border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60",
                    active ? "border-foreground/30 bg-muted font-medium" : "bg-card",
                  )}
                >
                  <span
                    className="h-5 w-5 shrink-0 rounded-full border"
                    style={{ background: `hsl(${preset.primary})` }}
                    aria-hidden
                  />
                  {preset.name}
                  {active ? <Check className="h-4 w-4 text-primary" aria-hidden /> : null}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <p className="text-sm font-medium">Hero photograph</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            The image behind the event name on the dashboard. Without one, {usesBundledPhoto(data.event)
              ? "the standard photograph is used."
              : "this kind of event shows its own artwork."}
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-3">
            {heroImageUrl ? (
              <img
                src={heroImageUrl}
                alt="This event's hero photograph"
                className="h-16 w-28 rounded-md border object-cover"
              />
            ) : (
              <span className="flex h-16 w-28 items-center justify-center rounded-md border bg-muted text-xs text-muted-foreground">
                {usesBundledPhoto(data.event) ? "Standard" : "Artwork"}
              </span>
            )}

            <label
              className={cn(
                "inline-flex h-10 cursor-pointer items-center gap-2 rounded-md border bg-card px-3 text-sm font-medium",
                "hover:bg-muted focus-within:ring-2 focus-within:ring-ring",
                busy && "pointer-events-none opacity-60",
              )}
            >
              <ImageUp className="h-4 w-4" aria-hidden />
              {heroImageUrl ? "Replace" : "Upload"}
              <input type="file" accept="image/*" className="sr-only" onChange={chooseHero} disabled={busy} />
            </label>

            {heroImageUrl ? (
              <Button variant="outline" size="sm" disabled={busy} onClick={() => void clearHero()}>
                <Trash2 className="h-4 w-4" />
                Remove
              </Button>
            ) : null}
          </div>
        </div>

        <HeroOptionsForm
          key={`${heroImageUrl ?? "standard"}|${JSON.stringify(data.event.heroOptions ?? null)}`}
          photoUrl={heroImageUrl}
          options={data.event.heroOptions ?? null}
          busy={busy}
          onSave={saveHeroOptions}
        />

        {message ? (
          <p
            role={failed ? "alert" : "status"}
            className={cn(
              "text-sm",
              failed ? "rounded-md bg-destructive/10 p-3 text-destructive" : "text-muted-foreground",
            )}
          >
            {message}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
