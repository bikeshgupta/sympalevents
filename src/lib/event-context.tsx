import { useQuery } from "@tanstack/react-query";
import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

export type EventOption = {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  location: string | null;
};

type EventContextValue = {
  events: EventOption[];
  selectedEventId?: string;
  setSelectedEventId: (eventId: string) => void;
  isLoading: boolean;
};

const EventContext = createContext<EventContextValue | null>(null);

export function EventProvider({ children }: { children: ReactNode }) {
  const [selectedEventId, setSelectedEventIdState] = useState<string | undefined>(() =>
    localStorage.getItem("selected_event_id") ?? undefined,
  );

  const { data: events = [], isLoading } = useQuery({
    queryKey: ["events"],
    queryFn: async () => {
      if (!supabase) return [];
      const { data, error } = await supabase
        .from("events")
        .select("id,name,start_date,end_date,location")
        .order("start_date", { ascending: true });
      if (error) throw error;
      return data as EventOption[];
    },
  });

  useEffect(() => {
    if (!events.length) return;
    if (!selectedEventId || !events.some((event) => event.id === selectedEventId)) {
      setSelectedEventIdState(events[0].id);
      localStorage.setItem("selected_event_id", events[0].id);
    }
  }, [events, selectedEventId]);

  const value = useMemo(
    () => ({
      events,
      selectedEventId,
      setSelectedEventId: (eventId: string) => {
        setSelectedEventIdState(eventId);
        localStorage.setItem("selected_event_id", eventId);
      },
      isLoading,
    }),
    [events, selectedEventId, isLoading],
  );

  return <EventContext.Provider value={value}>{children}</EventContext.Provider>;
}

export function useEventContext() {
  const value = useContext(EventContext);
  if (!value) throw new Error("useEventContext must be used inside EventProvider");
  return value;
}
