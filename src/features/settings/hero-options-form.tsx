import { MouseEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { useSettingsDirty } from "@/features/settings/settings-dirty-state";
import { BlockRow, FieldRow, IosSwitch, ListGroup, ListRow } from "@/features/settings/ios-list";
import { fieldInput } from "@/features/settings/ios-styles";
import { heroFocus, MAX_SUBTITLE, type HeroOptions } from "@/lib/hero";

/**
 * Dressing the hero: where the photograph is anchored, whether the event name
 * is printed over it, and one line of subtitle.
 *
 * Deliberately not a free-form designer. The name and subtitle sit on a
 * scrim tuned so white text clears 4.5:1 over any photograph, and letting
 * somebody drag text anywhere or thin that scrim is exactly how a hero ends up
 * unreadable - the same reason colour is five presets and not a picker. What
 * is offered are the choices that cannot make it worse: which part of the
 * picture is kept when it is cropped, and whether the words go on it at all.
 *
 * The focal point and "title is in the picture" only exist once there is a
 * photograph of the organiser's own to apply them to.
 */
export function HeroOptionsForm({
  photoUrl,
  options,
  busy,
  onSave,
}: {
  photoUrl: string | null;
  options: HeroOptions | null;
  busy: boolean;
  onSave: (options: HeroOptions | null) => Promise<void>;
}) {
  const initial = heroFocus(options);
  const [focus, setFocus] = useState<{ x: number; y: number } | null>(initial);
  const [hideTitle, setHideTitle] = useState(options?.hideTitle === true);
  const [subtitle, setSubtitle] = useState(options?.subtitle ?? "");

  function pick(event: MouseEvent<HTMLButtonElement>) {
    const box = event.currentTarget.getBoundingClientRect();
    if (!box.width || !box.height) return;
    const x = Math.round(((event.clientX - box.left) / box.width) * 100);
    const y = Math.round(((event.clientY - box.top) / box.height) * 100);
    setFocus({ x: Math.min(100, Math.max(0, x)), y: Math.min(100, Math.max(0, y)) });
  }

  function current(): HeroOptions | null {
    const next: HeroOptions = {};
    if (photoUrl && focus) {
      next.focusX = focus.x;
      next.focusY = focus.y;
    }
    if (photoUrl && hideTitle) next.hideTitle = true;
    if (subtitle.trim()) next.subtitle = subtitle.trim();
    return Object.keys(next).length ? next : null;
  }

  const dirty = JSON.stringify(current()) !== JSON.stringify(options ?? null);
  useSettingsDirty("hero-options", dirty);
  const point = focus ?? { x: 50, y: 50 };

  return (
    <div>
      <ListGroup
        header="Hero details"
        footer={
          <>
            A line under the event name
            {photoUrl ? ", and how your photograph is framed. The same point is used to crop it on the society page." : "."}
          </>
        }
      >
        <FieldRow id="hero-subtitle" label="Subtitle" hint="optional">
          <input
            id="hero-subtitle"
            className={fieldInput}
            value={subtitle}
            maxLength={MAX_SUBTITLE}
            onChange={(event) => setSubtitle(event.target.value)}
            placeholder="Navratri special"
          />
        </FieldRow>

        {photoUrl ? (
          <>
            <BlockRow className="space-y-2">
              <p className="text-base">Keep this part of the photograph in view</p>
              <p className="text-[13px] text-muted-foreground">
                Tap the part that matters, or use the sliders. Wide and tall frames crop the photograph, and this is the
                part they crop around.
              </p>
              <div className="relative inline-block max-w-full">
                <button
                  type="button"
                  onClick={pick}
                  aria-label="Set the focal point by clicking the photograph. The sliders below do the same."
                  className="block cursor-crosshair overflow-hidden rounded-2xl border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <img src={photoUrl} alt="" className="block max-h-52 w-auto max-w-full" draggable={false} />
                </button>
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-primary/70 shadow ring-1 ring-black/40"
                  style={{ left: `${point.x}%`, top: `${point.y}%` }}
                />
              </div>
              <div className="grid max-w-md gap-3 sm:grid-cols-2">
                <label className="space-y-1 text-xs text-muted-foreground">
                  Across: {point.x}%
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={point.x}
                    onChange={(event) => setFocus({ x: Number(event.target.value), y: point.y })}
                    className="block h-10 w-full"
                  />
                </label>
                <label className="space-y-1 text-xs text-muted-foreground">
                  Down: {point.y}%
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={point.y}
                    onChange={(event) => setFocus({ x: point.x, y: Number(event.target.value) })}
                    className="block h-10 w-full"
                  />
                </label>
              </div>
            </BlockRow>
            <ListRow
              title="Photo already shows the name"
              sub="Hides the name printed over it. Screen readers still get it."
              subWrap
              trailing={<IosSwitch label="My photograph already has the event name on it" checked={hideTitle} onChange={setHideTitle} />}
            />
          </>
        ) : null}
      </ListGroup>

      <div className="mt-4 flex flex-wrap gap-2 px-1">
        <Button type="button" className="h-11 rounded-2xl" disabled={busy || !dirty} onClick={() => void onSave(current())}>
          Save hero details
        </Button>
        {options ? (
          <Button
            type="button"
            variant="outline"
            className="h-11 rounded-2xl"
            disabled={busy}
            onClick={async () => {
              await onSave(null);
              setFocus(null);
              setHideTitle(false);
              setSubtitle("");
            }}
          >
            Reset
          </Button>
        ) : null}
      </div>
    </div>
  );
}
