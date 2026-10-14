import { CalendarCheck, CalendarClock, CalendarDays, ChevronRight, Radio, ShieldCheck, UserCog, UserRound, Users } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { StatCard, StatGrid } from "@/components/shared/stat-card";
import { Card, CardContent } from "@/components/ui/card";
import { SocietyForm } from "@/features/settings/society-card";
import type { SocietyOption } from "@/lib/event-context";
import { useSocietyOverview } from "@/lib/society-admin";

/**
 * The society at a glance: who is in it, what it is running, and what is
 * waiting. Deliberately lightweight - this is management information, not the
 * analytics product, and it counts only this society's own members and events.
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
  const show = (value: number | undefined) => (value === undefined ? "…" : String(value));

  return (
    <div className="space-y-6">
      {/* Waiting work comes first, so an admin does not have to go looking for it.
          Null means the proposals table does not exist yet, which is not "none". */}
      {pending !== null && pending > 0 ? (
        <Card className="border-primary/40 bg-primary/5">
          <CardContent className="flex items-center gap-3 p-4">
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
          </CardContent>
        </Card>
      ) : null}

      <section aria-labelledby="people-heading" className="space-y-2">
        <div className="flex items-baseline justify-between">
          <h2 id="people-heading" className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            People
          </h2>
          <Link to="?tab=members" className="inline-flex min-h-10 items-center text-sm font-medium text-primary">
            Manage members
          </Link>
        </div>
        <StatGrid>
          <Tile to="?tab=members" label="Show all members"><StatCard title="Members" value={show(members?.total)} icon={Users} isLoading={isLoading} /></Tile>
          <Tile to="?tab=members&filter=admin" label="Show society admins"><StatCard title="Society admins" shortTitle="Admins" value={show(members?.admins)} icon={ShieldCheck} isLoading={isLoading} /></Tile>
          <Tile to="?tab=members&filter=committee" label="Show committee members"><StatCard title="Committee" shortTitle="Team" value={show(members?.committee)} icon={UserCog} isLoading={isLoading} /></Tile>
          <Tile to="?tab=members&filter=resident" label="Show residents"><StatCard title="Residents" value={show(members?.residents)} icon={UserRound} isLoading={isLoading} /></Tile>
        </StatGrid>
      </section>

      <section aria-labelledby="events-heading" className="space-y-2">
        <div className="flex items-baseline justify-between">
          <h2 id="events-heading" className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Events
          </h2>
          <Link to="?tab=events" className="inline-flex min-h-10 items-center text-sm font-medium text-primary">
            Events &amp; access
          </Link>
        </div>
        <StatGrid>
          <Tile to="?tab=events" label="Show all events"><StatCard title="Total events" shortTitle="Total" value={show(events?.total)} icon={CalendarDays} isLoading={isLoading} /></Tile>
          <Tile to="?tab=events&filter=upcoming" label="Show upcoming events"><StatCard title="Upcoming" value={show(events?.upcoming)} icon={CalendarClock} isLoading={isLoading} /></Tile>
          <Tile to="?tab=events&filter=live" label="Show live events"><StatCard title="Live" value={show(events?.live)} icon={Radio} isLoading={isLoading} /></Tile>
          <Tile to="?tab=events&filter=completed" label="Show completed events"><StatCard title="Completed" shortTitle="Past" value={show(events?.completed)} icon={CalendarCheck} isLoading={isLoading} /></Tile>
        </StatGrid>
        {events && events.draft > 0 ? (
          <p className="text-xs text-muted-foreground">
            Total includes {events.draft} {events.draft === 1 ? "draft" : "drafts"}, which {events.draft === 1 ? "is" : "are"} not published yet.
          </p>
        ) : null}
      </section>

      <section aria-label="Society details">
        <SocietyForm society={society} inEvent={false} />
      </section>
    </div>
  );
}

/** A tile that opens the list it counts. The card keeps its own look; the link only adds the way in. */
function Tile({ to, label, children }: { to: string; label: string; children: ReactNode }) {
  return (
    <Link
      to={to}
      title={label}
      className="block min-w-0 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {children}
    </Link>
  );
}
