import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useSession } from "@/lib/auth";

export type OpportunityKind = "volunteer" | "performance";

export type SignupEntry = {
  id: string;
  name: string;
  status: "confirmed" | "pending" | "declined";
  details: { act?: string; minutes?: number | null; performers?: string };
  note: string;
  contact: string;
  createdAt: string;
};

export type Opportunity = {
  id: string;
  kind: OpportunityKind;
  title: string;
  description: string;
  slots: number | null;
  closesAt: string | null;
  closed: boolean;
  taken: number;
  left: number | null;
  full: boolean;
  mine: { id: string; status: SignupEntry["status"]; details: SignupEntry["details"]; note: string; contact: string } | null;
  /** Managers only. Everybody else gets counts, never names. */
  signups: SignupEntry[] | null;
};

export type OpportunitiesPayload = { ready: boolean; canManage: boolean; signedIn: boolean; items: Opportunity[] };

/** The yyyy-MM-ddTHH:mm a datetime-local box holds, read as IST, as an ISO instant. */
export function istInputToIso(value: string) {
  if (!value) return null;
  const parsed = new Date(`${value}:00+05:30`);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

export function isoToIstInput(iso: string | null) {
  return iso ? new Date(new Date(iso).getTime() + 19800000).toISOString().slice(0, 16) : "";
}

export function useOpportunities(eventId?: string, enabled = true) {
  const { data: session } = useSession();
  const client = useQueryClient();
  const base = `/api/events?resource=opportunities&eventId=${encodeURIComponent(eventId ?? "")}`;
  const query = useQuery({
    queryKey: ["opportunities", eventId, session?.user.appUserId ?? "guest"],
    enabled: Boolean(eventId) && enabled,
    queryFn: () => apiFetch<OpportunitiesPayload>(base, { requireAuth: false }),
  });
  const act = useMutation({
    mutationFn: (body: Record<string, unknown>) => apiFetch<{ status?: string; id?: string }>(base, { method: "POST", body }),
    onSettled: () => client.invalidateQueries({ queryKey: ["opportunities", eventId] }),
  });
  return { query, act };
}

/** How many things are still asking for people - what the checklist and the home card count. */
export function openCount(items: Opportunity[] | undefined) {
  return (items ?? []).filter((item) => !item.closed && !item.full && !item.mine).length;
}
