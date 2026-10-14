import { ArrowRight, ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";
import { SocietyForm } from "@/features/settings/society-card";
import type { SocietyOption } from "@/lib/event-context";
import { useSocietyOverview } from "@/lib/society-admin";
import { cn } from "@/lib/utils";

/**
 * The society at a glance: who is in it, what it is running, and what is waiting - then its details and the
 * code that lets residents in.
 *
 * Deliberately lightweight, and deliberately not boxed: it is built from type, spacing and hairlines in the same
 * language as Society Home (a stat is a number over a label, sections are divided by a thin rule), rather than
 * from a card per figure. It is management information, not the analytics product, and counts only this
 * society's own members and events. Every number still opens the list it counts, with the same filter in the
 * address (`?tab=members&filter=admin`) as before.
 */
export function OverviewTab({ society }: { society: SocietyOption }) {
  const { data, isLoading, error } = useSocietyOverview(society.id);

  if (error) {
    return (
      <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
        {error instanceof Error ? error.message : "Could not load the society."}
      </p>
    );
  }

  const members = data?.members;
  const events = data?.events;
  const pending = data?.pendingProposals ?? null;

  return (
    <div>
      {/* Waiting work comes first, so an admin does not have to go looking for it.
          Null means the proposals table does not exist yet, which is not "none". */}
      {pending !== null && pending > 0 ? (
        <div className="flex items-center gap-3 border-b pb-4">
          <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full bg-primary" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold">
              {pending} event {pending === 1 ? "proposal" : "proposals"}
            </p>
            <p className="text-sm text-muted-foreground">Waiting for review</p>
          </div>
          <span className="inline-flex min-h-10 items-center gap-1 text-sm font-medium text-primary">
            Review
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </span>
        </div>
      ) : null}

      <StatSection
        heading="People"
        link={{ to: "?tab=members", label: "Manage members" }}
        loading={isLoading}
        stats={[
          { label: "Members", value: members?.total, to: "?tab=members", title: "Show all members" },
          { label: "Admins", value: members?.admins, to: "?tab=members&filter=admin", title: "Show society admins" },
          { label: "Committee", value: members?.committee, to: "?tab=members&filter=committee", title: "Show committee members" },
          { label: "Residents", value: members?.residents, to: "?tab=members&filter=resident", title: "Show residents" },
        ]}
      />

      <StatSection
        heading="Events"
        link={{ to: "?tab=events", label: "Events & access" }}
        loading={isLoading}
        divided
        stats={[
          { label: "Total", value: events?.total, to: "?tab=events", title: "Show all events" },
          { label: "Upcoming", value: events?.upcoming, to: "?tab=events&filter=upcoming", title: "Show upcoming events" },
          { label: "Live", value: events?.live, to: "?tab=events&filter=live", title: "Show live events" },
          { label: "Past", value: events?.completed, to: "?tab=events&filter=completed", title: "Show completed events" },
        ]}
        note={
          events && events.draft > 0
            ? `Total includes ${events.draft} ${events.draft === 1 ? "draft" : "drafts"}, which ${events.draft === 1 ? "is" : "are"} not published yet.`
            : null
        }
      />

      <div className="mt-8 border-t pt-8">
        <SocietyForm society={society} inEvent={false} variant="page" />
      </div>
    </div>
  );
}

type Stat = { label: string; value: number | undefined; to: string; title: string };

/**
 * A heading with its link, and a single row of figures under it.
 *
 * No box per figure: a number over a muted label, a hairline between neighbours. The row is four equal columns
 * at every width - four short numbers are what a phone's width holds - and each column is a link of its own, with
 * a visible focus ring and a tap area taller than the figure. A value still loading shows a quiet bar, never a 0.
 */
function StatSection({
  heading,
  link,
  stats,
  loading,
  divided = false,
  note,
}: {
  heading: string;
  link: { to: string; label: string };
  stats: Stat[];
  loading: boolean;
  /** A hairline above the section, used for every section after the first. */
  divided?: boolean;
  note?: string | null;
}) {
  const id = `${heading.toLowerCase()}-heading`;
  return (
    <section aria-labelledby={id} className={cn("pt-5", divided && "mt-5 border-t")}>
      <div className="flex items-center justify-between gap-3">
        <h2 id={id} className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          {heading}
        </h2>
        <Link
          to={link.to}
          className="inline-flex min-h-10 items-center gap-1 rounded-md text-sm font-medium text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {link.label}
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>

      <div className="mt-1 grid grid-cols-4">
        {stats.map((stat, index) => (
          <Link
            key={stat.label}
            to={stat.to}
            title={stat.title}
            className={cn(
              "block min-w-0 py-2 pr-1 transition-colors hover:bg-muted/40",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
              index > 0 && "border-l pl-3 sm:pl-5",
            )}
          >
            {loading || stat.value === undefined ? (
              <span className="block h-8 w-8 animate-pulse rounded bg-muted" aria-hidden="true" />
            ) : (
              <span className="block text-3xl font-semibold leading-none tabular-nums">{stat.value}</span>
            )}
            <span className="mt-1.5 block truncate text-[13px] text-muted-foreground">{stat.label}</span>
          </Link>
        ))}
      </div>

      {note ? <p className="mt-2 text-xs text-muted-foreground">{note}</p> : null}
    </section>
  );
}
