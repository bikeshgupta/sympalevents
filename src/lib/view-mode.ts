import { useCallback, useSyncExternalStore } from "react";
import { useSession } from "@/lib/auth";
import { useEventAccess } from "@/lib/event-access";
import { useEventContext } from "@/lib/event-context";
import { isEventOrganiser, resolveViewMode, type ViewMode } from "@/lib/resident-view";

/**
 * Which view of the event this person gets, and - for an organiser - the switch
 * that previews the resident's. The rules are in `resident-view.ts`.
 *
 * The preview choice is kept in `sessionStorage`, not `localStorage`: it is a
 * per-tab convenience, and one that outlives the tab would leave an organiser
 * wondering next week why they cannot see their own menu. Storage can throw
 * (private windows), so every access is wrapped and the choice falls back to
 * memory - it simply does not survive a refresh there.
 */

const KEY = "sympal:view-as-resident";
const listeners = new Set<() => void>();
let memory = false;

function read() {
  try {
    return window.sessionStorage.getItem(KEY) === "1";
  } catch {
    return memory;
  }
}

function write(value: boolean) {
  memory = value;
  try {
    if (value) window.sessionStorage.setItem(KEY, "1");
    else window.sessionStorage.removeItem(KEY);
  } catch {
    /* kept in memory above */
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useViewMode(): {
  mode: ViewMode;
  /** The access answer has not arrived yet, so the mode is not known. */
  isLoading: boolean;
  /** Has a role on this event, so may preview the resident's view. */
  isOrganiser: boolean;
  /** An organiser looking at what a resident sees. */
  isPreview: boolean;
  setPreview: (value: boolean) => void;
} {
  const { selectedEventId } = useEventContext();
  const { isLoading: sessionLoading } = useSession();
  const { data: access, isFetching } = useEventAccess();
  const stored = useSyncExternalStore(subscribe, read, () => false);

  const isOrganiser = isEventOrganiser(access);
  const hasEvent = Boolean(selectedEventId);
  // `useEventAccess` starts from an empty answer, which is also what a resident
  // looks like. Until the real one arrives - or the session it depends on has
  // resolved - guessing "resident" would flash the wrong menu at every
  // committee member on every load.
  const isLoading = hasEvent && (sessionLoading || (isFetching && access.pages.length === 0));

  const mode = resolveViewMode({ hasEvent, isOrganiser, previewing: stored });
  const setPreview = useCallback((value: boolean) => write(value), []);

  return { mode, isLoading, isOrganiser, isPreview: isOrganiser && stored, setPreview };
}
