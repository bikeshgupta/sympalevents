import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import type { Deployment } from "../../../shared/platform-monitoring";

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

/* -------------------------------------------------------------------------------------------------------- */
/* Phase 2 contracts - mirrors api/_lib/platform-reads.ts                                                    */
/* -------------------------------------------------------------------------------------------------------- */

export type Comparison = { current: number; previous: number; change: number | null };
export type Series = { current: number[]; previous: number[] };
export type EventStatus = "draft" | "upcoming" | "live" | "completed" | "cancelled";
export type SocietyLabel = "new" | "active" | "quiet" | "dormant" | "empty";
export type WindowJson = {
  preset: string;
  days: number;
  from: string;
  to: string;
  firstDay: string;
  lastDay: string;
  previous: { from: string; to: string };
};
export type AuditItem = {
  id: string;
  at: string | null;
  actorId: string | null;
  actorEmail: string | null;
  actorName?: string | null;
  action: string;
  entityType: string;
  summary: string | null;
  societyId: string | null;
  eventId: string | null;
  society?: string | null;
};

export type OverviewData = {
  observedAt: string;
  window: WindowJson;
  days: string[];
  coverage: { visitsAvailable: boolean; visitsSince: string | null; visitsPartial: boolean; auditAvailable: boolean; auditSince: string | null; eventsPartial: boolean };
  metrics: {
    users: { total: number; joined: Comparison };
    societies: { total: number; active: Comparison; new: number };
    events: { total: number; created: Comparison; status: Record<EventStatus, number> };
    activePeople: Comparison | null;
  };
  series: { signups: Series; visits: Series | null; activePeople: Series | null; eventsCreated: Series; eventsPublished: Series | null };
  societies: { id: string; name: string; visits: number; signedInVisitors: number; eventsOn: number; joined: number }[];
  attention: { dormant: { id: string; name: string }[]; empty: number; draftsSoon: { id: string; name: string; society: string; startDate: string }[] };
  recent: AuditItem[] | null;
};

export type UserRow = { id: string; name: string | null; email: string | null; photoUrl: string | null; joinedAt: string | null; societies: number; eventRoles: number; lastVisitAt: string | null };
export type UsersData = {
  observedAt: string;
  window: WindowJson;
  coverage: { visitsAvailable: boolean; visitsSince: string | null; visitsPartial: boolean };
  summary: { total: number; joined: Comparison; active: Comparison | null; inSociety: number };
  filters: { q: string; joined: "any" | "period" | "active" };
  page: number;
  pageSize: number;
  total: number;
  users: UserRow[];
};
export type UserData = {
  observedAt: string;
  window: WindowJson;
  user: { id: string; name: string | null; email: string | null; photoUrl: string | null; joinedAt: string | null };
  memberships: { societyId: string; society: string; role: string; since: string | null }[];
  eventRoles: { eventId: string; event: string; society: string; status: EventStatus | null; role: string; since: string | null }[];
  visits: { inWindow: number; recent: { eventId: string | null; event: string | null; startedAt: string | null; lastSeenAt: string | null; pages: number; device: string | null; browser: string | null }[] } | null;
  bookingsMade: number | null;
  actions: AuditItem[] | null;
};

export type SocietyFactsJson = {
  label: SocietyLabel;
  active: boolean;
  members: number;
  events: number;
  eventsCreated: number;
  eventsOn: number;
  joined: number;
  visits: number;
  signedInVisitors: number;
  lastActivityAt: string | null;
};
export type SocietyRow = SocietyFactsJson & { id: string; name: string; slug: string | null; city: string | null; createdAt: string | null };
export type SocietiesData = {
  observedAt: string;
  window: WindowJson;
  days: string[];
  coverage: { visitsAvailable: boolean; visitsSince: string | null; partial: boolean; firstMembershipAt: string | null };
  summary: { total: number; active: Comparison; new: Comparison; withEvents: number; labels: Record<SocietyLabel, number> };
  series: { createdByMonth: { month: string; value: number }[]; joined: Series };
  societies: SocietyRow[];
};
export type SocietyData = {
  observedAt: string;
  window: WindowJson;
  coverage: { visitsAvailable: boolean; partial: boolean };
  society: SocietyRow;
  roles: { admin: number; committee: number; resident: number };
  joinsByMonth: { month: string; value: number }[];
  events: { id: string; name: string; status: EventStatus; startDate: string; endDate: string; visits: number; signedInVisitors: number }[];
  actions: AuditItem[] | null;
};

export type EventRow = { id: string; name: string; societyId: string; society: string; status: EventStatus; startDate: string; endDate: string; createdAt: string | null; type: string | null; bookings: number | null; visits: number | null };
export type EventsData = {
  observedAt: string;
  window: WindowJson;
  days: string[];
  coverage: { auditAvailable: boolean; auditSince: string | null; partial: boolean };
  summary: { total: number; status: Record<EventStatus, number>; created: Comparison };
  series: { created: Series; published: Series | null };
  filters: { q: string; status: "all" | EventStatus; society: string | null };
  societies: { id: string; name: string }[];
  page: number;
  pageSize: number;
  total: number;
  events: EventRow[];
};
export type EventData = {
  observedAt: string;
  window: WindowJson;
  days: string[];
  event: { id: string; name: string; societyId: string; society: string; status: EventStatus; startDate: string; endDate: string; startTime: string | null; endTime: string | null; type: string | null; location: string | null; createdAt: string | null };
  bookings: { active: number; cancelled: number; people: number; payments: Record<string, number>; partial: boolean } | null;
  visits: { total: number; signedInPeople: number; guests: number; byDay: number[]; devices: Record<string, number>; partial: boolean } | null;
  actions: AuditItem[] | null;
};

function usePart<T>(part: string, params: Record<string, string>, options: { enabled?: boolean; keepPrevious?: boolean } = {}) {
  const clean = Object.fromEntries(Object.entries(params).filter(([, value]) => value !== ""));
  return useQuery({
    queryKey: ["platform", part, clean],
    queryFn: () => apiFetch<T>(platformPath(part, clean)),
    retry: retryOnce,
    staleTime: 60_000,
    enabled: options.enabled ?? true,
    placeholderData: options.keepPrevious ? keepPreviousData : undefined,
  });
}

export const useOverview = (range: string) => usePart<OverviewData>("overview", { range });
export const useUsers = (params: { range: string; q: string; joined: string; page: string }) => usePart<UsersData>("users", params, { keepPrevious: true });
export const useUser = (id: string | null, range: string) => usePart<UserData>("user", { id: id ?? "", range }, { enabled: Boolean(id) });
export const useSocieties = (range: string) => usePart<SocietiesData>("societies", { range });
export const useSociety = (id: string | null, range: string) => usePart<SocietyData>("society", { id: id ?? "", range }, { enabled: Boolean(id) });
export const useEvents = (params: { range: string; q: string; status: string; society: string; page: string }) => usePart<EventsData>("events", params, { keepPrevious: true });
export const useEvent = (id: string | null, range: string) => usePart<EventData>("event", { id: id ?? "", range }, { enabled: Boolean(id) });

/* -------------------------------------------------------------------------------------------------------- */
/* Phase 3 contracts - mirrors api/_lib/platform-activity.ts and platform-analytics.ts                         */
/* -------------------------------------------------------------------------------------------------------- */

export type Facet = { value: string; count: number };
export type LabelCount = { label: string; count: number };
type ActivityBase = { observedAt: string; window: WindowJson; days: string[] };

export type ActionEntry = {
  id: string;
  at: string | null;
  actorId: string | null;
  actorName: string | null;
  actorEmail: string | null;
  action: string;
  entityType: string;
  summary: string | null;
  societyId: string | null;
  society: string | null;
  eventId: string | null;
  event: string | null;
};
export type ActionsData = ActivityBase & {
  view: "actions";
  available: true;
  since: string | null;
  partial: boolean;
  summary: { total: Comparison; people: Comparison; byAction: Facet[]; byEntity: Facet[]; topActors: { id: string; name: string | null; count: number }[] };
  series: Series;
  societies: { id: string; name: string }[];
  filters: { action: string; entity: string; society: string | null; event: string | null; q: string };
  page: number;
  pageSize: number;
  total: number;
  entries: ActionEntry[];
};
export type VisitEntry = {
  id: string;
  eventId: string | null;
  event: string | null;
  society: string | null;
  person: string | null;
  startedAt: string | null;
  seconds: number | null;
  pages: number | null;
  device: string | null;
  browser: string | null;
};
export type VisitLength = { medianSeconds: number | null; measured: number; total: number };
export type VisitsData = ActivityBase & {
  view: "visits";
  available: true;
  since: string | null;
  partial: boolean;
  summary: { visits: Comparison; people: number; guests: number; length: VisitLength };
  series: Series;
  events: { id: string; name: string }[];
  filters: { who: "all" | "signed_in" | "guests"; event: string | null };
  page: number;
  pageSize: number;
  total: number;
  visits: VisitEntry[];
};
export type AccessAttempt = { id: string; at: string | null; outcome: string; reason: string; part: string | null; person: string | null };
export type AccessData = ActivityBase & {
  view: "access";
  available: true;
  since: string | null;
  summary: { allowed: number; refused: number; refusedPeople: number };
  filters: { outcome: "all" | "allowed" | "refused" };
  page: number;
  pageSize: number;
  total: number;
  attempts: AccessAttempt[];
};
export type ActivityUnavailable = ActivityBase & { view: "actions" | "visits" | "access"; available: false; since: null };
export type ActivityData = ActionsData | VisitsData | AccessData | ActivityUnavailable;

export type AuditEntryData = {
  observedAt: string;
  entry: {
    id: string;
    at: string | null;
    actorId: string | null;
    actorName: string | null;
    actorEmail: string | null;
    action: string;
    entityType: string;
    entityId: string | null;
    summary: string | null;
    societyId: string | null;
    society: string | null;
    eventId: string | null;
    event: string | null;
    requestId: string | null;
  };
  changes: unknown;
  hiddenValues: number;
  sameRequest: { id: string; at: string | null; action: string; entityType: string; summary: string | null }[];
};

export type AnalyticsData = {
  observedAt: string;
  window: WindowJson;
  days: string[];
  coverage: { visitsAvailable: boolean; visitsSince: string | null; visitsPartial: boolean; pagesAvailable: boolean; bookingsAvailable: boolean; moneyAvailable: boolean };
  levels: { dau: Comparison; wau: Comparison; mau: Comparison; stickiness: number | null } | null;
  traffic: { visits: Comparison; people: Comparison; guests: number; length: VisitLength; series: { visits: Series; people: Series } } | null;
  devices: LabelCount[] | null;
  browsers: LabelCount[] | null;
  countries: LabelCount[] | null;
  cities: LabelCount[] | null;
  pages: { page: string; views: number; medianSeconds: number | null }[] | null;
  retention: { cohorts: { month: string; people: number; active: number; share: number | null }[]; activeDays: number } | null;
  bookings: { bookings: Comparison; people: Comparison; payments: Record<string, number>; series: Series; top: { id: string; name: string; society: string; bookings: number; people: number }[]; partial: boolean } | null;
  money: { byStatus: { status: string; count: number; received: number }[]; top: { id: string; name: string; society: string; count: number; received: number }[]; partial: boolean } | null;
};

export const useActivity = (params: Record<string, string>) => usePart<ActivityData>("activity", params, { keepPrevious: true });
export const useAuditEntry = (id: string | null) => usePart<AuditEntryData>("audit", { id: id ?? "" }, { enabled: Boolean(id) });
export const useAnalytics = (range: string) => usePart<AnalyticsData>("analytics", { range });

/* -------------------------------------------------------------------------------------------------------- */
/* Phase 4 - hosting monitoring (optional; "not connected" until the owner adds server secrets)                */
/* -------------------------------------------------------------------------------------------------------- */

export type VercelMonitoring =
  | { connected: false }
  | { connected: true; ok: false; status: number | null }
  | { connected: true; ok: true; deployments: Deployment[]; latestProduction: Deployment | null; newestFailed: boolean };
export type MonitoringData = { observedAt: string; vercel: VercelMonitoring };

export function usePlatformMonitoring() {
  return useQuery({
    queryKey: ["platform", "monitoring"],
    queryFn: () => apiFetch<MonitoringData>(platformPath("monitoring")),
    retry: retryOnce,
    staleTime: 60_000,
  });
}
