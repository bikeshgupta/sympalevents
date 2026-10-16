import { mapVercelDeployments, summariseDeployments } from "../../shared/platform-monitoring.js";
import type { ReadContext } from "./platform-reads.js";

/**
 * Hosting monitoring for the System page - optional, and only ever a GET to the host's own API.
 *
 * Connected only when the owner has set `PLATFORM_VERCEL_TOKEN` and `PLATFORM_VERCEL_PROJECT_ID` (and
 * `PLATFORM_VERCEL_TEAM_ID` for a team project) as server secrets. Without them this answers "not connected" and
 * the page says so; it never shows a health figure it cannot back up.
 *
 * - **The token is server-only.** It is never returned, never logged, and a failing call reports only the HTTP
 *   status, never the response body (tests/platform-boundaries checks the logging).
 * - **Read-only.** A GET of the deployment list. Nothing is deployed, redeployed, promoted or changed.
 * - **Never in the way.** It is its own part, so a slow or failing Vercel call cannot break the rest of System, and
 *   it shares the request's 5-second limit.
 *
 * Supabase's own platform metrics are not connected: their management API was not available to verify here, so
 * the System page keeps measuring what it can observe directly (database round trip, row counts, data sources).
 */

const vercelList = "https://api.vercel.com/v6/deployments";

export async function readMonitoring({ signal }: ReadContext) {
  const observedAt = new Date().toISOString();
  const token = process.env.PLATFORM_VERCEL_TOKEN;
  const project = process.env.PLATFORM_VERCEL_PROJECT_ID;
  const team = process.env.PLATFORM_VERCEL_TEAM_ID;
  if (!token || !project) return { observedAt, vercel: { connected: false as const } };

  const search = new URLSearchParams({ projectId: project, limit: "8" });
  if (team) search.set("teamId", team);
  try {
    const response = await fetch(`${vercelList}?${search.toString()}`, { headers: { Authorization: `Bearer ${token}` }, signal });
    if (!response.ok) return { observedAt, vercel: { connected: true as const, ok: false as const, status: response.status } };
    const deployments = mapVercelDeployments(await response.json());
    return { observedAt, vercel: { connected: true as const, ok: true as const, deployments, ...summariseDeployments(deployments) } };
  } catch (error) {
    const name = (error as { name?: string } | null)?.name;
    if (name === "AbortError" || name === "TimeoutError") throw error;
    return { observedAt, vercel: { connected: true as const, ok: false as const, status: null } };
  }
}
