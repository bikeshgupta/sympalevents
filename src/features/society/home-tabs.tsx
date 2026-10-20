import { User, Users } from "lucide-react";
import { useLayoutEffect, useRef } from "react";
import { Link } from "react-router-dom";
import type { HomeView } from "@/features/society/home-view";
import { useDashboardMotion } from "@/lib/dashboard-motion";
import { cn } from "@/lib/utils";

/**
 * "My space | <society>": the switch at the top of the home, in liquid glass - a fully round frosted track
 * (`.liquid-track`) and a glossy pill in the primary colour for the chosen half (`.liquid-thumb`). When the
 * choice changes the pill slides across on a spring and stretches along its path as it goes (`.liquid-go`),
 * then settles. 56px tall, with 46px halves.
 *
 * They are links, not a `tablist`: each half is its own address (`?view=space`, or the society's), so a
 * refresh, a shared link and Back all agree, and `aria-current="page"` is the honest role for that.
 *
 * Switching is a navigation and can remount this component, so the last position is kept at module level
 * rather than in state; that is what lets the pill travel from where it was.
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
    const moved = motion && lastView !== null && lastView !== view;
    if (moved && lastView) {
      thumb.style.transition = "none";
      thumb.style.transform = at(lastView);
      void thumb.offsetWidth;
      thumb.style.transition = "";
      thumb.classList.remove("liquid-go");
      void thumb.offsetWidth;
      thumb.classList.add("liquid-go");
    }
    thumb.style.transform = at(view);
    lastView = view;
  }, [view, motion]);

  const half = (selected: boolean) =>
    cn(
      "relative z-10 flex h-[46px] min-w-0 items-center justify-center gap-2 rounded-full px-4 text-[15px] font-semibold transition-[color,transform] duration-300",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:scale-[0.97] motion-reduce:transform-none",
      selected ? "text-primary-foreground" : "text-foreground/70 [@media(hover:hover)]:hover:text-foreground",
    );

  return (
    <nav aria-label="Your events" className="liquid-track mt-4 grid grid-cols-2 p-[5px] sm:max-w-md">
      <span aria-hidden="true" className="pointer-events-none absolute inset-y-[5px] left-[5px] w-[calc(50%-5px)]">
        <span
          ref={thumbRef}
          className={cn(
            "liquid-thumb absolute inset-0",
            motion && "transition-transform duration-500 ease-[cubic-bezier(0.34,1.4,0.5,1)]",
          )}
        />
      </span>
      <Link to={spaceTo} aria-current={view === "space" ? "page" : undefined} className={half(view === "space")}>
        <User className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
        My space
      </Link>
      <Link to={societyTo} aria-current={view === "society" ? "page" : undefined} className={half(view === "society")}>
        {societyLogoUrl ? (
          <img src={societyLogoUrl} alt="" aria-hidden className="h-[18px] w-[18px] shrink-0 rounded-full object-cover" />
        ) : (
          <Users className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
        )}
        <span className="truncate">{societyLabel}</span>
      </Link>
    </nav>
  );
}
