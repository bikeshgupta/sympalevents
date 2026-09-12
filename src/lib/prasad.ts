import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useSession } from "@/lib/auth";

/**
 * Prasad - see api/_lib/prasad.ts (served on
 * /api/event-schedule?resource=prasad).
 *
 * One **item** is one prasad in one slot: a day, a slot label (Morning, Noon,
 * Evening, or anything the committee names), what the prasad is, who arranges
 * it - the prasad sponsors - and who distributes it.
 *
 * Three "manys", all of them normal:
 *   - a slot holds several prasad items (modak from one family, pedha from
 *     another, both in the Morning slot);
 *   - an item has several sponsors arranging it;
 *   - an item has several people distributing it.
 *
 * Items come from the API, not useEventData: `prasad_items` is not readable
 * from the browser, which is also what lets the server leave flat numbers out
 * for a signed-out visitor.
 */

export type PrasadPerson = { name: string; flat: string };

export type PrasadItem = {
  id: string;
  date: string;
  /** The slot this prasad belongs to - several items can share one. */
  slot: string;
  /** What the prasad is. Required: it is what tells two items in one slot apart. */
  item: string;
  notes: string;
  /** The prasad sponsors: who arranges / brings this item. */
  arrangers: PrasadPerson[];
  /** Who hands this item out. */
  distributors: PrasadPerson[];
  createdAt: string;
  updatedAt: string;
};

export type PrasadItemInput = {
  date: string;
  slot: string;
  item: string;
  notes: string;
  arrangers: PrasadPerson[];
  distributors: PrasadPerson[];
};

type ItemsResponse = {
  slots: PrasadItem[];
  /** False until migration 019 has been run: items still list, saving is off. */
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

export function byDayThenSlot(left: PrasadItem, right: PrasadItem) {
  return (
    left.date.localeCompare(right.date) ||
    slotRank(left.slot) - slotRank(right.slot) ||
    left.slot.localeCompare(right.slot) ||
    left.item.localeCompare(right.item) ||
    left.createdAt.localeCompare(right.createdAt)
  );
}

/** An item still missing someone to arrange it or someone to hand it out. */
export function isUnfilled(item: PrasadItem) {
  return !item.arrangers.length || !item.distributors.length;
}

export function personKey(person: PrasadPerson) {
  return `${person.name.trim().toLowerCase()}|${person.flat.trim().toUpperCase()}`;
}

export type PrasadSlotGroup = { slot: string; items: PrasadItem[] };

/**
 * Groups items into the slots they share, in the order a day runs. Slot
 * labels are matched case-insensitively ("morning" joins "Morning") and the
 * first spelling is the one shown.
 */
export function groupBySlot(items: PrasadItem[]): PrasadSlotGroup[] {
  const slots = new Map<string, PrasadSlotGroup>();
  for (const item of items) {
    const key = item.slot.trim().toLowerCase();
    const group = slots.get(key);
    if (group) group.items.push(item);
    else slots.set(key, { slot: item.slot, items: [item] });
  }
  return [...slots.values()].sort(
    (left, right) => slotRank(left.slot) - slotRank(right.slot) || left.slot.localeCompare(right.slot),
  );
}

export function usePrasadItems(eventId?: string) {
  const { data: session, isLoading: isSessionLoading } = useSession();
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["prasad-items"] });

  const query = useQuery({
    queryKey: ["prasad-items", eventId, session?.user.appUserId ?? "guest"],
    enabled: Boolean(eventId) && !isSessionLoading,
    // The admin may have made the page public; the server decides what a
    // signed-out request gets.
    queryFn: () =>
      apiFetch<ItemsResponse>(`/api/event-schedule?resource=prasad&eventId=${encodeURIComponent(eventId!)}`, {
        requireAuth: false,
      }),
    retry: false,
  });

  const create = useMutation({
    mutationFn: (input: PrasadItemInput) =>
      apiFetch<{ slotId: string }>("/api/event-schedule?resource=prasad", { method: "POST", body: { eventId, ...input } }),
    onSuccess: invalidate,
  });

  const update = useMutation({
    mutationFn: ({ id, updatedAt, ...input }: PrasadItemInput & { id: string; updatedAt: string }) =>
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
