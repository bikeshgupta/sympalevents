import { Copy, ExternalLink, RotateCcw, Share2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatEventDate, formatEventTime } from "@/features/dashboard/dashboard-utils";
import { useCommunications } from "@/lib/communications";
import { useEventContext } from "@/lib/event-context";
import { useEventData } from "@/lib/event-data";
import { useEventPath } from "@/lib/event-path";
import { buildMessage, hasPlaceholder, messageTemplates, type TemplateKey } from "@/lib/message-templates";
import { cn } from "@/lib/utils";

/**
 * Write a message once, copy it into WhatsApp.
 *
 * Nothing is sent from here and the page says so: residents are in a WhatsApp
 * group already, and sending to them directly would need consent and opt-out
 * handling this app does not have. What it does is take the retyping out - the
 * date, venue, link and payment instructions come from the event - and keep a
 * record that the message was prepared, for whom, and by whom.
 *
 * The message never names a recipient. The audience is who to paste it to; the
 * flat numbers behind it are for an organiser's own follow-up, shown here and
 * never put in the text.
 */

const selectClass = "h-10 w-full rounded-md border border-input bg-background px-3 text-sm";

const templateLabel = (key: string) => messageTemplates.find((item) => item.key === key)?.label ?? key;

function ago(iso: string) {
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" }).format(new Date(iso));
}

export function CommunicationsPage() {
  const { selectedEventId } = useEventContext();
  const { data: eventData } = useEventData({ includeTasks: false });
  const path = useEventPath();
  const { query, record } = useCommunications(selectedEventId);
  const data = query.data;
  const event = eventData.event;

  const [template, setTemplate] = useState<TemplateKey>("registration_reminder");
  const [audience, setAudience] = useState("everyone");
  const [body, setBody] = useState("");
  const [edited, setEdited] = useState(false);
  const [status, setStatus] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [showFlats, setShowFlats] = useState(false);

  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const generated = useMemo(
    () =>
      buildMessage(template, {
        eventName: event.name,
        when: event.startDate ? formatEventDate(event.startDate) : "",
        time: event.startTime ? formatEventTime(event.startTime) : "",
        venue: event.location,
        registerLink: `${origin}${path("/registration")}`,
        eventLink: `${origin}${path("/dashboard")}`,
        paymentInstructions: data?.context.paymentInstructions ?? "",
        deadline: data?.context.closesAt
          ? new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" }).format(new Date(data.context.closesAt))
          : "",
      }),
    [template, event.name, event.startDate, event.startTime, event.location, origin, path, data?.context],
  );

  // The text follows the template and the event until the organiser edits it;
  // after that their words are theirs, and only "Start again" replaces them.
  useEffect(() => {
    if (!edited) setBody(generated);
  }, [generated, edited]);

  const segment = data?.segments.find((item) => item.key === audience) ?? data?.segments[0];
  const unfinished = hasPlaceholder(body);

  function choose(next: TemplateKey) {
    setTemplate(next);
    setEdited(false);
    const wanted = messageTemplates.find((item) => item.key === next)?.defaultAudience ?? "everyone";
    // Only a segment this organiser can actually see is offered.
    setAudience(data?.segments.some((item) => item.key === wanted) ? wanted : "everyone");
    setStatus(null);
  }

  async function copy(channel: "copy" | "share") {
    if (!body.trim()) return;
    setStatus(null);
    try {
      if (channel === "share" && typeof navigator.share === "function") {
        await navigator.share({ text: body });
      } else {
        await navigator.clipboard.writeText(body);
      }
    } catch (error) {
      if ((error as Error).name === "AbortError") return;
      setStatus({ tone: "error", text: "Could not copy automatically. Select the text and copy it yourself." });
      return;
    }
    try {
      await record.mutateAsync({ template, audience: segment?.key ?? "everyone", body, channel });
      setStatus({ tone: "ok", text: channel === "share" ? "Shared. Recorded in recent messages." : "Copied. Paste it into your WhatsApp group." });
    } catch (error) {
      // The copy worked; only the record did not.
      setStatus({ tone: "ok", text: `Copied. (Not recorded: ${(error as Error).message})` });
    }
  }

  if (query.isLoading) return <p role="status">Loading…</p>;
  if (query.error || !data) {
    return (
      <p role="alert" className="rounded-md bg-destructive/10 p-4 text-sm text-destructive">
        {query.error instanceof Error ? query.error.message : "Could not load communications."}
      </p>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <header>
        <h1 className="text-2xl font-semibold sm:text-3xl">Communications</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Write the message once, then copy it into WhatsApp. Nothing is sent from here.
        </p>
      </header>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr] lg:items-start">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle>Create message</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div role="radiogroup" aria-label="Message type" className="flex flex-wrap gap-2">
              {messageTemplates.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  role="radio"
                  aria-checked={template === item.key}
                  title={item.hint}
                  onClick={() => choose(item.key)}
                  className={cn(
                    "min-h-10 rounded-full border px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    template === item.key ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted",
                  )}
                >
                  {item.label}
                </button>
              ))}
            </div>

            <div className="space-y-1.5">
              <label htmlFor="audience" className="text-sm font-medium">
                Who is it for?
              </label>
              <select id="audience" className={selectClass} value={segment?.key} onChange={(field) => setAudience(field.target.value)}>
                {data.segments.map((item) => (
                  <option key={item.key} value={item.key}>
                    {item.label}
                    {item.count !== null ? ` (${item.count} ${item.count === 1 ? "household" : "households"})` : ""}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">
                This tells you where to paste it. It is not written into the message, and no names or numbers are shared.
              </p>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <label htmlFor="message-body" className="text-sm font-medium">
                  Message
                </label>
                {edited ? (
                  <button
                    type="button"
                    onClick={() => setEdited(false)}
                    className="inline-flex min-h-10 items-center gap-1 text-xs font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                    Start again
                  </button>
                ) : null}
              </div>
              <textarea
                id="message-body"
                value={body}
                maxLength={4000}
                onChange={(field) => {
                  setBody(field.target.value);
                  setEdited(true);
                }}
                className="min-h-56 w-full rounded-md border border-input bg-background p-3 text-sm leading-relaxed outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              {unfinished ? (
                <p role="alert" className="rounded-md bg-amber-100 p-2.5 text-sm text-amber-900">
                  Replace the line in [square brackets] before you copy this.
                </p>
              ) : null}
            </div>

            <div className="flex flex-wrap gap-2">
              <Button type="button" className="h-11" disabled={!body.trim() || unfinished || record.isPending} onClick={() => void copy("copy")}>
                <Copy className="h-4 w-4" aria-hidden="true" />
                Copy for WhatsApp
              </Button>
              {typeof navigator !== "undefined" && typeof navigator.share === "function" ? (
                <Button type="button" variant="outline" className="h-11" disabled={!body.trim() || unfinished} onClick={() => void copy("share")}>
                  <Share2 className="h-4 w-4" aria-hidden="true" />
                  Share
                </Button>
              ) : null}
              <Button asChild type="button" variant="outline" className="h-11">
                <a href={`https://wa.me/?text=${encodeURIComponent(body)}`} target="_blank" rel="noreferrer" aria-disabled={!body.trim() || unfinished}>
                  <ExternalLink className="h-4 w-4" aria-hidden="true" />
                  Open WhatsApp
                </a>
              </Button>
            </div>

            {status ? (
              <p role={status.tone === "error" ? "alert" : "status"} className={cn("text-sm", status.tone === "error" ? "text-destructive" : "text-emerald-800")}>
                {status.text}
              </p>
            ) : null}

            {segment && segment.flats.length ? (
              <div className="rounded-md border p-3">
                <button
                  type="button"
                  aria-expanded={showFlats}
                  onClick={() => setShowFlats((value) => !value)}
                  className="min-h-10 text-sm font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {showFlats ? "Hide" : "Show"} the {segment.count} {segment.count === 1 ? "household" : "households"}
                </button>
                {showFlats ? (
                  <>
                    <p className="mt-1 text-xs text-muted-foreground">For following up personally. These are never put in the message.</p>
                    <ul className="mt-2 flex flex-wrap gap-1.5">
                      {segment.flats.map((flat) => (
                        <li key={flat} className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium tabular-nums">
                          {flat}
                        </li>
                      ))}
                    </ul>
                  </>
                ) : null}
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle>Recent messages</CardTitle>
            <p className="text-sm text-muted-foreground">Recorded when you copy or share. Not a delivery receipt.</p>
          </CardHeader>
          <CardContent>
            {!data.historyReady ? (
              <p className="rounded-md bg-amber-100 p-3 text-sm text-amber-900">
                Recording messages needs migration 038. You can still write and copy them.
              </p>
            ) : data.history.length ? (
              <ul className="divide-y">
                {data.history.map((item) => (
                  <li key={item.id} className="py-3 first:pt-0 last:pb-0">
                    <p className="text-sm font-medium">{templateLabel(item.template)}</p>
                    <p className="text-xs text-muted-foreground">
                      {data.segments.find((segment) => segment.key === item.audience)?.label ?? item.audience}
                      {item.audience !== "everyone" ? ` · ${item.audienceCount} ${item.audienceCount === 1 ? "household" : "households"}` : ""}
                    </p>
                    <p className="text-xs text-muted-foreground tabular-nums">
                      {ago(item.createdAt)}
                      {item.by ? ` · ${item.by}` : ""}
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setBody(item.body);
                        setEdited(true);
                        window.scrollTo({ top: 0, behavior: "smooth" });
                      }}
                      className="mt-1 min-h-10 text-xs font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      Use this text again
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">Nothing yet. Messages you copy will appear here.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
