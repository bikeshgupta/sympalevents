import { QrCode } from "lucide-react";
import { Link } from "react-router-dom";
import { formatEventDate } from "@/features/dashboard/dashboard-utils";
import { getEventStatus } from "@/lib/event-status";
import type { SocietyEvent } from "@/lib/society";

/**
 * A shelf on the society's front door that exists for the person who has been here before.
 * (Memories, its sibling, is now "From your community" - see community-feed.ts.)
 *
 * **Your passes** - "I registered for the Garba, where is my pass?" is the
 * question a returning resident arrives with, and today it takes three taps.
 * It shows only the viewer's own active bookings for events that have not
 * finished (the server sends nobody else's), and goes straight to the pass.
 *
 * It draws nothing when it has nothing - an empty shelf is worse than none.
 */

export function PassesShelf({
  events,
  passes,
  now,
}: {
  events: SocietyEvent[];
  passes: { eventId: string; people: number; paymentStatus: string }[];
  now: Date;
}) {
  const rows = passes
    .map((pass) => ({ pass, event: events.find((event) => event.id === pass.eventId) }))
    .filter((row): row is { pass: (typeof passes)[number]; event: SocietyEvent } => {
      if (!row.event) return false;
      const status = getEventStatus(row.event, now);
      return status === "upcoming" || status === "live";
    });
  if (!rows.length) return null;

  return (
    <section className="mt-5" aria-labelledby="passes-heading">
      <h2 id="passes-heading" className="font-display text-xl font-semibold">
        Your passes
      </h2>
      <ul className="mt-0.5 divide-y">
        {rows.map(({ pass, event }) => {
          const owes = !["verified", "free"].includes(pass.paymentStatus);
          return (
            <li key={event.id}>
              <Link
                to={`/e/${event.id}/pass`}
                className="-mx-2 flex min-h-12 items-center gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <QrCode className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-semibold">{event.name}</span>
                  <span className="block text-xs text-muted-foreground tabular-nums">
                    {formatEventDate(event.startDate)} · {pass.people} {pass.people === 1 ? "person" : "people"}
                    {owes ? " · payment pending" : ""}
                  </span>
                </span>
                <span className="shrink-0 text-sm font-medium text-primary">Show pass &rarr;</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
