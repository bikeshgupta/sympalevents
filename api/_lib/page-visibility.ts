import { assertServiceSupabase } from "./server.js";

/**
 * Per-event page visibility - see supabase/migrations/015_event_page_visibility.sql.
 *
 * This is the single server-side source of truth for "who can see this page
 * at all". It replaced a hardcoded `publicPageKeys` set that lived in three
 * places at once (the client, api/page-access.ts, api/event-access.ts) and
 * could not be changed without a deploy.
 *
 * Lives under api/_lib/ on purpose: Vercel routes every file directly under
 * api/ as its own serverless function and this project sits at the plan's
 * cap, so shared code goes here and the handlers stay where they are.
 */
export type PageVisibility = "public" | "authenticated" | "restricted";

/** Every page an admin can set visibility for. "settings" is not one of them
 *  - it stays admin-only and is not something an admin can open up. */
export const eventPageKeys = [
  "dashboard",
  "contributions",
  "sponsors",
  "budget",
  "expenses",
  "auctions",
  "prasad",
  "tasks",
  "volunteers",
  "event-plan",
  "contacts",
  // Sports modules. Off by default for every other kind of event - see
  // defaultEnabled below and src/data/event-templates.ts.
  "teams",
  "fixtures",
  "closing",
] as const;

/**
 * Used for an event that has no row yet (created before the migration, or
 * created after it by a code path that does not seed). These are the same
 * pages that were hardcoded as public before this table existed, so an
 * unseeded event behaves exactly as it did.
 */
const defaultVisibility: Record<string, PageVisibility> = {
  dashboard: "public",
  budget: "public",
  auctions: "public",
  closing: "public",
  // Not "restricted": a committee member has to be able to open Tasks and see
  // what is on them without an admin granting each person individually. The
  // admin can still narrow it.
  tasks: "authenticated",
};

export function defaultVisibilityFor(pageKey: string): PageVisibility {
  return defaultVisibility[pageKey] ?? "restricted";
}

/**
 * Modules that cannot be switched off.
 *
 * The dashboard is where every route lands and what a bare link opens; an
 * event without one has no front door. "settings" is not in `eventPageKeys`
 * at all for the same family of reasons - it is the screen that controls the
 * others.
 */
const alwaysOnPages = new Set<string>(["dashboard"]);

export function isAlwaysOnPage(pageKey: string) {
  return alwaysOnPages.has(pageKey);
}

/** The app's own name for a module, when an event has not renamed it. */
/**
 * Modules that are OFF unless an event's template turned them on.
 *
 * Every other module defaults to on, which is what keeps every event that
 * predates 024 behaving exactly as it did. These two arrived after, and a
 * festival should not grow a fixture list because somebody deployed.
 */
const defaultDisabledPages = new Set<string>(["teams", "fixtures"]);

export const defaultPageLabels: Record<string, string> = {
  dashboard: "Dashboard",
  contributions: "Contributions",
  sponsors: "Sponsors",
  budget: "Budget",
  expenses: "Expense Ledger",
  auctions: "Auctions",
  prasad: "Prasad",
  tasks: "Tasks",
  volunteers: "Volunteers",
  "event-plan": "Events",
  contacts: "Contacts",
  teams: "Teams",
  fixtures: "Fixtures",
  closing: "Closing",
};

export type EventModule = {
  pageKey: string;
  visibility: PageVisibility;
  /** Whether this event has this module at all - see migration 024. */
  isEnabled: boolean;
  /** What this event calls it. Falls back to the app's own name. */
  label: string;
  /** Only set when the committee renamed it; the UI needs to tell them apart. */
  labelOverride: string | null;
  /** Where it sits in the nav. Null sorts after everything numbered. */
  sortOrder: number | null;
};

const MAX_LABEL = 28;

export function cleanModuleLabel(value: unknown): string | null {
  const label = String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_LABEL);
  return label || null;
}

/**
 * 024 has not been run yet: no event has module rows with these columns, so
 * every module reads as on and unrenamed and the app behaves exactly as it
 * did. Same "read degrades, write says so" shape as `event_schedule.sub_events`.
 */
function isMissingModuleColumns(error: { code?: string; message?: string } | null) {
  return Boolean(
    error &&
      (["42703", "PGRST204"].includes(error.code ?? "") ||
        error.message?.includes("is_enabled") ||
        error.message?.includes("label_override") ||
        error.message?.includes("sort_order")),
  );
}

function isMissingVisibilityTable(error: { code?: string; message?: string } | null) {
  return Boolean(error && ["42P01", "PGRST205"].includes(error.code ?? ""));
}

/**
 * Every module of one event, whether or not it has a stored row.
 *
 * This is the single answer to "what does this event have, what is it called,
 * and who may look at it". `fetchPageVisibility` below is now a thin view over
 * it, kept because several callers only ever wanted the visibility map.
 */
export async function fetchEventModules(eventId: string): Promise<Record<string, EventModule>> {
  const supabase = assertServiceSupabase();

  let stored = new Map<
    string,
    { visibility?: unknown; is_enabled?: unknown; label_override?: unknown; sort_order?: unknown }
  >();

  const full = await supabase
    .from("event_page_visibility")
    .select("page_key,visibility,is_enabled,label_override,sort_order")
    .eq("event_id", eventId);

  if (full.error && isMissingModuleColumns(full.error)) {
    console.warn("event_page_visibility has no module columns. Run migration 024_event_modules.sql.");
    const legacy = await supabase
      .from("event_page_visibility")
      .select("page_key,visibility")
      .eq("event_id", eventId);
    if (legacy.error && !isMissingVisibilityTable(legacy.error)) throw legacy.error;
    stored = new Map((legacy.data ?? []).map((row) => [row.page_key as string, row]));
  } else if (full.error && isMissingVisibilityTable(full.error)) {
    console.warn("event_page_visibility is missing. Run migration 015_event_page_visibility.sql.");
  } else if (full.error) {
    throw full.error;
  } else {
    stored = new Map((full.data ?? []).map((row) => [row.page_key as string, row]));
  }

  return Object.fromEntries(
    eventPageKeys.map((pageKey) => {
      const row = stored.get(pageKey);
      const labelOverride = cleanModuleLabel(row?.label_override);
      return [
        pageKey,
        {
          pageKey,
          visibility: normalizeVisibility(row?.visibility, pageKey),
          // A module with no row at all is on: that is how every event that
          // predates 024 behaves, and how an event created by a code path
          // that does not seed behaves.
          isEnabled: isAlwaysOnPage(pageKey)
            ? true
            : row?.is_enabled !== undefined && row?.is_enabled !== null
              ? row.is_enabled !== false
              : !defaultDisabledPages.has(pageKey),
          label: labelOverride ?? defaultPageLabels[pageKey] ?? pageKey,
          labelOverride,
          sortOrder: typeof row?.sort_order === "number" ? row.sort_order : null,
        } satisfies EventModule,
      ];
    }),
  );
}

/**
 * Modules in the order the committee put them in.
 *
 * A module with no stored position sorts after every one that has a number,
 * keeping the registry's own order among themselves - so a module added by a
 * later deploy turns up at the end of the nav rather than vanishing or
 * jumping to the top of somebody's carefully arranged list.
 */
export function sortModules(modules: EventModule[]): EventModule[] {
  const registryIndex = new Map(eventPageKeys.map((key, index) => [key as string, index]));
  return [...modules].sort((left, right) => {
    const l = left.sortOrder ?? Number.MAX_SAFE_INTEGER;
    const r = right.sortOrder ?? Number.MAX_SAFE_INTEGER;
    if (l !== r) return l - r;
    return (registryIndex.get(left.pageKey) ?? 0) - (registryIndex.get(right.pageKey) ?? 0);
  });
}

/**
 * Pages that can never be anonymous, whatever is stored or submitted.
 *
 * "tasks" names people and carries their conversation with each other, so it
 * is sign-in only by design - api/tasks.ts requires a signed-in user on every
 * branch regardless, and this keeps the stored setting from claiming
 * otherwise. An admin can still choose between "any signed-in user" and
 * "only members I give access to".
 */
const signInOnlyPages = new Set(["tasks"]);

export function isSignInOnlyPage(pageKey: string) {
  return signInOnlyPages.has(pageKey);
}

/**
 * Pages a committee member can always open, whatever visibility the admin
 * picked, because the page holds something that is theirs to do.
 *
 * "expenses": any committee member can file an out-of-pocket claim and follow
 * it until it is paid back. This widens *opening the page* only - what they
 * see there is still decided by api/expenses.ts, which without view access to
 * the ledger returns their own claims and nothing else. Editing is unchanged.
 */
const committeeOpenPages = new Set(["expenses"]);

export function isCommitteeOpenPage(pageKey: string) {
  return committeeOpenPages.has(pageKey);
}

function isPageVisibility(value: unknown): value is PageVisibility {
  return value === "public" || value === "authenticated" || value === "restricted";
}

export function normalizeVisibility(value: unknown, pageKey: string): PageVisibility {
  const visibility = isPageVisibility(value) ? value : defaultVisibilityFor(pageKey);
  if (visibility === "public" && signInOnlyPages.has(pageKey)) return "authenticated";
  return visibility;
}

/**
 * The event's visibility map, with every known page present. A thin view over
 * `fetchEventModules` so there is one place that reads the table.
 */
export async function fetchPageVisibility(eventId: string): Promise<Record<string, PageVisibility>> {
  const modules = await fetchEventModules(eventId);
  return Object.fromEntries(Object.values(modules).map((item) => [item.pageKey, item.visibility]));
}

export async function fetchPageVisibilityFor(eventId: string, pageKey: string): Promise<PageVisibility> {
  const visibility = await fetchPageVisibility(eventId);
  return visibility[pageKey] ?? defaultVisibilityFor(pageKey);
}

/**
 * Whether this caller (null = signed out) can view and edit one page's data -
 * the same answer api/page-access.ts gives the route guard, for a data route
 * to enforce on its own reads and writes. View follows the admin's
 * visibility; edit is always admin or an explicit "edit" grant.
 */
export async function resolvePageAccess(eventId: string, userId: string | null, pageKey: string) {
  const modules = await fetchEventModules(eventId);
  const module = modules[pageKey];
  const visibility = module?.visibility ?? defaultVisibilityFor(pageKey);

  // A module this event does not have is closed to everybody, the admin
  // included. Turning it back on in Settings is the way in - not a grant.
  if (module && !module.isEnabled) {
    return { role: null, canView: false, canEdit: false };
  }

  if (!userId) {
    return { role: null, canView: visibility === "public", canEdit: false };
  }

  const supabase = assertServiceSupabase();
  const [{ data: member, error: memberError }, { data: permission, error: permissionError }] = await Promise.all([
    supabase.from("event_members").select("role").eq("event_id", eventId).eq("user_id", userId).maybeSingle(),
    supabase
      .from("event_page_permissions")
      .select("access_level")
      .eq("event_id", eventId)
      .eq("user_id", userId)
      .eq("page_key", pageKey)
      .maybeSingle(),
  ]);
  if (memberError) throw memberError;
  if (permissionError) throw permissionError;

  const role = (member?.role ?? null) as "admin" | "committee" | "read_only" | null;
  const accessLevel = permission?.access_level ?? "none";
  const isAdmin = role === "admin";

  return {
    role,
    canView:
      isAdmin ||
      visibility === "public" ||
      visibility === "authenticated" ||
      accessLevel === "view" ||
      accessLevel === "edit" ||
      (role === "committee" && committeeOpenPages.has(pageKey)),
    canEdit: isAdmin || accessLevel === "edit",
  };
}
