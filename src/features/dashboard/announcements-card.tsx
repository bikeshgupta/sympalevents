import { useQueryClient } from "@tanstack/react-query";
import { Bell, Check, ChevronLeft, ChevronRight, Clock3, Gavel, LogIn, MapPin, Sparkles, TrendingUp, Users } from "lucide-react";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import auctionImage from "@/features/dashboard/auction.png";
import { AuctionRegisterDialog } from "@/features/dashboard/auction-register-dialog";
import { formatEventDate, formatEventTime } from "@/features/dashboard/dashboard-utils";
import type { AnnouncementArt } from "@/data/announcements";
import {
  auctionStatus,
  closesInLabel,
  leadTimeLabel,
  resolveAnnouncements,
  type ResolvedAnnouncement,
} from "@/lib/announcements";
import { useAuctionRegistration } from "@/lib/auction-registration";
import { signInWithGoogle, useSession } from "@/lib/auth";
import type { AppEvent } from "@/lib/event-data";
import { usePrefersReducedMotion } from "@/lib/motion";

const ROTATE_MS = 8000;

// Recharts pulls in a real amount of weight (d3 internals) and this dialog is
// opened by a minority of visitors, so it is only fetched on first open -
// not paid for by everyone who loads the public dashboard.
const AuctionDetailDialog = lazy(() =>
  import("@/features/dashboard/auction-detail-dialog").then((mod) => ({ default: mod.AuctionDetailDialog })),
);

/** Maps an announcement's `art` key to its illustration. Add an entry here
 *  alongside a new `AnnouncementArt` value to give another notice artwork. */
const ART_IMAGES: Record<AnnouncementArt, string> = {
  "laddoo-auction": auctionImage,
};

export function AnnouncementsCard({ event, now }: { event: AppEvent; now: Date }) {
  const items = useMemo(() => resolveAnnouncements(event), [event]);
  const prefersReduced = usePrefersReducedMotion();
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    setIndex(0);
  }, [event.id]);

  useEffect(() => {
    if (items.length < 2 || paused || prefersReduced) return;
    const timer = window.setInterval(() => setIndex((current) => (current + 1) % items.length), ROTATE_MS);
    return () => window.clearInterval(timer);
  }, [items.length, paused, prefersReduced]);

  if (!items.length) return null;

  const active = items[Math.min(index, items.length - 1)];
  const lead = leadTimeLabel(active, now);
  const isLive = lead === "Happening now";
  const isDone = lead === "Completed";
  const isSpotlight = active.tone === "spotlight" && !isDone;

  return (
    <Card
      className="overflow-hidden"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5 shrink-0">
              <span className="absolute inline-flex h-full w-full animate-pulse-ring rounded-full bg-primary" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-primary" />
            </span>
            <CardTitle>News &amp; Announcements</CardTitle>
          </div>
          <Bell className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
        </div>
      </CardHeader>

      <CardContent className="pb-3">
        <div
          key={active.id}
          className={`relative overflow-hidden rounded-lg border p-2.5 animate-fade-up ${
            isSpotlight
              ? "border-primary/25 bg-[linear-gradient(120deg,hsl(var(--accent))_0%,hsl(var(--secondary))_45%,hsl(var(--accent))_100%)] bg-[length:200%_200%] animate-gradient-pan"
              : "bg-muted/50"
          }`}
          role="group"
          aria-roledescription="announcement"
          aria-label={active.title}
        >
          {/* The "lucid" sweep: a soft band of light travelling across the card. */}
          {isSpotlight ? (
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 -left-1/3 w-1/3 animate-sheen bg-gradient-to-r from-transparent via-white/55 to-transparent"
            />
          ) : null}

          {/*
           * Fixed 60/40 split: details left, illustration right, at every
           * breakpoint. The image is capped small (a badge-sized accent, not a
           * hero illustration) so it never becomes the tallest thing in the
           * row - the notice should read compact even with a picture attached.
           */}
          <div className="relative grid grid-cols-[3fr_2fr] items-center gap-2 sm:gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5">
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                    isDone ? "bg-muted text-muted-foreground" : "bg-primary text-primary-foreground"
                  }`}
                >
                  <Sparkles className={`h-3 w-3 ${isDone ? "" : "animate-pulse-soft"}`} aria-hidden="true" />
                  {active.tag}
                </span>
                {isLive ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
                    <span className="h-1.5 w-1.5 animate-pulse-soft rounded-full bg-emerald-600" aria-hidden="true" />
                    Live now
                  </span>
                ) : lead ? (
                  <span className="rounded-full bg-background/80 px-2 py-0.5 text-[11px] font-medium tabular-nums text-foreground">
                    {lead}
                  </span>
                ) : null}
              </div>

              <h3 className="mt-1.5 text-sm font-semibold leading-snug sm:text-base">{active.title}</h3>
              <p className="mt-0.5 text-xs leading-snug text-muted-foreground">{active.body}</p>

              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                {active.day ? (
                  <span className="font-medium text-foreground">
                    {active.day}
                    {active.resolvedDate ? ` · ${formatEventDate(active.resolvedDate)}` : ""}
                  </span>
                ) : active.resolvedDate ? (
                  <span className="font-medium text-foreground">{formatEventDate(active.resolvedDate)}</span>
                ) : null}
                {active.time ? (
                  <span className="inline-flex items-center gap-1 tabular-nums">
                    <Clock3 className="h-3 w-3 shrink-0" aria-hidden="true" />
                    {formatEventTime(active.time)}
                  </span>
                ) : null}
                {active.location ? (
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="h-3 w-3 shrink-0" aria-hidden="true" />
                    {active.location}
                  </span>
                ) : null}
              </div>
            </div>

            {active.art ? (
              // ~2.5x the compact size (56px -> 144px mobile, 64px -> 160px desktop)
              // - there is enough width in the 40% column to show it properly,
              // especially on the phone-first majority of traffic.
              <img
                src={ART_IMAGES[active.art]}
                alt=""
                aria-hidden="true"
                className="max-h-36 w-full object-contain justify-self-end sm:max-h-40"
              />
            ) : null}
          </div>

          {active.auctionWindow ? (
            <AuctionPanel announcement={active} now={now} eventId={event.id} />
          ) : null}
        </div>

        {items.length > 1 ? (
          <div className="mt-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-1.5" role="tablist" aria-label="Announcements">
              {items.map((item, itemIndex) => (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={itemIndex === index}
                  aria-label={item.title}
                  onClick={() => setIndex(itemIndex)}
                  className={`h-1.5 rounded-full transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                    itemIndex === index ? "w-6 bg-primary" : "w-1.5 bg-border hover:bg-muted-foreground/40"
                  }`}
                />
              ))}
            </div>
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                aria-label="Previous announcement"
                onClick={() => setIndex((current) => (current - 1 + items.length) % items.length)}
              >
                <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                aria-label="Next announcement"
                onClick={() => setIndex((current) => (current + 1) % items.length)}
              >
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

/**
 * The auction panel. Bidding itself is not built yet, so the live action here
 * is registration: a signed-in resident registers interest, which is what a
 * future "place a bid" flow will check against. Everything below - the
 * table, the API route, this component - is written so wiring in real
 * bidding later means adding a bid flow on top of an already-real
 * registrant list, not building the list too.
 */
function AuctionPanel({
  announcement,
  now,
  eventId,
}: {
  announcement: ResolvedAnnouncement;
  now: Date;
  eventId?: string;
}) {
  const auctionWindow = announcement.auctionWindow;
  const { data: session } = useSession();
  const signedIn = Boolean(session?.user);
  const queryClient = useQueryClient();
  const { registration, count, isLoading, isError, register, cancel } = useAuctionRegistration({
    eventId,
    auctionId: announcement.id,
    signedIn,
  });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [signInError, setSignInError] = useState<string | null>(null);

  if (!auctionWindow) return null;

  const status = auctionStatus(announcement, now);
  const closesIn = closesInLabel(announcement, now);
  const isLive = status === "live";
  const isClosed = status === "closed";

  async function handleSignInAndRegister() {
    setSignInError(null);
    setSigningIn(true);
    try {
      await signInWithGoogle();
      await queryClient.invalidateQueries({ queryKey: ["session"] });
      setDialogOpen(true);
    } catch (item) {
      setSignInError(item instanceof Error ? item.message : "Sign-in failed");
    } finally {
      setSigningIn(false);
    }
  }

  async function handleCancelRegistration() {
    if (!window.confirm("Cancel your registration for this auction?")) return;
    await cancel.mutateAsync();
  }

  return (
    <div className="relative mt-2.5 rounded-lg border border-primary/20 bg-background/70 p-3 backdrop-blur-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-primary">
          <Gavel className="h-3.5 w-3.5" aria-hidden="true" />
          Online auction
        </span>
        {isClosed ? (
          <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
            Closed
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-bold text-emerald-800 shadow-sm ring-1 ring-emerald-300">
            <span className="relative flex h-2 w-2 shrink-0">
              <span className="absolute inline-flex h-full w-full animate-pulse-ring rounded-full bg-emerald-500" aria-hidden="true" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-600" aria-hidden="true" />
            </span>
            Registration open
          </span>
        )}
      </div>

      {/* Full Opens/Closes detail, always - nothing here truncates, on a phone
          included, since this is exactly the information a bidder needs. */}
      <div className="mt-2.5 grid grid-cols-2 gap-3 text-xs">
        <div>
          <p className="text-muted-foreground">Bidding opens</p>
          <p className="mt-0.5 font-medium tabular-nums text-foreground">{formatEventDate(auctionWindow.opensDate)}</p>
          <p className="tabular-nums text-muted-foreground">{formatEventTime(auctionWindow.opensTime)}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Bidding closes</p>
          <p className="mt-0.5 font-medium tabular-nums text-foreground">{formatEventDate(auctionWindow.closesDate)}</p>
          <p className="tabular-nums text-muted-foreground">{formatEventTime(auctionWindow.closesTime)}</p>
        </div>
      </div>

      {isLive && closesIn ? (
        <p className="mt-2 text-xs font-medium text-emerald-700">Bidding window closes in {closesIn}</p>
      ) : null}

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="mt-2.5 w-full sm:w-auto"
        onClick={() => setDetailOpen(true)}
      >
        <TrendingUp className="h-3.5 w-3.5" aria-hidden="true" />
        {isLive ? "View live bidding" : isClosed ? "View final results" : "Preview auction details"}
      </Button>

      <div className="mt-3 border-t pt-3">
        {isClosed ? (
          <p className="text-xs text-muted-foreground">Registration is closed. This auction has ended.</p>
        ) : !signedIn ? (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              Register yourself to be part of this auction. Bidding isn&apos;t open yet - sign in now and you&apos;ll
              be ready.
            </p>
            <Button className="w-full sm:w-auto" onClick={() => void handleSignInAndRegister()} disabled={signingIn}>
              <LogIn className="h-4 w-4" aria-hidden="true" />
              {signingIn ? "Opening Google..." : "Sign in to register"}
            </Button>
            {signInError ? <p className="text-xs text-destructive">{signInError}</p> : null}
          </div>
        ) : isLoading ? (
          <div className="h-16 animate-pulse rounded-md bg-muted" aria-hidden="true" />
        ) : isError ? (
          <p className="text-xs text-destructive">Couldn&apos;t load your registration status. Try refreshing.</p>
        ) : registration ? (
          <div className="space-y-1.5">
            <p className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-700">
              <Check className="h-4 w-4 shrink-0" aria-hidden="true" />
              You&apos;re registered
              {registration.flat_no ? ` · ${registration.flat_no}` : ""}
            </p>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              {count > 0 ? (
                <span className="inline-flex items-center gap-1">
                  <Users className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  {count} resident{count > 1 ? "s" : ""} registered
                </span>
              ) : null}
              <button
                type="button"
                className="font-medium text-muted-foreground underline-offset-2 hover:text-destructive hover:underline disabled:opacity-50"
                onClick={() => void handleCancelRegistration()}
                disabled={cancel.isPending}
              >
                {cancel.isPending ? "Cancelling..." : "Cancel registration"}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              Register yourself to be part of this auction. Bidding isn&apos;t open yet - you&apos;ll be notified when
              it starts.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <Button className="w-full sm:w-auto" onClick={() => setDialogOpen(true)}>
                <Gavel className="h-4 w-4" aria-hidden="true" />
                Register yourself
              </Button>
              {count > 0 ? (
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <Users className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  {count} resident{count > 1 ? "s" : ""} already registered
                </span>
              ) : null}
            </div>
          </div>
        )}
      </div>

      <AuctionRegisterDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        auctionTitle={announcement.title}
        defaultName={session?.user.name ?? ""}
        register={register}
      />
      {detailOpen ? (
        <Suspense fallback={null}>
          <AuctionDetailDialog
            open={detailOpen}
            onOpenChange={setDetailOpen}
            announcement={announcement}
            eventId={eventId}
            status={status}
            signedIn={signedIn}
            registration={registration}
          />
        </Suspense>
      ) : null}
    </div>
  );
}
