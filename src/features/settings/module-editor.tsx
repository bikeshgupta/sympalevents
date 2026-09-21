import { Check } from "lucide-react";
import { moduleGroups } from "@/data/event-templates";
import { Input } from "@/components/ui/input";
import {
  committeeOpenPageKeys,
  pageLabels,
  signInOnlyPageKeys,
  visibilityHints,
  visibilityLabels,
  visibilityOptionsFor,
  type PageVisibility,
} from "@/lib/page-access";
import { cn } from "@/lib/utils";

/**
 * The one control for "what does this event have, what is it called, and who
 * may look at it".
 *
 * It is shared by the create-event wizard and Settings deliberately: the
 * promise made on the wizard's third step is that the same switches are there
 * afterwards, and two components drifting apart would quietly break it.
 *
 * The dashboard is always on - it is where every route lands - so it gets the
 * visibility control without the switch.
 */

export type ModuleDraft = {
  pageKey: string;
  isEnabled: boolean;
  visibility: PageVisibility;
  labelOverride: string | null;
};

const alwaysOnPageKeys = new Set(["dashboard"]);

export function ModuleEditor({
  modules,
  onChange,
  disabled = false,
}: {
  modules: ModuleDraft[];
  onChange: (modules: ModuleDraft[]) => void;
  disabled?: boolean;
}) {
  const byKey = new Map(modules.map((module) => [module.pageKey, module]));

  function update(pageKey: string, patch: Partial<ModuleDraft>) {
    onChange(modules.map((module) => (module.pageKey === pageKey ? { ...module, ...patch } : module)));
  }

  return (
    <div className="space-y-5">
      {moduleGroups.map((group) => {
        const rows = group.pageKeys.map((pageKey) => byKey.get(pageKey)).filter(Boolean) as ModuleDraft[];
        if (!rows.length) return null;

        return (
          <section key={group.title}>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{group.title}</h3>
            <div className="overflow-hidden rounded-md border">
              <div className="divide-y">
                {rows.map((module) => (
                  <ModuleRow
                    key={module.pageKey}
                    module={module}
                    disabled={disabled}
                    onChange={(patch) => update(module.pageKey, patch)}
                  />
                ))}
              </div>
            </div>
          </section>
        );
      })}
    </div>
  );
}

function ModuleRow({
  module,
  disabled,
  onChange,
}: {
  module: ModuleDraft;
  disabled: boolean;
  onChange: (patch: Partial<ModuleDraft>) => void;
}) {
  const defaultLabel = pageLabels[module.pageKey] ?? module.pageKey;
  const alwaysOn = alwaysOnPageKeys.has(module.pageKey);
  const off = !module.isEnabled && !alwaysOn;

  return (
    <div className={cn("px-3 py-3", off && "bg-muted/40")}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-4">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          {alwaysOn ? (
            <span
              className="mt-0.5 flex h-6 w-11 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary"
              aria-hidden
            >
              <Check className="h-3.5 w-3.5" />
            </span>
          ) : (
            <button
              type="button"
              role="switch"
              aria-checked={module.isEnabled}
              aria-label={`${defaultLabel} module`}
              disabled={disabled}
              onClick={() => onChange({ isEnabled: !module.isEnabled })}
              className={cn(
                "mt-0.5 flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50",
                module.isEnabled ? "justify-end bg-primary" : "justify-start bg-muted-foreground/30",
              )}
            >
              <span className="h-5 w-5 rounded-full bg-card shadow-sm" />
            </button>
          )}

          <div className="min-w-0">
            <p className={cn("text-sm font-medium", off && "text-muted-foreground")}>
              {defaultLabel}
              {alwaysOn ? <span className="ml-2 text-xs font-normal text-muted-foreground">Always on</span> : null}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {off ? (
                "Off. It is hidden from the nav, from Member Access, and from anyone who tries the address directly."
              ) : (
                <>
                  {signInOnlyPageKeys.has(module.pageKey)
                    ? `Always needs a sign-in. ${visibilityHints[module.visibility]}`
                    : visibilityHints[module.visibility]}
                  {committeeOpenPageKeys.has(module.pageKey) && module.visibility === "restricted"
                    ? " Committee members can still open it to add their own expenses and see only those."
                    : null}
                </>
              )}
            </p>
          </div>
        </div>

        {off ? null : (
          <div className="flex shrink-0 flex-col gap-2 sm:w-72">
            <label className="sr-only" htmlFor={`label-${module.pageKey}`}>
              What this event calls {defaultLabel}
            </label>
            <Input
              id={`label-${module.pageKey}`}
              value={module.labelOverride ?? ""}
              placeholder={`Called "${defaultLabel}"`}
              disabled={disabled}
              maxLength={28}
              onChange={(field) => onChange({ labelOverride: field.target.value || null })}
            />
            <select
              aria-label={`Who can see ${defaultLabel}`}
              className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              value={module.visibility}
              disabled={disabled}
              onChange={(field) => onChange({ visibility: field.target.value as PageVisibility })}
            >
              {visibilityOptionsFor(module.pageKey).map((level) => (
                <option key={level} value={level}>
                  {visibilityLabels[level]}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
    </div>
  );
}
