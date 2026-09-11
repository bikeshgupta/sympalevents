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
 * The event's full map, with every known page present. A missing table (the
 * migration has not been run yet) is treated as "no rows" rather than an
 * error, so the app keeps working on its previous defaults instead of
 * locking everyone out of every page.
 */
export async function fetchPageVisibility(eventId: string): Promise<Record<string, PageVisibility>> {
  const supabase = assertServiceSupabase();
  const { data, error } = await supabase
    .from("event_page_visibility")
    .select("page_key,visibility")
    .eq("event_id", eventId);

  if (error && !["42P01", "PGRST205"].includes(error.code ?? "")) throw error;
  if (error) {
    console.warn("event_page_visibility is missing. Run migration 015_event_page_visibility.sql.");
  }

  const stored = new Map((data ?? []).map((row) => [row.page_key, row.visibility]));
  return Object.fromEntries(
    eventPageKeys.map((pageKey) => [pageKey, normalizeVisibility(stored.get(pageKey), pageKey)]),
  );
}

export async function fetchPageVisibilityFor(eventId: string, pageKey: string): Promise<PageVisibility> {
  const visibility = await fetchPageVisibility(eventId);
  return visibility[pageKey] ?? defaultVisibilityFor(pageKey);
}
