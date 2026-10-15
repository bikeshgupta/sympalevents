import { formatInstantDate, sourceDetail } from "../format";
import { QueryState, Skeleton } from "../data-states";
import { PageHeader, SectionHeading } from "../page-header";
import { usePlatformSources, type PlatformSources } from "../platform-api";
import type { PlatformSection } from "../platform-sections";
import { SourceStatusLabel } from "../source-status";

/**
 * A section that is not built yet. It shows no figures, because there are none behind it yet. Instead it says
 * what it will show and, from a live read of the database, which of the data it needs already exists and since
 * when. That is useful today (it is the coverage the finished section will have) and it cannot mislead.
 */
export function PendingSection({ section }: { section: PlatformSection }) {
  const sources = usePlatformSources();
  return (
    <div>
      <PageHeader title={section.label} summary={section.summary} rangeAware={section.rangeAware} observedAt={sources.data?.observedAt ?? null} />

      <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:gap-14">
        <section aria-labelledby={`${section.key}-plan`}>
          <div id={`${section.key}-plan`}>
            <SectionHeading title={`Coming in phase ${section.phase}`} />
          </div>
          <ul className="mt-4 space-y-3">
            {section.plan.map((line) => (
              <li key={line} className="flex gap-3 text-base leading-relaxed">
                <span aria-hidden="true" className="mt-2.5 h-1 w-3 shrink-0 rounded-full bg-chart-budget" />
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby={`${section.key}-data`}>
          <div id={`${section.key}-data`}>
            <SectionHeading title="The data it will use, right now" />
          </div>
          <QueryState query={sources} skeleton={<SourcesSkeleton count={section.uses.length} />} errorMessage="The data sources could not be read.">
            {(data) => <UsedSources data={data} keys={section.uses} />}
          </QueryState>
        </section>
      </div>
    </div>
  );
}

function UsedSources({ data, keys }: { data: PlatformSources; keys: string[] }) {
  const all = [...data.tables, ...data.columns];
  const used = keys.map((key) => all.find((source) => source.key === key)).filter((source) => source !== undefined);
  return (
    <ul className="divide-y divide-border/70">
      {used.map((source) => (
        <li key={source.key} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3">
          <div className="min-w-0">
            <p className="font-medium">{source.label}</p>
            <p className="text-sm text-muted-foreground tabular-nums">
              {sourceDetail(source)}
              {source.kind === "table" && source.status === "available" && source.lastAt ? ` · latest ${formatInstantDate(source.lastAt)}` : ""}
            </p>
          </div>
          <span className="text-sm">
            <SourceStatusLabel status={source.status} />
          </span>
        </li>
      ))}
    </ul>
  );
}

function SourcesSkeleton({ count }: { count: number }) {
  return (
    <div role="status" aria-label="Reading the data sources" className="mt-2 space-y-4">
      {Array.from({ length: count }, (_, key) => (
        <div key={key} className="space-y-2 py-1">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-3 w-56" />
        </div>
      ))}
    </div>
  );
}
