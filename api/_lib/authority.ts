// Type-only: erased at compile time, so server.ts can import this module at
// runtime without the two forming a cycle.
import type { assertServiceSupabase } from "./server.js";

/**
 * Who outranks whom.
 *
 * There are two levels of admin and they are not the same thing:
 *
 *   - an **event admin** (`event_members.role = 'admin'`) runs one event;
 *   - a **society admin** (`organization_members.role = 'admin'`) runs the
 *     society that owns the events, and is above every event admin in it.
 *
 * Before this, the second had no authority at all: `requireEventAdmin()` read
 * only `event_members`, so a society admin could create an event and then lose
 * all power over it the moment somebody else was made its admin. Worse, an
 * event whose only admin went quiet could not be recovered by anybody - there
 * was no way in from outside the event.
 *
 * ## The rules
 *
 * | Situation                              | Who may                        |
 * |----------------------------------------|--------------------------------|
 * | Grant or revoke **event admin**        | society admin only             |
 * | Grant or revoke committee / read-only  | event admin, or society admin  |
 * | Change or remove a **society admin**   | society admin only             |
 * | Everything else an event admin does    | event admin, or society admin  |
 *
 * The third row is the one that needs saying twice: an event admin cannot
 * demote, remove or otherwise touch somebody who is a society admin, even on
 * their own event. Without it the hierarchy is decorative - an event admin
 * could simply remove the person above them.
 */

type Supabase = ReturnType<typeof assertServiceSupabase>;

function forbid(message: string) {
  const error = new Error(message);
  Object.assign(error, { statusCode: 403 });
  return error;
}

/** A missing table or column - 023 not yet applied. Treated as "no society
 *  memberships exist", which leaves the event-level rules exactly as they were
 *  rather than locking anybody out. */
function isMissingSocietySchema(error: { code?: string } | null) {
  return Boolean(error && ["42P01", "PGRST205", "42703", "PGRST204"].includes(error.code ?? ""));
}

export async function societyIdForEvent(supabase: Supabase, eventId: string) {
  const { data, error } = await supabase
    .from("events")
    .select("organization_id")
    .eq("id", eventId)
    .maybeSingle();
  if (error) {
    if (isMissingSocietySchema(error)) return null;
    throw error;
  }
  return (data?.organization_id as string | null) ?? null;
}

export async function isSocietyAdmin(supabase: Supabase, organizationId: string | null, userId: string | null) {
  if (!organizationId || !userId) return false;
  const { data, error } = await supabase
    .from("organization_members")
    .select("role")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    if (isMissingSocietySchema(error)) return false;
    throw error;
  }
  return data?.role === "admin";
}

/**
 * A short memo for the question below.
 *
 * `GET /api/events?resource=data` resolves page access up to eight times in
 * one request, and every resolve asks this. Unmemoised that is sixteen extra
 * reads per dashboard load to learn one fact. Fifteen seconds is long enough
 * to collapse a request (and the burst of calls a page makes right after it)
 * into a single answer, and short enough that a society admin who is demoted
 * loses access in the time it takes to notice. It is per server instance, so
 * it can only ever make an answer a few seconds stale, never wrong for good.
 *
 * Deliberately NOT used by `assertCanManageEventRole`: changing who is an
 * event admin is the one decision here where a stale answer is not acceptable.
 */
const societyAdminMemoMs = 15_000;
const societyAdminMemo = new Map<string, { at: number; value: boolean }>();

/** For tests, and for a code path that has just changed somebody's role. */
export function clearSocietyAdminMemo() {
  societyAdminMemo.clear();
}

/** Is this person a society admin over the society that owns this event? */
export async function isSocietyAdminForEvent(supabase: Supabase, eventId: string, userId: string | null) {
  if (!userId) return false;

  const key = `${eventId}:${userId}`;
  const hit = societyAdminMemo.get(key);
  if (hit && Date.now() - hit.at < societyAdminMemoMs) return hit.value;

  const organizationId = await societyIdForEvent(supabase, eventId);
  const value = await isSocietyAdmin(supabase, organizationId, userId);

  // Keep the map from growing for ever on a long-lived instance.
  if (societyAdminMemo.size > 500) {
    const cutoff = Date.now() - societyAdminMemoMs;
    for (const [memoKey, entry] of societyAdminMemo) {
      if (entry.at < cutoff) societyAdminMemo.delete(memoKey);
    }
    if (societyAdminMemo.size > 500) societyAdminMemo.clear();
  }
  societyAdminMemo.set(key, { at: Date.now(), value });
  return value;
}

async function eventRole(supabase: Supabase, eventId: string, userId: string) {
  const { data, error } = await supabase
    .from("event_members")
    .select("role")
    .eq("event_id", eventId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return (data?.role as string | null) ?? null;
}

/**
 * May this person change that person's role on this event - or remove them?
 *
 * `nextRole` is the role they are being moved to, or `null` for removal. The
 * actor is assumed to have already cleared `requireEventAdmin`, which now
 * admits society admins too; this adds the two restrictions that sit on top of
 * it.
 */
export async function assertCanManageEventRole(
  supabase: Supabase,
  eventId: string,
  actorUserId: string,
  targetUserId: string,
  nextRole: string | null,
) {
  const organizationId = await societyIdForEvent(supabase, eventId);
  const actorIsSocietyAdmin = await isSocietyAdmin(supabase, organizationId, actorUserId);

  // A society admin may do anything here, including to another society admin -
  // otherwise two of them could deadlock each other out of their own society.
  if (actorIsSocietyAdmin) return;

  const [currentRole, targetIsSocietyAdmin] = await Promise.all([
    eventRole(supabase, eventId, targetUserId),
    isSocietyAdmin(supabase, organizationId, targetUserId),
  ]);

  // An event admin cannot touch the person above them.
  if (targetIsSocietyAdmin) {
    throw forbid(
      "That member is an admin of this society. Only another society admin can change their role on an event.",
    );
  }

  // Making somebody an event admin, or taking it away, is the society's call.
  if (nextRole === "admin" || currentRole === "admin") {
    throw forbid("Only a society admin can add or remove an event admin.");
  }
}
