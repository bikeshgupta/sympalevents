import { CalendarPlus, MapPin } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageSkeleton } from "@/components/shared/event-loading";
import { PersonalCover } from "@/features/personal/personal-cover";
import { useSession } from "@/lib/auth";
import { googleCalendarUrl } from "@/lib/calendar";
import { fireConfetti, useDashboardMotion } from "@/lib/dashboard-motion";
import { getDateInEventZone } from "@/lib/event-status";
import { daysToGo, invitationUrl, useInvitation, usePersonalEventMutations } from "@/lib/personal-events";
import { themeVariables } from "@/lib/themes";
import { cn } from "@/lib/utils";
import { LIMITS, type RsvpStatus } from "../../../shared/personal-events";

/**
 * An invitation, as a guest sees it: `/i/<code>`. Open to anybody with the code - no account needed to
 * read it or to reply. Signing in is offered, never required; it keeps the event in My space.
 *
 * What a guest can see is decided by the server: counts, wishes, and names only if the host chose to show
 * them. A phone number given here goes to the host alone.
 */
const choices: { value: RsvpStatus; label: string; emoji: string }[] = [
  { value: "going", label: "Going", emoji: "🎉" },
  { value: "maybe", label: "Maybe", emoji: "🤔" },
  { value: "declined", label: "Can't come", emoji: "💌" },
];

export function InvitationPage() {
  const { code } = useParams();
  const location = useLocation();
  const { data: session } = useSession();
  const { data, isLoading, error } = useInvitation(code?.toUpperCase());
  const { reply } = usePersonalEventMutations();
  const motion = useDashboardMotion();
  const sentRef = useRef<HTMLDivElement>(null);

  const [status, setStatus] = useState<RsvpStatus>("going");
  const [name, setName] = useState("");
  const [people, setPeople] = useState(1);
  const [phone, setPhone] = useState("");
  const [wish, setWish] = useState("");
  const [editing, setEditing] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [justSent, setJustSent] = useState(false);

  // Start the form from the existing reply, or from the signed-in person's name.
  useEffect(() => {
    if (!data) return;
    if (data.mine) {
      setStatus(data.mine.status);
      setName(data.mine.name);
      setPeople(Math.max(1, data.mine.people));
      setWish(data.mine.wish ?? "");
    } else if (session?.user.name && !name) {
      setName(session.user.name);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when the answer arrives
  }, [data?.mine, session?.user.name]);

  if (isLoading) return <PageSkeleton />;
  if (error || !data) {
    const status = (error as { status?: number } | null)?.status;
    return (
      <main className="mx-auto w-full max-w-xl px-4 py-10 text-center">
        <p className="font-display text-2xl font-semibold">{status === 501 ? "Not open yet" : "Invitation not found"}</p>
        <p className="mt-2 text-[15px] text-muted-foreground">
          {status === 501
            ? "Personal events are not switched on yet. Ask the host to try again soon."
            : error instanceof Error
              ? error.message
              : "Check the code with the person who sent it."}
        </p>
      </main>
    );
  }

  const { event, counts } = data;
  const cancelled = event.status === "cancelled";
  const showForm = data.repliesOpen && !data.isHost && (!data.mine || editing);
  const togo = daysToGo(event.startsOn, getDateInEventZone(new Date()));

  const send = async () => {
    setProblem(null);
    if (!name.trim()) return setProblem("Add your name so the host knows who's replying.");
    try {
      await reply.mutateAsync({ code: event.code, status, name, people, phone, wish });
      setEditing(false);
      setJustSent(true);
      if (motion && status === "going") requestAnimationFrame(() => sentRef.current && fireConfetti(sentRef.current));
    } catch (err) {
      setProblem(err instanceof Error ? err.message : "Could not send your reply. Try again.");
    }
  };

  const calendarLink = googleCalendarUrl({
    title: event.title,
    startDate: event.startsOn,
    endDate: event.startsOn,
    startTime: event.startTime,
    endTime: event.endTime,
    location: [event.venue, event.address].filter(Boolean).join(", ") || null,
    url: invitationUrl(event.code),
  });
  const place = [event.venue, event.address].filter(Boolean).join(", ");

  return (
    <main className="mx-auto w-full max-w-xl px-4 pb-16 pt-4 sm:pt-6" style={themeVariables(event.color)}>
      <PersonalCover event={event} eyebrow={`${data.host.firstName} invited you${togo && !cancelled ? ` · ${togo}` : ""}`} />

      {data.isHost ? (
        <p className="mt-4 rounded-lg bg-primary/10 p-3 text-sm">
          This is your event.{" "}
          <Link to={`/my/e/${event.id}`} className="font-semibold text-primary underline-offset-2 hover:underline">
            Open your host page
          </Link>{" "}
          to see who has replied.
        </p>
      ) : null}

      {event.description ? <p className="mt-5 whitespace-pre-line text-[15px] leading-relaxed">{event.description}</p> : null}

      {place ? (
        <a
          href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place)}`}
          target="_blank"
          rel="noreferrer"
          className="mt-4 flex items-start gap-2 rounded-lg border bg-card p-3 text-sm hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
          <span>
            <span className="block font-semibold">{event.venue ?? event.address}</span>
            {event.venue && event.address ? <span className="block text-muted-foreground">{event.address}</span> : null}
            <span className="mt-0.5 block font-medium text-primary">Get directions &rarr;</span>
          </span>
        </a>
      ) : null}

      <p className="mt-5 text-sm text-muted-foreground tabular-nums">
        <span className="font-display text-2xl font-semibold text-foreground">{counts.goingPeople}</span>{" "}
        {counts.goingPeople === 1 ? "person is" : "people are"} going{counts.maybe ? `, ${counts.maybe} might come` : ""}.
        {data.guests ? "" : " Only the host sees who."}
      </p>
      {data.guests?.length ? (
        <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Who's coming">
          {data.guests.map((guest, index) => (
            <li key={`${guest}-${index}`} className="rounded-full bg-muted px-2.5 py-1 text-sm">
              {guest}
            </li>
          ))}
        </ul>
      ) : null}

      {/* The reply */}
      <section className="mt-6" aria-labelledby="reply-heading" ref={sentRef}>
        {cancelled ? (
          <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">This event has been cancelled.</p>
        ) : !data.repliesOpen ? (
          <p className="rounded-lg bg-muted p-3 text-sm">Replies have closed for this event.</p>
        ) : data.mine && !editing ? (
          <div className="rounded-xl border bg-card p-4">
            <p id="reply-heading" className="font-display text-xl font-semibold">
              {justSent ? (data.mine.status === "going" ? "See you there!" : "Thanks for letting them know") : "Your reply"}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {choices.find((c) => c.value === data.mine?.status)?.label}
              {data.mine.status !== "declined" ? ` · ${data.mine.people} ${data.mine.people === 1 ? "person" : "people"}` : ""}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {data.mine.status !== "declined" ? (
                <Button asChild>
                  <a href={calendarLink} target="_blank" rel="noreferrer">
                    <CalendarPlus className="mr-1.5 h-4 w-4" aria-hidden="true" />
                    Add to calendar
                  </a>
                </Button>
              ) : null}
              <Button variant="outline" onClick={() => setEditing(true)}>
                Change my reply
              </Button>
            </div>
          </div>
        ) : showForm ? (
          <div className="rounded-xl border bg-card p-4">
            <h2 id="reply-heading" className="font-display text-xl font-semibold">
              Will you come?
            </h2>
            <p className="mt-0.5 text-sm text-muted-foreground">No account needed. Only {data.host.firstName} sees your details.</p>
            <div className="mt-3 grid grid-cols-3 gap-2" role="group" aria-label="Your reply">
              {choices.map((choice) => (
                <button
                  key={choice.value}
                  type="button"
                  aria-pressed={status === choice.value}
                  onClick={() => setStatus(choice.value)}
                  className={cn(
                    "flex min-h-20 flex-col items-center justify-center gap-1 rounded-xl border px-2 text-sm font-semibold transition",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    status === choice.value ? "border-primary bg-primary/10" : "bg-background [@media(hover:hover)]:hover:bg-muted/50",
                  )}
                >
                  <span aria-hidden="true" className={cn("text-2xl transition-transform", status === choice.value && motion && "scale-125")}>
                    {choice.emoji}
                  </span>
                  {choice.label}
                </button>
              ))}
            </div>
            <div className="mt-4 space-y-3">
              <div>
                <label htmlFor="rsvp-name" className="mb-1 block text-sm font-semibold">
                  Your name
                </label>
                <Input id="rsvp-name" maxLength={LIMITS.name} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
              </div>
              {event.allowPlusOnes && status !== "declined" ? (
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold" id="rsvp-people">
                    How many are coming
                  </span>
                  <div className="flex items-center gap-3" role="group" aria-labelledby="rsvp-people">
                    <Button type="button" variant="outline" size="icon" aria-label="One fewer" onClick={() => setPeople((n) => Math.max(1, n - 1))}>
                      −
                    </Button>
                    <output className="w-6 text-center text-lg font-semibold tabular-nums" aria-live="polite">
                      {people}
                    </output>
                    <Button type="button" variant="outline" size="icon" aria-label="One more" onClick={() => setPeople((n) => Math.min(LIMITS.people, n + 1))}>
                      +
                    </Button>
                  </div>
                </div>
              ) : null}
              <div>
                <label htmlFor="rsvp-phone" className="mb-1 block text-sm font-semibold">
                  Phone <span className="font-normal text-muted-foreground">Optional, only the host sees it</span>
                </label>
                <Input id="rsvp-phone" inputMode="tel" maxLength={LIMITS.phone} value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" />
              </div>
              <div>
                <label htmlFor="rsvp-wish" className="mb-1 block text-sm font-semibold">
                  A wish <span className="font-normal text-muted-foreground">Optional, other guests can read it</span>
                </label>
                <textarea
                  id="rsvp-wish"
                  rows={2}
                  maxLength={LIMITS.wish}
                  value={wish}
                  onChange={(e) => setWish(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>
            </div>
            {problem ? <p className="mt-3 rounded-md bg-destructive/10 p-3 text-sm text-destructive">{problem}</p> : null}
            <Button className="mt-4 w-full" onClick={() => void send()} disabled={reply.isPending}>
              {reply.isPending ? "Sending…" : data.mine ? "Update my reply" : "Send my reply"}
            </Button>
            {!session ? (
              <p className="mt-3 text-center text-xs text-muted-foreground">
                Signing in is optional.{" "}
                <Link to="/login" state={{ from: location.pathname }} className="font-medium text-primary underline-offset-2 hover:underline">
                  Sign in
                </Link>{" "}
                to keep this in My space and change your reply from any phone.
              </p>
            ) : null}
          </div>
        ) : null}
      </section>

      {data.wishes.length ? (
        <section className="mt-8" aria-labelledby="wishes-heading">
          <h2 id="wishes-heading" className="font-display text-xl font-semibold">
            Wishes
          </h2>
          <ul className="mt-2 grid gap-2 sm:grid-cols-2">
            {data.wishes.map((item, index) => (
              <li key={index} className="rounded-xl bg-muted/70 p-3 text-sm">
                <p>{item.wish}</p>
                <p className="mt-1 text-xs font-semibold text-muted-foreground">{item.name}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  );
}
