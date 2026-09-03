import { ChevronLeft, ChevronRight, Gavel } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { CardTitle } from "@/components/ui/card";
import { AuctionCard } from "@/features/auctions/auction-card";
import { publishedAuctions, useAuctions } from "@/lib/auctions";

/**
 * Published auctions, surfaced on the dashboard - the spot they used to live
 * before auctions got their own page. One at a time via big prev/next
 * arrows, not a grid - the auction card is already a bordered Card in its
 * own right, so this stays a bare heading + the card, matching how /auctions
 * itself avoids doubling that border. Committee still manages (edit, cancel,
 * publish) from /auctions; here it's view/register/bid only, and the
 * committee-only registrant list is deliberately left off (see
 * `canManage={false}` below) - that stays on /auctions, not here.
 *
 * No auto-rotation: unlike the announcements carousel, this card can hold a
 * half-typed bid amount - yanking it away on a timer would lose that.
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

  const active = visible[Math.min(index, visible.length - 1)];

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Gavel className="h-4 w-4" aria-hidden="true" />
        </span>
        <CardTitle>Auctions</CardTitle>
      </div>

      <AuctionCard key={active.id} auction={active} now={now} canManage={false} />

      {visible.length > 1 ? (
        <div className="flex items-center justify-center gap-4">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-11 w-11 shrink-0 rounded-full"
            aria-label="Previous auction"
            onClick={() => setIndex((current) => (current - 1 + visible.length) % visible.length)}
          >
            <ChevronLeft className="h-5 w-5" aria-hidden="true" />
          </Button>
          <p className="text-xs font-medium tabular-nums text-muted-foreground">
            Auction {Math.min(index, visible.length - 1) + 1} of {visible.length}
          </p>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-11 w-11 shrink-0 rounded-full"
            aria-label="Next auction"
            onClick={() => setIndex((current) => (current + 1) % visible.length)}
          >
            <ChevronRight className="h-5 w-5" aria-hidden="true" />
          </Button>
        </div>
      ) : null}
    </section>
  );
}
