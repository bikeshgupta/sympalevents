import { useQuery } from "@tanstack/react-query";
import { useLocation } from "react-router-dom";
import { apiFetch } from "@/lib/api";
import { useSession } from "@/lib/auth";
import { useEventContext } from "@/lib/event-context";

// "auctions" is public alongside dashboard/budget: browsing auctions and
// watching a bid's chart/history needs no sign-in, matching /api/auctions and
// /api/auction-bids GET. Only creating an auction or placing a bid does.
export const publicPageKeys = new Set(["dashboard", "budget", "auctions"]);

export const pageLabels: Record<string, string> = {
  dashboard: "Dashboard",
  contributions: "Contributions",
  sponsors: "Sponsors",
  budget: "Budget",
  expenses: "Expense Ledger",
  auctions: "Auctions",
  prasad: "Prasad",
  tasks: "Tasks",
  volunteers: "Volunteers",
  "event-plan": "Events",
  contacts: "Contacts",
  settings: "Settings",
};

export function pageKeyFromPath(pathname: string) {
  const pageKey = pathname.split("/").filter(Boolean)[0] || "dashboard";
  return pageKey === "events" ? "event-plan" : pageKey;
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
    enabled: Boolean(selectedEventId && session),
    queryFn: () =>
      apiFetch<{
        canView: boolean;
        canEdit: boolean;
        role: "admin" | "committee" | "read_only" | null;
        accessLevel: "none" | "view" | "edit";
      }>(`/api/page-access?eventId=${selectedEventId}&pageKey=${pageKey}`),
  });

  if (isPublicPage && !session) {
    return { canView: true, canEdit: false, requiresLogin: false, isLoading: false, role: null };
  }

  if (isPublicPage) {
    return {
      canView: true,
      canEdit: data?.canEdit ?? false,
      requiresLogin: false,
      isLoading: isSessionLoading || isLoading,
      role: data?.role ?? null,
    };
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
      canView: data?.canView ?? false,
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
