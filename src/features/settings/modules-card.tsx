import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useEventContext } from "@/lib/event-context";
import { useEventPath } from "@/lib/event-path";
import { ModuleEditor, type ModuleDraft } from "@/features/settings/module-editor";
import { useSettingsDirty } from "@/features/settings/settings-dirty-state";
import { usePageVisibility } from "@/lib/page-access";

/**
 * What this event has, what it calls each thing, and who can open it.
 *
 * This is the Page Visibility card grown up. It sits in the same place and
 * still answers the same question for every module, plus the two migration 024
 * added: whether this event has the module at all, and what the committee
 * calls it. A sports meet has no Prasad - that is not "Prasad, restricted",
 * it is a module nobody turned on, and it should not appear in the nav or in
 * Member Access either.
 *
 * The editor itself is shared with the create-event wizard, so the switches
 * somebody saw when they made the event are the switches they come back to.
 */
export function ModulesCard() {
  const { selectedEventId } = useEventContext();
  const eventPath = useEventPath();
  const { query, saveModules } = usePageVisibility();
  const [draft, setDraft] = useState<ModuleDraft[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const stored = query.data?.modules;
  // The server's list is the baseline; the draft only exists once the admin
  // has actually changed something, so a refetch never stomps on typing.
  const current: ModuleDraft[] | null =
    draft ??
    (stored
      ? stored.map((module) => ({
          pageKey: module.pageKey,
          isEnabled: module.isEnabled,
          visibility: module.visibility,
          labelOverride: module.labelOverride,
        }))
      : null);

  useSettingsDirty("modules", draft !== null);

  const offCount = current?.filter((module) => !module.isEnabled).length ?? 0;

  async function handleSave() {
    if (!current || !selectedEventId) return;
    setMessage("Saving modules...");
    try {
      await saveModules.mutateAsync(current);
      setDraft(null);
      setMessage("Modules saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to save modules");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Modules</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Turn a module off and it leaves the nav, Member Access and the address bar for this event. Rename one to what
          your committee actually calls it. Editing is never widened here - it still comes from the role and the
          per-member grants in Member Access.
        </p>

        {query.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading modules...</p>
        ) : !current ? (
          <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            Modules could not be loaded. Check that migration 015_event_page_visibility.sql has been run.
          </p>
        ) : (
          <>
            <ModuleEditor flat modules={current} onChange={setDraft} disabled={saveModules.isPending} />

            <div className="flex flex-col gap-2 text-xs text-muted-foreground">
              <p>
                <span className="font-medium text-foreground">Settings</span> is always admin-only and cannot be opened
                up - it is the screen that controls all the others.
              </p>
              <p>
                A page set to <span className="font-medium text-foreground">Anyone with the link</span> is genuinely
                public. Keep contact details and payment references off those pages.
              </p>
              {offCount ? (
                <p>
                  {offCount} module{offCount === 1 ? " is" : "s are"} off. Nothing they hold is deleted - turning one
                  back on brings its records with it.
                </p>
              ) : null}
            </div>

            {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={() => void handleSave()} disabled={!draft || saveModules.isPending}>
                {saveModules.isPending ? "Saving..." : "Save Modules"}
              </Button>
              <Button type="button" variant="outline" asChild>
                <Link to={eventPath("/customise-dashboard")}>Arrange the dashboard</Link>
              </Button>
              <Button type="button" variant="outline" onClick={() => setDraft(null)} disabled={!draft}>
                Reset
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

