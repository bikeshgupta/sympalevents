import { useRef, type KeyboardEvent } from "react";
import { cn } from "@/lib/utils";

/**
 * A short row of filters over one list ("Hosting 2 · Invited 3 · Joined 1 · Past 4", "Upcoming · Live · Past"):
 * words with a count, one hairline, a 2px underline under the chosen one that slides across.
 *
 * A real tablist: arrow keys, Home and End move between the tabs, and the content it controls carries
 * `role="tabpanel"` with the id `${idPrefix}-panel`. A tab with nothing in it is as selectable as any other,
 * and its panel says so - a dimmed tab reads as disabled.
 */
export function FilterTabs<K extends string>({
  tabs,
  value,
  onChange,
  label,
  idPrefix,
  motion,
}: {
  tabs: { key: K; label: string; count?: number }[];
  value: K;
  onChange: (key: K) => void;
  label: string;
  idPrefix: string;
  motion: boolean;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const index = Math.max(0, tabs.findIndex((tab) => tab.key === value));

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const last = tabs.length - 1;
    const target = { ArrowRight: index === last ? 0 : index + 1, ArrowLeft: index === 0 ? last : index - 1, Home: 0, End: last }[event.key];
    if (target === undefined) return;
    event.preventDefault();
    onChange(tabs[target].key);
    refs.current[target]?.focus();
  };

  return (
    <div role="tablist" aria-label={label} className="relative flex border-b">
      <span
        aria-hidden
        className={cn("pointer-events-none absolute -bottom-px left-0 h-0.5 px-3", motion && "transition-transform duration-500 ease-[cubic-bezier(0.3,1.3,0.5,1)]")}
        style={{ width: `${100 / tabs.length}%`, transform: `translateX(${index * 100}%)` }}
      >
        <span className="block h-full rounded-full bg-primary" />
      </span>
      {tabs.map((tab, i) => {
        const selected = i === index;
        return (
          <button
            key={tab.key}
            ref={(node) => {
              refs.current[i] = node;
            }}
            role="tab"
            type="button"
            id={`${idPrefix}-tab-${tab.key}`}
            aria-selected={selected}
            aria-controls={`${idPrefix}-panel`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(tab.key)}
            onKeyDown={onKeyDown}
            className={cn(
              "relative min-h-11 flex-1 px-1 text-[15px] font-medium transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
              selected ? "text-foreground" : "text-muted-foreground [@media(hover:hover)]:hover:text-foreground",
            )}
          >
            {tab.label}
            {tab.count ? (
              <span
                className={cn(
                  "ml-1.5 inline-flex min-w-5 items-center justify-center rounded-full px-1.5 text-xs tabular-nums",
                  selected ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
                )}
              >
                {tab.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
