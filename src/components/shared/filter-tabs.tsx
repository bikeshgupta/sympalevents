import { useEffect, useRef, type KeyboardEvent } from "react";
import { cn } from "@/lib/utils";

/**
 * A short row of filters over one list ("Hosting 2 · Invited 3 · Joined 1 · Past 4", "Upcoming · Live · Past"),
 * as a liquid-glass pill: a round frosted track and a white glass bead under the chosen one that slides across
 * on a spring and stretches as it goes (`.liquid-track`, `.liquid-go` in globals.css).
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
  const beadRef = useRef<HTMLSpanElement>(null);
  const lastIndex = useRef(index);
  // The bead stretches as it travels; replayed on each move, never on the first draw.
  useEffect(() => {
    const bead = beadRef.current;
    if (!bead || !motion || lastIndex.current === index) return;
    lastIndex.current = index;
    bead.classList.remove("liquid-go");
    void bead.offsetWidth;
    bead.classList.add("liquid-go");
  }, [index, motion]);

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const last = tabs.length - 1;
    const target = { ArrowRight: index === last ? 0 : index + 1, ArrowLeft: index === 0 ? last : index - 1, Home: 0, End: last }[event.key];
    if (target === undefined) return;
    event.preventDefault();
    onChange(tabs[target].key);
    refs.current[target]?.focus();
  };

  return (
    <div role="tablist" aria-label={label} className="liquid-track flex p-1">
      <span aria-hidden="true" className="pointer-events-none absolute inset-y-1 left-1" style={{ width: `calc((100% - 8px) / ${tabs.length})` }}>
        <span
          ref={beadRef}
          className={cn(
            "absolute inset-0 rounded-full bg-white shadow-[0_6px_16px_-8px_hsl(var(--foreground)/0.45),inset_0_1px_0_hsl(0_0%_100%)] ring-1 ring-black/5",
            motion && "transition-transform duration-500 ease-[cubic-bezier(0.34,1.4,0.5,1)]",
          )}
          style={{ transform: `translateX(${index * 100}%)` }}
        />
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
              "relative z-10 min-h-10 min-w-0 flex-1 whitespace-nowrap rounded-full px-0.5 text-sm font-semibold transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
              selected ? "text-foreground" : "text-muted-foreground [@media(hover:hover)]:hover:text-foreground",
            )}
          >
            {tab.label}
            {tab.count ? (
              <span
                className={cn(
                  "ml-1 inline-flex min-w-5 items-center justify-center rounded-full px-1.5 text-xs tabular-nums transition-colors",
                  selected ? "bg-primary text-primary-foreground" : "bg-foreground/[0.06] text-muted-foreground",
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
