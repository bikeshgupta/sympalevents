import { Check, Gift } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Auction } from "@/lib/auctions";
import { formatCurrency } from "@/lib/utils";

/**
 * A standalone popup - not a second view inside the auction details panel.
 * Deliberately has no recharts/bid-data dependency, so importing it never
 * pulls in the chart bundle that AuctionDetailsPanel is lazy-loaded to avoid.
 */
export function AuctionHowItWorksDialog({
  open,
  onOpenChange,
  auction,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  auction: Auction;
}) {
  const steps = [
    {
      title: "Register",
      body: "Sign in and register your interest. Registration is free and just tells the committee you want to take part.",
    },
    {
      title: "Wait for bidding to open",
      body: "Bidding opens at the time shown on the auction. You'll see a countdown until then.",
    },
    {
      title: "Place your bid",
      body: `The first bid must be at least ${formatCurrency(auction.starting_bid)}. After that, every new bid must beat the current highest by at least ${formatCurrency(auction.min_increment)}.`,
    },
    {
      title: "Watch it live",
      body: "Every bid appears instantly in the history list and the chart, so you can see exactly where things stand.",
    },
    {
      title: "Highest bid wins",
      body: auction.prize
        ? `When the bidding window closes, whoever holds the highest bid wins. ${auction.prize}`
        : "When the bidding window closes, whoever holds the highest bid wins.",
    },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>How {auction.title} works</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {auction.prize ? (
            <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm font-medium text-amber-900">
              <Gift className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
              {auction.prize}
            </p>
          ) : null}

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

          <div className="flex justify-end">
            <Button type="button" onClick={() => onOpenChange(false)}>
              <Check className="h-4 w-4" aria-hidden="true" />
              Got it
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
