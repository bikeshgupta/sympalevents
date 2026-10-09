import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Check, X } from "lucide-react";
import { FormEvent, ReactNode, useId } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * The shell every "add an entry" form sits in.
 *
 * On a phone it is a **bottom sheet**: it rises from the foot of the screen, takes up to 92% of
 * its height, keeps its title and its buttons pinned and scrolls only the fields between them.
 * The old form was the app's centred dialog, which on a phone is a tall card whose Save button
 * is below the fold and whose close button is a 16px icon. From `sm` up it is the ordinary
 * centred dialog, so the desktop does not change shape.
 *
 * It is a presentation, not a form: the caller owns the state and the save. What it adds is
 * the two-button footer for entering many in a row. **"Save & add next" is first in the DOM**
 * so Enter in any field means "next one" - the thing somebody entering twenty payments wants -
 * and is drawn on the right, where a thumb expects the main action.
 *
 * `intent` tells the caller which button was pressed.
 */
export type EntryIntent = "next" | "close";

export function EntrySheet({
  open,
  onOpenChange,
  title,
  summary,
  children,
  footerExtra,
  onSubmit,
  saving,
  error,
  notice,
  submitLabel,
  repeatable = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** One line under the title - e.g. "3 added · ₹3,500". */
  summary?: ReactNode;
  children: ReactNode;
  /** Anything that belongs under the fields but above the buttons (the list of what was just added). */
  footerExtra?: ReactNode;
  onSubmit: (intent: EntryIntent, event: FormEvent<HTMLFormElement>) => void | Promise<void>;
  saving: boolean;
  error: string | null;
  /** A short confirmation after "Save & add next". Announced politely. */
  notice?: string | null;
  submitLabel?: string;
  /** Show "Save & add next" beside "Save & close". Off for editing one existing row. */
  repeatable?: boolean;
}) {
  const formId = useId();
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 print:hidden" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className={cn(
            "fixed z-50 flex flex-col overflow-hidden bg-card shadow-xl outline-none",
            // Phone: a sheet from the bottom.
            "inset-x-0 bottom-0 max-h-[92dvh] rounded-t-2xl border-t",
            // sm and up: the centred dialog the app has always had.
            "sm:inset-auto sm:left-1/2 sm:top-1/2 sm:max-h-[90vh] sm:w-[calc(100%-2rem)] sm:max-w-xl sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-lg sm:border",
          )}
        >
          <div aria-hidden="true" className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-border sm:hidden" />
          <header className="flex shrink-0 items-start justify-between gap-3 px-4 pb-2 pt-3 sm:px-5">
            <div className="min-w-0">
              <DialogPrimitive.Title className="text-lg font-semibold leading-tight">{title}</DialogPrimitive.Title>
              {summary ? <p className="mt-0.5 text-sm tabular-nums text-muted-foreground">{summary}</p> : null}
            </div>
            <DialogPrimitive.Close
              className="-mr-2 -mt-1 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Close"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </DialogPrimitive.Close>
          </header>

          <form
            id={formId}
            className="flex min-h-0 flex-1 flex-col"
            onSubmit={(event) => {
              event.preventDefault();
              const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
              void onSubmit(submitter?.value === "close" ? "close" : repeatable ? "next" : "close", event);
            }}
          >
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 pb-4 pt-1 sm:px-5">
              {children}
              {footerExtra}
            </div>

            <div className="shrink-0 space-y-2 border-t bg-card px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 sm:px-5 sm:pb-4">
              {notice ? (
                <p role="status" className="flex items-center gap-1.5 text-sm font-medium text-emerald-800">
                  <Check className="h-4 w-4" aria-hidden="true" />
                  {notice}
                </p>
              ) : null}
              {error ? (
                <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                  {error}
                </p>
              ) : null}
              <div className="flex flex-row-reverse gap-2">
                {repeatable ? (
                  <>
                    <Button type="submit" name="intent" value="next" className="h-12 flex-1" disabled={saving}>
                      {saving ? "Saving…" : "Save & add next"}
                    </Button>
                    <Button type="submit" name="intent" value="close" variant="outline" className="h-12 flex-1" disabled={saving}>
                      Save & close
                    </Button>
                  </>
                ) : (
                  <>
                    <Button type="submit" name="intent" value="close" className="h-12 flex-1" disabled={saving}>
                      {saving ? "Saving…" : (submitLabel ?? "Save changes")}
                    </Button>
                    <Button type="button" variant="outline" className="h-12 flex-1" onClick={() => onOpenChange(false)}>
                      Cancel
                    </Button>
                  </>
                )}
              </div>
            </div>
          </form>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/**
 * One choice out of a few, as large tappable chips: how a phone wants a short list.
 * A real radio group underneath (`role="radiogroup"` + `role="radio"`), so a screen reader and
 * arrow keys behave as radio buttons without extra wiring.
 */
export function ChipChoice({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  const id = useId();
  // A stored value that is not one of the presets (an older free-text mode) still shows, selected.
  const all = value && !options.includes(value) ? [...options, value] : options;
  return (
    <div className="space-y-1.5">
      <span id={id} className="text-sm font-medium">
        {label}
      </span>
      <div role="radiogroup" aria-labelledby={id} className="flex flex-wrap gap-2">
        {all.map((option) => {
          const selected = option === value;
          return (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(option)}
              className={cn(
                "inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                selected ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-muted",
              )}
            >
              {option}
            </button>
          );
        })}
      </div>
    </div>
  );
}
