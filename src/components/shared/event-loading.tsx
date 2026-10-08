import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

/**
 * What an event looks like while it is on its way.
 *
 * These replace the Ganesh Chaturthi sample that used to stand in for every event until the
 * real one arrived (`useEventData` started from the demo dataset). Neither shows any event
 * detail, so there is nothing in them that can be wrong about somebody's event.
 *
 *  - `EventLoader` - full screen, for the first load of an event: the app icon's six people
 *    appear one by one around a hub, then the ring turns slowly.
 *  - `PageSkeleton` - the outline of the event page with a light sweep, for waits inside an
 *    event, so the page does not jump when the real content lands.
 *
 * Both stop moving for people who ask for reduced motion (see globals.css).
 */

const figure = (angle: number, delay: number) => (
  <g key={angle} className="loader-fig" style={{ animationDelay: `${delay}s` }}>
    <g transform={`rotate(${angle} 100 100)`}>
      <circle cx="100" cy="22" r="9" fill="url(#loader-gold)" />
      <path d="M82 52 a18 18 0 0 1 36 0 z" fill="url(#loader-gold)" />
    </g>
  </g>
);

export function EventLoader() {
  // A wait that goes on is worth saying something about, and a way out of it.
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setSlow(true), 12000);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex min-h-screen flex-col items-center justify-center gap-6 bg-primary px-6 text-center text-primary-foreground"
    >
      <svg viewBox="0 0 200 200" className="h-36 w-36 overflow-visible" aria-hidden="true">
        <defs>
          <linearGradient id="loader-gold" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#FFE4A0" />
            <stop offset="1" stopColor="#F6BE60" />
          </linearGradient>
        </defs>
        <g className="loader-ring">{[0, 60, 120, 180, 240, 300].map((angle, index) => figure(angle, index * 0.18))}</g>
        <circle className="loader-hub" cx="100" cy="100" r="11" fill="#FFE4A0" />
      </svg>
      <div>
        <p className="font-display text-xl font-medium">Getting your event ready</p>
        <p className="mt-1 text-sm text-primary-foreground/80">{slow ? "This is taking longer than usual." : "One moment"}</p>
      </div>
      {slow ? (
        <Button type="button" variant="secondary" className="h-11" onClick={() => window.location.reload()}>
          Try again
        </Button>
      ) : null}
    </div>
  );
}

export function PageSkeleton() {
  return (
    <div role="status" aria-busy="true" aria-label="Loading" className="mx-auto max-w-5xl space-y-4">
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
