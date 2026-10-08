import { Camera, QrCode, Star } from "lucide-react";
import { Link } from "react-router-dom";
import { formatEventDate } from "@/features/dashboard/dashboard-utils";
import { getEventStatus } from "@/lib/event-status";
import type { SocietyEvent } from "@/lib/society";

/**
 * Two shelves on the society's front door that exist for the person who has
 * been here before.
 *
 * **Your passes** - "I registered for the Garba, where is my pass?" is the
 * question a returning resident arrives with, and today it takes three taps.
 * It shows only the viewer's own active bookings for events that have not
 * finished (the server sends nobody else's), and goes straight to the pass.
 *
 * **Memories** - the finished events that left something behind: a photograph
 * from the album, a rating. It is what turns a list of past dates into a reason
 * to look, and what makes next year's Garba something to be part of. A cover
 * only appears where the viewer may open the album, so this never shows a
 * picture the closing page itself would not.
 *
 * Both draw nothing when they have nothing - an empty shelf is worse than none.
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
    <section className="mt-4" aria-label="Your passes">
      <h2 className="text-lg font-semibold">Your passes</h2>
      <ul className="mt-2 space-y-2">
        {rows.map(({ pass, event }) => {
          const owes = !["verified", "free"].includes(pass.paymentStatus);
          return (
            <li key={event.id}>
              <Link
                to={`/e/${event.id}/pass`}
                className="flex min-h-14 items-center gap-3 rounded-xl border bg-card p-3 hover:border-primary/30 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <QrCode className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{event.name}</span>
                  <span className="block text-xs text-muted-foreground tabular-nums">
                    {formatEventDate(event.startDate)} · {pass.people} {pass.people === 1 ? "person" : "people"}
                    {owes ? " · payment pending" : ""}
                  </span>
                </span>
                <span className="shrink-0 text-sm font-medium text-primary">Show pass</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function MemoriesShelf({ events, now }: { events: SocietyEvent[]; now: Date }) {
  const memories = events
    .filter((event) => getEventStatus(event, now) === "completed" && (event.coverPhotoUrl || event.metrics.photoCount > 0 || event.metrics.reviewCount > 0))
    .filter((event) => event.modules.includes("closing"))
    .sort((a, b) => (a.endDate < b.endDate ? 1 : -1))
    .slice(0, 6);
  if (!memories.length) return null;

  return (
    <section className="mt-8" aria-label="Memories">
      <h2 className="text-lg font-semibold">Memories</h2>
      <p className="text-sm text-muted-foreground">Photographs and reviews from events that have happened.</p>
      <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {memories.map((event) => (
          <li key={event.id}>
            <Link to={`/e/${event.id}/closing`} className="group block overflow-hidden rounded-xl border bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <span className="relative block aspect-[4/3] bg-muted">
                {event.coverPhotoUrl ? (
                  <img src={event.coverPhotoUrl} alt="" loading="lazy" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" />
                ) : (
                  <span className="flex h-full items-center justify-center text-muted-foreground">
                    <Camera className="h-6 w-6" aria-hidden="true" />
                  </span>
                )}
              </span>
              <span className="block p-2.5">
                <span className="line-clamp-2 block text-sm font-semibold leading-snug">{event.name}</span>
                <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground tabular-nums">
                  <span>{formatEventDate(event.startDate)}</span>
                  {event.metrics.photoCount ? <span>{event.metrics.photoCount} photos</span> : null}
                  {event.metrics.averageRating ? (
                    <span className="inline-flex items-center gap-0.5">
                      <Star className="h-3 w-3 fill-current" aria-hidden="true" />
                      {event.metrics.averageRating.toFixed(1)}
                    </span>
                  ) : null}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
