import { ArrowLeft, Check, Gavel, Gift, HelpCircle, TrendingUp, Users } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import auctionImage from "@/features/dashboard/auction.png";
import { formatEventDate, formatEventTime } from "@/features/dashboard/dashboard-utils";
import type { AuctionRegistration } from "@/lib/auction-registration";
import { useAuctionBids, type AuctionBid } from "@/lib/auction-bids";
import type { AuctionStatus, ResolvedAnnouncement } from "@/lib/announcements";
import { formatCurrency } from "@/lib/utils";

type View = "auction" | "how-it-works";

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

function AuctionView({
  announcement,
  eventId,
  status,
  signedIn,
  registration,
  onShowHowItWorks,
}: {
  announcement: ResolvedAnnouncement;
  eventId?: string;
  status: AuctionStatus | null;
  signedIn: boolean;
  registration: AuctionRegistration | null;
  onShowHowItWorks: () => void;
}) {
  const isLive = status === "live";
  const { bids, highest, minNextBid, bidderCount, isLoading, isError, placeBid } = useAuctionBids({
    eventId,
    auctionId: announcement.id,
    signedIn,
    live: isLive,
  });
  const [amount, setAmount] = useState(minNextBid);
  const [error, setError] = useState<string | null>(null);

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
      setAmount(minNextBid + 100);
    } catch (item) {
      setError(item instanceof Error ? item.message : "Unable to place bid");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-4">
        <img src={auctionImage} alt="" aria-hidden="true" className="h-20 w-20 shrink-0 object-contain" />
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">{announcement.body}</p>
          {announcement.auctionWindow ? (
            <p className="mt-1 text-xs text-muted-foreground">
              Bidding {formatEventDate(announcement.auctionWindow.opensDate)} –{" "}
              {formatEventDate(announcement.auctionWindow.closesDate)}, {formatEventTime(announcement.auctionWindow.opensTime)}{" "}
              to {formatEventTime(announcement.auctionWindow.closesTime)}
            </p>
          ) : null}
        </div>
      </div>

      {announcement.prize ? (
        <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm font-medium text-amber-900">
          <Gift className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
          {announcement.prize}
        </p>
      ) : null}

      {!signedIn ? (
        <p className="rounded-md bg-muted p-3 text-sm text-muted-foreground">Sign in to see live bidding details.</p>
      ) : isLoading ? (
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

          {isLive ? (
            registration ? (
              <form className="flex flex-wrap items-end gap-2 rounded-md border bg-muted/40 p-3" onSubmit={handleSubmit}>
                <div className="min-w-0 flex-1 space-y-1">
                  <label className="text-xs font-medium text-muted-foreground" htmlFor="bid-amount">
                    Your bid (min {formatCurrency(minNextBid)})
                  </label>
                  <input
                    id="bid-amount"
                    type="number"
                    min={minNextBid}
                    step={100}
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
            )
          ) : (
            <p className="rounded-md bg-muted p-3 text-sm text-muted-foreground">
              {status === "upcoming" ? "Bidding hasn't opened yet." : "Bidding has closed for this auction."}
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

function HowItWorksView({ prize, onBack }: { prize?: string; onBack: () => void }) {
  const steps = [
    {
      title: "Register",
      body: "Sign in and register your interest. Registration is free and just tells us you want to take part.",
    },
    {
      title: "Wait for bidding to open",
      body: "Bidding opens at the time shown on the auction. You'll see a countdown until then.",
    },
    {
      title: "Place your bid",
      body: "The first bid must be at least ₹5,000. After that, every new bid must beat the current highest by at least ₹100.",
    },
    {
      title: "Watch it live",
      body: "Every bid appears instantly in the history list and the chart, so you can see exactly where things stand.",
    },
    {
      title: "Highest bid wins",
      body: prize
        ? `When the bidding window closes, whoever holds the highest bid wins. ${prize} Proceeds go straight into the event fund.`
        : "When the bidding window closes, whoever holds the highest bid wins. Proceeds go straight into the event fund.",
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <img src={auctionImage} alt="" aria-hidden="true" className="h-20 w-20 shrink-0 object-contain" />
        <p className="text-sm text-muted-foreground">
          A quick walkthrough of how the online laddoo auction works, start to finish.
        </p>
      </div>

      <ol className="space-y-3">
        {steps.map((step, index) => (
          <li key={step.title} className="flex gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
              {index + 1}
            </span>
            <div>
              <p className="text-sm font-medium">{step.title}</p>
              <p className="text-sm text-muted-foreground">{step.body}</p>
            </div>
          </li>
        ))}
      </ol>

      <Button type="button" variant="outline" size="sm" onClick={onBack}>
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Back to auction
      </Button>
    </div>
  );
}

export function AuctionDetailDialog({
  open,
  onOpenChange,
  announcement,
  eventId,
  status,
  signedIn,
  registration,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  announcement: ResolvedAnnouncement;
  eventId?: string;
  status: AuctionStatus | null;
  signedIn: boolean;
  registration: AuctionRegistration | null;
}) {
  const [view, setView] = useState<View>("auction");

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) setView("auction");
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{view === "auction" ? announcement.title : "How the auction works"}</DialogTitle>
        </DialogHeader>
        {view === "auction" ? (
          <AuctionView
            announcement={announcement}
            eventId={eventId}
            status={status}
            signedIn={signedIn}
            registration={registration}
            onShowHowItWorks={() => setView("how-it-works")}
          />
        ) : (
          <HowItWorksView prize={announcement.prize} onBack={() => setView("auction")} />
        )}
      </DialogContent>
    </Dialog>
  );
}
