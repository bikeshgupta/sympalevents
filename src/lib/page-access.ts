import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "react-router-dom";
import { apiFetch } from "@/lib/api";
import { useSession } from "@/lib/auth";
import { useEventContext } from "@/lib/event-context";

/**
 * Which pages are open to whom is the event admin's call, per event, set in
 * Settings -> Page Visibility and stored in `event_page_visibility`. There is
 * deliberately no hardcoded `publicPageKeys` set here any more: the server is
 * the only authority, and this module just asks it.
 *
 *   public        - anyone with the link, no sign-in
 *   authenticated - any signed-in user
 *   restricted    - the admin, plus members granted view/edit for that page
 *
 * Editing is unchanged and never widened by visibility: it stays admin, or an
 * explicit "edit" grant in Member Access.
 */
export type PageVisibility = "public" | "authenticated" | "restricted";

export const visibilityLabels: Record<PageVisibility, string> = {
  public: "Anyone with the link",
  authenticated: "Signed-in users",
  restricted: "Only members I give access to",
};

export const visibilityHints: Record<PageVisibility, string> = {
  public: "No sign-in needed. Do not put contact details or payment references on a page set to this.",
  authenticated: "Any signed-in resident can view. Editing still needs a per-member grant below.",
  restricted: "Hidden unless this person has a Read or Read/write grant in Member Access.",
};

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
  closing: "Closing",
  contacts: "Contacts",
  settings: "Settings",
};

/** Every page whose visibility an admin can set. "settings" is not one of
 *  them - it is the screen that controls the others, so it stays admin-only. */
export const configurablePageKeys = Object.keys(pageLabels).filter((pageKey) => pageKey !== "settings");

export function pageKeyFromPath(pathname: string) {
  const pageKey = pathname.split("/").filter(Boolean)[0] || "dashboard";
  return pageKey === "events" ? "event-plan" : pageKey;
}

export function useCurrentPageAccess() {
  const location = useLocation();
  const pageKey = pageKeyFromPath(location.pathname);
  return usePageAccess(pageKey);
}

type PageAccessResponse = {
  canView: boolean;
  canEdit: boolean;
  role: "admin" | "committee" | "read_only" | null;
  accessLevel: "none" | "view" | "edit";
  visibility: PageVisibility | "admin-only";
  requiresLogin: boolean;
};

export function usePageAccess(pageKey: string) {
  const { data: session, isLoading: isSessionLoading } = useSession();
  const { selectedEventId, isLoading: isEventLoading } = useEventContext();

  const { data, isLoading } = useQuery({
    // Signed out is a real state with a real answer now (a page may be
    // public), so this query runs either way - the key just has to change
    // when the viewer does, or a sign-in would serve the guest's answer.
    queryKey: ["page-access", selectedEventId, session?.user.appUserId ?? "guest", pageKey],
    enabled: Boolean(selectedEventId) && !isSessionLoading,
    queryFn: () =>
      apiFetch<PageAccessResponse>(`/api/page-access?eventId=${selectedEventId}&pageKey=${pageKey}`, {
        requireAuth: false,
      }),
  });

  // Settings before an event exists: a signed-in user has to be able to reach
  // it to create their first event.
  if (pageKey === "settings" && session && !selectedEventId) {
    return { canView: true, canEdit: true, requiresLogin: false, isLoading: isSessionLoading, role: null };
  }

  // No event to ask about: either the list is still loading, or Supabase is
  // unconfigured and the app is running on the demo dataset. There is no
  // admin to have set anything, and nothing real to protect, so demo mode
  // reads view-only everywhere rather than bouncing to access-denied.
  if (!selectedEventId) {
    return {
      canView: !isEventLoading,
      canEdit: false,
      requiresLogin: false,
      isLoading: isEventLoading || isSessionLoading,
      role: null,
    };
  }

  return {
    canView: data?.canView ?? false,
    canEdit: data?.canEdit ?? false,
    requiresLogin: (data?.requiresLogin ?? !session) && !session,
    isLoading: isSessionLoading || isLoading,
    role: data?.role ?? null,
  };
}

type VisibilityResponse = {
  visibility: Record<string, PageVisibility>;
  pageKeys: string[];
  canEdit: boolean;
};

/** The admin's whole map for the selected event, plus a save mutation.
 *  Read by Settings; the nav and the route guard go through the two hooks
 *  above, which get the already-resolved answer from the server. */
export function usePageVisibility() {
  const { data: session } = useSession();
  const { selectedEventId } = useEventContext();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["page-visibility", selectedEventId, session?.user.appUserId ?? "guest"],
    enabled: Boolean(selectedEventId),
    queryFn: () =>
      apiFetch<VisibilityResponse>(`/api/page-access?eventId=${selectedEventId}&resource=visibility`, {
        requireAuth: false,
      }),
  });

  const save = useMutation({
    mutationFn: (visibility: Record<string, PageVisibility>) =>
      apiFetch<{ visibility: Record<string, PageVisibility> }>("/api/page-access", {
        method: "POST",
        body: { eventId: selectedEventId, visibility },
      }),
    onSuccess: async () => {
      // Everything that renders off "who can see what" has to re-ask.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["page-visibility"] }),
        queryClient.invalidateQueries({ queryKey: ["page-access"] }),
        queryClient.invalidateQueries({ queryKey: ["event-access"] }),
      ]);
    },
  });

  return { query, save };
}
