import { useEventContext } from "@/lib/event-context";
import { eventBasePath } from "@/lib/event-slug";

/**
 * Builds an in-app link that keeps the event in the address.
 *
 * `useEventPath("/budget")` gives
 * `/society/tru-windchimes/events/ganesh-2026/budget` once the event has
 * slugs, `/e/<id>/budget` when it does not yet (migration 029 unapplied, or an
 * event created before it), and `/budget` when no event is selected at all.
 *
 * Every nav link and every in-app link goes through this one function, which
 * is what lets the whole app change address shape in one place - and what
 * makes the fallback total rather than piecemeal.
 */
export function useEventPath() {
  const { selectedEventId, selectedEvent } = useEventContext();
  return (path: string) => {
    if (!selectedEventId) return path;
    const clean = path.startsWith("/") ? path : `/${path}`;
    const base = eventBasePath({
      id: selectedEventId,
      slug: selectedEvent?.slug,
      societySlug: selectedEvent?.societySlug,
    });
    return `${base}${clean}`;
  };
}
