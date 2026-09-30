import { CalendarDays, CheckCircle2, ListOrdered, Plus, Timer, Trash2 } from "lucide-react";
import { FormEvent, useMemo, useState } from "react";
import { StatCard, StatGrid } from "@/components/shared/stat-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatEventTimestampTime, formatEventTimestampWeekday } from "@/features/dashboard/dashboard-utils";
import { useEventContext } from "@/lib/event-context";
import { buildStandings, teamNameLookup, useFixtures, useTeams, type Fixture } from "@/lib/fixtures";
import { usePageAccess } from "@/lib/page-access";
import { cn } from "@/lib/utils";
import { useVocabulary } from "@/lib/vocabulary";

/**
 * The fixture list and what it added up to.
 *
 * Cards at every width, like the Tasks board - the alternative is a table wide
 * enough to need sideways scrolling on the phone this is actually read on, at
 * the ground, between matches.
 *
 * The points table is derived here from completed fixtures, never stored. See
 * `buildStandings` in src/lib/fixtures.ts.
 */

type Tab = "all" | "today" | "results" | "upcoming";

const tabLabels: Record<Tab, string> = {
  all: "All",
  today: "Today",
  results: "Results",
  upcoming: "Upcoming",
};

const statusTone: Record<string, string> = {
  completed: "bg-accent text-accent-foreground",
  in_progress: "bg-primary/15 text-primary",
  cancelled: "bg-muted text-muted-foreground",
  scheduled: "bg-secondary text-secondary-foreground",
};

const statusWords: Record<string, string> = {
  completed: "Result in",
  in_progress: "Playing now",
  cancelled: "Cancelled",
  scheduled: "Scheduled",
};

function isSameDay(iso: string | null) {
  if (!iso) return false;
  return formatEventTimestampWeekday(iso) === formatEventTimestampWeekday(new Date().toISOString());
}

export function FixturesPage() {
  const vocab = useVocabulary();
  const { selectedEventId } = useEventContext();
  const access = usePageAccess("fixtures");
  const fixtures = useFixtures(selectedEventId);
  const teams = useTeams(selectedEventId);

  const [tab, setTab] = useState<Tab>("all");
  const [editing, setEditing] = useState<Fixture | null>(null);
  const [adding, setAdding] = useState(false);

  // `?? []` makes a new array on every render, so the standings memo below
  // would never actually memoise. These give it a stable dependency.
  const rows = useMemo(() => fixtures.query.data?.fixtures ?? [], [fixtures.query.data]);
  const teamRows = useMemo(() => teams.query.data?.teams ?? [], [teams.query.data]);
  const ready = fixtures.query.data?.ready ?? true;
  const canEdit = access.canEdit && ready;

  const nameFor = teamNameLookup(teamRows);
  const standings = useMemo(() => buildStandings(teamRows, rows), [teamRows, rows]);

  const played = rows.filter((row) => row.status === "completed").length;
  const remaining = rows.filter((row) => row.status === "scheduled" || row.status === "in_progress").length;
  const todayCount = rows.filter((row) => isSameDay(row.scheduledAt)).length;

  const visible = rows.filter((row) => {
    if (tab === "results") return row.status === "completed";
    if (tab === "upcoming") return row.status === "scheduled" || row.status === "in_progress";
    if (tab === "today") return isSameDay(row.scheduledAt);
    return true;
  });

  // Group by the day they are played, so a four-day tournament reads as four
  // days rather than one long list.
  const byDay = new Map<string, Fixture[]>();
  for (const fixture of visible) {
    const key = fixture.scheduledAt ? formatEventTimestampWeekday(fixture.scheduledAt) : "Not scheduled yet";
    byDay.set(key, [...(byDay.get(key) ?? []), fixture]);
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold">{vocab.labelFor("fixtures")}</h2>
          <p className="text-sm text-muted-foreground">Who plays whom, when, and how it went.</p>
        </div>
        {canEdit ? (
          <Button onClick={() => setAdding(true)}>
            <Plus className="h-4 w-4" />
            Add match
          </Button>
        ) : (
          <span className="text-sm text-muted-foreground">View-only access</span>
        )}
      </div>

      {!ready ? (
        <p className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-900">
          Fixtures are not set up yet. Run{" "}
          <span className="font-medium">supabase/migrations/025_sports_fixtures.sql</span> to start adding them.
        </p>
      ) : null}

      <StatGrid>
        <StatCard title="Played" value={String(played)} icon={CheckCircle2} isLoading={fixtures.query.isLoading} />
        <StatCard title="Remaining" shortTitle="Left" value={String(remaining)} icon={Timer} isLoading={fixtures.query.isLoading} />
        <StatCard title="Teams" value={String(teamRows.length)} icon={ListOrdered} isLoading={teams.query.isLoading} />
        <StatCard title="Today" value={String(todayCount)} icon={CalendarDays} isLoading={fixtures.query.isLoading} />
      </StatGrid>

      <div role="tablist" aria-label="Filter fixtures" className="flex flex-wrap gap-2">
        {(Object.keys(tabLabels) as Tab[]).map((item) => (
          <button
            key={item}
            type="button"
            role="tab"
            aria-selected={tab === item}
            onClick={() => setTab(item)}
            className={cn(
              "h-10 rounded-full border px-4 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              tab === item ? "border-primary bg-primary text-primary-foreground" : "bg-card",
            )}
          >
            {tabLabels[item]}
          </button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_0.7fr] lg:items-start">
        <div role="tabpanel" aria-label={`${tabLabels[tab]} fixtures`} className="space-y-4">
          {fixtures.query.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading fixtures…</p>
          ) : !visible.length ? (
            <Card>
              <CardContent className="py-10 text-center">
                <p className="text-sm font-medium">Nothing here</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {rows.length
                    ? "No match matches this filter."
                    : canEdit
                      ? "Add the first match. Teams come from the Teams page."
                      : "The committee has not put up the fixture list yet."}
                </p>
              </CardContent>
            </Card>
          ) : (
            [...byDay.entries()].map(([day, dayFixtures]) => (
              <section key={day} className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{day}</h3>
                <div className="space-y-2">
                  {dayFixtures.map((fixture) => (
                    <FixtureCard
                      key={fixture.id}
                      fixture={fixture}
                      nameFor={nameFor}
                      canEdit={canEdit}
                      onEdit={() => setEditing(fixture)}
                      onDelete={() => {
                        if (!window.confirm("Delete this match?")) return;
                        void fixtures.remove.mutateAsync(fixture.id);
                      }}
                    />
                  ))}
                </div>
              </section>
            ))
          )}
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ListOrdered className="h-5 w-5" aria-hidden />
              Points table
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!standings.length ? (
              <p className="text-sm text-muted-foreground">
                It fills in as results are recorded. Two points for a win, one for a draw.
              </p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                    <th scope="col" className="pb-2 font-semibold">
                      Team
                    </th>
                    <th scope="col" className="pb-2 text-right font-semibold">
                      P
                    </th>
                    <th scope="col" className="pb-2 text-right font-semibold">
                      W
                    </th>
                    <th scope="col" className="pb-2 text-right font-semibold">
                      L
                    </th>
                    <th scope="col" className="pb-2 text-right font-semibold">
                      Pts
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {standings.map((row) => (
                    <tr key={row.teamId} className="border-t">
                      <td className="py-2 font-medium">{row.name}</td>
                      <td className="py-2 text-right tabular-nums text-muted-foreground">{row.played}</td>
                      <td className="py-2 text-right tabular-nums text-muted-foreground">{row.won}</td>
                      <td className="py-2 text-right tabular-nums text-muted-foreground">{row.lost}</td>
                      <td className="py-2 text-right font-semibold tabular-nums">{row.points}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      </div>

      {adding || editing ? (
        <FixtureDialog
          fixture={editing}
          teams={teamRows}
          saving={fixtures.save.isPending}
          onClose={() => {
            setAdding(false);
            setEditing(null);
          }}
          onSave={async (fixture) => {
            await fixtures.save.mutateAsync(fixture);
            setAdding(false);
            setEditing(null);
          }}
        />
      ) : null}
    </div>
  );
}

function FixtureCard({
  fixture,
  nameFor,
  canEdit,
  onEdit,
  onDelete,
}: {
  fixture: Fixture;
  nameFor: (teamId: string | null, fallback: string) => string;
  canEdit: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const home = nameFor(fixture.homeTeamId, fixture.homeLabel);
  const away = nameFor(fixture.awayTeamId, fixture.awayLabel);
  const done = fixture.status === "completed";

  const outcome = done
    ? fixture.isDraw
      ? "Match drawn"
      : fixture.winnerTeamId
        ? `${nameFor(fixture.winnerTeamId, "")} won`
        : "Result recorded"
    : fixture.status === "cancelled"
      ? "Cancelled"
      : fixture.status === "in_progress"
        ? "Playing now"
        : "Not started";

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground tabular-nums">
            {fixture.scheduledAt ? formatEventTimestampTime(fixture.scheduledAt) : "Time to be fixed"}
            {fixture.venue ? ` · ${fixture.venue}` : ""}
          </span>
          <span className="flex-1" />
          {fixture.stage ? (
            <span className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
              {fixture.stage}
            </span>
          ) : null}
          <span className={cn("rounded-full px-2.5 py-1 text-[11px] font-medium", statusTone[fixture.status])}>
            {statusWords[fixture.status] ?? fixture.status}
          </span>
        </div>

        <div className="flex items-center gap-3">
          <span className="min-w-0 flex-1 truncate text-sm font-semibold sm:text-base">{home}</span>
          {done ? (
            <span className="shrink-0 text-sm font-bold tabular-nums sm:text-base">
              {fixture.homeScore || "—"} <span className="font-normal text-muted-foreground">–</span>{" "}
              {fixture.awayScore || "—"}
            </span>
          ) : (
            <span className="shrink-0 text-xs text-muted-foreground">v</span>
          )}
          <span className="min-w-0 flex-1 truncate text-right text-sm font-semibold sm:text-base">{away}</span>
        </div>

        <div className="flex items-center gap-2">
          <span className={cn("text-sm", done ? "font-medium text-primary" : "text-muted-foreground")}>{outcome}</span>
          <span className="flex-1" />
          {canEdit ? (
            <>
              <Button variant="outline" size="sm" onClick={onEdit}>
                Edit
              </Button>
              <Button variant="outline" size="sm" aria-label="Delete this match" onClick={onDelete}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </>
          ) : null}
        </div>

        {fixture.notes ? <p className="text-xs text-muted-foreground">{fixture.notes}</p> : null}
      </CardContent>
    </Card>
  );
}

function FixtureDialog({
  fixture,
  teams,
  saving,
  onClose,
  onSave,
}: {
  fixture: Fixture | null;
  teams: { id: string; name: string }[];
  saving: boolean;
  onClose: () => void;
  onSave: (fixture: Partial<Fixture>) => Promise<void>;
}) {
  const [stage, setStage] = useState(fixture?.stage ?? "");
  const [homeTeamId, setHomeTeamId] = useState(fixture?.homeTeamId ?? "");
  const [awayTeamId, setAwayTeamId] = useState(fixture?.awayTeamId ?? "");
  const [scheduledAt, setScheduledAt] = useState(
    fixture?.scheduledAt ? fixture.scheduledAt.slice(0, 16) : "",
  );
  const [venue, setVenue] = useState(fixture?.venue ?? "");
  const [homeScore, setHomeScore] = useState(fixture?.homeScore ?? "");
  const [awayScore, setAwayScore] = useState(fixture?.awayScore ?? "");
  const [status, setStatus] = useState(fixture?.status ?? "scheduled");
  const [result, setResult] = useState(fixture?.isDraw ? "draw" : (fixture?.winnerTeamId ?? ""));
  const [notes, setNotes] = useState(fixture?.notes ?? "");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      await onSave({
        id: fixture?.id,
        stage,
        homeTeamId: homeTeamId || null,
        awayTeamId: awayTeamId || null,
        scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : null,
        venue,
        homeScore,
        awayScore,
        status: status as Fixture["status"],
        isDraw: result === "draw",
        winnerTeamId: result === "draw" || !result ? null : result,
        notes,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the match");
    }
  }

  return (
    <Dialog open onOpenChange={(open) => (open ? null : onClose())}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{fixture ? "Edit match" : "Add match"}</DialogTitle>
        </DialogHeader>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="home-team">Home side</Label>
              <select
                id="home-team"
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                value={homeTeamId}
                onChange={(field) => setHomeTeamId(field.target.value)}
              >
                <option value="">To be decided</option>
                {teams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="away-team">Away side</Label>
              <select
                id="away-team"
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                value={awayTeamId}
                onChange={(field) => setAwayTeamId(field.target.value)}
              >
                <option value="">To be decided</option>
                {teams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fixture-when">When</Label>
              <Input
                id="fixture-when"
                type="datetime-local"
                value={scheduledAt}
                onChange={(field) => setScheduledAt(field.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fixture-venue">Where</Label>
              <Input id="fixture-venue" value={venue} onChange={(field) => setVenue(field.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fixture-stage">Stage</Label>
              <Input
                id="fixture-stage"
                value={stage}
                onChange={(field) => setStage(field.target.value)}
                placeholder="Group stage"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fixture-status">Status</Label>
              <select
                id="fixture-status"
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                value={status}
                onChange={(field) => setStatus(field.target.value as Fixture["status"])}
              >
                <option value="scheduled">Scheduled</option>
                <option value="in_progress">Playing now</option>
                <option value="completed">Result in</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="home-score">Home score</Label>
              <Input
                id="home-score"
                value={homeScore}
                onChange={(field) => setHomeScore(field.target.value)}
                placeholder="124/6"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="away-score">Away score</Label>
              <Input
                id="away-score"
                value={awayScore}
                onChange={(field) => setAwayScore(field.target.value)}
                placeholder="118/9"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="fixture-result">Result</Label>
            <select
              id="fixture-result"
              className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              value={result}
              onChange={(field) => setResult(field.target.value)}
            >
              <option value="">Not decided</option>
              {homeTeamId ? <option value={homeTeamId}>{teams.find((t) => t.id === homeTeamId)?.name} won</option> : null}
              {awayTeamId ? <option value={awayTeamId}>{teams.find((t) => t.id === awayTeamId)?.name} won</option> : null}
              <option value="draw">Drawn</option>
            </select>
            <p className="text-xs text-muted-foreground">
              The points table counts a match only once its status is &ldquo;Result in&rdquo;. Two points for a win,
              one for a draw.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="fixture-notes">Notes</Label>
            <Input id="fixture-notes" value={notes} onChange={(field) => setNotes(field.target.value)} />
          </div>

          {error ? <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : "Save match"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
