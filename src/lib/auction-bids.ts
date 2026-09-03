import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

export type AuctionBid = {
  id: string;
  display_name: string;
  flat_no: string | null;
  amount: number;
  created_at: string;
};

type BidsResponse = {
  bids: AuctionBid[];
  highest: number | null;
  minNextBid: number;
  bidderCount: number;
};

/**
 * Bid history + live totals for one auction, plus the place-bid mutation.
 * The server is the only place bid amounts and the bidding window are
 * actually enforced (see api/auction-bids.ts) - this hook trusts what it
 * gets back rather than re-deriving minimums client-side.
 */
export function useAuctionBids({
  eventId,
  auctionId,
  signedIn,
  live,
}: {
  eventId?: string;
  auctionId: string;
  signedIn: boolean;
  /** Poll while true (the dialog is open and bidding is actually live). */
  live: boolean;
}) {
  const queryClient = useQueryClient();
  const queryKey = ["auction-bids", eventId, auctionId];

  const query = useQuery({
    queryKey,
    enabled: signedIn && Boolean(eventId),
    queryFn: () =>
      apiFetch<BidsResponse>(
        `/api/auction-bids?eventId=${encodeURIComponent(eventId!)}&auctionId=${encodeURIComponent(auctionId)}`,
      ),
    refetchInterval: live ? 3000 : false,
    retry: false,
  });

  const placeBid = useMutation({
    mutationFn: (amount: number) =>
      apiFetch<{ bid: AuctionBid }>("/api/auction-bids", {
        method: "POST",
        body: { eventId, auctionId, amount },
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  return {
    bids: query.data?.bids ?? [],
    highest: query.data?.highest ?? null,
    minNextBid: query.data?.minNextBid ?? 5000,
    bidderCount: query.data?.bidderCount ?? 0,
    isLoading: signedIn && Boolean(eventId) && query.isLoading,
    isError: query.isError,
    placeBid,
  };
}
