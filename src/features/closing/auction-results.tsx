import { Gavel, Trophy } from "lucide-react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatEventDate } from "@/features/dashboard/dashboard-utils";
import type { AuctionResult } from "@/lib/closing";
import { formatCurrency } from "@/lib/utils";

/**
 * How the auctions went, in one line each.
 *
 * A short summary on purpose: the chart, the full bid history and the rules
 * live on /auctions and always will. This answers the only question anybody
 * asks afterwards - what did it go for, and to whom.
 *
 * Renders nothing when the event ran no auctions, which most will. An
 * auction that closed with no bids still shows: "it did not sell" is part of
 * how the celebration went, and dropping it silently would leave a committee
 * wondering where it went.
 *
 * The winner's name is already public - the bid history on /auctions needs no
 * sign-in - but their flat is not carried over here, the same as every other
 * list on this page.
 */
export function AuctionResults({ auctions }: { auctions: AuctionResult[] }) {
  if (!auctions.length) return null;

  const raised = auctions.reduce((sum, auction) => sum + (auction.winningAmount ?? 0), 0);
  const sold = auctions.filter((auction) => auction.winningAmount !== null).length;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Gavel className="h-4 w-4" aria-hidden="true" />
          </span>
          <div>
            <CardTitle>{auctions.length === 1 ? "The auction" : "The auctions"}</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              {sold
                ? `${sold} of ${auctions.length} went under the hammer for ${formatCurrency(raised)} in all.`
                : "Nobody bid before these closed."}
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-2.5">
        {auctions.map((auction) => (
          <article key={auction.id} className="rounded-lg border bg-card p-3">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <h3 className="text-sm font-semibold">{auction.title || "Auction"}</h3>
              <span className="text-xs text-muted-foreground">Closed {formatEventDate(auction.closesAt.slice(0, 10))}</span>
            </div>

            {auction.prize ? <p className="mt-0.5 text-xs text-muted-foreground">{auction.prize}</p> : null}

            {auction.winningAmount !== null ? (
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-sm font-semibold tabular-nums text-primary">
                  <Trophy className="h-3.5 w-3.5" aria-hidden="true" />
                  {formatCurrency(auction.winningAmount)}
                </span>
                {auction.winner ? <span className="text-sm font-medium">{auction.winner}</span> : null}
                <span className="text-xs text-muted-foreground">
                  {auction.bidCount} {auction.bidCount === 1 ? "bid" : "bids"} from {auction.bidderCount}{" "}
                  {auction.bidderCount === 1 ? "bidder" : "bidders"}
                </span>
              </div>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">Closed without a bid.</p>
            )}
          </article>
        ))}

        <Link to="/auctions" className="inline-block text-sm font-medium text-primary underline underline-offset-2">
          Every bid, on the Auctions page
        </Link>
      </CardContent>
    </Card>
  );
}
