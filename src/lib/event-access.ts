import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useSession } from "@/lib/auth";
import { useEventContext } from "@/lib/event-context";
import { publicPageKeys } from "@/lib/page-access";

export type PageAccess = {
  pageKey: string;
  canView: boolean;
  canEdit: boolean;
  accessLevel: "none" | "view" | "edit";
};

const publicAccess = {
  role: null,
  pages: [...publicPageKeys].map((pageKey) => ({
    pageKey,
    canView: true,
    canEdit: false,
    accessLevel: "view" as const,
  })),
};

export function useEventAccess() {
  const { data: session, isLoading: isSessionLoading } = useSession();
  const { selectedEventId } = useEventContext();

  return useQuery({
    queryKey: ["event-access", selectedEventId, session?.user.appUserId ?? "guest"],
    queryFn: () =>
      session
        ? apiFetch<{
            role: "admin" | "committee" | "read_only" | null;
            pages: PageAccess[];
          }>(`/api/event-access?eventId=${selectedEventId}`)
        : apiFetch<{
            role: "admin" | "committee" | "read_only" | null;
            pages: PageAccess[];
          }>(`/api/event-access?eventId=${selectedEventId}`, { requireAuth: false }).catch((error) => {
            console.warn("Falling back to public page access:", error);
            return publicAccess;
          }),
    initialData: publicAccess,
    enabled: Boolean(selectedEventId) && !isSessionLoading,
  });
}
