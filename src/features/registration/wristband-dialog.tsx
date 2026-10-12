import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { NoticeDialog } from "@/features/notices/notice-sheet";
import { dateRange } from "@/features/society/event-presentation";
import type { AppEvent } from "@/lib/event-data";
import { themeByKey } from "@/lib/themes";
import { cn } from "@/lib/utils";

/**
 * The entry wristband: one common design for everybody at the event.
 *
 * It carries no QR code and nothing about the person - only the event, its
 * dates and a tag - so a roll of them can be printed ahead of the day and put
 * on anyone, and a photograph of one wrist reveals nothing. The QR passes are
 * separate and personal (see "Share pass"), and the gate reads those; the band
 * only says *this person has been let in tonight*.
 *
 * What is customised per event is what the event already has: its colour
 * preset, its name and its dates, plus a tag the organiser types here
 * (ENTRY, GUEST, VOLUNTEER, FOOD...) and remembers on this device. Nothing is
 * stored on the server, so this needs no migration.
 *
 * Seven bands to an A4 landscape sheet, each cut on its dashed edge. The text is
 * printed twice along the band so it reads wherever the wrist ends up, and the
 * pale striped end is the part that sticks down.
 */

const tagKey = (eventId: string) => `sympal:wristband-tag:${eventId}`;
const MAX_BANDS = 300;

function readTag(eventId: string | undefined) {
  if (!eventId) return "ENTRY";
  try {
    return window.localStorage.getItem(tagKey(eventId)) || "ENTRY";
  } catch {
    return "ENTRY";
  }
}

function nameSize(name: string) {
  if (name.length > 30) return "wristband-name wristband-name-xs";
  if (name.length > 20) return "wristband-name wristband-name-sm";
  return "wristband-name";
}

function Band({ event, tag, dates }: { event: AppEvent; tag: string; dates: string }) {
  const theme = themeByKey(event.theme);
  const copy = (
    <div className="wristband-copy">
      {tag ? <span className="wristband-tag">{tag}</span> : null}
      <span className={nameSize(event.name)}>{event.name}</span>
      <span className="wristband-dates">{dates}</span>
    </div>
  );
  return (
    <div
      className="wristband"
      style={{ "--band": `hsl(${theme.primary})`, "--band-pale": `hsl(${theme.accent})` } as React.CSSProperties}
      aria-hidden="true"
    >
      <div className="wristband-print">
        {copy}
        <span className="wristband-gap" />
        {copy}
      </div>
      <div className="wristband-tail">
        <span>Press this end down</span>
      </div>
    </div>
  );
}

export function WristbandDialog({
  open,
  onOpenChange,
  event,
  suggestedCount,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  event: AppEvent;
  /** How many people are booked: a sensible number to start from. */
  suggestedCount: number;
}) {
  const [tag, setTag] = useState(() => readTag(event.id));
  const [count, setCount] = useState(() => Math.min(Math.max(suggestedCount, 7), MAX_BANDS));

  useEffect(() => {
    if (!open) return;
    setTag(readTag(event.id));
    setCount(Math.min(Math.max(suggestedCount, 7), MAX_BANDS));
  }, [open, event.id, suggestedCount]);

  function changeTag(value: string) {
    const next = value.toUpperCase().slice(0, 14);
    setTag(next);
    if (!event.id) return;
    try {
      window.localStorage.setItem(tagKey(event.id), next);
    } catch {
      /* the tag is just not remembered */
    }
  }

  const bands = Math.min(Math.max(Math.round(count) || 1, 1), MAX_BANDS);
  const dates = [dateRange(event), event.location].filter(Boolean).join(" · ");

  return (
    <NoticeDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Wristbands"
      documentTitle={`${event.name} - Wristbands`}
      audience="internal"
      description={
        <>
          One common band for everyone: the event, its dates and a tag, with no names and no QR code. Print on A4
          <strong> landscape</strong> (7 to a sheet), cut on the dashed lines, and fix with tape or a sticker.
        </>
      }
      controls={
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label className="block text-sm font-medium" htmlFor="band-tag">
              Tag <span className="font-normal text-muted-foreground">(blank for none)</span>
            </label>
            <Input
              id="band-tag"
              value={tag}
              maxLength={14}
              autoComplete="off"
              onChange={(item) => changeTag(item.target.value)}
              className="w-full min-w-0 uppercase"
            />
          </div>
          <div className="space-y-1.5">
            <label className="block text-sm font-medium" htmlFor="band-count">
              How many <span className="font-normal text-muted-foreground">(booked people: {suggestedCount})</span>
            </label>
            <Input
              id="band-count"
              type="number"
              inputMode="numeric"
              min={1}
              max={MAX_BANDS}
              value={count}
              onChange={(item) => setCount(Number(item.target.value))}
              className="w-full min-w-0"
            />
          </div>
        </div>
      }
    >
      <div className={cn("wristband-sheet", "grid gap-2")}>
        {Array.from({ length: bands }, (_, index) => (
          <Band key={index} event={event} tag={tag} dates={dates} />
        ))}
      </div>
    </NoticeDialog>
  );
}
