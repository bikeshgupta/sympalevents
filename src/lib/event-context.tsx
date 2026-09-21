import { useQuery } from "@tanstack/react-query";
import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useSession } from "@/lib/auth";

export type EventOption = {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  location: string | null;
  /** This person's role on that event, so the switcher can label it. */
  role?: "admin" | "committee" | "read_only" | null;
};

type EventContextValue = {
  events: EventOption[];
  selectedEventId?: string;
  setSelectedEventId: (eventId: string) => void;
  isLoading: boolean;
};

const EventContext = createContext<EventContextValue | null>(null);

const STORAGE_KEY = "selected_event_id";

/**
 * An event id pinned in the address bar, which is how somebody without an
 * account reaches a public page at all.
 *
 * The provider sits outside the Router (see main.tsx), so this reads
 * `window.location` rather than `useSearchParams`. It is read once on mount:
 * following a link into the app is a fresh load, and after that the switcher
 * owns the selection.
 */
function eventIdFromUrl() {
  if (typeof window === "undefined") return undefined;
  const fromQuery = new URLSearchParams(window.location.search).get("eventId");
  return fromQuery?.trim() || undefined;
}

function storedEventId() {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? undefined;
  } catch {
    // Private windows and blocked site data both throw here. A person who
    // cannot store a preference should still be able to use the app.
    return undefined;
  }
}

function rememberEventId(eventId: string) {
  try {
    localStorage.setItem(STORAGE_KEY, eventId);
  } catch {
    // Nothing to do - the selection still holds for this page's lifetime.
  }
}

export function EventProvider({ children }: { children: ReactNode }) {
  const { data: session, isLoading: isSessionLoading } = useSession();
  const [selectedEventId, setSelectedEventIdState] = useState<string | undefined>(
    () => eventIdFromUrl() ?? storedEventId(),
  );

  /**
   * The events this person has a role on - not every event in the database.
   *
   * This used to be `supabase.from("events").select(...)` with no filter at
   * all, backed by an RLS policy of `using (true)` for `anon`. On a single
   * -society deployment that read as "our events". On a shared one it is every
   * society's events, and the effect below then auto-selected the earliest of
   * them, which is to say a stranger's.
   */
  const { data: events = [], isLoading } = useQuery({
    queryKey: ["my-events", session?.user.appUserId ?? "guest"],
    enabled: !isSessionLoading,
    queryFn: async () => {
      const { events: mine } = await apiFetch<{ events: EventOption[] }>("/api/events?resource=mine", {
        requireAuth: false,
      });
      return mine;
    },
  });

  useEffect(() => {
    if (!events.length) return;
    // A link-borne id is honoured even when it is not in this person's list -
    // that is the whole point of a public page. Only fall back to their own
    // first event when nothing is selected at all.
    if (selectedEventId) return;
    setSelectedEventIdState(events[0].id);
    rememberEventId(events[0].id);
  }, [events, selectedEventId]);

  const value = useMemo(
    () => ({
      events,
      selectedEventId,
      setSelectedEventId: (eventId: string) => {
        setSelectedEventIdState(eventId);
        rememberEventId(eventId);
      },
      isLoading: isLoading || isSessionLoading,
    }),
    [events, selectedEventId, isLoading, isSessionLoading],
  );

  return <EventContext.Provider value={value}>{children}</EventContext.Provider>;
}

export function useEventContext() {
  const value = useContext(EventContext);
  if (!value) throw new Error("useEventContext must be used inside EventProvider");
  return value;
}
