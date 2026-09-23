import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { apiFetch } from "@/lib/api";
import { useEventContext } from "@/lib/event-context";
import { pageKeyFromPath } from "@/lib/page-access";

/**
 * Who is on this event's pages, and who has been.
 *
 * The heartbeat is sent by every visitor, signed in or not; the read is the
 * admin's panel in Settings. See api/_lib/traffic.ts for the server half and
 * for why it rides on /api/event-access rather than /api/events.
 */

export type TrafficVisit = {
  id: string;
  /** Null for a guest. Names only - never an email, photograph or role. */
  name: string | null;
  signedIn: boolean;
  startedAt: string;
  lastSeenAt: string;
  seconds: number;
  pageKey: string | null;
  pageViews: number;
  device: string | null;
  browser: string | null;
  country: string | null;
  city: string | null;
  /** How many visits this browser has made inside the window. */
  visitNumber: number;
};

export type TrafficReport = {
  ready: boolean;
  migration?: string;
  visits: TrafficVisit[];
  byPage: { pageKey: string; visits: number }[];
  liveWindowSeconds: number;
};

const VISIT_KEY = "traffic_visit_id";
const VISITOR_KEY = "traffic_visitor_key";

/** Once a minute while the tab is actually being looked at. */
const BEAT_MS = 60_000;

function randomId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  // Older Safari. Good enough for an id that identifies nobody.
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
    const value = (Math.random() * 16) | 0;
    return (char === "x" ? value : (value & 0x3) | 0x8).toString(16);
  });
}

/**
 * Both of these are wrapped because a private window, blocked site data and a
 * cleared profile all throw here - and somebody who cannot store anything
 * must still be able to read the page. When storage is unavailable the visit
 * simply is not counted, which is the right failure: it never blocks a read.
 */
function storedId(store: "session" | "local", key: string) {
  try {
    const storage = store === "session" ? sessionStorage : localStorage;
    const existing = storage.getItem(key);
    if (existing) return existing;
    const created = randomId();
    storage.setItem(key, created);
    return created;
  } catch {
    return null;
  }
}

/**
 * One beat per minute per visitor, mounted once in AppLayout.
 *
 * That mount point is deliberate: /login, /new-event and /s/<token> sit
 * outside the layout and belong to no event, so they send nothing.
 *
 * The visit id lives in sessionStorage, so a new tab is a new visit; the
 * visitor key lives in localStorage, so a guest who comes back is recognised
 * as the same browser without anything about them being stored server-side.
 *
 * There is no close-out beat on unload. `navigator.sendBeacon` cannot carry
 * the Authorization header this API needs, and an unload handler that fires
 * an ordinary fetch is unreliable on a phone in any case. The cost is that a
 * visit's recorded length under-counts by up to one beat - which is honest,
 * and much better than a tab left open all night reading as an hour's
 * attention.
 */
export function useTrafficHeartbeat() {
  const { selectedEventId } = useEventContext();
  const location = useLocation();
  const pageKey = pageKeyFromPath(location.pathname);

  // Held in a ref so the effect below depends on the event and the page only
  // - it must not re-arm its timer on every render.
  const latest = useRef({ eventId: selectedEventId, pageKey });
  latest.current = { eventId: selectedEventId, pageKey };

  useEffect(() => {
    if (!selectedEventId) return;

    const visitId = storedId("session", VISIT_KEY);
    const visitorKey = storedId("local", VISITOR_KEY);
    if (!visitId || !visitorKey) return;

    let cancelled = false;

    const beat = () => {
      // A backgrounded tab is not a person on the site. Counting it would
      // make both the live number and every recorded duration wrong.
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      if (cancelled) return;

      const { eventId, pageKey: currentPage } = latest.current;
      if (!eventId) return;

      void apiFetch("/api/event-access?resource=traffic", {
        method: "POST",
        requireAuth: false,
        body: { eventId, visitId, visitorKey, pageKey: currentPage },
      }).catch(() => {
        // Silent, always. A resident browsing a page asked for none of this
        // and must never see it fail.
      });
    };

    beat();
    const timer = window.setInterval(beat, BEAT_MS);
    // Coming back to the tab should register straight away rather than up to
    // a minute later, or somebody who returns briefly never appears at all.
    document.addEventListener("visibilitychange", beat);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", beat);
    };
    // `pageKey` is here so moving between pages beats immediately; the ref
    // above is what keeps the timer itself from being torn down needlessly.
  }, [selectedEventId, pageKey]);
}

/**
 * The admin panel's read.
 *
 * `enabled` is the panel's open state, and the refetch timer runs only while
 * it is open - a 30-second poll for a card nobody has expanded is exactly the
 * kind of off-screen timer the performance rules rule out.
 */
export function useEventTraffic(eventId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ["event-traffic", eventId],
    enabled: Boolean(eventId) && enabled,
    refetchInterval: enabled ? 30_000 : false,
    queryFn: () => apiFetch<TrafficReport>(`/api/event-access?resource=traffic&eventId=${eventId}`),
  });
}
