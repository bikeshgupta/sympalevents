import { CalendarPlus, ExternalLink, MapPin, Share2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { AppEvent } from "@/lib/event-data";
import { buildIcs, downloadIcs, googleCalendarUrl, type CalendarEntry } from "@/lib/calendar";
import { describeEventHours } from "@/lib/event-hours";
import { mapsSearchUrl } from "@/lib/good-to-know";
import { shareLink } from "@/lib/share";

/**
 * Where, when, how to get there - and whatever the organisers have said.
 *
 * Always has something to show: the venue, the dates and the hours come from
 * the event itself, so a committee that has written nothing still gives a
 * resident the basics and the three buttons people actually use (directions,
 * add to calendar, share). The organisers' own entries - parking, what to bring,
 * who to ask - sit under that when they exist.
 *
 * The calendar entry is the app's only honest reminder: there is no push
 * channel, and a calendar alert is one that really does buzz a phone.
 */
export function GoodToKnowCard({ event }: { event: AppEvent }) {
  const [note, setNote] = useState<string | null>(null);
  const info = event.goodToKnow;
  const hours = describeEventHours(event);

  const entry: CalendarEntry = {
    title: event.name,
    startDate: event.startDate,
    endDate: event.endDate,
    startTime: event.startTime,
    endTime: event.endTime,
    location: event.location,
    description: info?.items.length ? info.items.map((item) => `${item.title}: ${item.text}`).join("\n") : undefined,
    url: typeof window === "undefined" ? undefined : window.location.href.split("#")[0],
    alarmMinutes: 60,
  };

  async function share() {
    const outcome = await shareLink({
      title: event.name,
      text: `${event.name} · ${event.dates}${event.location ? ` · ${event.location}` : ""}`,
      url: entry.url ?? "",
    });
    setNote(outcome === "copied" ? "Link copied. Paste it into your group." : outcome === "failed" ? "Could not share. Copy the address from your browser." : null);
  }

  const directions = info?.directionsUrl ?? (event.location ? mapsSearchUrl(event.location) : null);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle>Good to know</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <p className="text-sm font-semibold leading-snug">{event.location || "Venue to be announced"}</p>
          <p className="text-sm text-muted-foreground">
            {event.dates}
            {hours ? ` · ${hours}` : ""}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {directions ? (
            <Button asChild variant="outline" className="h-11">
              <a href={directions} target="_blank" rel="noreferrer">
                <MapPin className="h-4 w-4" aria-hidden="true" />
                Directions
              </a>
            </Button>
          ) : null}
          <Button type="button" variant="outline" className="h-11" onClick={() => downloadIcs(event.name, buildIcs([entry]))}>
            <CalendarPlus className="h-4 w-4" aria-hidden="true" />
            Add to calendar
          </Button>
          <Button type="button" variant="outline" className="h-11" onClick={() => void share()}>
            <Share2 className="h-4 w-4" aria-hidden="true" />
            Share
          </Button>
        </div>
        <p className="-mt-2 text-xs text-muted-foreground">
          Or{" "}
          <a href={googleCalendarUrl(entry)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 font-medium text-primary underline-offset-2 hover:underline">
            open in Google Calendar
            <ExternalLink className="h-3 w-3" aria-hidden="true" />
          </a>
          . Your calendar will remind you an hour before.
        </p>
        {note ? (
          <p role="status" className="text-sm text-muted-foreground">
            {note}
          </p>
        ) : null}

        {info?.items.length ? (
          <dl className="divide-y rounded-md border">
            {info.items.map((item) => (
              <div key={item.title} className="p-3">
                <dt className="text-sm font-semibold">{item.title}</dt>
                <dd className="mt-0.5 whitespace-pre-line text-sm leading-snug text-muted-foreground">{item.text}</dd>
              </div>
            ))}
          </dl>
        ) : null}
      </CardContent>
    </Card>
  );
}
