import { createContext, useContext, useEffect } from "react";

/**
 * The registry behind Event Settings' unsaved-changes tracking. The provider lives in settings-dirty.tsx; the
 * context and hooks are here so a card can import them without a file that mixes components with non-components.
 */

export type Registry = {
  report: (id: string, dirty: boolean) => void;
  dirtyIds: ReadonlySet<string>;
};

export const SettingsDirtyContext = createContext<Registry | null>(null);

/** A card says whether it is holding unsaved changes. Its entry is removed when it unmounts. */
export function useSettingsDirty(id: string, dirty: boolean) {
  const registry = useContext(SettingsDirtyContext);
  const report = registry?.report;
  useEffect(() => {
    report?.(id, dirty);
  }, [report, id, dirty]);
  useEffect(() => () => report?.(id, false), [report, id]);
}

export function useDirtyIds(): ReadonlySet<string> {
  return useContext(SettingsDirtyContext)?.dirtyIds ?? new Set();
}
