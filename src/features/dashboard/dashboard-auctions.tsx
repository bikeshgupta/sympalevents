import { ChevronLeft, ChevronRight, Gavel } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AuctionCard } from "@/features/auctions/auction-card";
import { publishedAuctions, useAuctions } from "@/lib/auctions";

/**
 * Published auctions on the dashboard, in the card treatment this section has
 * always had: the pulse-dot header, and one auction at a time in the animated
 * spotlight panel. It sits where the single hardcoded auction used to, just
 * reading real rows now instead of one notice in a file.
 *
 * View/register/bid only (`canManage={false}`) - editing, cancelling,
 * publishing and the committee registrant list all stay on /auctions, so
 * there is one management surface rather than two.
 *
 * No auto-rotation, unlike the announcements carousel below it: this card can
 * hold a half-typed bid amount, and rotating it away on a timer would lose it.
 */
export function DashboardAuctions({ eventId }: { eventId?: string }) {
  const { auctions, isLoading } = useAuctions(eventId);
  const visible = publishedAuctions(auctions);
  const [index, setIndex] = useState(0);

  // 30s is plenty here - this is a summary surface, not the live bidding
  // page (that ticks per-second on its own once bidding is actually live).
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const interval = window.setInterval(() => setNow(new Date()), 30000);
    return () => window.clearInterval(interval);
  }, []);

  if (isLoading || !visible.length) return null;

  const safeIndex = Math.min(index, visible.length - 1);
  const active = visible[safeIndex];

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5 shrink-0">
              <span className="absolute inline-flex h-full w-full animate-pulse-ring rounded-full bg-primary" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-primary" />
            </span>
            <CardTitle>Auctions</CardTitle>
          </div>
          <Gavel className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
        </div>
      </CardHeader>

      <CardContent className="pb-3">
        <AuctionCard key={active.id} auction={active} now={now} canManage={false} spotlight />

        {visible.length > 1 ? (
          <div className="mt-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-1.5" role="tablist" aria-label="Auctions">
              {visible.map((auction, auctionIndex) => (
                <button
                  key={auction.id}
                  type="button"
                  role="tab"
                  aria-selected={auctionIndex === safeIndex}
                  aria-label={auction.title}
                  onClick={() => setIndex(auctionIndex)}
                  className={`h-1.5 rounded-full transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                    auctionIndex === safeIndex ? "w-6 bg-primary" : "w-1.5 bg-border hover:bg-muted-foreground/40"
                  }`}
                />
              ))}
            </div>
            <div className="flex items-center gap-1.5">
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-10 w-10 rounded-full"
                aria-label="Previous auction"
                onClick={() => setIndex((current) => (current - 1 + visible.length) % visible.length)}
              >
                <ChevronLeft className="h-5 w-5" aria-hidden="true" />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-10 w-10 rounded-full"
                aria-label="Next auction"
                onClick={() => setIndex((current) => (current + 1) % visible.length)}
              >
                <ChevronRight className="h-5 w-5" aria-hidden="true" />
              </Button>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
