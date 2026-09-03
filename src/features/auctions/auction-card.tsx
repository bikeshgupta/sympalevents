import { useQueryClient } from "@tanstack/react-query";
import { Check, ChevronDown, Eye, EyeOff, Gavel, Image as ImageIcon, LogIn, Pencil, TrendingUp, Users, XCircle } from "lucide-react";
import { lazy, Suspense, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { AuctionHowItWorksDialog } from "@/features/auctions/auction-how-it-works-dialog";
import { AuctionRegisterDialog } from "@/features/auctions/auction-register-dialog";
import { useAuctionRegistration } from "@/lib/auction-registration";
import { auctionRuntimeStatus, closesInLabel, type Auction, type AuctionStatus } from "@/lib/auctions";
import { signInWithGoogle, useSession } from "@/lib/auth";
import { formatCurrency } from "@/lib/utils";

// Recharts pulls in a real amount of weight (d3 internals). This panel is the
// only thing that imports it, and it is only mounted once someone expands the
// details section (or once bidding goes live, when it auto-expands) - not
// paid for by every visitor browsing the auctions list.
const AuctionDetailsPanel = lazy(() =>
  import("@/features/auctions/auction-details-panel").then((mod) => ({ default: mod.AuctionDetailsPanel })),
);

const STATUS_LABEL: Record<AuctionStatus, string> = {
  upcoming: "Registration open",
  live: "Bidding open",
  closed: "Closed",
};

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

export function AuctionCard({
  auction,
  now,
  canManage,
  onEdit,
  onCancel,
  onTogglePublish,
  isTogglingPublish,
}: {
  auction: Auction;
  now: Date;
  canManage: boolean;
  onEdit?: () => void;
  onCancel?: () => void;
  onTogglePublish?: () => void;
  isTogglingPublish?: boolean;
}) {
  const status = auctionRuntimeStatus(auction, now);
  const isLive = status === "live";
  const isClosed = status === "closed";
  const closesIn = closesInLabel(auction, now);

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
    <Card className="overflow-hidden">
      {/* A banner, not a thumbnail - the auction's photo (or a soft
          placeholder) is content worth seeing, the same weight a resident's
          own uploaded prize photo deserves. */}
      <div className="relative h-40 w-full bg-muted sm:h-48">
        {auction.image_url ? (
          <img src={auction.image_url} alt="" aria-hidden="true" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-primary/15 via-primary/5 to-transparent">
            <ImageIcon className="h-10 w-10 text-primary/40" aria-hidden="true" />
          </div>
        )}
      </div>

      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
              <Gavel className="h-3 w-3" aria-hidden="true" />
              {auction.tag}
            </span>
            {canManage && !auction.is_published ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800 ring-1 ring-amber-300">
                <EyeOff className="h-3 w-3" aria-hidden="true" />
                Unpublished
              </span>
            ) : null}
            {isClosed ? (
              <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
                Closed
              </span>
            ) : (
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ${
                  isLive
                    ? "bg-emerald-100 text-emerald-800 shadow-sm ring-1 ring-emerald-300"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {isLive ? (
                  <span className="relative flex h-2 w-2 shrink-0">
                    <span className="absolute inline-flex h-full w-full animate-pulse-ring rounded-full bg-emerald-500" aria-hidden="true" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-600" aria-hidden="true" />
                  </span>
                ) : null}
                {STATUS_LABEL[status]}
              </span>
            )}
          </div>

          {canManage ? (
            <div className="flex shrink-0 gap-1">
              <Button
                type="button"
                variant="ghost"
                size="icon"
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
              <Button type="button" variant="ghost" size="icon" aria-label="Edit auction" onClick={onEdit}>
                <Pencil className="h-4 w-4" aria-hidden="true" />
              </Button>
              <Button type="button" variant="ghost" size="icon" aria-label="Cancel auction" onClick={onCancel}>
                <XCircle className="h-4 w-4 text-destructive" aria-hidden="true" />
              </Button>
            </div>
          ) : null}
        </div>

        <h3 className="mt-1.5 text-base font-semibold leading-snug">{auction.title}</h3>

        {/* Full opens/closes detail up front, not tucked behind a click -
            this is exactly the information a bidder needs first. */}
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

        <p className="mt-2 text-xs text-muted-foreground">
          Starts at {formatCurrency(auction.starting_bid)} · +{formatCurrency(auction.min_increment)} per bid
        </p>

        {/*
         * One bordered container - the toggle is its header, the expanded
         * content is its body - so this reads as a single accordion
         * component rather than a floating button above a separately
         * bordered block.
         */}
        <div className="overflow-hidden rounded-lg border border-primary/20">
          <button
            type="button"
            className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs font-medium text-foreground transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
            onClick={() => setDetailsExpanded((current) => !current)}
            aria-expanded={detailsExpanded}
            aria-controls={`auction-details-${auction.id}`}
          >
            <span className="inline-flex items-center gap-1.5">
              <TrendingUp className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
              {isLive ? "Live bidding details" : isClosed ? "Final results" : "Preview auction details"}
            </span>
            <ChevronDown
              className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform ${detailsExpanded ? "rotate-180" : ""}`}
              aria-hidden="true"
            />
          </button>

          {detailsExpanded ? (
            <div id={`auction-details-${auction.id}`} className="animate-fade-up border-t border-primary/20 bg-background/60 p-3">
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
        </div>

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
    </Card>
  );
}
