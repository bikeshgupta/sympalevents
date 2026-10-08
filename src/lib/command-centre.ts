import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useSession } from "@/lib/auth";

/**
 * The command centre's one read. The server (api/_lib/command-centre.ts) does
 * the counting, tenant-scoped, and decides which sections this organiser may
 * have - the page draws what comes back and nothing else.
 */

export type CommandSeverity = "high" | "medium" | "info";

export type CommandAttention = {
  key: string;
  severity: CommandSeverity;
  title: string;
  detail?: string;
  label: string;
  page: string;
};

export type CommandMetric = {
  key: string;
  label: string;
  value: string;
  note?: string;
  tone: "default" | "warn" | "good";
  page: string;
};

export type CommandReadiness = {
  key: string;
  label: string;
  status: "complete" | "missing" | "optional";
  detail?: string;
  page?: string;
};

export type CommandCentre = {
  event: {
    id: string;
    name: string;
    startDate: string;
    endDate: string;
    startTime: string | null;
    endTime: string | null;
    statusOverride: "draft" | "cancelled" | null;
  };
  metrics: CommandMetric[];
  attention: CommandAttention[];
  readiness: { items: CommandReadiness[]; percent: number };
};

export function useCommandCentre(eventId?: string) {
  const { data: session } = useSession();
  return useQuery({
    queryKey: ["command-centre", eventId, session?.user.appUserId ?? "guest"],
    enabled: Boolean(eventId),
    // What needs attention changes while somebody has the page open - a payment
    // is submitted, a task goes overdue at midnight - so it is allowed to go
    // stale quickly. It is a handful of counts, not a ledger.
    staleTime: 30_000,
    queryFn: () => apiFetch<CommandCentre>(`/api/events?resource=command&eventId=${encodeURIComponent(eventId ?? "")}`),
  });
}
