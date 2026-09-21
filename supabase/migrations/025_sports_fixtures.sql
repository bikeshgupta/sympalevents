-- Teams and fixtures: the two modules a sports meet needs and no other kind of
-- event does.
--
-- These are real tables rather than a reuse of `event_schedule`. A match has a
-- home side, an away side, two scores and a winner; a scheduled activity has
-- none of those, and bolting them on would have made every festival's
-- programme carry six columns about nothing.
--
-- The points table is NOT stored. It is derived from the fixtures in the
-- client, because a stored standings table is a second copy of the same truth
-- that goes stale the moment a score is corrected.

create table if not exists public.event_teams (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  name text not null,
  captain_name text,
  -- Where the team is from, in the event's own word for it: "A Wing",
  -- "Tower 3", "Class 9B". See events.unit_label (024).
  unit text,
  -- [{ "name": "...", "unit": "..." }] - a squad list, not a child table, for
  -- the same reason 019 kept prasad arrangers inline: saving a team is one row
  -- write, so there is never a moment where the old players are gone and the
  -- new ones not yet in.
  members jsonb not null default '[]'::jsonb,
  created_by uuid references public.app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Two teams with the same name in one event is somebody adding a duplicate
-- where they meant to open the existing one. Case-insensitive, because "A Wing"
-- and "a wing" are the same team.
create unique index if not exists event_teams_event_name_key
  on public.event_teams (event_id, lower(name));

create table if not exists public.event_fixtures (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  -- "Group stage", "Semi-final", "Final" - free text, because every sport
  -- names its rounds differently and a fixed enum would be wrong for most.
  stage text,
  round_number integer,
  home_team_id uuid references public.event_teams(id) on delete set null,
  away_team_id uuid references public.event_teams(id) on delete set null,
  -- A final exists on the schedule before anybody knows who is in it. These
  -- hold "Winner of match 10" until the team ids are filled in.
  home_label text,
  away_label text,
  scheduled_at timestamptz,
  venue text,
  -- Scores are TEXT on purpose. Cricket is "124/6", badminton is
  -- "21-18, 21-15", athletics is a time. A number column would fit one sport
  -- and quietly mangle the rest.
  home_score text,
  away_score text,
  winner_team_id uuid references public.event_teams(id) on delete set null,
  is_draw boolean not null default false,
  status text not null default 'scheduled'
    check (status in ('scheduled', 'in_progress', 'completed', 'cancelled')),
  notes text,
  created_by uuid references public.app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists event_fixtures_event_idx on public.event_fixtures (event_id, scheduled_at);
create index if not exists event_fixtures_home_idx on public.event_fixtures (home_team_id);
create index if not exists event_fixtures_away_idx on public.event_fixtures (away_team_id);

-- RLS on with zero policies, the same deliberate choice as every table added
-- since 009: this app authenticates through Firebase, so the browser's
-- Supabase client never holds a session and `auth.uid()` never resolves for
-- it. A policy written against it would be dead code. All access goes through
-- /api/event-schedule?resource=teams|fixtures with the service-role client,
-- which resolves the admin's page visibility itself. Do not add anon or
-- authenticated policies here expecting a direct browser read to work.
alter table public.event_teams enable row level security;
alter table public.event_fixtures enable row level security;
