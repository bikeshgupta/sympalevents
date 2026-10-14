import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import type { SocietyRole } from "../../shared/society-members";
import type { EventStatus } from "../../shared/event-status";

/**
 * Society Management's reads and writes - one place, so the page components
 * stay about layout.
 *
 * Every request is answered by the society-admin routes, which refuse anybody
 * who is not an admin of THIS society. Nothing here is a permission; the pages
 * only decline to ask when they already know the answer will be no.
 *
 * These queries are deliberately NOT in the persisted cache (query-persist.ts):
 * the roster carries private membership information and must never be written
 * to localStorage.
 */

const base = "/api/events?resource=societies";

export type SocietyOverview = {
  society: {
    id: string;
    name: string;
    slug: string | null;
    city: string;
    logoUrl: string | null;
    inviteCode: string | null;
  };
  members: { total: number; admins: number; committee: number; residents: number };
  events: { total: number; draft: number; upcoming: number; live: number; completed: number; cancelled: number };
  /** null until migration 043 exists: "unknown", not "none". */
  pendingProposals: number | null;
};

export type SocietyMemberRow = {
  userId: string;
  name: string;
  /** Society admins only - the profile page says so. */
  flat: string | null;
  role: SocietyRole;
  joinedAt: string | null;
  isYou: boolean;
};

export type SocietyEventAccessRow = {
  id: string;
  name: string;
  slug: string | null;
  status: EventStatus;
  startDate: string;
  endDate: string;
  admins: number;
  committee: number;
  pages: number | null;
};

export function useSocietyOverview(societyId?: string) {
  return useQuery({
    queryKey: ["society-admin", societyId, "overview"],
    enabled: Boolean(societyId),
    queryFn: () => apiFetch<SocietyOverview>(`${base}&part=overview&societyId=${societyId}`),
  });
}

export function useSocietyMembers(societyId?: string) {
  return useQuery({
    queryKey: ["society-admin", societyId, "members"],
    enabled: Boolean(societyId),
    queryFn: () => apiFetch<{ members: SocietyMemberRow[] }>(`${base}&part=members&societyId=${societyId}`),
  });
}

export function useSocietyEventAccess(societyId?: string) {
  return useQuery({
    queryKey: ["society-admin", societyId, "access"],
    enabled: Boolean(societyId),
    queryFn: () =>
      apiFetch<{ societySlug: string | null; events: SocietyEventAccessRow[] }>(
        `${base}&part=access&societyId=${societyId}`,
      ),
  });
}

export function useSocietyMemberActions(societyId?: string) {
  const queryClient = useQueryClient();
  // A role change moves the counts on the overview, the roster, and - because
  // a society admin is an admin everywhere - possibly the viewer's own access.
  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["society-admin", societyId] });
    await queryClient.invalidateQueries({ queryKey: ["my-events"] });
  };

  const changeRole = useMutation({
    mutationFn: (input: { userId: string; role: SocietyRole }) =>
      apiFetch(base + "&part=members", { method: "PATCH", body: { societyId, ...input } }),
    onSuccess: refresh,
  });

  const addByEmail = useMutation({
    mutationFn: (input: { email: string; role: SocietyRole }) =>
      apiFetch(base + "&part=members", { method: "POST", body: { societyId, ...input } }),
    onSuccess: refresh,
  });

  return { changeRole, addByEmail };
}
