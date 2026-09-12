import { Printer } from "lucide-react";
import { ReactNode, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatPrintedOn } from "@/lib/notices";
import { cn } from "@/lib/utils";

/**
 * Printable notices - the A4 sheet a committee pins on the board or sends
 * round on WhatsApp as a PDF.
 *
 * **There is no PDF library here, on purpose.** The sheet is ordinary HTML
 * that prints properly, and the browser's own print dialog has "Save as PDF"
 * (and "Print to PDF" on Windows, "Share -> Print" on iOS). That means:
 * selectable text, real fonts, no 300KB dependency, no serverless function to
 * render it - and the preview in the dialog *is* what comes out, because it is
 * the same markup.
 *
 * How printing works: the dialog portals outside `#root`, so the print rules
 * in globals.css hide `#root` and strip the dialog's own framing
 * (`[data-notice-shell]`), leaving the sheet alone on the page. Anything that
 * must not print - the audience switch, the buttons - carries
 * `notice-no-print`.
 *
 * Every notice comes in two audiences, because the same list is not fit for
 * both:
 *   external - the notice board and the residents' group: no flat numbers,
 *              no contact details, no internal notes;
 *   internal - the committee's own copy: owners, flats, notes, status.
 * Each notice decides what that means for its own content; the switch only
 * says which one is being printed.
 */
export type NoticeAudience = "external" | "internal";

const audienceOptions: Array<{ value: NoticeAudience; label: string; hint: string }> = [
  { value: "external", label: "Notice board", hint: "For residents - no flats or private notes" },
  { value: "internal", label: "Committee copy", hint: "Everything, including owners and notes" },
];

/**
 * The sheet itself: masthead, body, footer. Sized for A4 on screen and
 * unstyled by the app's chrome when printed.
 */
export function NoticeSheet({
  eventName,
  eventDates,
  location,
  title,
  intro,
  audience,
  size = "notice",
  children,
}: {
  eventName: string;
  eventDates: string;
  location?: string;
  title: string;
  intro?: string;
  audience: NoticeAudience;
  /**
   * "notice" is the dense list - a whole programme, every prasad slot.
   * "poster" is one thing on one sheet (a single event's running order), so
   * the type goes up to be read from a few feet away on a board.
   */
  size?: "notice" | "poster";
  children: ReactNode;
}) {
  const poster = size === "poster";

  return (
    <article className="notice-sheet mx-auto w-full max-w-[760px] bg-card p-5 text-card-foreground sm:p-7 print:max-w-none print:p-0">
      <header className={cn("border-b-2 border-foreground", poster ? "pb-4" : "pb-3")}>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">{eventName}</p>
        <h1 className={cn("mt-1.5 font-bold leading-tight", poster ? "text-4xl sm:text-5xl" : "text-2xl sm:text-3xl")}>
          {title}
        </h1>
        <p className={cn("mt-1.5 text-muted-foreground", poster ? "text-lg" : "text-sm")}>
          {eventDates}
          {location ? ` · ${location}` : ""}
        </p>
      </header>

      {intro ? <p className={cn("mt-3", poster ? "text-lg font-medium" : "text-sm")}>{intro}</p> : null}

      <div className="mt-4 space-y-4">{children}</div>

      <footer className="mt-6 flex flex-wrap justify-between gap-2 border-t border-border pt-2 text-xs text-muted-foreground">
        <span>
          {audience === "internal" ? "Committee copy - not for the notice board" : `Issued by the ${eventName} committee`}
        </span>
        <span>Printed {formatPrintedOn()}</span>
      </footer>
    </article>
  );
}

/** A day, a slot, an auction - one block that should not be split across pages. */
export function NoticeBlock({ heading, meta, children }: { heading: string; meta?: string; children: ReactNode }) {
  return (
    <section className="notice-block">
      <h2 className="flex flex-wrap items-baseline gap-x-2 border-b border-border pb-1 text-base font-semibold">
        {heading}
        {meta ? <span className="text-sm font-normal text-muted-foreground">{meta}</span> : null}
      </h2>
      <div className="mt-2 space-y-2.5">{children}</div>
    </section>
  );
}

/** "Sponsored by: Sharma family, Joshi family" - a labelled run of values. */
export function NoticeLine({ label, value }: { label: string; value: ReactNode }) {
  return (
    <p className="text-sm">
      <span className="font-medium">{label}: </span>
      {value}
    </p>
  );
}

export function NoticeEmpty({ children }: { children: ReactNode }) {
  return <p className="text-sm italic text-muted-foreground">{children}</p>;
}

/**
 * The preview-and-print wrapper. Pass the sheet as `children`, and anything
 * the notice needs to choose (which event, which day) as `controls`.
 */
export function NoticeDialog({
  open,
  onOpenChange,
  title,
  documentTitle,
  audience,
  onAudienceChange,
  controls,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** Becomes the browser's suggested PDF filename. */
  documentTitle: string;
  audience: NoticeAudience;
  /** Omit to lock the notice to one audience (Tasks has no public version). */
  onAudienceChange?: (audience: NoticeAudience) => void;
  controls?: ReactNode;
  children: ReactNode;
}) {
  // Marks the document as "printing a notice" so the print rules know to hide
  // the app behind the dialog. Removed again when the dialog closes.
  useEffect(() => {
    if (!open) return;
    document.body.classList.add("printing-notice");
    return () => document.body.classList.remove("printing-notice");
  }, [open]);

  function print() {
    const previousTitle = document.title;
    // Chrome, Edge and Safari all seed the "Save as PDF" filename from the
    // document title, so a notice saves as "Ganesh Chaturthi - Prasad.pdf"
    // rather than "index".
    document.title = documentTitle;
    const restore = () => {
      document.title = previousTitle;
      window.removeEventListener("afterprint", restore);
    };
    window.addEventListener("afterprint", restore);
    window.print();
    // Safari on iOS does not always fire afterprint.
    window.setTimeout(restore, 5000);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-notice-shell className="max-w-3xl">
        <DialogHeader className="notice-no-print">
          <DialogTitle>{title}</DialogTitle>
          <p className="text-sm text-muted-foreground">
            Print it for the board, or choose <strong>Save as PDF</strong> in the print dialog to share it.
          </p>
        </DialogHeader>

        <div className="notice-no-print space-y-3">
          {onAudienceChange ? (
            <fieldset className="space-y-1.5">
              <legend className="text-sm font-medium">This copy is for</legend>
              <div className="grid gap-1 rounded-md border p-0.5 sm:grid-cols-2">
                {audienceOptions.map((option) => (
                  <label
                    key={option.value}
                    className={cn(
                      "flex min-h-11 cursor-pointer flex-col justify-center rounded px-3 py-1.5 text-sm transition-colors focus-within:ring-2 focus-within:ring-ring",
                      audience === option.value ? "bg-primary text-primary-foreground" : "hover:bg-muted",
                    )}
                  >
                    <input
                      type="radio"
                      name="notice-audience"
                      value={option.value}
                      checked={audience === option.value}
                      onChange={() => onAudienceChange(option.value)}
                      className="sr-only"
                    />
                    <span className="font-medium">{option.label}</span>
                    <span
                      className={cn(
                        "text-xs",
                        audience === option.value ? "text-primary-foreground/85" : "text-muted-foreground",
                      )}
                    >
                      {option.hint}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          ) : null}

          {controls}
        </div>

        {/* The preview frame is chrome, so it goes away in print; the sheet
            inside it is what lands on paper. */}
        <div className="max-h-[55vh] overflow-y-auto rounded-md border bg-muted/40 p-2 print:max-h-none print:overflow-visible print:border-0 print:bg-transparent print:p-0">
          {children}
        </div>

        <div className="notice-no-print flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button type="button" onClick={print}>
            <Printer className="h-4 w-4" aria-hidden="true" />
            Print / Save as PDF
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
