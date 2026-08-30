import { useQuery } from "@tanstack/react-query";
import { useLocation } from "react-router-dom";
import { apiFetch } from "@/lib/api";
import { useSession } from "@/lib/auth";
import { useEventContext } from "@/lib/event-context";

export const publicPageKeys = new Set(["dashboard", "expenses"]);

export const pageLabels: Record<string, string> = {
  dashboard: "Dashboard",
  contributions: "Contributions",
  sponsors: "Sponsors",
  budget: "Budget",
  expenses: "Expense Ledger",
  procurement: "Procurement",
  prasad: "Prasad",
  tasks: "Tasks",
  volunteers: "Volunteers",
  "event-plan": "Event Plan",
  "run-sheet": "Run Sheet",
  inventory: "Inventory",
  vendors: "Vendors",
  contacts: "Contacts",
  risks: "Safety / Risks",
  settings: "Settings",
};

export function pageKeyFromPath(pathname: string) {
  return pathname.split("/").filter(Boolean)[0] || "dashboard";
}

export function useCurrentPageAccess() {
  const location = useLocation();
  const pageKey = pageKeyFromPath(location.pathname);
  return usePageAccess(pageKey);
}

export function usePageAccess(pageKey: string) {
  const { data: session, isLoading: isSessionLoading } = useSession();
  const { selectedEventId } = useEventContext();
  const isPublicPage = publicPageKeys.has(pageKey);

  const { data, isLoading } = useQuery({
    queryKey: ["page-access", selectedEventId, session?.user.appUserId, pageKey],
    enabled: Boolean(selectedEventId && session && !isPublicPage),
    queryFn: () =>
      apiFetch<{
        canView: boolean;
        canEdit: boolean;
        role: "admin" | "committee" | "read_only" | null;
        accessLevel: "none" | "view" | "edit";
      }>(`/api/page-access?eventId=${selectedEventId}&pageKey=${pageKey}`),
  });

  if (isPublicPage) {
    return { canView: true, canEdit: false, requiresLogin: false, isLoading: false, role: null };
  }

  if (pageKey === "settings" && session && !selectedEventId) {
    return {
      canView: true,
      canEdit: true,
      requiresLogin: false,
      isLoading: isSessionLoading,
      role: null,
    };
  }

  if (pageKey === "settings" && session) {
    return {
      canView: true,
      canEdit: data?.canEdit ?? false,
      requiresLogin: false,
      isLoading: isSessionLoading || isLoading,
      role: data?.role ?? null,
    };
  }

  return {
    canView: data?.canView ?? false,
    canEdit: data?.canEdit ?? false,
    requiresLogin: !publicPageKeys.has(pageKey) && !session,
    isLoading: isSessionLoading || isLoading,
    role: data?.role ?? null,
  };
}
