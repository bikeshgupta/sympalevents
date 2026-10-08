import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

/**
 * What an event looks like while it is on its way: the outline of the page with a light
 * sweep, so nothing jumps when the real content lands.
 *
 * It replaces the Ganesh Chaturthi sample that used to stand in for every event until the
 * real one arrived (`useEventData` started from the demo dataset). It shows no event detail,
 * so there is nothing in it that can be wrong about somebody's event. A full-screen spinner
 * ahead of it was tried and rejected: it read as the app loading twice.
 *
 * The very first one in a session is **unveiled from the top down** with a soft fade edge
 * (`.unveil`, globals.css). Later ones, and the ones that follow it while access is checked,
 * appear whole - re-running the reveal on each would look like several separate loads.
 *
 * Stops moving for people who ask for reduced motion.
 */

let hasUnveiled = false;

export function PageSkeleton() {
  // Decided once, on mount: the module flag flips as soon as the first one is on screen.
  const [unveil] = useState(() => !hasUnveiled);
  useEffect(() => {
    hasUnveiled = true;
  }, []);

  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Loading"
      className={`mx-auto max-w-5xl space-y-4${unveil ? " unveil" : ""}`}
    >
      <div className="skeleton-sheen h-[300px] rounded-xl bg-muted sm:h-[380px]" />
      <div className="relative z-10 -mt-16 grid grid-cols-4 gap-2 px-3 sm:px-6">
        {[0, 1, 2, 3].map((key) => (
          <div key={key} className="skeleton-sheen h-12 rounded-lg bg-muted-foreground/20" />
        ))}
      </div>
      <div className="skeleton-sheen h-12 rounded-xl bg-muted" />
      <div className="space-y-2.5">
        <div className="skeleton-sheen h-3.5 w-3/4 rounded-full bg-muted" />
        <div className="skeleton-sheen h-3.5 w-1/2 rounded-full bg-muted" />
      </div>
      <div className="skeleton-sheen h-24 rounded-xl bg-muted" />
      <div className="skeleton-sheen h-24 rounded-xl bg-muted" />
    </div>
  );
}

/**
 * The whole screen while an event's first read is in flight: a placeholder for the header
 * (which would otherwise name the wrong event) and the page skeleton. After 12 seconds it says
 * the wait is unusual and offers a way out.
 */
export function EventLoadingShell() {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setSlow(true), 12000);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <div className="skeleton-sheen h-16 border-b bg-card" aria-hidden="true" />
      <main className="px-4 pt-5 lg:px-6">
        <PageSkeleton />
        {slow ? (
          <div role="alert" className="mx-auto mt-6 flex max-w-5xl flex-wrap items-center gap-3 text-sm text-muted-foreground">
            This is taking longer than usual.
            <Button type="button" variant="outline" className="h-10" onClick={() => window.location.reload()}>
              Try again
            </Button>
          </div>
        ) : null}
      </main>
    </div>
  );
}
