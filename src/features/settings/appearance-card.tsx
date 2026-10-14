import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, ImageUp, Trash2 } from "lucide-react";
import { ChangeEvent, useState } from "react";
import { apiFetch } from "@/lib/api";
import { BlockRow, IconTile, ListGroup, ListRow } from "@/features/settings/ios-list";
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
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["command-centre"] });
      return queryClient.invalidateQueries({ queryKey: ["event-data"] });
    },
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
    <div>
      <ListGroup
        header="Colour"
        footer="Used for buttons, links, focus rings and the funding bar. Five to choose from rather than any colour at all, so text on them stays readable."
      >
        <BlockRow>
          <div className="flex flex-wrap gap-2">
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
                    "flex items-center gap-2 rounded-full border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60",
                    active ? "border-foreground/30 bg-muted font-medium" : "bg-white",
                  )}
                >
                  <span className="h-5 w-5 shrink-0 rounded-full border" style={{ background: `hsl(${preset.primary})` }} aria-hidden />
                  {preset.name}
                  {active ? <Check className="h-4 w-4 text-primary" aria-hidden /> : null}
                </button>
              );
            })}
          </div>
        </BlockRow>
      </ListGroup>

      <ListGroup
        header="Hero photograph"
        footer={
          <>
            The image behind the event name on the dashboard. Without one,{" "}
            {usesBundledPhoto(data.event) ? "the standard photograph is used." : "this kind of event shows its own artwork."}
          </>
        }
      >
        <BlockRow>
          {heroImageUrl ? (
            <img src={heroImageUrl} alt="This event's hero photograph" className="h-24 w-full max-w-xs rounded-2xl border object-cover" />
          ) : (
            <span className="flex h-24 w-full max-w-xs items-center justify-center rounded-2xl border bg-muted text-sm text-muted-foreground">
              {usesBundledPhoto(data.event) ? "Standard photograph" : "Artwork"}
            </span>
          )}
        </BlockRow>
        <li style={{ ["--ios-inset" as string]: "3.5rem" } as React.CSSProperties}>
          <label
            className={cn(
              "flex min-h-12 w-full cursor-pointer items-center gap-3 px-4 py-2 transition-colors focus-within:ring-2 focus-within:ring-inset focus-within:ring-ring active:bg-black/[0.05]",
              busy && "pointer-events-none opacity-50",
            )}
          >
            <IconTile icon={ImageUp} tone="blue" />
            <span className="flex-1 text-[15px]">{heroImageUrl ? "Replace photograph" : "Upload a photograph"}</span>
            <input type="file" accept="image/*" className="sr-only" onChange={chooseHero} disabled={busy} />
          </label>
        </li>
        {heroImageUrl ? (
          <ListRow icon={Trash2} tone="red" title="Remove photograph" chevron={false} disabled={busy} onClick={() => void clearHero()} />
        ) : null}
      </ListGroup>

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
          className={cn("mt-4 text-sm", failed ? "rounded-2xl bg-destructive/10 p-3 text-destructive" : "px-4 text-muted-foreground")}
        >
          {message}
        </p>
      ) : null}
    </div>
  );
}
