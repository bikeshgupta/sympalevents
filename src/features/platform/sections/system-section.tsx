import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { QueryState, Skeleton } from "../data-states";
import { formatCount, formatInstantDate, sourceDetail } from "../format";
import { PageHeader, SectionHeading } from "../page-header";
import { usePlatformSources, type PlatformSources } from "../platform-api";
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
            onClick={() => void sources.refetch()}
            disabled={sources.isFetching}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border bg-card px-3 text-sm hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
          >
            <RefreshCw className={cn("h-4 w-4", sources.isFetching && "animate-spin")} aria-hidden="true" />
            {sources.isFetching ? "Reading" : "Read again"}
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
          <Monitor name="Vercel" covers="Deployments, failed requests and response times" needs="Needs a Vercel API token stored as a server secret." />
          <Monitor name="Supabase" covers="Database load, connections and storage" needs="Needs a Supabase management token stored as a server secret." />
        </ul>
        <p className="mt-3 text-sm text-muted-foreground">Until these are connected, this page shows no error rates or response times rather than guessing them.</p>
      </section>
    </div>
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

function Monitor({ name, covers, needs }: { name: string; covers: string; needs: string }) {
  return (
    <li className="grid gap-x-6 gap-y-1 py-3.5 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1.3fr)] sm:items-center">
      <div>
        <p className="font-medium">{name}</p>
        <p className="text-xs text-muted-foreground">{covers}</p>
      </div>
      <div className="text-sm">
        <SourceStatusLabel status="missing" label="Not connected" />
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
