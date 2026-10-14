import { DuplicateEventForm } from "@/features/settings/duplicate-event-form";
import { useEventContext } from "@/lib/event-context";
import { useEventData } from "@/lib/event-data";

/** Settings -> Advanced -> Run this event again. */
export function DuplicateEventCard() {
  const { selectedEventId } = useEventContext();
  const { data } = useEventData({ includeTasks: false });
  if (!selectedEventId) return null;

  return <DuplicateEventForm ios key={selectedEventId} eventId={selectedEventId} defaultName={`${data.event.name} (copy)`} />;
}
