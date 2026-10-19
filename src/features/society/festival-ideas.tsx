import { useMemo } from "react";
import { Link } from "react-router-dom";
import { formatEventWeekday } from "@/features/dashboard/dashboard-utils";
import { upcomingFestivals } from "@/features/society/festivals";
import { getDateInEventZone } from "@/lib/event-status";
import type { SocietyEvent } from "@/lib/society";

/**
 * "Plan your next event": the next festivals on the Indian calendar, for the people who can create a
 * society's events (rules and dates in festivals.ts). A festival the society already has an event for says
 * so and links to it; the rest offer the existing New event flow.
 *
 * Only for organisers (`canManage`): a resident has no way to act on it yet - suggesting a festival to the
 * committee needs the event proposals that migration 043 prepares.
 */
export function FestivalIdeas({ events, now, eventPath }: { events: SocietyEvent[]; now: Date; eventPath: (event: SocietyEvent) => string }) {
  const today = getDateInEventZone(now);
  const ideas = useMemo(
    () => upcomingFestivals(today, events.map((event) => ({ id: event.id, name: event.name, startDate: event.startDate }))),
    [today, events],
  );
  if (!ideas.length) return null;

  return (
    <section className="mt-9" aria-labelledby="festival-ideas">
      <h2 id="festival-ideas" className="font-display text-2xl font-semibold">
        Plan your next event
      </h2>
      <p className="mt-0.5 text-[15px] text-muted-foreground">Coming up on the Indian calendar</p>
      <ul className="mt-2 divide-y">
        {ideas.map((idea) => {
          const planned = idea.planned ? events.find((event) => event.id === idea.planned?.id) : null;
          return (
            <li key={idea.name} className="flex gap-3.5 py-3.5">
              <span
                aria-hidden="true"
                className="flex h-16 w-14 shrink-0 items-center justify-center rounded-lg bg-muted text-3xl"
              >
                {idea.emoji}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {formatEventWeekday(idea.date)} · in <span className="tabular-nums">{idea.days}</span> days
                </p>
                <h3 className="font-display mt-0.5 text-lg font-semibold leading-snug">{idea.name}</h3>
                {planned ? (
                  <Link
                    to={eventPath(planned)}
                    className="mt-1 inline-flex min-h-10 items-center text-sm font-medium text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    Already planned: {planned.name} &rarr;
                  </Link>
                ) : (
                  <>
                    <p className="text-sm text-muted-foreground">{idea.idea}</p>
                    <Link
                      to="/new-event"
                      className="mt-1 inline-flex min-h-10 items-center text-sm font-medium text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      Create an event for it &rarr;
                    </Link>
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
