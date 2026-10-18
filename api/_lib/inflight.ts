/**
 * Share one read between callers that ask for the same thing at the same time.
 *
 * `api/events.ts?resource=data` resolves access for seven pages at once, and each
 * resolve used to fetch the same event row, the same module list and the same
 * membership - seven identical queries, every time a dashboard opened. With this
 * they share one. The entry is dropped the moment the read settles, so nothing
 * is cached: a request that arrives after a write always reads afresh, exactly
 * as before.
 */
const pending = new Map<string, Promise<unknown>>();

export function inflight<T>(key: string, read: () => Promise<T>): Promise<T> {
  const hit = pending.get(key);
  if (hit) return hit as Promise<T>;
  const promise = read().finally(() => pending.delete(key));
  pending.set(key, promise);
  return promise;
}
