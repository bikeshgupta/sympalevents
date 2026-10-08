import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useSession } from "@/lib/auth";
import type {
  Registration,
  RegistrationConfig,
} from "../../shared/registration";
export type RegistrationPayload = {
  config: RegistrationConfig;
  mine: Registration | null;
  canManage: boolean;
  signedIn: boolean;
  registrations: Registration[] | null;
  hasMore: boolean;
  summary: {
    attendees: number;
    households?: number;
    food?: number;
    checkedIn?: number;
    foodServed?: number;
    verifiedAmount?: number;
    pendingAmount?: number;
    refundAmount?: number;
  };
};
export function useRegistration(eventId?: string, page = 0, search = "") {
  const { data: session } = useSession();
  const client = useQueryClient();
  const url = `/api/events?resource=registration&eventId=${encodeURIComponent(eventId ?? "")}`;
  const query = useQuery({
    queryKey: [
      "registration",
      eventId,
      session?.user.appUserId ?? "guest",
      page,
      search,
    ],
    enabled: Boolean(eventId),
    queryFn: () =>
      apiFetch<RegistrationPayload>(
        `${url}&page=${page}&search=${encodeURIComponent(search)}`,
        { requireAuth: false },
      ),
  });
  const mutation = useMutation({
    mutationFn: ({
      method,
      body,
    }: {
      method: "POST" | "PUT" | "PATCH";
      body: unknown;
    }) => apiFetch(url, { method, body }),
    onSettled: () =>
      client.invalidateQueries({ queryKey: ["registration", eventId] }),
  });
  return { query, mutation };
}
