import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { CalendarRange, Check, ChevronDown } from "lucide-react";
import type { ReactNode } from "react";
import { menuGlass } from "@/lib/glass";
import { platformRangeLabels, platformRangePresets } from "../../../shared/platform-range";
import { formatInstantDate, formatInstantTime, formatWindow } from "./format";
import { usePlatformRange } from "./use-platform-range";

/**
 * The top of every section: the title in the display face, one short line, and on the right the controls that
 * scope the page. Kept compact so the first figures sit above the fold on a laptop.
 */
export function PageHeader({
  title,
  summary,
  rangeAware,
  observedAt,
  actions,
}: {
  title: string;
  summary: string;
  rangeAware: boolean;
  observedAt?: string | null;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-4 border-b border-border/80 pb-5 md:flex-row md:items-end md:justify-between">
      <div className="min-w-0">
        <h1 className="font-display text-3xl leading-tight sm:text-4xl">{title}</h1>
        <p className="mt-1.5 text-sm text-muted-foreground sm:text-base">{summary}</p>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {rangeAware ? <RangePicker /> : null}
        {observedAt ? <Observed at={observedAt} /> : null}
        {actions}
      </div>
    </header>
  );
}

/** When the numbers on screen were read. Only ever a real response's timestamp. */
export function Observed({ at }: { at: string }) {
  const time = formatInstantTime(at);
  if (!time) return null;
  return (
    <span className="inline-flex items-center gap-2 text-xs text-muted-foreground" title={`${formatInstantDate(at)}, ${time} IST`}>
      <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-primary" />
      Read at {time} IST
    </span>
  );
}

/** The reporting window: four presets, IST calendar days, the exact dates always on show. */
export function RangePicker() {
  const { preset, window, setPreset } = usePlatformRange();
  return (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className="inline-flex min-h-10 items-center gap-2 rounded-xl border bg-card px-3 text-sm shadow-[0_1px_2px_hsl(var(--foreground)/0.05)] hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={`Reporting period: ${platformRangeLabels[preset]}, ${formatWindow(window)}. Change`}
        >
          <CalendarRange className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <span className="font-medium">{platformRangeLabels[preset]}</span>
          <span className="hidden text-muted-foreground sm:inline">{formatWindow(window)}</span>
          <ChevronDown className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" sideOffset={8} className={`z-50 w-64 rounded-xl border p-1.5 ${menuGlass}`}>
          <DropdownMenu.RadioGroup value={preset} onValueChange={(value) => setPreset(value as typeof preset)}>
            {platformRangePresets.map((item) => (
              <DropdownMenu.RadioItem
                key={item}
                value={item}
                className="flex min-h-10 cursor-pointer items-center gap-2 rounded-md px-2.5 text-sm outline-none data-[highlighted]:bg-muted"
              >
                <span className="flex h-4 w-4 items-center justify-center">
                  <DropdownMenu.ItemIndicator>
                    <Check className="h-4 w-4 text-primary" strokeWidth={2.5} aria-hidden="true" />
                  </DropdownMenu.ItemIndicator>
                </span>
                {platformRangeLabels[item]}
              </DropdownMenu.RadioItem>
            ))}
          </DropdownMenu.RadioGroup>
          <DropdownMenu.Separator className="my-1.5 h-px bg-border" />
          <p className="px-2.5 pb-1 text-xs text-muted-foreground">Whole days in IST, today included. Compared with the same number of days before.</p>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

/** A section heading inside a page: small capitals over a hairline, not a card. */
export function SectionHeading({ title, aside }: { title: string; aside?: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border/80 pb-2">
      <h2 className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">{title}</h2>
      {aside}
    </div>
  );
}
