import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FormEvent, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiFetch } from "@/lib/api";
import { useEventContext } from "@/lib/event-context";
import { useEventData } from "@/lib/event-data";
import { usePageAccess } from "@/lib/page-access";
import { useSettingsDirty } from "@/features/settings/settings-dirty-state";

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

/**
 * Which fields this instance owns. The Settings sections show the name on its own (Basics) and the venue, dates and
 * hours together (Schedule & location); each sends only its own fields, which the details route has always accepted
 * (every field is optional there). Without a `part` the card is the whole form, exactly as before.
 */
export type DetailsPart = "all" | "basics" | "schedule";

const partKeys: Record<DetailsPart, (keyof Draft)[]> = {
  all: ["name", "location", "startDate", "startTime", "endDate", "endTime"],
  basics: ["name"],
  schedule: ["location", "startDate", "startTime", "endDate", "endTime"],
};

const partTitles: Record<DetailsPart, string> = {
  all: "Event details",
  basics: "Event name",
  schedule: "Venue, dates and hours",
};

const fieldInput =
  "min-w-0 flex-1 bg-transparent py-2 text-right text-base text-foreground outline-none placeholder:text-muted-foreground/70 focus-visible:rounded-md focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";

function FieldRow({ id, label, hint, children }: { id: string; label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex min-h-[3.25rem] items-center gap-3 px-4">
      <label htmlFor={id} className="w-28 shrink-0 text-base">
        {label}
        {hint ? <span className="block text-xs text-muted-foreground">{hint}</span> : null}
      </label>
      {children}
    </div>
  );
}

export function EventDetailsCard({ part = "all" }: { part?: DetailsPart }) {
  const { data } = useEventData({ includeTasks: false });
  const { selectedEventId } = useEventContext();
  const access = usePageAccess("settings");
  const queryClient = useQueryClient();

  const [draft, setDraft] = useState<Draft | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "warn" | "error"; text: string } | null>(null);

  const owns = (key: keyof Draft) => partKeys[part].includes(key);

  const save = useMutation({
    mutationFn: (input: Draft) =>
      apiFetch<SaveResult>("/api/events?resource=details", {
        method: "PATCH",
        body: {
          eventId: selectedEventId,
          ...(owns("name") ? { name: input.name } : {}),
          ...(owns("location") ? { location: input.location } : {}),
          ...(owns("startDate") ? { startDate: input.startDate } : {}),
          ...(owns("endDate") ? { endDate: input.endDate } : {}),
          ...(owns("startTime") ? { startTime: input.startTime || null } : {}),
          ...(owns("endTime") ? { endTime: input.endTime || null } : {}),
        },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["event-data"] });
      queryClient.invalidateQueries({ queryKey: ["my-events"] });
      queryClient.invalidateQueries({ queryKey: ["society-home"] });
      // The readiness line on the Settings index reads the command centre's checklist, which this may have settled.
      queryClient.invalidateQueries({ queryKey: ["command-centre"] });
    },
  });

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
  const dirty = partKeys[part].some((key) => value[key] !== stored[key]);
  useSettingsDirty(`details:${part}`, dirty);

  if (!selectedEventId || !access.canEdit) return null;

  // The same rules the server enforces, so the button explains itself instead
  // of the save failing. A blank start is the start of the day and a blank end
  // is the end of it.
  let problem: string | null = null;
  if (owns("name") && !value.name.trim()) problem = "An event needs a name.";
  else if (!owns("startDate")) problem = null;
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
        <CardTitle>{partTitles[part]}</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="space-y-4">
          {!timesReady && owns("startTime") ? (
            <p className="rounded-md bg-amber-100 p-3 text-sm text-amber-900">
              Start and end times need <code className="break-all font-mono">supabase/migrations/031_event_details.sql</code>.
              Until it is run, name, venue and dates still save.
            </p>
          ) : null}

          {/* Rows, as in iOS Settings: the label on the left, the value you type on the right, a hairline between. */}
          <div className="ios-list -mx-4 -my-1" style={{ ["--ios-inset" as string]: "1rem" }}>
            {owns("name") ? (
              <FieldRow id="event-name" label="Name">
                <input
                  id="event-name"
                  className={fieldInput}
                  value={value.name}
                  onChange={(item) => change("name", item.target.value)}
                  maxLength={120}
                  autoComplete="off"
                  placeholder="Event name"
                />
              </FieldRow>
            ) : null}
            {owns("location") ? (
              <FieldRow id="event-venue" label="Venue">
                <input
                  id="event-venue"
                  className={fieldInput}
                  value={value.location}
                  onChange={(item) => change("location", item.target.value)}
                  maxLength={160}
                  autoComplete="off"
                  placeholder="Add the venue"
                />
              </FieldRow>
            ) : null}
            {owns("startDate") ? (
              <>
                <FieldRow id="event-start-date" label="Starts on">
                  <input
                    id="event-start-date"
                    className={fieldInput}
                    type="date"
                    value={value.startDate}
                    onChange={(item) => change("startDate", item.target.value)}
                  />
                </FieldRow>
                <FieldRow id="event-start-time" label="Start time" hint="optional">
                  <input
                    id="event-start-time"
                    className={fieldInput}
                    type="time"
                    value={value.startTime}
                    disabled={!timesReady}
                    onChange={(item) => change("startTime", item.target.value)}
                  />
                </FieldRow>
                <FieldRow id="event-end-date" label="Ends on">
                  <input
                    id="event-end-date"
                    className={fieldInput}
                    type="date"
                    value={value.endDate}
                    min={value.startDate || undefined}
                    onChange={(item) => change("endDate", item.target.value)}
                  />
                </FieldRow>
                <FieldRow id="event-end-time" label="End time" hint="optional">
                  <input
                    id="event-end-time"
                    className={fieldInput}
                    type="time"
                    value={value.endTime}
                    disabled={!timesReady}
                    onChange={(item) => change("endTime", item.target.value)}
                  />
                </FieldRow>
              </>
            ) : null}
          </div>

          {owns("startDate") ? (
            <p className="text-xs text-muted-foreground">
              Times are India time. Leave a time blank for the whole day &mdash; the event then starts at the
              beginning of its first day and ends at the close of its last.
            </p>
          ) : null}

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
