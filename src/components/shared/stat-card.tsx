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
}) {
  const animate = typeof countTo === "number" && typeof format === "function";

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
