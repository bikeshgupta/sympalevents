import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import type { LayoutEntry } from "@/lib/widgets";

/**
 * Saving the dashboard arrangement.
 *
 * Reading it is not here: the layout travels with the event in
 * `useEventData()`, which every screen already loads. A query of its own would
 * be a second request for an array of ten short objects.
 *
 * `null` is a real value and means "back to the default for this kind of
 * event", which is computed rather than stored - so Reset leaves nothing
 * behind, and an event picks up a better default from a later release instead
 * of being frozen to the one it was made with.
 */
export function useSaveDashboardLayout(eventId?: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (layout: LayoutEntry[] | null) =>
      apiFetch<{ layout: LayoutEntry[] | null }>("/api/events?resource=layout", {
        method: "PUT",
        body: { eventId, layout },
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["event-data"] }),
  });
}
