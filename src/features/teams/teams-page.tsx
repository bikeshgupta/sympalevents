import { Plus, Shield, Trash2, UserRound, Users } from "lucide-react";
import { FormEvent, useState } from "react";
import { StatCard, StatGrid } from "@/components/shared/stat-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useEventContext } from "@/lib/event-context";
import { useTeams, type Team } from "@/lib/fixtures";
import { usePageAccess } from "@/lib/page-access";
import { useVocabulary } from "@/lib/vocabulary";

/**
 * Who is playing. One card per team, with its squad behind the card rather
 * than in a wide table - a roster is read on a phone at the ground.
 */
export function TeamsPage() {
  const vocab = useVocabulary();
  const { selectedEventId } = useEventContext();
  const access = usePageAccess("teams");
  const { query, save, remove } = useTeams(selectedEventId);

  const [editing, setEditing] = useState<Team | null>(null);
  const [adding, setAdding] = useState(false);

  const teams = query.data?.teams ?? [];
  const ready = query.data?.ready ?? true;
  const canEdit = access.canEdit && ready;
  const playerCount = teams.reduce((sum, team) => sum + team.members.length, 0);
  const withoutCaptain = teams.filter((team) => !team.captainName.trim()).length;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold">{vocab.labelFor("teams")}</h2>
          <p className="text-sm text-muted-foreground">
            Everyone taking part, and who is leading each side.
          </p>
        </div>
        {canEdit ? (
          <Button onClick={() => setAdding(true)}>
            <Plus className="h-4 w-4" />
            Add team
          </Button>
        ) : (
          <span className="text-sm text-muted-foreground">View-only access</span>
        )}
      </div>

      {!ready ? (
        <p className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-900">
          Teams are not set up yet. Run <span className="font-medium">supabase/migrations/025_sports_fixtures.sql</span>{" "}
          to start adding them.
        </p>
      ) : null}

      <StatGrid>
        <StatCard title="Teams" value={String(teams.length)} icon={Users} isLoading={query.isLoading} />
        <StatCard title="Players" value={String(playerCount)} icon={UserRound} isLoading={query.isLoading} />
        <StatCard
          title="No captain"
          shortTitle="No lead"
          value={String(withoutCaptain)}
          icon={Shield}
          isLoading={query.isLoading}
          note={withoutCaptain ? "Someone has to answer for the side" : "Every side has a captain"}
        />
      </StatGrid>

      {query.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading teams…</p>
      ) : !teams.length ? (
        <Card>
          <CardContent className="py-10 text-center">
            <p className="text-sm font-medium">No teams yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {canEdit
                ? "Add the sides that are taking part. Fixtures are built from them."
                : "The committee has not added the sides yet."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {teams.map((team) => (
            <Card key={team.id}>
              <CardContent className="space-y-3 p-4">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-base font-semibold">{team.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {team.unit ? `${team.unit} · ` : ""}
                      {team.members.length} player{team.members.length === 1 ? "" : "s"}
                    </p>
                  </div>
                  {canEdit ? (
                    <div className="flex shrink-0 gap-1">
                      <Button variant="outline" size="sm" onClick={() => setEditing(team)}>
                        Edit
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        aria-label={`Remove ${team.name}`}
                        onClick={() => {
                          if (!window.confirm(`Remove ${team.name}? Its matches stay, without that side.`)) return;
                          void remove.mutateAsync(team.id);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : null}
                </div>

                <p className="text-sm">
                  <span className="text-muted-foreground">Captain: </span>
                  {team.captainName || <span className="text-muted-foreground">nobody yet</span>}
                </p>

                {team.members.length ? (
                  <ul className="flex flex-wrap gap-1.5">
                    {team.members.map((member) => (
                      <li
                        key={`${team.id}-${member.name}`}
                        className="rounded-full bg-muted px-2.5 py-1 text-xs"
                      >
                        {member.name}
                        {member.unit ? <span className="ml-1 text-muted-foreground">{member.unit}</span> : null}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-muted-foreground">No squad listed yet.</p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {adding || editing ? (
        <TeamDialog
          team={editing}
          unitLabel={vocab.unit}
          saving={save.isPending}
          onClose={() => {
            setAdding(false);
            setEditing(null);
          }}
          onSave={async (team) => {
            await save.mutateAsync(team);
            setAdding(false);
            setEditing(null);
          }}
        />
      ) : null}
    </div>
  );
}

function TeamDialog({
  team,
  unitLabel,
  saving,
  onClose,
  onSave,
}: {
  team: Team | null;
  unitLabel: string;
  saving: boolean;
  onClose: () => void;
  onSave: (team: Partial<Team> & { name: string }) => Promise<void>;
}) {
  const [name, setName] = useState(team?.name ?? "");
  const [captainName, setCaptainName] = useState(team?.captainName ?? "");
  const [unit, setUnit] = useState(team?.unit ?? "");
  // One player per line. A row editor with an add button per player is what
  // made the prasad people-lists slow to fill in on a phone; a textarea is
  // faster for a squad somebody is copying off a sheet.
  const [squad, setSquad] = useState(team?.members.map((member) => member.name).join("\n") ?? "");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      await onSave({
        id: team?.id,
        name: name.trim(),
        captainName: captainName.trim(),
        unit: unit.trim(),
        members: squad
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean)
          .map((line) => ({ name: line, unit: null })),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the team");
    }
  }

  return (
    <Dialog open onOpenChange={(open) => (open ? null : onClose())}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{team ? "Edit team" : "Add team"}</DialogTitle>
        </DialogHeader>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-1.5">
            <Label htmlFor="team-name">Team name</Label>
            <Input id="team-name" value={name} onChange={(field) => setName(field.target.value)} required />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="team-captain">Captain</Label>
              <Input
                id="team-captain"
                value={captainName}
                onChange={(field) => setCaptainName(field.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="team-unit">{unitLabel}</Label>
              <Input
                id="team-unit"
                value={unit}
                onChange={(field) => setUnit(field.target.value)}
                placeholder="A Wing"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="team-squad">Squad</Label>
            <textarea
              id="team-squad"
              value={squad}
              onChange={(field) => setSquad(field.target.value)}
              rows={6}
              className="w-full rounded-md border bg-background p-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              placeholder={"One player per line"}
            />
            <p className="text-xs text-muted-foreground">One player per line.</p>
          </div>
          {error ? <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving || !name.trim()}>
              {saving ? "Saving…" : "Save team"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
