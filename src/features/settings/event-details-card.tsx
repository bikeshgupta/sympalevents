import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";
import { useEventContext } from "@/lib/event-context";
import { useEventData } from "@/lib/event-data";
import { usePageAccess } from "@/lib/page-access";

/**
 * What the event is: its name, venue, and when it starts and ends.
 *
 * Until this card existed nothing could change an event after it was created -
 * a mistyped date had no screen at all. Dates are `date` columns, so a start
 * and end *time* is a separate optional field beside each (migration 031);
 * leaving one blank means the whole day, which is what every event made before
 * times existed is.
 *
 * Times are read on the event's own clock (India time), the same clock the
 * schedule and the countdown use.
 *
 * Name, venue and dates save on any database. The two times need 031, and the
 * card says so up front rather than offering fields that cannot save.
 */

type Draft = {
  name: string;
  location: string;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
};

type SaveResult = { ok: true; changed: boolean; scheduleOutsideRange: number };

export function EventDetailsCard() {
  const { data } = useEventData({ includeTasks: false });
  const { selectedEventId } = useEventContext();
  const access = usePageAccess("settings");
  const queryClient = useQueryClient();

  const [draft, setDraft] = useState<Draft | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "warn" | "error"; text: string } | null>(null);

  const save = useMutation({
    mutationFn: (input: Draft) =>
      apiFetch<SaveResult>("/api/events?resource=details", {
        method: "PATCH",
        body: {
          eventId: selectedEventId,
          name: input.name,
          location: input.location,
          startDate: input.startDate,
          endDate: input.endDate,
          startTime: input.startTime || null,
          endTime: input.endTime || null,
        },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["event-data"] });
      queryClient.invalidateQueries({ queryKey: ["my-events"] });
      queryClient.invalidateQueries({ queryKey: ["society-home"] });
    },
  });

  if (!selectedEventId || !access.canEdit) return null;

  const event = data.event;
  const timesReady = Boolean(event.detailsReady);
  const stored: Draft = {
    name: event.name,
    location: event.location,
    startDate: event.startDate,
    startTime: event.startTime ?? "",
    endDate: event.endDate,
    endTime: event.endTime ?? "",
  };
  const value = draft ?? stored;
  const dirty = (Object.keys(stored) as (keyof Draft)[]).some((key) => value[key] !== stored[key]);

  // The same rules the server enforces, so the button explains itself instead
  // of the save failing. A blank start is the start of the day and a blank end
  // is the end of it.
  let problem: string | null = null;
  if (!value.name.trim()) problem = "An event needs a name.";
  else if (!value.startDate || !value.endDate) problem = "Pick both dates.";
  else if (value.endDate < value.startDate) problem = "The event cannot end before it starts.";
  else if (value.endDate === value.startDate && (value.endTime || "23:59") <= (value.startTime || "00:00")) {
    problem = "On a one-day event the end time has to be after the start time.";
  }

  function change(key: keyof Draft, next: string) {
    setMessage(null);
    setDraft({ ...value, [key]: next });
  }

  async function submit(formEvent: FormEvent) {
    formEvent.preventDefault();
    if (problem || !dirty) return;
    setMessage(null);
    try {
      const result = await save.mutateAsync(value);
      setDraft(null);
      if (result.scheduleOutsideRange > 0) {
        setMessage({
          tone: "warn",
          text: `Saved. ${result.scheduleOutsideRange} scheduled ${
            result.scheduleOutsideRange === 1 ? "item now falls" : "items now fall"
          } outside these dates. Nothing was moved - open Events to change them.`,
        });
      } else {
        setMessage({ tone: "ok", text: "Saved." });
      }
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "Could not save these details" });
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Event details</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="space-y-4">
          {!timesReady ? (
            <p className="rounded-md bg-amber-100 p-3 text-sm text-amber-900">
              Start and end times need <code className="break-all font-mono">supabase/migrations/031_event_details.sql</code>.
              Until it is run, name, venue and dates still save.
            </p>
          ) : null}

          <div className="space-y-1.5">
            <label className="block text-sm font-medium" htmlFor="event-name">
              Name
            </label>
            <Input
              id="event-name"
              value={value.name}
              onChange={(item) => change("name", item.target.value)}
              maxLength={120}
              autoComplete="off"
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-sm font-medium" htmlFor="event-venue">
              Venue
            </label>
            <Input
              id="event-venue"
              value={value.location}
              onChange={(item) => change("location", item.target.value)}
              maxLength={160}
              autoComplete="off"
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="block text-sm font-medium" htmlFor="event-start-date">
                Starts on
              </label>
              <Input
                id="event-start-date"
                type="date"
                value={value.startDate}
                onChange={(item) => change("startDate", item.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <label className="block text-sm font-medium" htmlFor="event-start-time">
                Start time <span className="font-normal text-muted-foreground">(optional)</span>
              </label>
              <Input
                id="event-start-time"
                type="time"
                value={value.startTime}
                disabled={!timesReady}
                onChange={(item) => change("startTime", item.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <label className="block text-sm font-medium" htmlFor="event-end-date">
                Ends on
              </label>
              <Input
                id="event-end-date"
                type="date"
                value={value.endDate}
                min={value.startDate || undefined}
                onChange={(item) => change("endDate", item.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <label className="block text-sm font-medium" htmlFor="event-end-time">
                End time <span className="font-normal text-muted-foreground">(optional)</span>
              </label>
              <Input
                id="event-end-time"
                type="time"
                value={value.endTime}
                disabled={!timesReady}
                onChange={(item) => change("endTime", item.target.value)}
              />
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            Times are India time. Leave a time blank for the whole day &mdash; the event then starts at the
            beginning of its first day and ends at the close of its last.
          </p>

          {dirty && problem ? (
            <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {problem}
            </p>
          ) : null}

          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" size="sm" disabled={save.isPending || !dirty || Boolean(problem)}>
              {save.isPending ? "Saving..." : "Save details"}
            </Button>
            {dirty ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={save.isPending}
                onClick={() => {
                  setDraft(null);
                  setMessage(null);
                }}
              >
                Discard changes
              </Button>
            ) : null}
          </div>

          {message ? (
            <p
              role={message.tone === "error" ? "alert" : "status"}
              className={
                message.tone === "error"
                  ? "rounded-md bg-destructive/10 p-3 text-sm text-destructive"
                  : message.tone === "warn"
                    ? "rounded-md bg-amber-100 p-3 text-sm text-amber-900"
                    : "text-sm text-muted-foreground"
              }
            >
              {message.text}
            </p>
          ) : null}
        </form>
      </CardContent>
    </Card>
  );
}
