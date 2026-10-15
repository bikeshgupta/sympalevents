import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

/**
 * Reads from `/api/events?resource=platform&part=<part>` - the owner-only Platform Control Center.
 *
 * The server is the only authority: every part answers 404 to anybody not on the platform list. These queries are
 * keyed under "platform", which is NOT in query-persist's `persistedRoots`, so nothing here is ever written to
 * localStorage (tests/platform-boundaries checks).
 */

export type PlatformSession = {
  user: { id: string; name: string | null; email: string | null };
  observedAt: string;
};

export type SourceStatus = "available" | "missing" | "error";

export type PlatformTableSource = {
  key: string;
  label: string;
  table: string;
  migration: string;
  kind: "table";
  status: SourceStatus;
  rows: number | null;
  firstAt: string | null;
  lastAt: string | null;
};

export type PlatformColumnSource = {
  key: string;
  label: string;
  table: string;
  migration: string;
  kind: "column";
  status: SourceStatus;
};

export type PlatformSources = {
  observedAt: string;
  database: { reachable: boolean; roundTripMs: number | null };
  deployment: { environment: string | null; commit: string | null; region: string | null };
  tables: PlatformTableSource[];
  columns: PlatformColumnSource[];
};

export type PlatformError = Error & { status?: number };

export const isNotFound = (error: unknown) => (error as PlatformError | null)?.status === 404;

function platformPath(part: string, params: Record<string, string> = {}) {
  const search = new URLSearchParams({ resource: "platform", part, ...params });
  return `/api/events?${search.toString()}`;
}

/** One retry for a failure that might be passing; never for a 404, which is an answer, not a failure. */
const retryOnce = (count: number, error: unknown) => !isNotFound(error) && count < 1;

export function usePlatformSession(enabled: boolean) {
  return useQuery({
    queryKey: ["platform", "session"],
    queryFn: () => apiFetch<PlatformSession>(platformPath("session")),
    enabled,
    retry: retryOnce,
    staleTime: 5 * 60_000,
  });
}

export function usePlatformSources() {
  return useQuery({
    queryKey: ["platform", "sources"],
    queryFn: () => apiFetch<PlatformSources>(platformPath("sources")),
    retry: retryOnce,
    staleTime: 60_000,
  });
}
