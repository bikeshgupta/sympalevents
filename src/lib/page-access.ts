import { useQuery } from "@tanstack/react-query";
import { useLocation } from "react-router-dom";
import { useSession } from "@/lib/auth";
import { useEventContext } from "@/lib/event-context";
import { supabase } from "@/lib/supabase";

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

function isUuid(value: string | undefined) {
  return Boolean(value?.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i));
}

export function useCurrentPageAccess() {
  const location = useLocation();
  const pageKey = pageKeyFromPath(location.pathname);
  return usePageAccess(pageKey);
}

export function usePageAccess(pageKey: string) {
  const { data: session, isLoading: isSessionLoading } = useSession();
  const { selectedEventId } = useEventContext();
  const supabaseUserId = isUuid(session?.user.id) ? session?.user.id : null;

  const { data, isLoading } = useQuery({
    queryKey: ["page-access", selectedEventId, supabaseUserId, pageKey],
    enabled: Boolean(selectedEventId && supabaseUserId && supabase),
    queryFn: async () => {
      if (!supabase || !selectedEventId || !supabaseUserId) {
        return { canView: publicPageKeys.has(pageKey), canEdit: false, role: null };
      }

      const [{ data: member }, { data: permission }] = await Promise.all([
        supabase
          .from("event_members")
          .select("role")
          .eq("event_id", selectedEventId)
          .eq("user_id", supabaseUserId)
          .maybeSingle(),
        supabase
          .from("event_page_permissions")
          .select("access_level")
          .eq("event_id", selectedEventId)
          .eq("user_id", supabaseUserId)
          .eq("page_key", pageKey)
          .maybeSingle(),
      ]);

      const role = member?.role ?? null;
      const isAdmin = role === "owner" || role === "admin";
      const level = permission?.access_level ?? "none";

      return {
        canView: publicPageKeys.has(pageKey) || isAdmin || level === "view" || level === "edit",
        canEdit: isAdmin || level === "edit",
        role,
      };
    },
  });

  if (publicPageKeys.has(pageKey) && !session) {
    return { canView: true, canEdit: false, requiresLogin: false, isLoading: false, role: null };
  }

  if (session && !supabaseUserId) {
    return {
      canView: true,
      canEdit: false,
      requiresLogin: false,
      isLoading: isSessionLoading,
      role: "firebase-user",
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
