import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import type { SocietyOption } from "@/lib/event-context";

/**
 * Creating, renaming and joining a society.
 *
 * Reading them is not here: `EventProvider` already asks
 * `/api/events?resource=mine`, which returns this person's societies alongside
 * their events in the same round trip, and every screen that needs the list
 * reads it from `useEventContext()`. A second query for the same rows would
 * only be a second thing to keep in step.
 *
 * Every mutation invalidates `["my-events"]`, which is that one query.
 */

type SocietyResponse = { society: SocietyOption };

export function useSocietyActions() {
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["my-events"] });

  const create = useMutation({
    mutationFn: (input: { name: string; city?: string }) =>
      apiFetch<SocietyResponse>("/api/events?resource=societies", {
        method: "POST",
        body: { name: input.name, city: input.city ?? "" },
      }),
    onSuccess: refresh,
  });

  const join = useMutation({
    mutationFn: (inviteCode: string) =>
      apiFetch<SocietyResponse>("/api/events?resource=join", {
        method: "POST",
        body: { inviteCode },
      }),
    onSuccess: refresh,
  });

  const update = useMutation({
    mutationFn: (input: { societyId: string; name?: string; city?: string; rotateInviteCode?: boolean }) =>
      apiFetch<SocietyResponse>("/api/events?resource=societies", {
        method: "PATCH",
        body: input,
      }),
    onSuccess: refresh,
  });

  return { create, join, update };
}
