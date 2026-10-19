import { User, Users } from "lucide-react";
import { useLayoutEffect, useRef, type ReactNode } from "react";
import { Link } from "react-router-dom";
import type { HomeView } from "@/features/society/home-view";
import { useDashboardMotion } from "@/lib/dashboard-motion";
import { cn } from "@/lib/utils";

/**
 * "My space" and the person's society, as two tabs under the greeting.
 *
 * Minimal on purpose: two words with an icon, the chosen one in the foreground colour, the other muted,
 * one hairline under the row and a 2px underline under the chosen tab. No pills, boxes or buttons.
 *
 * They are links, not a `tablist`: each tab is its own address (`?view=space`, or the society's), so a
 * refresh, a shared link and Back all agree, and `aria-current="page"` is the honest role for that.
 *
 * The underline slides from where it was. Switching tab is a navigation and can remount this component,
 * so the last position is kept at module level rather than in state.
 */

let lastBar: { left: number; width: number } | null = null;

export function HomeTabs({
  view,
  spaceTo,
  societyTo,
  societyLabel,
  societyLogoUrl,
  action,
}: {
  view: HomeView;
  spaceTo: string;
  societyTo: string;
  societyLabel: string;
  societyLogoUrl?: string | null;
  /** One small action at the right end of the row, from `sm` up. */
  action?: ReactNode;
}) {
  const motion = useDashboardMotion();
  const spaceRef = useRef<HTMLAnchorElement>(null);
  const societyRef = useRef<HTMLAnchorElement>(null);
  const barRef = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const bar = barRef.current;
    const tab = view === "space" ? spaceRef.current : societyRef.current;
    if (!bar || !tab) return;
    const next = { left: tab.offsetLeft, width: tab.offsetWidth };
    if (motion && lastBar && (lastBar.left !== next.left || lastBar.width !== next.width)) {
      bar.style.transition = "none";
      bar.style.transform = `translateX(${lastBar.left}px)`;
      bar.style.width = `${lastBar.width}px`;
      void bar.offsetWidth;
      bar.style.transition = "";
    }
    bar.style.transform = `translateX(${next.left}px)`;
    bar.style.width = `${next.width}px`;
    lastBar = next;
  }, [view, motion, societyLabel]);

  const tabClass = (selected: boolean) =>
    cn(
      "font-display relative inline-flex min-h-12 min-w-0 items-center justify-center gap-2 px-0.5 text-lg font-semibold transition-colors sm:justify-start sm:text-xl",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
      "flex-1 sm:flex-none",
      selected ? "text-foreground" : "text-muted-foreground [@media(hover:hover)]:hover:text-foreground",
    );

  return (
    <nav aria-label="Your events" className="relative mt-3 flex items-end gap-0 border-b sm:gap-8">
      <Link ref={spaceRef} to={spaceTo} aria-current={view === "space" ? "page" : undefined} className={tabClass(view === "space")}>
        <User className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
        My space
      </Link>
      <Link ref={societyRef} to={societyTo} aria-current={view === "society" ? "page" : undefined} className={tabClass(view === "society")}>
        {societyLogoUrl ? (
          <img src={societyLogoUrl} alt="" aria-hidden className="h-[18px] w-[18px] shrink-0 rounded object-cover" />
        ) : (
          <Users className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
        )}
        <span className="truncate">{societyLabel}</span>
      </Link>
      {action ? <div className="mb-2 ml-auto hidden sm:block">{action}</div> : null}
      <span
        ref={barRef}
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute -bottom-px left-0 h-0.5 w-0 rounded-full bg-foreground",
          motion && "transition-[transform,width] duration-500 ease-[cubic-bezier(0.3,1.3,0.5,1)]",
        )}
      />
    </nav>
  );
}
