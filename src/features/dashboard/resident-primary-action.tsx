import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { formatEventDate, formatEventTime } from "@/features/dashboard/dashboard-utils";
import type { AppEvent, EventPlanRow } from "@/lib/event-data";
import type { EventStatus } from "@/lib/event-status";
import { useEventPath } from "@/lib/event-path";
import { useRegistration } from "@/lib/registration";
import {
  isRegistrationOpen,
  resolveResidentAction,
  type ResidentActionPage,
} from "@/lib/resident-action";

/**
 * The one thing a resident is asked to do, directly under the event's name.
 *
 * It replaces the organiser's "Join the event" block on a resident's home: that
 * one carried Publish and Cancel for whoever had edit access and a registration
 * link for everyone else. A resident gets a single button chosen from where the
 * event is in its life and whether they already have a booking
 * (`resolveResidentAction`) - "Register now", "View my registration", "See
 * what's on", "View memories" - and nothing else competing with it.
 *
 * The supporting line is the two facts that make the button worth pressing:
 * how many people are already coming, and what is next on the programme.
 *
 * Registration is read only when this viewer may open the Registration page at
 * all, and only here, so a dashboard of an event with no registration makes no
 * request for it.
 */
export function ResidentPrimaryAction({
  event,
  status,
  now,
  openPageKeys,
  nextEvent,
}: {
  event: AppEvent;
  status: EventStatus;
  now: Date;
  /** What this viewer may open; `null` in the demo, where nothing is filtered. */
  openPageKeys: Set<string> | null;
  nextEvent?: EventPlanRow;
}) {
  const path = useEventPath();
  const canOpen = (page: ResidentActionPage) => openPageKeys === null || openPageKeys.has(page);
  const registrationVisible = Boolean(event.id) && openPageKeys !== null && openPageKeys.has("registration");
  const { query } = useRegistration(registrationVisible ? event.id : undefined);

  // The button can flip between "How to register" and "Register now" once the
  // booking rules arrive. A placeholder is better than a label that changes
  // under somebody's thumb.
  if (registrationVisible && query.isLoading) {
    return <div aria-hidden className="h-24 animate-pulse rounded-xl border bg-muted/60" />;
  }

  const registration = query.data;
  const attendees = registration?.summary.attendees ?? 0;
  const action = resolveResidentAction({
    status,
    canOpen,
    registrationOpen: registration ? isRegistrationOpen(registration.config, attendees, now) : false,
    selfService: registration?.config.self_service ?? false,
    hasBooking: registration?.mine?.status === "active",
  });
  if (!action) return null;

  const support: string[] = [];
  if (status === "cancelled") {
    support.push("Contact the organiser about any pending refund.");
  } else {
    if (attendees > 0) support.push(`${attendees} ${attendees === 1 ? "person" : "people"} registered`);
    if (nextEvent && (status === "upcoming" || status === "live")) {
      support.push(
        `Next: ${nextEvent.activity}${nextEvent.startTime ? ` · ${formatEventDate(nextEvent.date)}, ${formatEventTime(nextEvent.startTime)}` : ""}`,
      );
    }
  }

  return (
    <section aria-labelledby="resident-action-heading" className="rounded-xl border bg-card p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 id="resident-action-heading" className="text-lg font-semibold leading-snug">
            {action.headline}
          </h2>
          {support.length ? <p className="mt-0.5 text-sm text-muted-foreground">{support.join(" · ")}</p> : null}
        </div>
        {action.label && action.page ? (
          <Button asChild className="h-11 w-full shrink-0 sm:w-auto">
            <Link to={path(`/${action.page}`)}>
              {action.label}
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </Button>
        ) : null}
      </div>
    </section>
  );
}
