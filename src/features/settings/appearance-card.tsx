import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, ImageUp, Trash2 } from "lucide-react";
import { ChangeEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiFetch } from "@/lib/api";
import { useEventContext } from "@/lib/event-context";
import { useEventData } from "@/lib/event-data";
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

  const save = useMutation({
    mutationFn: (input: { theme?: string | null; heroImageUrl?: string | null }) =>
      apiFetch<{ theme: string | null; heroImageUrl: string | null }>("/api/events?resource=appearance", {
        method: "PATCH",
        body: { eventId: selectedEventId, ...input },
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["event-data"] }),
  });

  if (!selectedEventId || !access.canEdit) return null;

  const currentTheme = data.event.theme ?? "teal";
  const heroImageUrl = data.event.heroImageUrl ?? null;

  async function chooseTheme(key: string) {
    setMessage(null);
    try {
      await save.mutateAsync({ theme: key });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not change the colour");
    }
  }

  async function chooseHero(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !selectedEventId) return;

    setMessage("Preparing the photograph...");
    try {
      // Re-encoded on the device, as gallery photographs are: a hero read on
      // a phone never needs more than ~1600px, and a 12MP original would
      // otherwise be sent, stored and downloaded at full size by everyone who
      // opens the dashboard.
      const prepared = await prepareGalleryPhoto(file);
      setMessage("Uploading...");
      const url = await upload.mutateAsync({ file: prepared.file, eventId: selectedEventId, folder: "events" });
      await save.mutateAsync({ heroImageUrl: url });
      // `prepareGalleryPhoto` always re-encodes, so say so when it actually
      // saved something worth mentioning - a silently altered file is a
      // surprise, which is the same reason the gallery dialog says it too.
      setMessage(
        prepared.shrunk
          ? `Hero photograph updated, resized from ${Math.round(prepared.originalBytes / 1024)}KB to ${Math.round(prepared.bytes / 1024)}KB.`
          : "Hero photograph updated.",
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not set the photograph");
    }
  }

  async function clearHero() {
    setMessage(null);
    try {
      await save.mutateAsync({ heroImageUrl: null });
      setMessage("Back to the standard photograph.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not clear the photograph");
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
            The image behind the event name on the dashboard. Without one, the standard photograph is used.
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
                Standard
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

        {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
      </CardContent>
    </Card>
  );
}
