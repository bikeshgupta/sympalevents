import { LucideIcon } from "lucide-react";
import { AnimatedNumber } from "@/components/shared/animated-number";
import { Card, CardContent } from "@/components/ui/card";

export function StatCard({
  title,
  value,
  icon: Icon,
  note,
  valueTitle,
  isLoading = false,
  countTo,
  format,
  compact = false,
}: {
  title: string;
  value: string;
  icon: LucideIcon;
  note?: string;
  valueTitle?: string;
  isLoading?: boolean;
  /** Pass with `format` to count the value up on load instead of snapping to it. */
  countTo?: number;
  format?: (value: number) => string;
  /**
   * Opt-in dense variant for a row of four tiles that must fit a phone's width
   * without wrapping: value first, label under it, and the icon and note - both
   * supplementary next to a labelled number - dropped below `sm`.
   *
   * Off by default on purpose. Four screens still use the roomy original and
   * must keep looking exactly as they do; only Contributions opts in.
   */
  compact?: boolean;
}) {
  const animate = typeof countTo === "number" && typeof format === "function";

  if (compact) {
    return (
      <Card className="transition-shadow hover:shadow-md">
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
            {title}
          </p>
          {note ? <p className="hidden truncate text-xs text-muted-foreground sm:block">{note}</p> : null}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="transition-shadow hover:shadow-md">
      <CardContent className="flex items-start justify-between gap-3 p-4">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</p>
          {isLoading ? (
            <div className="mt-2 h-7 w-24 animate-pulse rounded bg-muted" aria-hidden="true" />
          ) : animate ? (
            <AnimatedNumber
              value={countTo}
              format={format}
              className="mt-2 block truncate text-2xl font-semibold tabular-nums"
              title={valueTitle}
            />
          ) : (
            <p className="mt-2 truncate text-2xl font-semibold tabular-nums" title={valueTitle}>
              {value}
            </p>
          )}
          {note ? <p className="mt-1 text-xs text-muted-foreground">{note}</p> : null}
        </div>
        <div className="shrink-0 rounded-md bg-accent p-2 text-primary transition-transform duration-300 hover:scale-105">
          <Icon className="h-4 w-4" aria-hidden="true" />
        </div>
      </CardContent>
    </Card>
  );
}
