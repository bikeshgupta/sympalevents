import { useQueryClient } from "@tanstack/react-query";
import {
  Check,
  ChevronDown,
  Eye,
  EyeOff,
  Gavel,
  LogIn,
  Pencil,
  Sparkles,
  TrendingUp,
  Users,
  XCircle,
} from "lucide-react";
import { lazy, Suspense, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { AuctionHowItWorksDialog } from "@/features/auctions/auction-how-it-works-dialog";
import { AuctionRegisterDialog } from "@/features/auctions/auction-register-dialog";
import { useAuctionRegistration } from "@/lib/auction-registration";
import { auctionRuntimeStatus, closesInLabel, opensInLabel, type Auction } from "@/lib/auctions";
import { signInWithGoogle, useSession } from "@/lib/auth";

// Recharts pulls in a real amount of weight (d3 internals). This panel is the
// only thing that imports it, and it is only mounted once someone expands the
// details section (or once bidding goes live, when it auto-expands) - not
// paid for by every visitor browsing the auctions list.
const AuctionDetailsPanel = lazy(() =>
  import("@/features/auctions/auction-details-panel").then((mod) => ({ default: mod.AuctionDetailsPanel })),
);

function formatAuctionDate(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" }).format(parsed);
}

function formatAuctionTime(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("en-IN", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Kolkata",
  }).format(parsed);
}

/**
 * One auction, rendered as the notice-style panel this feature has always
 * used: tag + status pills and the copy on the left, the auction's own image
 * on the right, then the auction section itself (window, countdown,
 * collapsible bidding details, registration) under a rule.
 *
 * This is the panel *only* - no `Card` wrapper - because the two callers
 * frame it differently and neither should end up with a border inside a
 * border: `DashboardAuctions` puts it inside the dashboard's Auctions card,
 * `AuctionsPage` lays several out in a grid.
 *
 * `spotlight` turns on the animated gradient + light sweep. It is for the one
 * focal auction on the dashboard, never for a grid of them - two looping
 * things on a screen and neither reads as important.
 */
export function AuctionCard({
  auction,
  now,
  canManage,
  spotlight = false,
  onEdit,
  onCancel,
  onTogglePublish,
  isTogglingPublish,
}: {
  auction: Auction;
  now: Date;
  canManage: boolean;
  spotlight?: boolean;
  onEdit?: () => void;
  onCancel?: () => void;
  onTogglePublish?: () => void;
  isTogglingPublish?: boolean;
}) {
  const status = auctionRuntimeStatus(auction, now);
  const isLive = status === "live";
  const isClosed = status === "closed";
  const closesIn = closesInLabel(auction, now);
  const opensIn = opensInLabel(auction, now);
  const isSpotlight = spotlight && !isClosed;

  const { data: session } = useSession();
  const signedIn = Boolean(session?.user);
  const queryClient = useQueryClient();
  const { registration, count, isLoading, isError, register, cancel } = useAuctionRegistration({
    eventId: auction.event_id,
    auctionId: auction.id,
    signedIn,
  });

  const [registerOpen, setRegisterOpen] = useState(false);
  const [detailsExpanded, setDetailsExpanded] = useState(isLive);
  const [howItWorksOpen, setHowItWorksOpen] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [signInError, setSignInError] = useState<string | null>(null);

  // Once bidding goes live, the details panel (chart, current bid, place-bid
  // form) opens itself - that is the moment people actually need it visible,
  // not one more thing to click. It can still be collapsed manually afterward.
  useEffect(() => {
    if (isLive) setDetailsExpanded(true);
  }, [isLive]);

  async function handleSignInAndRegister() {
    setSignInError(null);
    setSigningIn(true);
    try {
      await signInWithGoogle();
      await queryClient.invalidateQueries({ queryKey: ["session"] });
      setRegisterOpen(true);
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
    <div
      className={`relative overflow-hidden rounded-lg border p-2.5 animate-fade-up ${
        isSpotlight
          ? "border-primary/25 bg-[linear-gradient(120deg,hsl(var(--accent))_0%,hsl(var(--secondary))_45%,hsl(var(--accent))_100%)] bg-[length:200%_200%] animate-gradient-pan"
          : "bg-muted/50"
      }`}
      role="group"
      aria-roledescription="auction"
      aria-label={auction.title}
    >
      {/* The "lucid" sweep: a soft band of light travelling across the card. */}
      {isSpotlight ? (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 -left-1/3 w-1/3 animate-sheen bg-gradient-to-r from-transparent via-white/55 to-transparent"
        />
      ) : null}

      {/* Management controls get their own row rather than an overlay - the
          image column below is the auction's own photo and shouldn't have
          buttons sitting on top of it. Never rendered on the dashboard. */}
      {canManage ? (
        <div className="relative mb-1 flex justify-end gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            aria-label={auction.is_published ? "Unpublish auction" : "Publish auction"}
            onClick={onTogglePublish}
            disabled={isTogglingPublish}
          >
            {auction.is_published ? (
              <Eye className="h-4 w-4" aria-hidden="true" />
            ) : (
              <EyeOff className="h-4 w-4 text-amber-600" aria-hidden="true" />
            )}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            aria-label="Edit auction"
            onClick={onEdit}
          >
            <Pencil className="h-4 w-4" aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            aria-label="Cancel auction"
            onClick={onCancel}
          >
            <XCircle className="h-4 w-4 text-destructive" aria-hidden="true" />
          </Button>
        </div>
      ) : null}

      {/*
       * Fixed 60/40 split: details left, the auction's image right, at every
       * breakpoint. The image is capped (a badge-sized accent, not a hero
       * illustration) so it never becomes the tallest thing in the row. With
       * no image uploaded the copy simply takes the full width - no generic
       * placeholder art, since every auction here brings its own.
       */}
      <div
        className={`relative grid items-center gap-2 sm:gap-4 ${auction.image_url ? "grid-cols-[3fr_2fr]" : "grid-cols-1"}`}
      >
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                isClosed ? "bg-muted text-muted-foreground" : "bg-primary text-primary-foreground"
              }`}
            >
              <Sparkles className={`h-3 w-3 ${isClosed ? "" : "animate-pulse-soft"}`} aria-hidden="true" />
              {auction.tag}
            </span>
            {canManage && !auction.is_published ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800 ring-1 ring-amber-300">
                <EyeOff className="h-3 w-3" aria-hidden="true" />
                Unpublished
              </span>
            ) : null}
            {isLive ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
                <span className="h-1.5 w-1.5 animate-pulse-soft rounded-full bg-emerald-600" aria-hidden="true" />
                Live now
              </span>
            ) : opensIn ? (
              <span className="rounded-full bg-background/80 px-2 py-0.5 text-[11px] font-medium tabular-nums text-foreground">
                {opensIn}
              </span>
            ) : null}
          </div>

          <h3 className="mt-1.5 text-sm font-semibold leading-snug sm:text-base">{auction.title}</h3>
          {auction.description ? (
            <p className="mt-0.5 text-xs leading-snug text-muted-foreground">{auction.description}</p>
          ) : null}
        </div>

        {auction.image_url ? (
          <img
            src={auction.image_url}
            alt=""
            aria-hidden="true"
            className="max-h-36 w-full object-contain justify-self-end sm:max-h-40"
          />
        ) : null}
      </div>

      {/* No border/side-padding on this wrapper - the panel around it already
          has its own, and stacking a second inset just narrows the auction
          content for no benefit. A top rule + vertical spacing is enough. */}
      <div className="relative mt-2.5 border-t border-primary/20 pt-2.5">
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
                <span
                  className="absolute inline-flex h-full w-full animate-pulse-ring rounded-full bg-emerald-500"
                  aria-hidden="true"
                />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-600" aria-hidden="true" />
              </span>
              {isLive ? "Bidding open" : "Registration open"}
            </span>
          )}
        </div>

        {/* Full Opens/Closes detail, always - nothing here truncates, on a
            phone included, since this is exactly what a bidder needs. */}
        <div className="mt-2.5 grid grid-cols-2 gap-3 text-xs">
          <div>
            <p className="text-muted-foreground">Bidding opens</p>
            <p className="mt-0.5 font-medium tabular-nums text-foreground">{formatAuctionDate(auction.opens_at)}</p>
            <p className="tabular-nums text-muted-foreground">{formatAuctionTime(auction.opens_at)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Bidding closes</p>
            <p className="mt-0.5 font-medium tabular-nums text-foreground">{formatAuctionDate(auction.closes_at)}</p>
            <p className="tabular-nums text-muted-foreground">{formatAuctionTime(auction.closes_at)}</p>
          </div>
        </div>

        {isLive && closesIn ? (
          <p className="mt-2 text-xs font-medium text-emerald-700">Bidding window closes in {closesIn}</p>
        ) : null}

        {/* Collapsible, not a popup - open by default once bidding is live
            (see the effect above), otherwise the visitor opts in. Full width
            at every breakpoint (no sm:w-auto) so this bar spans the same
            width as the title/image row above it. */}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-2.5 w-full justify-between"
          onClick={() => setDetailsExpanded((current) => !current)}
          aria-expanded={detailsExpanded}
          aria-controls={`auction-details-${auction.id}`}
        >
          <span className="inline-flex items-center gap-1.5">
            <TrendingUp className="h-3.5 w-3.5" aria-hidden="true" />
            {isLive ? "Live bidding details" : isClosed ? "Final results" : "Preview auction details"}
          </span>
          <ChevronDown
            className={`h-3.5 w-3.5 shrink-0 transition-transform ${detailsExpanded ? "rotate-180" : ""}`}
            aria-hidden="true"
          />
        </Button>

        {detailsExpanded ? (
          <div id={`auction-details-${auction.id}`} className="mt-3 animate-fade-up border-t pt-3">
            <Suspense fallback={<div className="h-40 animate-pulse rounded-md bg-muted" aria-hidden="true" />}>
              <AuctionDetailsPanel
                auction={auction}
                status={status}
                canManage={canManage}
                onShowHowItWorks={() => setHowItWorksOpen(true)}
              />
            </Suspense>
          </div>
        ) : null}

        <div className="mt-3 border-t pt-3">
          {isClosed ? (
            <p className="text-xs text-muted-foreground">Registration is closed. This auction has ended.</p>
          ) : !signedIn ? (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                Register yourself to be part of this auction. Sign in now and you&apos;ll be ready when bidding opens.
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
                Register yourself to be part of this auction. You&apos;ll be notified when bidding starts.
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <Button className="w-full sm:w-auto" onClick={() => setRegisterOpen(true)}>
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
      </div>

      <AuctionRegisterDialog
        open={registerOpen}
        onOpenChange={setRegisterOpen}
        auctionTitle={auction.title}
        defaultName={session?.user.name ?? ""}
        register={register}
      />
      <AuctionHowItWorksDialog open={howItWorksOpen} onOpenChange={setHowItWorksOpen} auction={auction} />
    </div>
  );
}
