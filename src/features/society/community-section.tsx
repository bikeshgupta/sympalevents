import { Camera, ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";
import type { CommunityEntry } from "@/features/society/community-feed";
import { useRef } from "react";
import { useDashboardMotion, useScrollReveal } from "@/lib/dashboard-motion";

/**
 * "From your community" - the society's life between events, as a short list of rows.
 *
 * Draws nothing when there is nothing to say (an empty section is worse than none), and says only what
 * `buildCommunityFeed` could prove from data the page already holds. See that file for what is real today
 * and what data announcements, edits and new-photo notices would need before they can appear here.
 */
export function CommunitySection({ entries }: { entries: CommunityEntry[] }) {
  // Rows below the first screen slide in as they are reached.
  const listRef = useRef<HTMLUListElement>(null);
  useScrollReveal(listRef, useDashboardMotion() && entries.length > 0);
  if (!entries.length) return null;

  return (
    <section className="mt-8" aria-labelledby="community-heading">
      <h2 id="community-heading" className="font-display text-2xl font-semibold">
        From your community
      </h2>
      <ul ref={listRef} className="mt-1 divide-y">
        {entries.map((entry) => (
          <li key={entry.key}>
            <Link
              to={entry.to}
              className="group -mx-2 flex items-center gap-4 rounded-lg px-2 py-3 transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted text-muted-foreground">
                {entry.imageUrl ? (
                  <img src={entry.imageUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
                ) : (
                  <Camera className="h-5 w-5" aria-hidden="true" />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="font-display block truncate text-base font-semibold leading-snug">{entry.title}</span>
                {entry.facts.length ? (
                  <span className="mt-0.5 block text-sm text-muted-foreground tabular-nums">{entry.facts.join(" · ")}</span>
                ) : null}
              </span>
              <ChevronRight
                className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                aria-hidden="true"
              />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
