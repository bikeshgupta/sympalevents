import type { QueryClient } from "@tanstack/react-query";

/**
 * Remember the last answers on this device, so a reload shows the page at once.
 *
 * A reload used to start from nothing: Firebase restores the sign-in, `/api/me` names the person,
 * then the person's events, then the event, then what they may open - five round trips in a row,
 * and a skeleton for all of it. This keeps the last answer to each of those on the device
 * (`localStorage`) and puts it back into the query cache before the first render, so the page draws
 * from what it knew a moment ago while every query refreshes behind it (stale-while-revalidate - the
 * queries still refetch, nothing here changes how fresh anything is).
 *
 * Cookies were considered and are the wrong tool: about 4KB, and sent with every request.
 *
 * ## What is, and is not, kept
 *
 * Only the handful of reads that make up "who am I, what is open to me and what is on this event".
 * **Not** anything a person files or settles (expenses with their signed bill links, registrations,
 * profile fields, tokens): a faster reload is not worth a bill link or a phone number sitting in
 * storage. Demo data is never kept.
 *
 * ## Rules that keep it safe
 *
 *  - **Wiped on sign-out**, and whenever the session turns out to be signed out. Entries are also
 *    keyed by user id inside the query key, so one person's answer is never what another's page
 *    reads.
 *  - **Tied to the build**: a new deploy may change the shape of a payload, so a stored copy from an
 *    older build is thrown away rather than fed to code that does not expect it.
 *  - **Expires** after 24 hours.
 *  - Anything that fails (private window, full quota, bad JSON) simply means the page loads the way it
 *    always did.
 */

const STORAGE_KEY = "sympal:cache";
const MAX_AGE_MS = 24 * 60 * 60 * 1000;
const MAX_BYTES = 1_500_000;
const SAVE_DELAY_MS = 1000;

/** The query-key roots worth keeping. See the note above before adding one. */
export const persistedRoots = new Set(["session", "my-events", "event-data", "event-access", "page-access", "page-visibility"]);

export type StoredQuery = { queryKey: unknown[]; data: unknown; updatedAt: number };
export type StoredCache = { build: string; savedAt: number; queries: StoredQuery[] };

type Candidate = { queryKey: readonly unknown[]; state: { status: string; data: unknown; dataUpdatedAt: number } };

/** Which of the cache's queries are kept. Pure. */
export function selectPersistable(queries: Candidate[]): StoredQuery[] {
  return queries
    .filter((query) => query.state.status === "success" && query.state.data !== undefined)
    .filter((query) => typeof query.queryKey[0] === "string" && persistedRoots.has(query.queryKey[0] as string))
    // The demo stands in when nothing could be read; it must never be mistaken for the real thing later.
    .filter((query) => (query.state.data as { source?: string } | null)?.source !== "demo")
    .map((query) => ({ queryKey: [...query.queryKey], data: query.state.data, updatedAt: query.state.dataUpdatedAt }));
}

/** What a stored string is worth today: the queries to restore, or nothing. Pure. */
export function readStored(raw: string | null, build: string, now: number): StoredQuery[] {
  if (!raw) return [];
  try {
    const stored = JSON.parse(raw) as StoredCache;
    if (stored.build !== build) return [];
    if (!Number.isFinite(stored.savedAt) || now - stored.savedAt > MAX_AGE_MS) return [];
    if (!Array.isArray(stored.queries)) return [];
    return stored.queries.filter(
      (query) => Array.isArray(query.queryKey) && typeof query.queryKey[0] === "string" && persistedRoots.has(query.queryKey[0]),
    );
  } catch {
    return [];
  }
}

export function clearPersistedCache() {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // nothing to clear
  }
}

/** Put the last answers back before anything renders. Call once, before the first render. */
export function restorePersistedCache(client: QueryClient, build: string) {
  try {
    const restored = readStored(window.localStorage.getItem(STORAGE_KEY), build, Date.now());
    for (const query of restored) client.setQueryData(query.queryKey, query.data, { updatedAt: query.updatedAt });
  } catch {
    // The page loads the way it always did.
  }
}

/** Keep the stored copy current, and wipe it the moment the session is signed out. */
export function startPersistingCache(client: QueryClient, build: string) {
  let timer: number | undefined;

  const save = () => {
    timer = undefined;
    try {
      const queries = selectPersistable(client.getQueryCache().getAll() as unknown as Candidate[]);
      // A session that came back empty means signed out: keep nothing.
      const session = queries.find((query) => query.queryKey[0] === "session");
      if (!session || session.data === null) {
        clearPersistedCache();
        return;
      }
      const text = JSON.stringify({ build, savedAt: Date.now(), queries } satisfies StoredCache);
      if (text.length > MAX_BYTES) return;
      window.localStorage.setItem(STORAGE_KEY, text);
    } catch {
      // Quota or a private window: skip this save.
    }
  };

  return client.getQueryCache().subscribe(() => {
    if (timer === undefined) timer = window.setTimeout(save, SAVE_DELAY_MS);
  });
}
