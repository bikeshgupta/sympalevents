import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useSession } from "@/lib/auth";
import { useEventContext } from "@/lib/event-context";

/**
 * Teams, fixtures, and the points table derived from them.
 *
 * Both come from `/api/event-schedule?resource=teams|fixtures` - a fixture is
 * a scheduled thing, and there is no room for another function under api/.
 * Neither goes through `useEventData()` and neither can: `event_teams` and
 * `event_fixtures` have RLS on with no policies, so the browser's Supabase
 * client cannot read them at all.
 */

export type Team = {
  id: string;
  name: string;
  captainName: string;
  unit: string;
  members: { name: string; unit: string | null }[];
  updatedAt?: string;
};

export type FixtureStatus = "scheduled" | "in_progress" | "completed" | "cancelled";

export type Fixture = {
  id: string;
  stage: string;
  roundNumber: number | null;
  homeTeamId: string | null;
  awayTeamId: string | null;
  /** Stands in for a side nobody knows yet: "Winner of match 10". */
  homeLabel: string;
  awayLabel: string;
  scheduledAt: string | null;
  venue: string;
  /** Text, not a number - cricket is "124/6", badminton is "21-18, 21-15". */
  homeScore: string;
  awayScore: string;
  winnerTeamId: string | null;
  isDraw: boolean;
  status: FixtureStatus;
  notes: string;
};

type TeamsResponse = { teams: Team[]; ready: boolean; canEdit: boolean };
type FixturesResponse = { fixtures: Fixture[]; ready: boolean; canEdit: boolean };

export function useTeams(eventId?: string) {
  const queryClient = useQueryClient();
  const { data: session } = useSession();

  const query = useQuery({
    queryKey: ["teams", eventId, session?.user.appUserId ?? "guest"],
    enabled: Boolean(eventId),
    queryFn: () =>
      apiFetch<TeamsResponse>(`/api/event-schedule?resource=teams&eventId=${encodeURIComponent(eventId!)}`, {
        requireAuth: false,
      }),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["teams", eventId] });

  const save = useMutation({
    mutationFn: (team: Partial<Team> & { name: string }) =>
      apiFetch<{ teamId: string }>(`/api/event-schedule?resource=teams&eventId=${encodeURIComponent(eventId!)}`, {
        method: team.id ? "PATCH" : "POST",
        body: team,
      }),
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ deleted: boolean }>(
        `/api/event-schedule?resource=teams&eventId=${encodeURIComponent(eventId!)}&id=${encodeURIComponent(id)}`,
        { method: "DELETE" },
      ),
    onSuccess: invalidate,
  });

  return { query, save, remove };
}

export function useFixtures(eventId?: string) {
  const queryClient = useQueryClient();
  const { data: session } = useSession();

  const query = useQuery({
    queryKey: ["fixtures", eventId, session?.user.appUserId ?? "guest"],
    enabled: Boolean(eventId),
    queryFn: () =>
      apiFetch<FixturesResponse>(`/api/event-schedule?resource=fixtures&eventId=${encodeURIComponent(eventId!)}`, {
        requireAuth: false,
      }),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["fixtures", eventId] });

  const save = useMutation({
    mutationFn: (fixture: Partial<Fixture>) =>
      apiFetch<{ fixtureId: string }>(`/api/event-schedule?resource=fixtures&eventId=${encodeURIComponent(eventId!)}`, {
        method: fixture.id ? "PATCH" : "POST",
        body: fixture,
      }),
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ deleted: boolean }>(
        `/api/event-schedule?resource=fixtures&eventId=${encodeURIComponent(eventId!)}&id=${encodeURIComponent(id)}`,
        { method: "DELETE" },
      ),
    onSuccess: invalidate,
  });

  return { query, save, remove };
}

/** The current event, for a page that does not want to reach for the context. */
export function useSelectedEventId() {
  return useEventContext().selectedEventId;
}

export type StandingsRow = {
  teamId: string;
  name: string;
  played: number;
  won: number;
  lost: number;
  drawn: number;
  points: number;
};

/**
 * Two points for a win, one for a draw, none for a loss.
 *
 * Derived rather than stored, on purpose: a standings table in the database is
 * a second copy of the same truth, and it goes stale the moment somebody
 * corrects a score. Only completed fixtures count - a cancelled match did not
 * happen, and a scheduled one has not yet.
 */
export const POINTS_FOR_WIN = 2;
export const POINTS_FOR_DRAW = 1;

export function buildStandings(teams: Team[], fixtures: Fixture[]): StandingsRow[] {
  const rows = new Map<string, StandingsRow>(
    teams.map((team) => [
      team.id,
      { teamId: team.id, name: team.name, played: 0, won: 0, lost: 0, drawn: 0, points: 0 },
    ]),
  );

  for (const fixture of fixtures) {
    if (fixture.status !== "completed") continue;

    const sides = [fixture.homeTeamId, fixture.awayTeamId].filter(Boolean) as string[];
    if (sides.length !== 2) continue;

    for (const teamId of sides) {
      const row = rows.get(teamId);
      if (!row) continue;
      row.played += 1;

      if (fixture.isDraw) {
        row.drawn += 1;
        row.points += POINTS_FOR_DRAW;
      } else if (fixture.winnerTeamId === teamId) {
        row.won += 1;
        row.points += POINTS_FOR_WIN;
      } else if (fixture.winnerTeamId) {
        row.lost += 1;
      }
    }
  }

  return [...rows.values()].sort(
    (left, right) => right.points - left.points || right.won - left.won || left.name.localeCompare(right.name),
  );
}

/** Teams by id, for rendering a fixture's two sides. */
export function teamNameLookup(teams: Team[]) {
  const byId = new Map(teams.map((team) => [team.id, team.name]));
  return (teamId: string | null, fallbackLabel: string) => byId.get(teamId ?? "") ?? fallbackLabel ?? "To be decided";
}
