import { useLayoutEffect, useRef, type ReactNode } from "react";
import { Outlet, useLocation, useNavigationType } from "react-router-dom";
import { routeSegmentFromPath } from "@/lib/page-access";

/**
 * Every move to another page slides the new one in: from the right going forward, from the left going back (the
 * browser's Back), like turning a page - the same direction the Settings sheets, Team's person pages and the wizard
 * use. A change of `?section=` or `#anchor` is not a new page and does not turn; neither does a redirect (REPLACE),
 * which is the same page arriving at its proper address.
 *
 * It is the Web Animations API on one wrapper, not a keyed remount: keying the content on the path would throw away
 * the page's state whenever its address changed shape. The animation has no fill, so once it ends the wrapper carries
 * no transform at all. That matters because a transformed element is the containing block for its `position: fixed`
 * descendants: while a page slides, anything fixed inside it would be placed against the page instead of the
 * screen. The one such thing is Settings' phone sheet. A page arriving with one open fades in without the slide
 * (opacity does not move fixed descendants). That is decided from the address (`arrivesWithFixedOverlay`), because
 * the page usually renders its content a moment after the turn starts - asking the DOM is too early - and also from
 * the DOM (`data-fixed-overlay`) for a page that is already drawn.
 *
 * The first page of a visit does not turn, nor does a page arriving through the loading skeleton's unveil (it
 * already brings the page in, and two movements read as the page arriving twice). The last path is
 * kept at module level so the move from Society Home into an event - two different layouts, so a fresh wrapper -
 * still counts as a page turn. `prefers-reduced-motion` skips it: this is script-driven, so the stylesheet's
 * reduced-motion block does not reach it.
 */
let lastPath: string | null = null;

/** Addresses that open with a fixed sheet on screen: Settings with a section open. */
function arrivesWithFixedOverlay(pathname: string, search: string) {
  return routeSegmentFromPath(pathname) === "settings" && new URLSearchParams(search).has("section");
}

export function PageTurn({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const { pathname, search } = useLocation();
  const navigationType = useNavigationType();
  // Read inside the effect without making them dependencies: a search-only change can flip them, and that is not
  // a turn.
  const navigationTypeRef = useRef(navigationType);
  navigationTypeRef.current = navigationType;
  const searchRef = useRef(search);
  searchRef.current = search;

  useLayoutEffect(() => {
    const previous = lastPath;
    lastPath = pathname;
    if (previous === null || previous === pathname) return;
    if (navigationTypeRef.current === "REPLACE") return;

    const element = ref.current;
    if (!element || typeof element.animate !== "function") return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    // Arriving through the loading skeleton (into an event from Society Home), the unveil is already bringing the
    // page in; a second movement on top of it reads as the page arriving twice.
    if (element.closest(".unveil")) return;

    const fixedShowing =
      arrivesWithFixedOverlay(pathname, searchRef.current) ||
      Boolean(element.querySelector('[data-fixed-overlay]:not([aria-hidden="true"])'));
    const offset = navigationTypeRef.current === "POP" ? "-1.5rem" : "1.5rem";
    element.animate(
      fixedShowing
        ? [{ opacity: 0 }, { opacity: 1 }]
        : [
            { opacity: 0, transform: `translateX(${offset})` },
            { opacity: 1, transform: "translateX(0)" },
          ],
      { duration: 320, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
    );
    // Not cancelled on cleanup: a newer turn simply takes over the same property, and cancelling would also undo
    // the turn under React's development double-run of effects.
  }, [pathname]);

  return <div ref={ref}>{children}</div>;
}

/** A layout route for the pages that sit outside AppLayout (Society Home, Society Management, profile, sign-in...). */
export function PageTurnOutlet() {
  return (
    <PageTurn>
      <Outlet />
    </PageTurn>
  );
}
