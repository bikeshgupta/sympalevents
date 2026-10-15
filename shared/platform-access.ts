/**
 * Who may read the Platform Control Center (`/platform/analytics`).
 *
 * The answer is a server-only allowlist of `app_users.id` values in `PLATFORM_ADMIN_USER_IDS`. It is deliberately
 * NOT derived from any society or event role: a society admin is an admin of one society, not of the platform.
 * An empty or missing list admits nobody.
 *
 * Every refusal looks identical from outside - the same 404 and the same body - so a signed-out visitor, a
 * resident and a society admin learn nothing about why, or how close they are. The reason is only for the
 * server's own log. Hiding the address is a convenience; this check is the protection.
 *
 * Pure and dependency-injected, so the decision can be tested without a network or a database. The real
 * dependencies (Firebase token verification, a read of `app_users`) are wired in api/_lib/platform.ts.
 */

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** `PLATFORM_ADMIN_USER_IDS` as a set of lower-case ids. Commas or whitespace separate; anything not a uuid is dropped. */
export function parsePlatformAdminIds(raw: string | undefined | null): Set<string> {
  const ids = String(raw ?? "")
    .split(/[\s,]+/)
    .map((value) => value.trim().replace(/^["']+|["']+$/g, "").toLowerCase())
    .filter((value) => uuidPattern.test(value));
  return new Set(ids);
}

export type PlatformDenial = "no_admins_configured" | "no_token" | "bad_token" | "no_user" | "not_listed" | "error";

export type PlatformAccess = { ok: true; userId: string } | { ok: false; reason: PlatformDenial; userId?: string };

export type PlatformAccessDeps = {
  /** The bearer token from the Authorization header, or null. */
  token: string | null;
  /** The ids allowed in. */
  admins: Set<string>;
  /** Verifies a Firebase ID token and returns its uid. Throws when the token is not valid. */
  verify: (token: string) => Promise<{ uid: string }>;
  /** Looks up `app_users.id` for a Firebase uid. A READ: it must never create or update the row. */
  findUserId: (firebaseUid: string) => Promise<string | null>;
};

/** The bearer token from an Authorization header value, or null. */
export function bearerToken(header: unknown): string | null {
  const value = String(header ?? "");
  if (!value.startsWith("Bearer ")) return null;
  const token = value.slice("Bearer ".length).trim();
  return token || null;
}

/**
 * Decides one request. Checks the cheap things first, and never touches the database for a request that has
 * no token or when nobody is configured.
 */
export async function checkPlatformAccess(deps: PlatformAccessDeps): Promise<PlatformAccess> {
  if (deps.admins.size === 0) return { ok: false, reason: "no_admins_configured" };
  if (!deps.token) return { ok: false, reason: "no_token" };

  let uid: string;
  try {
    uid = (await deps.verify(deps.token)).uid;
  } catch {
    return { ok: false, reason: "bad_token" };
  }
  if (!uid) return { ok: false, reason: "bad_token" };

  let userId: string | null;
  try {
    userId = await deps.findUserId(uid);
  } catch {
    return { ok: false, reason: "error" };
  }
  if (!userId) return { ok: false, reason: "no_user" };

  const id = userId.toLowerCase();
  if (!deps.admins.has(id)) return { ok: false, reason: "not_listed", userId: id };
  return { ok: true, userId: id };
}

/** The one body every refusal gets, whatever the reason. */
export const platformNotFoundBody = { error: "Not found" } as const;
