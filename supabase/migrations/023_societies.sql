-- The society becomes a real tenant.
--
-- `organizations` has existed since 001 but was never a concept: api/events.ts
-- inserted one throwaway row per event, named "<Event Name> Organization",
-- purely to satisfy a NOT NULL foreign key, and nothing ever read it again.
-- `organization_id` appeared in exactly one place in the whole codebase.
--
-- The table keeps its name. Renaming it would mean renaming a live foreign key
-- and every row that points through it, for no behavioural gain - in the
-- product it is a Society, and the code says so.
--
-- WHAT A SOCIETY IS FOR: discovery, not authority. Belonging to a society is
-- what makes its events appear in your switcher. What you may DO on any one of
-- them is still `event_members` plus the admin's page visibility, exactly as
-- before - see api/_lib/page-visibility.ts. Nothing here widens access to an
-- event's data.

alter table public.organizations
  add column if not exists city text,
  add column if not exists logo_url text,
  add column if not exists invite_code text,
  -- `created_by` already exists and references public.profiles, which is keyed
  -- on Supabase Auth and is dead in this app (everything signs in through
  -- Firebase and lands in app_users). A second column rather than a risky
  -- repoint of the first.
  add column if not exists created_by_user uuid references public.app_users(id) on delete set null;

-- An invite code is optional, so the uniqueness is partial. Codes are minted
-- server-side in api/_lib/societies.ts.
create unique index if not exists organizations_invite_code_key
  on public.organizations (invite_code)
  where invite_code is not null;

-- `organization_members` from 001 keys on public.profiles, which nothing in
-- this app writes. 003 did exactly this drop-and-recreate to move
-- `event_members` onto app_users; this is the same move, for the same reason.
-- Nothing is lost: the old table has never had a row written to it.
drop table if exists public.organization_members;

create table public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.app_users(id) on delete cascade,
  role event_role not null default 'read_only',
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create index if not exists organization_members_user_idx on public.organization_members (user_id);

-- RLS on with zero policies, the same deliberate choice as every table added
-- since 009: this app authenticates through Firebase, so the browser's
-- Supabase client never holds a session and `auth.uid()` never resolves for
-- it. A policy written against it would be dead code. All access goes through
-- /api/events?resource=societies with the service-role client.
alter table public.organization_members enable row level security;

-- Backfill 1: give the throwaway rows a name somebody would recognise.
-- "Ganesh Chaturthi 2026 Organization" becomes "Ganesh Chaturthi 2026", which
-- is the event's name rather than the society's - an admin renames it in
-- Settings. It is still a better starting point than the word Organization.
update public.organizations
set name = regexp_replace(name, '\s+Organization$', '')
where name ~ '\s+Organization$';

-- Backfill 2: everybody who has a role on an event becomes a member of that
-- event's society, carrying the same role. Without this, the very people
-- running the live event would open the app to an empty switcher.
insert into public.organization_members (organization_id, user_id, role)
select distinct on (e.organization_id, m.user_id) e.organization_id, m.user_id, m.role
from public.events e
join public.event_members m on m.event_id = e.id
where e.organization_id is not null
order by e.organization_id, m.user_id, (m.role = 'admin') desc
on conflict (organization_id, user_id) do nothing;
