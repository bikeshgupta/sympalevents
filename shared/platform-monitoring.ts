/**
 * Reading Vercel's deployment list defensively. Pure and import-free, so the API and the tests run the same code
 * (tests/platform-monitoring.test.mjs). Nothing in an API response is trusted to have a shape: a field that is
 * missing or the wrong type becomes null, never a guess.
 */

export type DeploymentState = "ready" | "error" | "building" | "queued" | "canceled" | "unknown";

export type Deployment = {
  id: string;
  state: DeploymentState;
  production: boolean;
  createdAt: string | null;
  commit: string | null;
  message: string | null;
};

const states: Record<string, DeploymentState> = {
  READY: "ready",
  ERROR: "error",
  BUILDING: "building",
  INITIALIZING: "building",
  QUEUED: "queued",
  CANCELED: "canceled",
};

const text = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : null);

/** The deployments in a Vercel `GET /v6/deployments` answer, newest first, at most `limit`. */
export function mapVercelDeployments(body: unknown, limit = 8): Deployment[] {
  const list = (body as { deployments?: unknown } | null)?.deployments;
  if (!Array.isArray(list)) return [];
  return list
    .slice(0, limit)
    .map((item): Deployment | null => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      const id = text(row.uid) ?? text(row.id);
      if (!id) return null;
      const meta = (row.meta && typeof row.meta === "object" ? row.meta : {}) as Record<string, unknown>;
      const created = typeof row.created === "number" && Number.isFinite(row.created) ? new Date(row.created).toISOString() : null;
      const sha = text(meta.githubCommitSha);
      const message = text(meta.githubCommitMessage)?.split("\n")[0].slice(0, 120) ?? null;
      return {
        id,
        state: states[String(text(row.state) ?? text(row.readyState) ?? "").toUpperCase()] ?? "unknown",
        production: row.target === "production",
        createdAt: created,
        commit: sha ? sha.slice(0, 7) : null,
        message,
      };
    })
    .filter((item): item is Deployment => item !== null);
}

/** The newest production deployment, and whether the newest of all is failing - the two things worth a headline. */
export function summariseDeployments(deployments: Deployment[]) {
  const production = deployments.find((deployment) => deployment.production) ?? null;
  return { latestProduction: production, newestFailed: deployments[0]?.state === "error" };
}
