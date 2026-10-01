import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

/**
 * A readable address resolved to the id everything else works by.
 *
 * `/society/tru-windchimes/events/ganesh-2026/budget` has to become an event
 * id before any screen can load, and the person opening it may have no account
 * and no stored selection - so this asks the server, which answers publicly for
 * the same reason `/s/<token>` does.
 *
 * Cached by react-query on the slug pair, so moving between pages inside one
 * event resolves once rather than on every navigation.
 */

export type ResolvedEvent = {
  ready: boolean;
  migration?: string;
  eventId?: string;
  eventName?: string;
  eventSlug?: string;
  societyName?: string;
  societySlug?: string;
};

export function useResolvedEventSlug(societySlug?: string, eventSlug?: string) {
  return useQuery({
    queryKey: ["resolve-event", societySlug, eventSlug],
    enabled: Boolean(societySlug && eventSlug),
    // An address does not change under somebody while they are reading it.
    staleTime: 5 * 60 * 1000,
    retry: false,
    queryFn: () =>
      apiFetch<ResolvedEvent>(
        `/api/events?resource=resolve&society=${encodeURIComponent(societySlug ?? "")}&event=${encodeURIComponent(eventSlug ?? "")}`,
        { requireAuth: false },
      ),
  });
}

/**
 * The readable address for an event, or the id form when it has no slugs yet.
 *
 * Both halves are null until migration 029 has been run, which is what keeps
 * every link in the app working unchanged before then.
 */
export function eventBasePath(input: {
  id?: string | null;
  slug?: string | null;
  societySlug?: string | null;
}) {
  if (input.slug && input.societySlug) {
    return `/society/${input.societySlug}/events/${input.slug}`;
  }
  return input.id ? `/e/${input.id}` : "";
}
