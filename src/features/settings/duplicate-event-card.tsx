import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DuplicateEventForm } from "@/features/settings/duplicate-event-form";
import { useEventContext } from "@/lib/event-context";
import { useEventData } from "@/lib/event-data";

/** Settings -> Run this event again. */
export function DuplicateEventCard() {
  const { selectedEventId } = useEventContext();
  const { data } = useEventData({ includeTasks: false });
  if (!selectedEventId) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Run this event again</CardTitle>
      </CardHeader>
      <CardContent>
        <DuplicateEventForm key={selectedEventId} eventId={selectedEventId} defaultName={`${data.event.name} (copy)`} />
      </CardContent>
    </Card>
  );
}
