import { Link } from "react-router-dom";
import { EventArtwork } from "@/features/society/event-artwork";
import { callToAction, eventEyebrow } from "@/features/society/event-presentation";
import { getEventStatus, type EventStatus } from "@/lib/event-status";
import { hasModule, type SocietyEvent } from "@/lib/society";
import { cn } from "@/lib/utils";

/**
 * One card, every kind of event.
 *
 * There is deliberately no SportsEventCard or FestivalEventCard. What a card
 * says is decided by three things it is given, never by the event's name:
 * `eventType`, `getEventStatus()`, and the `modules` this viewer may open -
 * then by whether the number in question is non-zero.
 *
 * Three rules keep a list of these scannable rather than repetitive:
 *
 *  - **The eyebrow carries the date and the kind of event, not a status
 *    badge.** Inside the Upcoming tab, "Upcoming" on every card is a word
 *    repeated for no information; "SPORTS" is what somebody is scanning for.
 *    Only cancelled - which contradicts what the tab implies - still shows a
 *    badge.
 *  - **At most two pieces of metadata.** Everything available is not worth
 *    saying; a card is an invitation, and the detail is one tap away.
 *  - **The whole card is the link.** One tappable region with a textual
 *    affordance inside it, never a button nested in a link.
 */
export function EventCard({ event, to, now }: { event: SocietyEvent; to: string; now?: Date }) {
  const status = getEventStatus(event, now);
  const cancelled = status === "cancelled";

  return (
    <Link
      to={to}
      className={cn(
        "group flex gap-3 rounded-xl border bg-card p-2.5 transition-colors sm:gap-4 sm:p-3",
        "hover:border-primary/30 hover:bg-muted/40",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        cancelled && "opacity-70",
      )}
    >
      <EventArtwork
        eventType={event.eventType}
        imageUrl={event.heroImageUrl}
        focus={event.heroFocus}
        dim={status === "completed" || cancelled}
        className="h-20 w-20 shrink-0 rounded-lg sm:h-24 sm:w-24"
      />

      <div className="flex min-w-0 flex-1 flex-col justify-center py-0.5">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {eventEyebrow(event)}
        </p>

        <h3 className="mt-0.5 text-base font-semibold leading-snug sm:text-[17px]">{event.name}</h3>

        <Metadata event={event} status={status} />

        <p className="mt-1.5 text-sm font-medium text-primary">
          {callToAction(event, status)}{" "}
          <span aria-hidden className="inline-block transition-transform group-hover:translate-x-0.5">
            &rarr;
          </span>
        </p>
      </div>
    </Link>
  );
}

/**
 * One line, at most two facts, and only ones this event actually has.
 *
 * Each is gated on the module being open to this viewer *and* the number being
 * non-zero, so a card never advertises an empty gallery or claims nought
 * contributors. An event with nothing to say gets no line rather than a row of
 * dashes.
 */
function Metadata({ event, status }: { event: SocietyEvent; status: EventStatus }) {
  const { metrics } = event;
  const facts: string[] = [];

  if (status === "cancelled") {
    return (
      <p className="mt-1">
        <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
          Cancelled
        </span>
      </p>
    );
  }

  if (status === "completed") {
    // A completed event is remembered by how it went and what is left of it.
    if (hasModule(event, "closing") && metrics.averageRating !== null) {
      facts.push(`★ ${metrics.averageRating.toFixed(1)} · ${plural(metrics.reviewCount, "review")}`);
    }
    if (hasModule(event, "closing") && metrics.photoCount > 0) facts.push(plural(metrics.photoCount, "photo"));
    else if (hasModule(event, "contributions") && metrics.contributorCount > 0) {
      facts.push(plural(metrics.contributorCount, "contributor"));
    }
  } else {
    // One ahead of it is about contributors, not about money raised.
    if (hasModule(event, "teams") && metrics.teamCount > 0) facts.push(plural(metrics.teamCount, "team"));
    if (hasModule(event, "contributions") && metrics.contributorCount > 0) {
      facts.push(`${metrics.contributorCount} contributors`);
    }
    if (facts.length < 2 && hasModule(event, "sponsors") && metrics.sponsorCount > 0) {
      facts.push(plural(metrics.sponsorCount, "sponsor"));
    }
  }

  if (!facts.length) return null;

  return (
    <p className="mt-1 truncate text-sm text-muted-foreground">
      {facts.slice(0, 2).map((fact, index) => (
        <span key={fact}>
          {index > 0 ? <span aria-hidden className="px-1.5 text-muted-foreground/40">·</span> : null}
          <span className="tabular-nums">{fact}</span>
        </span>
      ))}
    </p>
  );
}

function plural(count: number, noun: string) {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}
