import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useSession } from "@/lib/auth";

/**
 * Prasad slots - see api/_lib/prasad.ts (served on
 * /api/event-schedule?resource=prasad).
 *
 * A slot is a day plus a label - Morning, Noon, Evening, or anything the
 * committee names - with what prasad is served, who arranges it (the prasad
 * sponsors) and who distributes it. Several people on either list is normal.
 *
 * Slots come from the API, not useEventData: `prasad_items` is not readable
 * from the browser, which is also what lets the server leave flat numbers out
 * for a signed-out visitor.
 */

export type PrasadPerson = { name: string; flat: string };

export type PrasadSlot = {
  id: string;
  date: string;
  slot: string;
  item: string;
  notes: string;
  /** The prasad sponsors: who arranges / brings it. */
  arrangers: PrasadPerson[];
  /** Who hands it out. */
  distributors: PrasadPerson[];
  createdAt: string;
  updatedAt: string;
};

export type PrasadSlotInput = {
  date: string;
  slot: string;
  item: string;
  notes: string;
  arrangers: PrasadPerson[];
  distributors: PrasadPerson[];
};

type SlotsResponse = {
  slots: PrasadSlot[];
  /** False until migration 019 has been run: slots still list, saving is off. */
  ready: boolean;
  access: { canEdit: boolean };
};

/** Offered as one-tap choices; any other label can be typed. */
export const slotPresets = ["Morning", "Noon", "Evening", "Night"];

// The order a day actually runs in. Anything custom sorts after the presets.
const slotOrder: Record<string, number> = {
  "early morning": 0,
  morning: 1,
  "late morning": 2,
  noon: 3,
  afternoon: 4,
  evening: 5,
  night: 6,
};

export function slotRank(label: string) {
  return slotOrder[label.trim().toLowerCase()] ?? 10;
}

export function byDayThenSlot(left: PrasadSlot, right: PrasadSlot) {
  return (
    left.date.localeCompare(right.date) ||
    slotRank(left.slot) - slotRank(right.slot) ||
    left.slot.localeCompare(right.slot) ||
    left.createdAt.localeCompare(right.createdAt)
  );
}

/** A slot still missing someone to arrange it or someone to hand it out. */
export function isUnfilled(slot: PrasadSlot) {
  return !slot.arrangers.length || !slot.distributors.length;
}

export function personKey(person: PrasadPerson) {
  return `${person.name.trim().toLowerCase()}|${person.flat.trim().toUpperCase()}`;
}

export function usePrasadSlots(eventId?: string) {
  const { data: session, isLoading: isSessionLoading } = useSession();
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["prasad-slots"] });

  const query = useQuery({
    queryKey: ["prasad-slots", eventId, session?.user.appUserId ?? "guest"],
    enabled: Boolean(eventId) && !isSessionLoading,
    // The admin may have made the page public; the server decides what a
    // signed-out request gets.
    queryFn: () =>
      apiFetch<SlotsResponse>(`/api/event-schedule?resource=prasad&eventId=${encodeURIComponent(eventId!)}`, {
        requireAuth: false,
      }),
    retry: false,
  });

  const create = useMutation({
    mutationFn: (input: PrasadSlotInput) =>
      apiFetch<{ slotId: string }>("/api/event-schedule?resource=prasad", { method: "POST", body: { eventId, ...input } }),
    onSuccess: invalidate,
  });

  const update = useMutation({
    mutationFn: ({ id, updatedAt, ...input }: PrasadSlotInput & { id: string; updatedAt: string }) =>
      apiFetch<{ ok: true }>("/api/event-schedule?resource=prasad", {
        method: "PATCH",
        body: { id, updatedAt, ...input },
      }),
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ ok: true }>("/api/event-schedule?resource=prasad", { method: "DELETE", body: { id } }),
    onSuccess: invalidate,
  });

  return { query, create, update, remove };
}
