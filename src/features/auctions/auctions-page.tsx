import { Gavel, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { AuctionCard } from "@/features/auctions/auction-card";
import { AuctionFormDialog } from "@/features/auctions/auction-form-dialog";
import { auctionRuntimeStatus, useAuctions, type Auction } from "@/lib/auctions";
import { useEventAccess } from "@/lib/event-access";
import { useEventContext } from "@/lib/event-context";

export function AuctionsPage() {
  const { selectedEventId } = useEventContext();
  const { auctions, isLoading, isError, create, update, cancel, setPublished } = useAuctions(selectedEventId);
  const { data: eventAccess } = useEventAccess();
  const canManage = eventAccess?.role === "admin" || eventAccess?.role === "committee";

  const [now, setNow] = useState(() => new Date());
  const [formOpen, setFormOpen] = useState(false);
  const [editingAuction, setEditingAuction] = useState<Auction | null>(null);

  // Tick every second while something is live (bidding closes-in precision
  // matters then); otherwise every 30s is plenty for status transitions.
  useEffect(() => {
    const hasLive = auctions.some((auction) => auctionRuntimeStatus(auction, now) === "live");
    const intervalMs = hasLive ? 1000 : 30000;
    const interval = window.setInterval(() => setNow(new Date()), intervalMs);
    return () => window.clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auctions.length]);

  function openCreateForm() {
    setEditingAuction(null);
    setFormOpen(true);
  }

  function openEditForm(auction: Auction) {
    setEditingAuction(auction);
    setFormOpen(true);
  }

  async function handleCancelAuction(auction: Auction) {
    if (!window.confirm(`Cancel "${auction.title}"? This hides it from the list; existing bids stay on record.`)) return;
    await cancel.mutateAsync(auction.id);
  }

  async function handleTogglePublish(auction: Auction) {
    await setPublished.mutateAsync({ auctionId: auction.id, published: !auction.is_published });
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Auctions</h2>
          <p className="text-sm text-muted-foreground">
            Committee-run online auctions. Register, watch bidding live, and see who wins.
          </p>
        </div>
        {canManage ? (
          <Button onClick={openCreateForm}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            Create Auction
          </Button>
        ) : null}
      </div>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {[0, 1].map((key) => (
            <div key={key} className="h-48 animate-pulse rounded-lg bg-muted" aria-hidden="true" />
          ))}
        </div>
      ) : isError ? (
        <div className="rounded-md bg-destructive/10 p-4 text-sm text-destructive">
          Couldn&apos;t load auctions right now. Try refreshing the page.
        </div>
      ) : auctions.length ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {auctions.map((auction) => (
            <AuctionCard
              key={auction.id}
              auction={auction}
              now={now}
              canManage={canManage}
              onEdit={() => openEditForm(auction)}
              onCancel={() => void handleCancelAuction(auction)}
              onTogglePublish={() => void handleTogglePublish(auction)}
              isTogglingPublish={setPublished.isPending && setPublished.variables?.auctionId === auction.id}
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed bg-muted/40 p-10 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Gavel className="h-6 w-6" aria-hidden="true" />
          </span>
          <div>
            <p className="font-medium">No auctions yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {canManage
                ? "Create one to start collecting registrations and bids."
                : "Check back once the committee sets one up."}
            </p>
          </div>
          {canManage ? (
            <Button className="mt-1" onClick={openCreateForm}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              Create Auction
            </Button>
          ) : null}
        </div>
      )}

      {canManage && selectedEventId ? (
        <AuctionFormDialog
          open={formOpen}
          onOpenChange={setFormOpen}
          eventId={selectedEventId}
          auction={editingAuction ?? undefined}
          create={create}
          update={update}
        />
      ) : null}
    </div>
  );
}
