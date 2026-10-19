import { User, Users } from "lucide-react";
import { useLayoutEffect, useRef } from "react";
import { Link } from "react-router-dom";
import type { HomeView } from "@/features/society/home-view";
import { useDashboardMotion } from "@/lib/dashboard-motion";
import { cn } from "@/lib/utils";

/**
 * "My space | <society>": the switch at the top of the home. A two-option segmented control - one soft
 * track, the chosen half filled in the primary colour - 48px tall in all, so it is found at once and costs
 * little of the screen.
 *
 * They are links, not a `tablist`: each half is its own address (`?view=space`, or the society's), so a
 * refresh, a shared link and Back all agree, and `aria-current="page"` is the honest role for that.
 *
 * The fill slides from the half it was on. Switching is a navigation and can remount this component, so the
 * last position is kept at module level rather than in state.
 */

let lastView: HomeView | null = null;

export function HomeTabs({
  view,
  spaceTo,
  societyTo,
  societyLabel,
  societyLogoUrl,
}: {
  view: HomeView;
  spaceTo: string;
  societyTo: string;
  societyLabel: string;
  societyLogoUrl?: string | null;
}) {
  const motion = useDashboardMotion();
  const thumbRef = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const thumb = thumbRef.current;
    if (!thumb) return;
    const at = (which: HomeView) => (which === "space" ? "translateX(0)" : "translateX(100%)");
    if (motion && lastView && lastView !== view) {
      thumb.style.transition = "none";
      thumb.style.transform = at(lastView);
      void thumb.offsetWidth;
      thumb.style.transition = "";
    }
    thumb.style.transform = at(view);
    lastView = view;
  }, [view, motion]);

  const half = (selected: boolean) =>
    cn(
      "relative z-10 flex h-10 min-w-0 items-center justify-center gap-2 rounded-xl px-3 text-sm font-semibold transition-colors duration-300",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
      selected ? "text-primary-foreground" : "text-muted-foreground [@media(hover:hover)]:hover:text-foreground",
    );

  return (
    <nav aria-label="Your events" className="relative mt-4 grid grid-cols-2 rounded-2xl bg-muted p-1 sm:max-w-sm">
      <span
        ref={thumbRef}
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute inset-y-1 left-1 w-[calc(50%-4px)] rounded-xl bg-primary shadow-sm",
          motion && "transition-transform duration-500 ease-[cubic-bezier(0.3,1.25,0.5,1)]",
        )}
      />
      <Link to={spaceTo} aria-current={view === "space" ? "page" : undefined} className={half(view === "space")}>
        <User className="h-4 w-4 shrink-0" aria-hidden="true" />
        My space
      </Link>
      <Link to={societyTo} aria-current={view === "society" ? "page" : undefined} className={half(view === "society")}>
        {societyLogoUrl ? (
          <img src={societyLogoUrl} alt="" aria-hidden className="h-4 w-4 shrink-0 rounded object-cover" />
        ) : (
          <Users className="h-4 w-4 shrink-0" aria-hidden="true" />
        )}
        <span className="truncate">{societyLabel}</span>
      </Link>
    </nav>
  );
}
