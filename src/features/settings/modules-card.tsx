import { useState } from "react";
import { LayoutDashboard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEventContext } from "@/lib/event-context";
import { useEventPath } from "@/lib/event-path";
import { ListGroup, ListRow } from "@/features/settings/ios-list";
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
    <div>
      <p className="mb-3 px-4 text-[13px] leading-snug text-muted-foreground">
        Turn a module off and it leaves the nav, Member Access and the address bar for this event. Tap a module to rename
        it to what your committee actually calls it, choose who can open it, or move it in the menu. Editing is never
        widened here - it still comes from the role and the per-member grants in Team &amp; permissions.
      </p>

      {query.isLoading ? (
        <p className="px-4 text-sm text-muted-foreground">Loading modules...</p>
      ) : !current ? (
        <p className="rounded-2xl bg-destructive/10 p-3 text-sm text-destructive">
          Modules could not be loaded. Check that migration 015_event_page_visibility.sql has been run.
        </p>
      ) : (
        <>
          <ModuleEditor ios modules={current} onChange={setDraft} disabled={saveModules.isPending} />

          <div className="mt-4 space-y-1.5 px-4 text-[13px] leading-snug text-muted-foreground">
            <p>
              <span className="font-medium text-foreground">Settings</span> is always admin-only and cannot be opened up
              - it is the screen that controls all the others.
            </p>
            <p>
              A page set to <span className="font-medium text-foreground">Anyone with the link</span> is genuinely public.
              Keep contact details and payment references off those pages.
            </p>
            {offCount ? (
              <p>
                {offCount} module{offCount === 1 ? " is" : "s are"} off. Nothing they hold is deleted - turning one back
                on brings its records with it.
              </p>
            ) : null}
          </div>

          {message ? <p className="mt-3 px-4 text-sm text-muted-foreground">{message}</p> : null}
          <div className="mt-4 flex flex-wrap gap-2 px-1">
            <Button type="button" className="h-11 rounded-2xl" onClick={() => void handleSave()} disabled={!draft || saveModules.isPending}>
              {saveModules.isPending ? "Saving..." : "Save modules"}
            </Button>
            <Button type="button" variant="outline" className="h-11 rounded-2xl" onClick={() => setDraft(null)} disabled={!draft}>
              Reset
            </Button>
          </div>
          <ListGroup>
            <ListRow icon={LayoutDashboard} title="Arrange the dashboard" href={eventPath("/customise-dashboard")} />
          </ListGroup>
        </>
      )}
    </div>
  );
}
