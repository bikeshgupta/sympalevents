import { useSession } from "@/lib/auth";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import type { EventStatusOverride } from "@/lib/event-status";

/**
 * Society Home's one read.
 *
 * Everything the page draws comes from here - the society, its events, and the
 * handful of counts each card shows. The aggregates are tallied server-side
 * (api/_lib/society-home.ts) precisely so that adding a card never adds a
 * request, the same rule the dashboard's widgets follow.
 */

export type EventMetrics = {
  reviewCount: number;
  writtenReviewCount: number;
  averageRating: number | null;
  photoCount: number;
  contributorCount: number;
  sponsorCount: number;
  teamCount: number;
};

export type SocietyEvent = {
  id: string;
  name: string;
  slug: string | null;
  startDate: string;
  endDate: string;
  /** Hours of the first and last day; null or absent means the whole day. */
  startTime?: string | null;
  endTime?: string | null;
  location: string | null;
  eventType: string;
  /** The template it was made from; null predates templates. */
  templateKey?: string | null;
  statusOverride: EventStatusOverride;
  isClosed: boolean;
  heroImageUrl: string | null;
  /** Where the organiser anchored that photograph (0-100 each), or null for centred. */
  heroFocus?: { x: number; y: number } | null;
  /** Page keys this viewer may open - what a card is allowed to mention. */
  modules: string[];
  metrics: EventMetrics;
};

export type Society = {
  id: string;
  name: string;
  slug: string | null;
  city: string | null;
  logoUrl: string | null;
};

export type SocietyHome = {
  ready: boolean;
  migration?: string;
  canManage?: boolean;
  society: Society | null;
  events: SocietyEvent[];
};

export function useSocietyHome(slug?: string) {
  const {data:session}=useSession();
  return useQuery({
    queryKey: ["society-home", slug ?? "mine", session?.user.appUserId ?? "guest"],
    queryFn: () =>
      apiFetch<SocietyHome>(
        `/api/events?resource=society-home${slug ? `&slug=${encodeURIComponent(slug)}` : ""}`,
        // A society's event list is readable without an account: what a
        // visitor then sees is decided per event by the server, which returns
        // only the ones whose dashboard an admin has made public.
        { requireAuth: false },
      ),
  });
}

/** A module is worth mentioning on a card only when this viewer may open it. */
export function hasModule(event: SocietyEvent, pageKey: string) {
  return event.modules.includes(pageKey);
}
