import { societyIdForEvent } from "./authority.js";
import { assertServiceSupabase } from "./server.js";

/**
 * Who did what, and what changed when they did it.
 *
 * Every mutating branch of every API route calls `recordAudit`. Three things
 * about it are load-bearing:
 *
 *  - **It never breaks the write it is logging.** Every call is wrapped and
 *    swallowed. A missing table (030 not yet applied) is ignored silently, the
 *    same shape traffic uses. Nobody should be unable to settle an expense
 *    because the audit table is unhappy.
 *  - **It diffs field by field.** An update records only the keys that moved,
 *    as `{ amount: { from: 5000, to: 500 } }`. Storing both whole rows buries
 *    the one field that changed among forty that did not.
 *  - **It redacts credentials.** A share token or an invite code in an audit
 *    row is a new hole, not a record of one.
 *
 * It is deliberately fire-and-forget rather than awaited: the caller has
 * already done the work the user asked for, and making them wait on a log
 * write adds latency to every mutation for no benefit to them.
 */

type ApiRequest = {
  headers?: Record<string, unknown>;
};

type Row = Record<string, unknown> | null | undefined;

export type AuditEntry = {
  /** create | update | delete, or a verb whose field does not describe it:
   *  settle, unsettle, publish, unpublish, rotate_share_token, approve. */
  action: string;
  /** 'expense' | 'event_member' | 'contribution' | 'page_visibility' | ... */
  entityType: string;
  entityId?: string | null;
  eventId?: string | null;
  organizationId?: string | null;
  /** The actor. Routes have this from requireAppUser. */
  actor: { id: string; email?: string | null } | null;
  /** The row as it was, for an update or a delete. */
  before?: Row;
  /** The row as it is now, for a create or an update. */
  after?: Row;
  /** One human-readable line, so the table reads without decoding jsonb. */
  summary?: string;
  /** Groups rows written by one request. */
  requestId?: string | null;
};

/**
 * Never logged, whatever table they arrive on.
 *
 * `share_token` and `invite_code` are credentials - anybody holding one can
 * use it. The rest are belt and braces for columns that may arrive later.
 */
const redactedKeys = new Set(["share_token", "invite_code", "password", "secret"]);

function isRedacted(key: string) {
  return redactedKeys.has(key) || /(^|_)(token|secret|password)(_|$)/i.test(key);
}

/** Internal columns that say nothing about what a person changed. */
const noiseKeys = new Set(["updated_at", "created_at", "id"]);

function redactValue(key: string, value: unknown) {
  if (!isRedacted(key)) return value;
  // Recorded as having changed, without recording what to.
  return value === null || value === undefined ? value : "[redacted]";
}

/**
 * Only what moved.
 *
 * Compared by JSON shape so jsonb columns (prasad's arranger lists, the
 * dashboard layout, the closing credits) diff correctly rather than always
 * reading as changed because two objects are not `===`.
 */
export function diffRows(before: Row, after: Row) {
  const changes: Record<string, { from: unknown; to: unknown }> = {};

  if (!before && !after) return changes;

  // A create or a delete has one side only: record the row itself, which is
  // what somebody reading the log back actually wants to see.
  if (!before || !after) {
    const row = (after ?? before) as Record<string, unknown>;
    for (const [key, value] of Object.entries(row)) {
      if (noiseKeys.has(key) && key !== "id") continue;
      changes[key] = after
        ? { from: null, to: redactValue(key, value) }
        : { from: redactValue(key, value), to: null };
    }
    return changes;
  }

  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (noiseKeys.has(key)) continue;
    const from = before[key];
    const to = after[key];
    if (JSON.stringify(from ?? null) === JSON.stringify(to ?? null)) continue;
    changes[key] = { from: redactValue(key, from), to: redactValue(key, to) };
  }

  return changes;
}

/** One id per request, so a member edit that writes a role and four page
 *  permissions reads back as a single action. */
export function newRequestId() {
  return `r_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export async function recordAudit(_req: ApiRequest | null, entry: AuditEntry) {
  try {
    const supabase = assertServiceSupabase();

    const changes = diffRows(entry.before, entry.after);
    // An update that moved nothing is not an event worth a row.
    if (entry.action === "update" && Object.keys(changes).length === 0) return;

    let organizationId = entry.organizationId ?? null;
    if (!organizationId && entry.eventId) {
      organizationId = await societyIdForEvent(supabase, entry.eventId).catch(() => null);
    }

    const { error } = await supabase.from("audit_log").insert({
      actor_user_id: entry.actor?.id ?? null,
      actor_email: entry.actor?.email ?? null,
      event_id: entry.eventId ?? null,
      organization_id: organizationId,
      action: entry.action,
      entity_type: entry.entityType,
      entity_id: entry.entityId ? String(entry.entityId) : null,
      summary: entry.summary ?? null,
      changes,
      request_id: entry.requestId ?? null,
    });

    if (error && !isMissingTable(error)) {
      console.warn("Could not write an audit row:", error);
    }
  } catch (error) {
    // Logging must never be the reason a write fails.
    console.warn("Audit logging failed:", error);
  }
}

function isMissingTable(error: { code?: string; message?: string }) {
  return ["42P01", "PGRST205"].includes(error.code ?? "") || Boolean(error.message?.includes("audit_log"));
}

/** Fire-and-forget. The caller has already done what the user asked; making
 *  them wait on a log write adds latency to every mutation for no benefit. */
export function audit(req: ApiRequest | null, entry: AuditEntry) {
  void recordAudit(req, entry);
}
