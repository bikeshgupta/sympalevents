import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { SettingsDirtyContext } from "@/features/settings/settings-dirty-state";

/**
 * Which parts of Event Settings hold changes that have not been saved.
 *
 * Every settings card keeps its own draft and its own Save (that is how they have always worked, and the redesign
 * does not change it), so nothing above them can know whether somebody has typed something. A card tells the shell
 * with `useSettingsDirty(id, dirty)` (settings-dirty-state.ts); the shell uses it for the "Unsaved" marker on a section and to warn before the
 * page is left. Outside the provider the hook does nothing, so a card rendered anywhere else behaves as before.
 *
 * The router is a plain BrowserRouter (no data router), so react-router's `useBlocker` is not available. The guard
 * instead covers what actually loses a draft: closing or reloading the tab (`beforeunload`) and following a link
 * out of Settings (a capture-phase click check on same-origin anchors). The browser's Back button is not covered.
 */

const leaveWarning = "You have changes that are not saved. Leave this page and they are lost.";

export function SettingsDirtyProvider({ children }: { children: ReactNode }) {
  const [dirtyIds, setDirtyIds] = useState<ReadonlySet<string>>(new Set());
  const dirtyRef = useRef(false);

  const report = useCallback((id: string, dirty: boolean) => {
    setDirtyIds((current) => {
      if (current.has(id) === dirty) return current;
      const next = new Set(current);
      if (dirty) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  dirtyRef.current = dirtyIds.size > 0;

  useEffect(() => {
    function beforeUnload(event: BeforeUnloadEvent) {
      if (!dirtyRef.current) return;
      event.preventDefault();
      // Browsers show their own words; setting returnValue is what asks them to show the prompt at all.
      event.returnValue = leaveWarning;
    }

    function linkClick(event: MouseEvent) {
      if (!dirtyRef.current || event.defaultPrevented) return;
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      const url = new URL(anchor.href, window.location.href);
      // A move within Settings itself (another section, the index) keeps every draft: they all stay mounted.
      if (url.origin === window.location.origin && url.pathname === window.location.pathname) return;
      if (!window.confirm(leaveWarning)) {
        event.preventDefault();
        event.stopPropagation();
      }
    }

    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", linkClick, true);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("click", linkClick, true);
    };
  }, []);

  const value = useMemo(() => ({ report, dirtyIds }), [report, dirtyIds]);
  return <SettingsDirtyContext.Provider value={value}>{children}</SettingsDirtyContext.Provider>;
}
