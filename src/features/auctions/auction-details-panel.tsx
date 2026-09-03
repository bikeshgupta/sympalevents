import { useQueryClient } from "@tanstack/react-query";
import { Check, Gavel, Gift, HelpCircle, LogIn, ShieldCheck, TrendingUp, Users } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { useAuctionBids, type AuctionBid } from "@/lib/auction-bids";
import { useAuctionRegistration } from "@/lib/auction-registration";
import type { Auction, AuctionStatus } from "@/lib/auctions";
import { signInWithGoogle, useSession } from "@/lib/auth";
import { formatCurrency } from "@/lib/utils";

function formatDateTime(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Kolkata",
  }).format(parsed);
}

function formatBidTime(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Kolkata",
  }).format(parsed);
}

/** Tooltip content for the bid chart. Values lead, the bidder's name follows. */
function BidTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: AuctionBid & { index: number } }> }) {
  if (!active || !payload?.length) return null;
  const bid = payload[0].payload;

  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md">
      <p className="text-sm font-semibold tabular-nums">{formatCurrency(bid.amount)}</p>
      <p className="mt-0.5 text-muted-foreground">
        {bid.display_name}
        {bid.flat_no ? ` · ${bid.flat_no}` : ""}
      </p>
      <p className="text-muted-foreground">{formatBidTime(bid.created_at)}</p>
    </div>
  );
}

function BidChart({ bids }: { bids: AuctionBid[] }) {
  if (!bids.length) {
    return (
      <div className="flex h-40 flex-col items-center justify-center rounded-md border border-dashed bg-muted/40 text-center">
        <TrendingUp className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
        <p className="mt-2 text-sm font-medium">No bids yet</p>
        <p className="text-xs text-muted-foreground">The chart fills in as bids come in.</p>
      </div>
    );
  }

  const data = bids.map((bid, index) => ({ ...bid, index: index + 1 }));

  return (
    <div className="h-40" role="img" aria-label={`Bid amount over time, currently ${formatCurrency(bids[bids.length - 1].amount)}`}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <XAxis
            dataKey="index"
            tickFormatter={(value: number) => `#${value}`}
            tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
            axisLine={{ stroke: "hsl(var(--border))" }}
            tickLine={false}
            minTickGap={24}
          />
          <YAxis
            width={56}
            tickFormatter={(value: number) => `₹${Math.round(value / 1000)}K`}
            tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip content={<BidTooltip />} cursor={{ stroke: "hsl(var(--border))", strokeWidth: 1 }} />
          <Area
            type="monotone"
            dataKey="amount"
            stroke="hsl(var(--primary))"
            strokeWidth={2}
            fill="hsl(var(--primary))"
            fillOpacity={0.1}
            dot={false}
            activeDot={{ r: 4, strokeWidth: 2, stroke: "hsl(var(--card))" }}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/**
 * The live bid chart, history, and place-bid form for one auction. Rendered
 * inline inside a collapsible section on the Auctions page, not as a dialog -
 * "How does this work?" opens a separate, lighter dialog instead of being a
 * second view bundled in here, so that dialog never pulls in recharts.
 *
 * Fully self-contained: derives sign-in and registration itself rather than
 * taking them as props, since it is lazy-loaded on its own and both are
 * cheap (react-query dedupes against whatever the parent card already
 * fetched). `canManage` is the exception - it comes from the parent
 * `AuctionCard` (which the dashboard and /auctions set differently) rather
 * than being re-derived here, so the committee-only registrant list follows
 * the same on/off switch as the card's Edit/Cancel/Publish controls: shown
 * on /auctions, never on the dashboard, even for a committee member.
 */
export function AuctionDetailsPanel({
  auction,
  status,
  canManage,
  onShowHowItWorks,
}: {
  auction: Auction;
  status: AuctionStatus;
  canManage: boolean;
  onShowHowItWorks: () => void;
}) {
  const isLive = status === "live";
  const { data: session } = useSession();
  const signedIn = Boolean(session?.user);
  const queryClient = useQueryClient();

  // Viewing is public - anyone can watch the chart and history without
  // signing in. Only placing a bid needs an identity.
  const { bids, highest, minNextBid, bidderCount, isLoading, isError, placeBid } = useAuctionBids({
    eventId: auction.event_id,
    auctionId: auction.id,
    live: isLive,
  });
  const { registration, registrants, isLoading: isRegistrationLoading } = useAuctionRegistration({
    eventId: auction.event_id,
    auctionId: auction.id,
    signedIn,
  });

  const [amount, setAmount] = useState(minNextBid);
  const [error, setError] = useState<string | null>(null);
  const [signingIn, setSigningIn] = useState(false);
  const [signInError, setSignInError] = useState<string | null>(null);

  // Keeps the field at least at the true minimum once it is known, and bumps
  // it up again if someone else's bid raises the floor while this is open -
  // without fighting a higher amount the person deliberately typed in.
  useEffect(() => {
    setAmount((current) => (current < minNextBid ? minNextBid : current));
  }, [minNextBid]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    try {
      await placeBid.mutateAsync(amount);
      setAmount(minNextBid + auction.min_increment);
    } catch (item) {
      setError(item instanceof Error ? item.message : "Unable to place bid");
    }
  }

  async function handleSignIn() {
    setSignInError(null);
    setSigningIn(true);
    try {
      await signInWithGoogle();
      await queryClient.invalidateQueries({ queryKey: ["session"] });
    } catch (item) {
      setSignInError(item instanceof Error ? item.message : "Sign-in failed");
    } finally {
      setSigningIn(false);
    }
  }

  return (
    <div className="space-y-4">
      {auction.description ? <p className="text-sm text-muted-foreground">{auction.description}</p> : null}
      <p className="text-xs text-muted-foreground">
        Bidding {formatDateTime(auction.opens_at)} to {formatDateTime(auction.closes_at)}
      </p>

      {auction.prize ? (
        <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm font-medium text-amber-900">
          <Gift className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
          {auction.prize}
        </p>
      ) : null}

      {canManage ? (
        <div className="flex items-start gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2.5">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">
              {isRegistrationLoading ? "Checking registrations…" : `${registrants?.length ?? 0} residents registered`}
            </p>
            <p className="text-xs text-muted-foreground">Visible to committee only.</p>
            {registrants?.length ? (
              <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto">
                {registrants.map((entry) => (
                  <li key={entry.id} className="flex items-center justify-between gap-3 text-xs">
                    <span className="truncate">
                      {entry.display_name}
                      {entry.flat_no ? ` · ${entry.flat_no}` : ""}
                    </span>
                    <span className="shrink-0 tabular-nums text-muted-foreground">{entry.phone}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>
      ) : null}

      {isLoading ? (
        <div className="h-40 animate-pulse rounded-md bg-muted" aria-hidden="true" />
      ) : isError ? (
        <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          Couldn&apos;t load bid history. Try again shortly.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div className="rounded-md border bg-background p-3">
              <p className="text-xs text-muted-foreground">Current bid</p>
              <p className="mt-1 text-xl font-semibold tabular-nums">{highest ? formatCurrency(highest) : "—"}</p>
            </div>
            <div className="rounded-md border bg-background p-3">
              <p className="text-xs text-muted-foreground">Minimum next bid</p>
              <p className="mt-1 text-xl font-semibold tabular-nums">{formatCurrency(minNextBid)}</p>
            </div>
            <div className="col-span-2 flex items-center gap-2 rounded-md border bg-background p-3 sm:col-span-1">
              <Users className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
              <div>
                <p className="text-xs text-muted-foreground">Bidders</p>
                <p className="text-xl font-semibold tabular-nums">{bidderCount}</p>
              </div>
            </div>
          </div>

          <BidChart bids={bids} />

          {!isLive ? (
            <p className="rounded-md bg-muted p-3 text-sm text-muted-foreground">
              {status === "upcoming" ? "Bidding hasn't opened yet." : "Bidding has closed for this auction."}
            </p>
          ) : !signedIn ? (
            <div className="space-y-2 rounded-md border bg-muted/40 p-3">
              <p className="text-sm text-muted-foreground">Sign in to place a bid.</p>
              <Button size="sm" onClick={() => void handleSignIn()} disabled={signingIn}>
                <LogIn className="h-4 w-4" aria-hidden="true" />
                {signingIn ? "Opening Google..." : "Sign in to bid"}
              </Button>
              {signInError ? <p className="text-xs text-destructive">{signInError}</p> : null}
            </div>
          ) : registration ? (
            <form className="flex flex-wrap items-end gap-2 rounded-md border bg-muted/40 p-3" onSubmit={handleSubmit}>
              <div className="min-w-0 flex-1 space-y-1">
                <label className="text-xs font-medium text-muted-foreground" htmlFor={`bid-amount-${auction.id}`}>
                  Your bid (min {formatCurrency(minNextBid)})
                </label>
                <input
                  id={`bid-amount-${auction.id}`}
                  type="number"
                  min={minNextBid}
                  step={auction.min_increment}
                  value={amount}
                  onChange={(event) => setAmount(Number(event.target.value))}
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>
              <Button type="submit" disabled={placeBid.isPending}>
                <Gavel className="h-4 w-4" aria-hidden="true" />
                {placeBid.isPending ? "Placing bid..." : "Place bid"}
              </Button>
            </form>
          ) : (
            <p className="rounded-md bg-muted p-3 text-sm text-muted-foreground">
              Register for this auction to place a bid.
            </p>
          )}
          {error ? <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</p> : null}

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Bid history ({bids.length})
            </p>
            {bids.length ? (
              <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto">
                {[...bids].reverse().map((bid, index) => (
                  <li
                    key={bid.id}
                    className={`flex items-center justify-between gap-3 rounded-md px-2 py-1.5 text-sm ${
                      index === 0 ? "bg-primary/10 font-medium" : ""
                    }`}
                  >
                    <span className="flex items-center gap-1.5 truncate">
                      {index === 0 ? <Check className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" /> : null}
                      <span className="truncate">
                        {bid.display_name}
                        {bid.flat_no ? ` · ${bid.flat_no}` : ""}
                      </span>
                    </span>
                    <span className="shrink-0 tabular-nums">{formatCurrency(bid.amount)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">No bids yet. Be the first once bidding opens.</p>
            )}
          </div>
        </>
      )}

      <Button type="button" variant="ghost" size="sm" onClick={onShowHowItWorks}>
        <HelpCircle className="h-4 w-4" aria-hidden="true" />
        How does this work?
      </Button>
    </div>
  );
}
