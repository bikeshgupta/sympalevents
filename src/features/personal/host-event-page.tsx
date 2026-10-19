import { ArrowLeft, Copy, MessageCircle, Pencil, RefreshCw, Share2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, Navigate, useLocation, useParams, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { PageSkeleton } from "@/components/shared/event-loading";
import { PersonalCover } from "@/features/personal/personal-cover";
import { useSession } from "@/lib/auth";
import { fireConfetti, useDashboardMotion } from "@/lib/dashboard-motion";
import { getDateInEventZone } from "@/lib/event-status";
import { daysToGo, invitationUrl, useHostedEvent, usePersonalEventMutations } from "@/lib/personal-events";
import { shareLink } from "@/lib/share";
import { themeVariables } from "@/lib/themes";
import { cn } from "@/lib/utils";

/**
 * The host's page for a personal event: `/my/e/<id>`. The host only - the server answers 403 to anybody
 * else, and the guest list with its phone numbers is never sent to anyone but the host.
 *
 * Share first (that is what a new event needs), then who has replied, then the quieter controls: edit, a
 * new code (the old link stops working at once), cancel.
 */
const statusLabel = { going: "Going", maybe: "Maybe", declined: "Can't come" } as const;
const statusTone = { going: "bg-emerald-100 text-emerald-800", maybe: "bg-amber-100 text-amber-900", declined: "bg-muted text-muted-foreground" } as const;

export function HostEventPage() {
  const { id } = useParams();
  const [search, setSearch] = useSearchParams();
  const location = useLocation();
  const { data: session, isLoading: sessionLoading } = useSession();
  const { data, isLoading, error } = useHostedEvent(id);
  const { update } = usePersonalEventMutations();
  const motion = useDashboardMotion();
  const [note, setNote] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<"cancel" | "new-code" | null>(null);
  const celebrate = useRef<HTMLDivElement>(null);
  const justCreated = search.get("created") === "1";

  useEffect(() => {
    if (!justCreated || !data || !celebrate.current) return;
    if (motion) fireConfetti(celebrate.current);
    // Once is enough: a refresh should not throw confetti again.
    const next = new URLSearchParams(search);
    next.delete("created");
    setSearch(next, { replace: true });
  }, [justCreated, data, motion, search, setSearch]);

  if (sessionLoading) return <PageSkeleton />;
  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (isLoading) return <PageSkeleton />;
  if (error || !data) {
    return (
      <main className="mx-auto w-full max-w-2xl px-4 py-6">
        <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error instanceof Error ? error.message : "Could not load this event."}</p>
      </main>
    );
  }

  const { event, counts, rsvps } = data;
  const url = invitationUrl(event.code);
  const shareText = `You're invited: ${event.title}. Reply here:`;
  const cancelled = event.status === "cancelled";
  const togo = daysToGo(event.startsOn, getDateInEventZone(new Date()));

  const act = async (action: "cancel" | "reopen" | "new-code") => {
    setConfirming(null);
    try {
      await update.mutateAsync({ id: event.id, action });
      setNote(action === "new-code" ? "New code made. The old link and code no longer work." : action === "cancel" ? "Event cancelled. Guests see that it's cancelled." : "Event reopened.");
    } catch (err) {
      setNote(err instanceof Error ? err.message : "Could not do that. Try again.");
    }
  };
  const copy = async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setNote(`${what} copied.`);
    } catch {
      setNote(`Select the ${what.toLowerCase()} to copy it.`);
    }
  };

  return (
    <main className="mx-auto w-full max-w-2xl px-4 pb-16 pt-4 sm:pt-6" style={themeVariables(event.color)}>
      <Link
        to="/society?view=space"
        className="inline-flex min-h-10 items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        My space
      </Link>

      <div ref={celebrate}>
        <PersonalCover event={event} eyebrow={`You're hosting${togo && !cancelled ? ` · ${togo}` : ""}`} className="mt-2" />
      </div>

      {justCreated ? (
        <p className="mt-4 rounded-lg bg-primary/10 p-3 text-sm">
          <span className="font-semibold">Your event is ready.</span> Send the link or the code to your people. Their replies will show up here.
        </p>
      ) : null}
      {note ? (
        <p role="status" className="mt-4 rounded-lg bg-muted p-3 text-sm">
          {note}
        </p>
      ) : null}

      {/* Share */}
      <section className="mt-6" aria-labelledby="invite-heading">
        <h2 id="invite-heading" className="font-display text-xl font-semibold">
          Invite people
        </h2>
        <div className="mt-2 rounded-xl border bg-card p-4">
          <p className="text-sm text-muted-foreground">Private link</p>
          <div className="mt-1 flex items-center gap-2 rounded-lg bg-muted/60 py-1 pl-3 pr-1">
            <span className="min-w-0 flex-1 select-all truncate text-sm">{url}</span>
            <Button size="sm" variant="outline" onClick={() => void copy(url, "Link")}>
              <Copy className="mr-1.5 h-4 w-4" aria-hidden="true" />
              Copy
            </Button>
          </div>
          <p className="mt-3 text-sm text-muted-foreground">Or the invite code</p>
          <p className="font-display mt-0.5 select-all text-2xl font-semibold tracking-[0.3em] text-primary">{event.code}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              disabled={cancelled}
              onClick={async () => {
                const outcome = await shareLink({ title: event.title, text: shareText, url });
                if (outcome === "copied") setNote("Link copied.");
              }}
            >
              <Share2 className="mr-1.5 h-4 w-4" aria-hidden="true" />
              Share invitation
            </Button>
            <Button asChild variant="outline">
              <a href={`https://wa.me/?text=${encodeURIComponent(`${shareText} ${url}`)}`} target="_blank" rel="noreferrer">
                <MessageCircle className="mr-1.5 h-4 w-4" aria-hidden="true" />
                WhatsApp
              </a>
            </Button>
          </div>
        </div>
      </section>

      {/* Replies */}
      <section className="mt-8" aria-labelledby="replies-heading">
        <h2 id="replies-heading" className="font-display text-xl font-semibold">
          Who's coming
        </h2>
        <p className="mt-1 text-sm text-muted-foreground tabular-nums">
          {counts.goingPeople} {counts.goingPeople === 1 ? "person" : "people"} going · {counts.maybe} maybe · {counts.declined} can't come
        </p>
        {rsvps.length ? (
          <ul className="mt-2 divide-y rounded-xl border bg-card">
            {rsvps.map((row) => (
              <li key={row.id} className="px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{row.name}</p>
                    <p className="text-sm text-muted-foreground tabular-nums">
                      {row.status === "declined" ? "Not coming" : `${row.people} ${row.people === 1 ? "person" : "people"}`}
                      {row.phone ? <> · <span className="select-all">{row.phone}</span></> : null}
                      {row.signedIn ? "" : " · replied without an account"}
                    </p>
                  </div>
                  <span className={cn("shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold", statusTone[row.status])}>{statusLabel[row.status]}</span>
                </div>
                {row.wish ? <p className="mt-1.5 text-sm italic text-foreground/90">&ldquo;{row.wish}&rdquo;</p> : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-[15px] text-muted-foreground">No replies yet. Share the link to invite people.</p>
        )}
        <p className="mt-2 text-xs text-muted-foreground">Only you see names and phone numbers here.</p>
      </section>

      {event.description ? (
        <section className="mt-8">
          <h2 className="font-display text-xl font-semibold">Your note</h2>
          <p className="mt-1 whitespace-pre-line text-[15px]">{event.description}</p>
        </section>
      ) : null}

      {/* Quieter controls */}
      <section className="mt-8 border-t pt-5" aria-label="Manage">
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link to={`/my/e/${event.id}/edit`}>
              <Pencil className="mr-1.5 h-4 w-4" aria-hidden="true" />
              Edit event
            </Link>
          </Button>
          <Button variant="outline" onClick={() => setConfirming("new-code")} disabled={update.isPending}>
            <RefreshCw className="mr-1.5 h-4 w-4" aria-hidden="true" />
            New code
          </Button>
          {cancelled ? (
            <Button variant="outline" onClick={() => void act("reopen")} disabled={update.isPending}>
              Reopen event
            </Button>
          ) : (
            <Button variant="outline" className="text-destructive" onClick={() => setConfirming("cancel")} disabled={update.isPending}>
              Cancel event
            </Button>
          )}
        </div>
        {confirming ? (
          <div className="mt-3 rounded-lg border bg-card p-4 text-sm">
            <p className="font-semibold">{confirming === "cancel" ? "Cancel this event?" : "Make a new code?"}</p>
            <p className="mt-1 text-muted-foreground">
              {confirming === "cancel"
                ? "Guests who open the link will see it's cancelled, and nobody can reply. You can reopen it."
                : "The link and code you've already shared will stop working at once. Replies so far are kept."}
            </p>
            <div className="mt-3 flex gap-2">
              <Button variant={confirming === "cancel" ? "default" : "default"} onClick={() => void act(confirming)}>
                {confirming === "cancel" ? "Yes, cancel it" : "Make a new code"}
              </Button>
              <Button variant="outline" onClick={() => setConfirming(null)}>
                Keep it
              </Button>
            </div>
          </div>
        ) : null}
      </section>
    </main>
  );
}
