import { ArrowDown, ArrowUp, Eye, EyeOff, Lock, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useSaveDashboardLayout } from "@/lib/dashboard-layout";
import { useEventContext } from "@/lib/event-context";
import { useEventClosing } from "@/lib/closing";
import { useEventData } from "@/lib/event-data";
import { usePageAccess } from "@/lib/page-access";
import { cn } from "@/lib/utils";
import { normaliseLayout, widgetByKey, type LayoutEntry, type WidgetVariant } from "@/lib/widgets";

/**
 * Arranging the dashboard: what is on it, in what order, and how much of each.
 *
 * Reordering is up and down buttons rather than drag-and-drop, the same call
 * `CreditsDialog` made for the committee list - dragging a row is close to
 * unusable on a phone, which is where most of this app is read.
 *
 * Nothing here is destructive. A widget switched off keeps everything behind
 * it; it is simply not on the page. "Reset to default" stores nothing at all
 * rather than a copy of today's defaults, so an event picks up a better
 * default from a later release instead of being frozen to this one.
 */
export function CustomiseDashboardPage() {
  const { data } = useEventData({ includeTasks: false });
  const { selectedEventId } = useEventContext();
  const access = usePageAccess("dashboard");
  const closing = useEventClosing(data.event.id);
  const save = useSaveDashboardLayout(selectedEventId);

  const isClosed = Boolean(closing.data?.closing.is_closed);
  const stored = useMemo(
    () => normaliseLayout(data.event.dashboardLayout, isClosed),
    [data.event.dashboardLayout, isClosed],
  );

  const [draft, setDraft] = useState<LayoutEntry[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const layout = draft ?? stored;

  const placed = layout.filter((entry) => entry.isVisible);
  const available = layout.filter((entry) => !entry.isVisible);

  function update(next: LayoutEntry[]) {
    setDraft(next);
    setMessage(null);
  }

  /** Move within the placed widgets, not within the whole array - the hidden
   *  ones live in the same list and would otherwise swallow a press. */
  function move(key: string, direction: -1 | 1) {
    const order = placed.map((entry) => entry.key);
    const at = order.indexOf(key);
    const to = at + direction;
    if (at < 0 || to < 0 || to >= order.length) return;
    [order[at], order[to]] = [order[to], order[at]];

    const byKey = new Map(layout.map((entry) => [entry.key, entry]));
    update([...order.map((k) => byKey.get(k)!), ...available]);
  }

  function setVisible(key: string, isVisible: boolean) {
    update(layout.map((entry) => (entry.key === key ? { ...entry, isVisible } : entry)));
  }

  function setVariant(key: string, variant: WidgetVariant) {
    update(layout.map((entry) => (entry.key === key ? { ...entry, variant } : entry)));
  }

  async function handleSave() {
    setMessage("Saving...");
    try {
      await save.mutateAsync(layout);
      setDraft(null);
      setMessage("Dashboard saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save the dashboard");
    }
  }

  async function handleReset() {
    if (!window.confirm("Put the dashboard back to its default arrangement?")) return;
    setMessage("Resetting...");
    try {
      await save.mutateAsync(null);
      setDraft(null);
      setMessage("Back to the default arrangement.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not reset the dashboard");
    }
  }

  if (!access.canEdit) {
    return (
      <div className="space-y-3">
        <h2 className="text-2xl font-semibold">Customise dashboard</h2>
        <p className="text-sm text-muted-foreground">
          Arranging the dashboard is an admin's job. You have view-only access to this event.
        </p>
        <Button variant="outline" asChild>
          <Link to="/dashboard">Back to the dashboard</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Customise dashboard</h2>
          <p className="text-sm text-muted-foreground">
            What everybody sees when they open this event, and in what order.
          </p>
        </div>
        <Button variant="outline" onClick={() => void handleReset()} disabled={save.isPending}>
          Reset to default
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle>On the dashboard</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {placed.map((entry, index) => {
            const widget = widgetByKey.get(entry.key);
            if (!widget) return null;
            return (
              <div
                key={entry.key}
                className="flex flex-col gap-3 rounded-md border p-3 sm:flex-row sm:items-center sm:gap-4"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{widget.title}</p>
                  <p className="text-xs text-muted-foreground">{widget.description}</p>
                </div>

                <div className="flex items-center gap-2">
                  {widget.variants.length > 1 ? (
                    <select
                      aria-label={`How much of ${widget.title} to show`}
                      className="h-10 rounded-md border bg-background px-2 text-sm"
                      value={entry.variant}
                      onChange={(field) => setVariant(entry.key, field.target.value as WidgetVariant)}
                    >
                      <option value="basic">Short</option>
                      <option value="detailed">Full</option>
                    </select>
                  ) : null}

                  <Button
                    variant="outline"
                    size="sm"
                    aria-label={`Move ${widget.title} up`}
                    disabled={index === 0}
                    onClick={() => move(entry.key, -1)}
                  >
                    <ArrowUp className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    aria-label={`Move ${widget.title} down`}
                    disabled={index === placed.length - 1}
                    onClick={() => move(entry.key, 1)}
                  >
                    <ArrowDown className="h-4 w-4" />
                  </Button>

                  {widget.required ? (
                    <span
                      className="inline-flex h-9 items-center gap-1.5 rounded-md bg-muted px-2.5 text-xs text-muted-foreground"
                      title="The dashboard needs a hero - it is what a shared link opens on."
                    >
                      <Lock className="h-3.5 w-3.5" aria-hidden />
                      Always on
                    </span>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      aria-label={`Take ${widget.title} off the dashboard`}
                      onClick={() => setVisible(entry.key, false)}
                    >
                      <EyeOff className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle>Not on it</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {!available.length ? (
            <p className="text-sm text-muted-foreground">Every widget is on the dashboard.</p>
          ) : (
            available.map((entry) => {
              const widget = widgetByKey.get(entry.key);
              if (!widget) return null;
              return (
                <div
                  key={entry.key}
                  className={cn(
                    "flex flex-col gap-3 rounded-md border bg-muted/40 p-3",
                    "sm:flex-row sm:items-center sm:gap-4",
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-muted-foreground">{widget.title}</p>
                    <p className="text-xs text-muted-foreground">{widget.description}</p>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => setVisible(entry.key, true)}>
                    <Plus className="h-4 w-4" />
                    Add
                  </Button>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      <div className="rounded-md border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
        <p>
          A widget that belongs to a module you have switched off never appears, whatever it says here - the auctions
          strip goes with the Auctions page, the photographs with Closing.
        </p>
        <p className="mt-1.5">
          Nothing is deleted by taking a widget off. Its records stay exactly where they are.
        </p>
      </div>

      {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => void handleSave()} disabled={!draft || save.isPending}>
          {save.isPending ? "Saving..." : "Save dashboard"}
        </Button>
        <Button variant="outline" onClick={() => setDraft(null)} disabled={!draft}>
          Discard changes
        </Button>
        <Button variant="outline" asChild>
          <Link to="/dashboard">
            <Eye className="h-4 w-4" />
            View dashboard
          </Link>
        </Button>
      </div>
    </div>
  );
}
