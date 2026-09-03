import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

export type AuctionRegistration = {
  id: string;
  display_name: string;
  flat_no: string | null;
  phone: string;
  status: "registered" | "cancelled";
  created_at: string;
};

export type Registrant = {
  id: string;
  display_name: string;
  flat_no: string | null;
  phone: string;
  created_at: string;
};

type RegistrationResponse = {
  registration: AuctionRegistration | null;
  count: number;
  /** Full registrant list with phone numbers - the server only ever includes
   *  this for an admin/committee member of the event, null for everyone else. */
  registrants: Registrant[] | null;
};

/**
 * Registration state for one auction (an announcement's `id`) within one
 * event. Mirrors the request-access pattern: reads and writes go through
 * /api/auctions?resource=registrations, which verifies the signed-in user server-side -
 * there is no direct client table access for this data (see the migration).
 */
export function useAuctionRegistration({
  eventId,
  auctionId,
  signedIn,
}: {
  eventId?: string;
  auctionId: string;
  signedIn: boolean;
}) {
  const queryClient = useQueryClient();
  const queryKey = ["auction-registration", eventId, auctionId];

  const query = useQuery({
    queryKey,
    enabled: signedIn && Boolean(eventId),
    queryFn: () =>
      apiFetch<RegistrationResponse>(
        `/api/auctions?resource=registrations&eventId=${encodeURIComponent(eventId!)}&auctionId=${encodeURIComponent(auctionId)}`,
      ),
    retry: false,
  });

  const register = useMutation({
    mutationFn: (input: { name: string; flat: string; phone: string }) =>
      apiFetch<{ registration: AuctionRegistration }>("/api/auctions?resource=registrations", {
        method: "POST",
        body: { eventId, auctionId, ...input },
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  const cancel = useMutation({
    mutationFn: () =>
      apiFetch<{ ok: true }>("/api/auctions?resource=registrations", {
        method: "DELETE",
        body: { eventId, auctionId },
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  return {
    registration: query.data?.registration ?? null,
    count: query.data?.count ?? 0,
    /** Non-null only for an admin/committee member - see the API. */
    registrants: query.data?.registrants ?? null,
    isLoading: signedIn && Boolean(eventId) && query.isLoading,
    isError: query.isError,
    register,
    cancel,
  };
}
