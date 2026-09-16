import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { usePrefersReducedMotion } from "@/lib/motion";

/**
 * Start every navigation at the top of the page.
 *
 * React Router does not do this - it swaps the route's element and leaves the
 * window where it was, so following a link from halfway down the dashboard
 * dropped you halfway down the next screen with no idea why. The browser only
 * restores a scroll position by itself on back/forward, which it still does.
 *
 * Runs on `pathname` alone, not on the hash: `#reviews` is handled by
 * `useHashTarget` on the page that owns that section, and jumping to the top
 * first is the right intermediate state while its data is still loading.
 */
export function useScrollToTopOnNavigate() {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0 });
  }, [pathname]);
}

/**
 * Brings the `#section` named in the URL into view, once the page has the
 * data that decides how tall everything above it is.
 *
 * `ready` is what makes this reliable rather than a race: scrolling on mount
 * lands correctly and then drifts as the sections above finish loading and
 * push the target down. Pass the page's own "the query has settled" flag.
 *
 * Focus moves with the scroll so somebody on a keyboard or a screen reader
 * arrives where the eye does. The target therefore needs `tabIndex={-1}`, and
 * `scroll-mt-20` to clear the sticky header.
 */
export function useHashTarget(ready: boolean) {
  const { hash } = useLocation();
  const prefersReduced = usePrefersReducedMotion();

  useEffect(() => {
    if (!hash || !ready) return;

    // After paint, so it runs after `useScrollToTopOnNavigate` rather than
    // against it: child effects fire before a parent's, and the layout owns
    // that one, so without the frame the jump to the top would land last.
    const frame = requestAnimationFrame(() => {
      const target = document.getElementById(decodeURIComponent(hash.slice(1)));
      if (!target) return;
      target.scrollIntoView({ behavior: prefersReduced ? "auto" : "smooth", block: "start" });
      target.focus({ preventScroll: true });
    });

    return () => cancelAnimationFrame(frame);
  }, [hash, ready, prefersReduced]);
}
