-- Personal events: a birthday, an anniversary, a get-together. Private and
-- invite-only, hosted by one person, belonging to no society. See
-- shared/personal-events.ts for the rules and api/_lib/personal-events.ts for
-- who may read and write what.
--
-- Requires app_users (001). Touches no existing table.
--
-- Two new tables rather than rows in `events`: everything about `events` is
-- built around a society (page visibility, modules, members, public pages),
-- and a personal event must never become visible through any of it. Keeping
-- them apart means no existing screen or query can show one by accident.
--
-- RLS is on with zero policies on both, the same deliberate choice as every
-- table since 009: the browser never reads Supabase, the API uses the service
-- role. Do not add anon/authenticated policies.
begin;

create table if not exists public.personal_events (
  id uuid primary key default gen_random_uuid(),
  host_user_id uuid not null references public.app_users(id) on delete cascade,
  kind text not null default 'other',
  title text not null check (char_length(title) between 1 and 100),
  description text check (description is null or char_length(description) <= 500),
  color text not null default 'teal' check (color in ('teal', 'marigold', 'indigo', 'rose', 'forest')),
  starts_on date not null,
  start_time time,
  end_time time,
  venue text check (venue is null or char_length(venue) <= 120),
  address text check (address is null or char_length(address) <= 200),
  -- An optional cover photograph, uploaded through /api/uploads into the host's
  -- own folder (uploads/personal/<host id>/...). The API refuses any other URL.
  cover_url text check (cover_url is null or char_length(cover_url) <= 500),
  -- The code a guest types; the link carries the same code. No I, L, O, 0 or 1.
  invite_code text not null unique check (invite_code ~ '^[A-HJKMNP-Z2-9]{6}$'),
  guests_see_list boolean not null default false,
  allow_plus_ones boolean not null default true,
  status text not null default 'active' check (status in ('active', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists personal_events_host_idx on public.personal_events (host_user_id, starts_on);

comment on table public.personal_events is
  'Private, invite-only events hosted by one person (049). Readable only through /api/events?resource=personal.';

create table if not exists public.personal_event_rsvps (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.personal_events(id) on delete cascade,
  -- A signed-in guest. Null for a guest who replied without an account.
  user_id uuid references public.app_users(id) on delete set null,
  -- A guest without an account is recognised by a random token their own browser
  -- keeps; only its SHA-256 is stored, so the table cannot be used to impersonate them.
  guest_token_hash text,
  name text not null check (char_length(name) between 1 and 60),
  status text not null check (status in ('going', 'maybe', 'declined')),
  people smallint not null default 1 check (people between 0 and 20),
  -- Private to the host. Never returned to anybody else.
  phone text check (phone is null or char_length(phone) <= 20),
  wish text check (wish is null or char_length(wish) <= 280),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint personal_event_rsvps_identity check (user_id is not null or guest_token_hash is not null)
);

create unique index if not exists personal_event_rsvps_user_uidx
  on public.personal_event_rsvps (event_id, user_id) where user_id is not null;
create unique index if not exists personal_event_rsvps_guest_uidx
  on public.personal_event_rsvps (event_id, guest_token_hash) where guest_token_hash is not null;
create index if not exists personal_event_rsvps_user_idx on public.personal_event_rsvps (user_id);

comment on column public.personal_event_rsvps.phone is 'Private to the host (049).';

alter table public.personal_events enable row level security;
alter table public.personal_event_rsvps enable row level security;

commit;
