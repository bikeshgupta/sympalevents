import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import auctionImage from "@/features/dashboard/auction.png";

/**
 * A standalone popup - not a second view inside the auction details panel.
 * Deliberately has no recharts/bid-data dependency, so importing it never
 * pulls in the chart bundle that AuctionDetailsPanel is lazy-loaded to avoid.
 */
export function AuctionHowItWorksDialog({
  open,
  onOpenChange,
  prize,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prize?: string;
}) {
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>How the auction works</DialogTitle>
        </DialogHeader>
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
