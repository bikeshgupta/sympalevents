import type { assertServiceSupabase } from "./server.js";

/**
 * The one place the Platform Control Center writes anything: a line in `platform_access_log` (migration 047)
 * saying a signed-in person opened the area, or was refused at it. Everything else in the area is read-only
 * (tests/platform-boundaries checks that this is the only file that inserts, and into this table only).
 *
 * - **Never in the way.** It cannot fail a request: a missing table (047 not applied), a slow database or any error
 *   is swallowed, and it gives up after 1.5 seconds. The answer to the person never depends on it.
 * - **Only for a signed-in account.** The caller passes a user id it has already verified. A request with no or an
 *   invalid token never gets here, so a stranger cannot fill the table.
 * - **At most one row per person per outcome per five minutes**, so a signed-in person who is not the owner cannot
 *   fill it by refreshing. The check is a read first; if that read fails, nothing is written.
 * - **No IP address, user agent, token or email** - only what the table's columns allow.
 */

type Supabase = ReturnType<typeof assertServiceSupabase>;

const throttleMs = 5 * 60 * 1000;
const limitMs = 1500;

export type AccessEntry = { outcome: "allowed" | "refused"; reason: string; part: string | null; userId: string };

export async function recordPlatformAccess(supabase: Supabase, entry: AccessEntry): Promise<void> {
  try {
    const signal = AbortSignal.timeout(limitMs);
    const since = new Date(Date.now() - throttleMs).toISOString();
    const recent = await supabase
      .from("platform_access_log")
      .select("id")
      .eq("user_id", entry.userId)
      .eq("outcome", entry.outcome)
      .gte("occurred_at", since)
      .limit(1)
      .abortSignal(signal);
    if (recent.error || (recent.data?.length ?? 0) > 0) return;
    await supabase
      .from("platform_access_log")
      .insert({ outcome: entry.outcome, reason: entry.reason, part: entry.part, user_id: entry.userId })
      .abortSignal(signal);
  } catch {
    // Logging a visit must never break the visit.
  }
}
