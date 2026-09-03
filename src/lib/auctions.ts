import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { gapLabel } from "@/lib/announcements";

export type Auction = {
  id: string;
  event_id: string;
  title: string;
  tag: string;
  description: string;
  prize: string | null;
  image_url: string | null;
  starting_bid: number;
  min_increment: number;
  opens_at: string;
  closes_at: string;
  status: "active" | "cancelled";
  /** Controls dashboard/bell visibility, independent of cancel. Defaults to
   *  true - a newly created auction is visible unless explicitly hidden. */
  is_published: boolean;
  created_at: string;
};

export type AuctionInput = {
  title: string;
  tag?: string;
  description?: string;
  prize?: string;
  imageUrl?: string;
  startingBid: number;
  minIncrement: number;
  /** Both as ISO strings (datetime-local inputs need converting first). */
  opensAt: string;
  closesAt: string;
};

/**
 * Auctions for one event. Listing is public - the GET does not require
 * sign-in, matching /api/auction-bids - only create/update/cancel do, and
 * the server independently checks the requester is admin/committee for the
 * event, not just the client.
 */
export function useAuctions(eventId?: string) {
  const queryClient = useQueryClient();
  const queryKey = ["auctions", eventId];

  const query = useQuery({
    queryKey,
    enabled: Boolean(eventId),
    queryFn: () =>
      apiFetch<{ auctions: Auction[] }>(`/api/auctions?eventId=${encodeURIComponent(eventId!)}`, {
        requireAuth: false,
      }),
    retry: false,
  });

  const create = useMutation({
    mutationFn: (input: AuctionInput) =>
      apiFetch<{ auction: Auction }>("/api/auctions", {
        method: "POST",
        body: { eventId, ...input },
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  const update = useMutation({
    mutationFn: ({ auctionId, ...input }: Partial<AuctionInput> & { auctionId: string }) =>
      apiFetch<{ auction: Auction }>("/api/auctions", {
        method: "PATCH",
        body: { auctionId, ...input },
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  const cancel = useMutation({
    mutationFn: (auctionId: string) =>
      apiFetch<{ ok: true }>("/api/auctions", {
        method: "PATCH",
        body: { auctionId, action: "cancel" },
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  const setPublished = useMutation({
    mutationFn: ({ auctionId, published }: { auctionId: string; published: boolean }) =>
      apiFetch<{ auction: Auction }>("/api/auctions", {
        method: "PATCH",
        body: { auctionId, action: published ? "publish" : "unpublish" },
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  return {
    auctions: query.data?.auctions ?? [],
    isLoading: Boolean(eventId) && query.isLoading,
    isError: query.isError,
    create,
    update,
    cancel,
    setPublished,
  };
}

/** What the dashboard and header bell show - everything else on the
 *  Auctions page itself, published or not, so committee can still find and
 *  manage a hidden auction. */
export function publishedAuctions(auctions: Auction[]) {
  return auctions.filter((auction) => auction.is_published);
}

export type AuctionStatus = "upcoming" | "live" | "closed";

export function auctionRuntimeStatus(auction: Auction, now: Date): AuctionStatus {
  const current = now.getTime();
  if (current < new Date(auction.opens_at).getTime()) return "upcoming";
  if (current > new Date(auction.closes_at).getTime()) return "closed";
  return "live";
}

/** "closes in 2 days 4 hr" while bidding is live, null otherwise - the same
 *  urgency cue the original single-auction dashboard card had. */
export function closesInLabel(auction: Auction, now: Date) {
  const diffMs = new Date(auction.closes_at).getTime() - now.getTime();
  if (diffMs <= 0) return null;
  return gapLabel(diffMs);
}
