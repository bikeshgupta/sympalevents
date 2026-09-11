import { LucideIcon } from "lucide-react";
import { Children, ReactNode } from "react";
import { AnimatedNumber } from "@/components/shared/animated-number";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * A page's headline numbers: one short row of tiles, at every width.
 *
 * This is the only tile design, on purpose. The roomy original stacked one
 * tile per row on a phone - three or four cards and ~380px of screen before
 * any of the page's actual content - so every page now uses the dense one
 * Contributions introduced: value first, label under it, and the icon and
 * note (both supplementary next to a labelled number) dropped below `sm`.
 *
 * Put tiles in a `StatGrid`, which keeps them on one row. Money goes in as
 * `formatCurrencyCompact` with the exact figure on `valueTitle` - a full
 * "₹1,23,456" does not fit a quarter of a phone.
 *
 * Labels have to fit too: in a four-tile row on a 360px phone about eight
 * capital letters fit, three tiles about twelve. A longer label gets a
 * `shortTitle` for phones ("Outstanding" -> "Due"), which must still be true
 * of the number.
 */
export function StatCard({
  title,
  shortTitle,
  value,
  icon: Icon,
  note,
  valueTitle,
  isLoading = false,
  countTo,
  format,
}: {
  title: string;
  /** Shown instead of `title` below `sm`; screen readers still hear `title`. */
  shortTitle?: string;
  value: string;
  icon: LucideIcon;
  note?: string;
  valueTitle?: string;
  isLoading?: boolean;
  /** Pass with `format` to count the value up on load instead of snapping to it. */
  countTo?: number;
  format?: (value: number) => string;
}) {
  const animate = typeof countTo === "number" && typeof format === "function";

  return (
    <Card className="min-w-0 transition-shadow hover:shadow-md">
      <CardContent className="px-2 py-2 sm:px-3">
        <div className="flex items-baseline gap-1.5">
          {isLoading ? (
            <div className="h-6 w-14 animate-pulse rounded bg-muted" aria-hidden="true" />
          ) : animate ? (
            <AnimatedNumber
              value={countTo}
              format={format}
              className="block truncate text-lg font-semibold tabular-nums sm:text-xl"
              title={valueTitle}
            />
          ) : (
            <p className="truncate text-lg font-semibold tabular-nums sm:text-xl" title={valueTitle}>
              {value}
            </p>
          )}
          <Icon className="hidden h-4 w-4 shrink-0 self-center text-primary sm:block" aria-hidden="true" />
        </div>
        <p className="truncate text-[11px] font-medium uppercase tracking-wide text-muted-foreground sm:text-xs">
          {shortTitle ? (
            <>
              <span aria-hidden="true" className="sm:hidden">
                {shortTitle}
              </span>
              <span className="sr-only sm:not-sr-only">{title}</span>
            </>
          ) : (
            title
          )}
        </p>
        {note ? <p className="hidden truncate text-xs text-muted-foreground sm:block">{note}</p> : null}
      </CardContent>
    </Card>
  );
}

// Written out in full so Tailwind sees every class it has to generate.
const columnsByCount: Record<number, string> = {
  1: "grid-cols-1",
  2: "grid-cols-2",
  3: "grid-cols-3",
  4: "grid-cols-4",
};

/**
 * The row StatCards sit in: as many columns as there are tiles, on one line
 * at every width. Past four it wraps into rows of four - four short numbers
 * are about all a phone's width holds.
 */
export function StatGrid({ children, className }: { children: ReactNode; className?: string }) {
  const count = Children.toArray(children).length;

  return (
    <section className={cn("grid gap-1.5 sm:gap-3", columnsByCount[count] ?? "grid-cols-4", className)}>
      {children}
    </section>
  );
}
