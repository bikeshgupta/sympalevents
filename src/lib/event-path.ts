import { useEventContext } from "@/lib/event-context";

/**
 * Builds an in-app link that keeps the event in the address.
 *
 * `useEventPath("/budget")` gives `/e/<id>/budget` when an event is selected,
 * and `/budget` when there is not one yet. Every nav link and every in-app
 * link goes through this, so a page opened from a shared link stays shareable
 * as somebody moves around it.
 */
export function useEventPath() {
  const { selectedEventId } = useEventContext();
  return (path: string) => {
    if (!selectedEventId) return path;
    const clean = path.startsWith("/") ? path : `/${path}`;
    return `/e/${selectedEventId}${clean}`;
  };
}
