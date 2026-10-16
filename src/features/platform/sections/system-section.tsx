import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { QueryState, Skeleton } from "../data-states";
import { formatCount, formatInstantDate, sourceDetail } from "../format";
import { PageHeader, SectionHeading } from "../page-header";
import { usePlatformMonitoring, usePlatformSources, type PlatformSources } from "../platform-api";
import { sinceText } from "../platform-helpers";
import type { PlatformSection } from "../platform-sections";
import { SourceStatusLabel } from "../source-status";

/**
 * System - what is true of the platform right now, read when the page asked. Observational only: nothing here
 * changes anything.
 *
 * Every figure is a real observation from the platform API: which deployment answered, how long one read of the
 * database took from there, and what each data source holds. Hosting monitoring (Vercel, Supabase metrics) is not
 * connected, and the page says so instead of drawing a green "Healthy" it cannot back up.
 */
export function SystemSection({ section }: { section: PlatformSection }) {
  const sources = usePlatformSources();
  const monitoring = usePlatformMonitoring();
  const refreshing = sources.isFetching || monitoring.isFetching;
  return (
    <div>
      <PageHeader
        title={section.label}
        summary={section.summary}
        rangeAware={false}
        observedAt={sources.data?.observedAt ?? null}
        actions={
          <button
            type="button"
            onClick={() => void Promise.all([sources.refetch(), monitoring.refetch()])}
            disabled={refreshing}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border bg-card px-3 text-sm hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
          >
            <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} aria-hidden="true" />
            {refreshing ? "Reading" : "Read again"}
          </button>
        }
      />
      <div className="mt-8">
        <QueryState query={sources} skeleton={<SystemSkeleton />} errorMessage="The system readings could not be loaded.">
          {(data) => <SystemReadings data={data} />}
        </QueryState>
      </div>
    </div>
  );
}

function SystemReadings({ data }: { data: PlatformSources }) {
  const { deployment, database } = data;
  const missing = [...data.tables, ...data.columns].filter((source) => source.status === "missing");
  const failing = [...data.tables, ...data.columns].filter((source) => source.status === "error");

  return (
    <div className="space-y-12">
      {/* Three readings as figures on hairlines, not cards. */}
      <dl className="grid grid-cols-1 divide-y divide-border/80 border-b border-border/80 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        <Reading
          label="Database"
          value={database.reachable ? `${formatCount(database.roundTripMs ?? 0)} ms` : "Unreachable"}
          note={database.reachable ? "One read from the platform API" : "The platform API could not read it"}
          tone={database.reachable ? "ok" : "bad"}
        />
        <Reading
          label="Deployment"
          value={deployment.environment ? capitalise(deployment.environment) : "Not on Vercel"}
          note={
            deployment.environment
              ? [deployment.commit ? `Commit ${deployment.commit}` : null, deployment.region].filter(Boolean).join(" · ") || "No commit reported"
              : "A local or unknown server answered"
          }
          tone="neutral"
        />
        <Reading label="Data sources" value={`${data.tables.length + data.columns.length - missing.length - failing.length} of ${data.tables.length + data.columns.length}`} note={missing.length ? `${missing.length} waiting for a database update` : "All present"} tone={failing.length ? "bad" : "neutral"} />
      </dl>

      <section aria-labelledby="sources-heading">
        <div id="sources-heading">
          <SectionHeading title="Data sources" />
        </div>
        <ul className="divide-y divide-border/70">
          {data.tables.map((source) => (
            <li key={source.key} className="grid gap-x-6 gap-y-1 py-3.5 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1.3fr)] sm:items-center">
              <div className="min-w-0">
                <p className="font-medium">{source.label}</p>
                <p className="truncate font-mono text-xs text-muted-foreground">{source.table}</p>
              </div>
              <div className="text-sm">
                <SourceStatusLabel status={source.status} />
              </div>
              <div className="text-sm text-muted-foreground sm:text-right">
                <p className="tabular-nums">{sourceDetail(source)}</p>
                {source.status === "available" && source.lastAt ? <p className="text-xs">Latest {formatInstantDate(source.lastAt)}</p> : null}
              </div>
            </li>
          ))}
          {data.columns.map((source) => (
            <li key={source.key} className="grid gap-x-6 gap-y-1 py-3.5 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1.3fr)] sm:items-center">
              <div className="min-w-0">
                <p className="font-medium">{source.label}</p>
                <p className="truncate font-mono text-xs text-muted-foreground">{source.table}</p>
              </div>
              <div className="text-sm">
                <SourceStatusLabel status={source.status} />
              </div>
              <p className="text-sm text-muted-foreground sm:text-right">{sourceDetail(source)}</p>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="monitoring-heading">
        <div id="monitoring-heading">
          <SectionHeading title="Hosting monitoring" />
        </div>
        <ul className="divide-y divide-border/70">
          <VercelRow />
          <Monitor
            name="Supabase"
            covers="Database load, connections and storage"
            needs="Not connected. The database response time and row counts above are measured directly; use the Supabase dashboard for load and storage."
          />
        </ul>
        <p className="mt-3 text-sm text-muted-foreground">This page shows no error rates or response times it cannot measure, rather than guessing them.</p>
      </section>
    </div>
  );
}

const deploymentWords: Record<string, string> = { ready: "Ready", error: "Failed", building: "Building", queued: "Queued", canceled: "Canceled", unknown: "Unknown" };

/** Vercel, if the owner connected it: the newest production deployment and the recent ones. A GET; changes nothing. */
function VercelRow() {
  const monitoring = usePlatformMonitoring();
  const covers = "Deployments and whether they succeeded";
  if (monitoring.isPending) {
    return (
      <li className="py-3.5" role="status" aria-label="Checking Vercel">
        <p className="font-medium">Vercel</p>
        <Skeleton className="mt-2 h-4 w-48" />
      </li>
    );
  }
  if (monitoring.isError) {
    return <Monitor name="Vercel" covers={covers} status="error" label="Could not be read" needs="The monitoring read failed. Try again." />;
  }
  const vercel = monitoring.data.vercel;
  if (!vercel.connected) {
    return <Monitor name="Vercel" covers={covers} needs="Not connected. Set PLATFORM_VERCEL_TOKEN and PLATFORM_VERCEL_PROJECT_ID as server secrets, then redeploy." />;
  }
  if (!vercel.ok) {
    return (
      <Monitor
        name="Vercel"
        covers={covers}
        status="error"
        label="Could not be read"
        needs={vercel.status ? `Vercel answered ${vercel.status}. Check the token's access and the project id.` : "Vercel could not be reached."}
      />
    );
  }
  const latest = vercel.latestProduction;
  return (
    <li className="py-3.5">
      <div className="grid gap-x-6 gap-y-1 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1.3fr)] sm:items-center">
        <div>
          <p className="font-medium">Vercel</p>
          <p className="text-xs text-muted-foreground">{covers}</p>
        </div>
        <div className="text-sm">
          <SourceStatusLabel status={vercel.newestFailed ? "error" : "available"} label={vercel.newestFailed ? "Newest deployment failed" : "Connected"} />
        </div>
        <p className="text-sm text-muted-foreground sm:text-right">
          {latest ? `Live: ${deploymentWords[latest.state]}${latest.commit ? ` · ${latest.commit}` : ""}${latest.createdAt ? ` · ${sinceText(latest.createdAt)}` : ""}` : "No production deployment in the latest eight"}
        </p>
      </div>
      <ul className="mt-3 divide-y divide-border/50 rounded-lg border border-border/70 px-3">
        {vercel.deployments.map((deployment) => (
          <li key={deployment.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 py-2 text-sm">
            <span className="min-w-0">
              <span className={cn("font-medium", deployment.state === "error" && "text-destructive")}>{deploymentWords[deployment.state]}</span>
              {deployment.production ? <span className="text-muted-foreground"> · Production</span> : <span className="text-muted-foreground"> · Preview</span>}
              {deployment.message ? <span className="block truncate text-xs text-muted-foreground">{deployment.message}</span> : null}
            </span>
            <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
              {[deployment.commit, deployment.createdAt ? sinceText(deployment.createdAt) : null].filter(Boolean).join(" · ")}
            </span>
          </li>
        ))}
      </ul>
    </li>
  );
}

function Reading({ label, value, note, tone }: { label: string; value: string; note: string; tone: "ok" | "bad" | "neutral" }) {
  return (
    <div className="py-5 sm:px-6 sm:first:pl-0">
      <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">{label}</dt>
      <dd className={cn("mt-2 text-3xl font-semibold tabular-nums", tone === "bad" && "text-destructive")}>{value}</dd>
      <dd className="mt-1 text-sm text-muted-foreground">{note}</dd>
    </div>
  );
}

function Monitor({ name, covers, needs, status = "missing", label = "Not connected" }: { name: string; covers: string; needs: string; status?: "missing" | "error"; label?: string }) {
  return (
    <li className="grid gap-x-6 gap-y-1 py-3.5 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1.3fr)] sm:items-center">
      <div>
        <p className="font-medium">{name}</p>
        <p className="text-xs text-muted-foreground">{covers}</p>
      </div>
      <div className="text-sm">
        <SourceStatusLabel status={status} label={label} />
      </div>
      <p className="text-sm text-muted-foreground sm:text-right">{needs}</p>
    </li>
  );
}

function SystemSkeleton() {
  return (
    <div className="space-y-12" aria-label="Reading the system" role="status">
      <div className="grid grid-cols-1 gap-6 border-b border-border/80 pb-5 sm:grid-cols-3">
        {[0, 1, 2].map((key) => (
          <div key={key} className="space-y-3 py-2">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-8 w-32" />
            <Skeleton className="h-3 w-40" />
          </div>
        ))}
      </div>
      <div className="space-y-4">
        {Array.from({ length: 6 }, (_, key) => (
          <Skeleton key={key} className="h-10 w-full" />
        ))}
      </div>
    </div>
  );
}

const capitalise = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);
