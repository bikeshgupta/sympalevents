import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useSession } from "@/lib/auth";
import { useEventContext } from "@/lib/event-context";

export type PageAccess = {
  pageKey: string;
  canView: boolean;
  canEdit: boolean;
  accessLevel: "none" | "view" | "edit";
};

type EventAccess = {
  role: "admin" | "committee" | "read_only" | null;
  pages: PageAccess[];
};

/**
 * Nothing is assumed visible before the server answers. Which pages are open
 * is the admin's per-event setting now (see src/lib/page-access.ts), so a
 * guessed default here would either flash links a viewer cannot open or hide
 * ones they can - the nav simply waits for the real list.
 */
const noAccess: EventAccess = { role: null, pages: [] };

export function useEventAccess() {
  const { data: session, isLoading: isSessionLoading } = useSession();
  const { selectedEventId } = useEventContext();

  return useQuery({
    queryKey: ["event-access", selectedEventId, session?.user.appUserId ?? "guest"],
    queryFn: () =>
      apiFetch<EventAccess>(`/api/event-access?eventId=${selectedEventId}`, {
        requireAuth: false,
      }).catch((error) => {
        console.warn("Falling back to no page access:", error);
        return noAccess;
      }),
    initialData: noAccess,
    enabled: Boolean(selectedEventId) && !isSessionLoading,
  });
}
