-- Society Home: addresses for a society and its events, the two states a date
-- cannot express, and notices that belong to one event instead of the whole app.
--
-- Everything here is additive. Every column is nullable or defaulted, every
-- table starts empty, and no existing row changes meaning. The application
-- degrades on each piece independently, so this can be applied before or after
-- the code that reads it.

-- ---------------------------------------------------------------------------
-- 1. Addresses
-- ---------------------------------------------------------------------------

alter table public.organizations
  -- The society's address: /society/<slug>. Globally unique, because it is the
  -- first segment and there is nothing above it to scope it to.
  add column if not exists slug text;

create unique index if not exists organizations_slug_key
  on public.organizations (slug)
  where slug is not null;

alter table public.events
  -- The event's address within its society. Deliberately NOT globally unique:
  -- two societies both running a "diwali-2026" is normal and neither should
  -- have to find a different word for it. The uniqueness that matters is the
  -- pair, below.
  add column if not exists slug text;

create unique index if not exists events_org_slug_key
  on public.events (organization_id, slug)
  where slug is not null;

-- ---------------------------------------------------------------------------
-- 2. Backfill the slugs, so nothing has to be typed by hand
-- ---------------------------------------------------------------------------
--
-- Lower-cased, non-alphanumerics collapsed to single hyphens, trimmed. A name
-- that slugs to nothing at all (punctuation only) falls back to the row's id,
-- which is ugly but addressable - better than a null that breaks a link.
--
-- Collisions are resolved by appending -2, -3 ... in creation order, so the
-- oldest row keeps the clean slug. Existing rows are left alone if they
-- already have one, which is what makes this safe to re-run.

create or replace function public.slugify(value text)
returns text
language sql
immutable
as $$
  select nullif(
    trim(both '-' from regexp_replace(lower(coalesce(value, '')), '[^a-z0-9]+', '-', 'g')),
    ''
  );
$$;

do $$
declare
  row_record record;
  base_slug text;
  candidate text;
  suffix integer;
begin
  for row_record in
    select id, name, created_at from public.organizations where slug is null order by created_at, id
  loop
    base_slug := coalesce(public.slugify(row_record.name), replace(row_record.id::text, '-', ''));
    candidate := base_slug;
    suffix := 1;
    while exists (select 1 from public.organizations where slug = candidate) loop
      suffix := suffix + 1;
      candidate := base_slug || '-' || suffix;
    end loop;
    update public.organizations set slug = candidate where id = row_record.id;
  end loop;

  for row_record in
    select id, name, organization_id, created_at from public.events where slug is null order by created_at, id
  loop
    base_slug := coalesce(public.slugify(row_record.name), replace(row_record.id::text, '-', ''));
    candidate := base_slug;
    suffix := 1;
    -- Scoped to the society, matching the index above.
    while exists (
      select 1 from public.events
      where slug = candidate and organization_id is not distinct from row_record.organization_id
    ) loop
      suffix := suffix + 1;
      candidate := base_slug || '-' || suffix;
    end loop;
    update public.events set slug = candidate where id = row_record.id;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 3. The two states a date cannot express
-- ---------------------------------------------------------------------------
--
-- Status is derived from the dates - upcoming, live and completed all fall out
-- of start_date/end_date, and `event_closing.is_closed` is the committee's own
-- "we have wrapped up" switch on top of that. Neither can say "not announced
-- yet" or "called off", so those two are the only ones stored.
--
-- NULL means "ask the calendar", and is the default for every existing row, so
-- nothing changes status by applying this.
--
-- Named `status_override` rather than `lifecycle` because that is what it is:
-- an override of the derived answer, not a parallel state machine. The legacy
-- `events.status` column (001, defaults 'planning') is NOT touched and NOT
-- read by this - it predates all of it and nothing in the app uses it.

alter table public.events
  add column if not exists status_override text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'events_status_override_check') then
    alter table public.events
      add constraint events_status_override_check
      check (status_override is null or status_override in ('draft', 'cancelled'));
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Notices that belong to an event
-- ---------------------------------------------------------------------------
--
-- src/data/announcements.ts is a committed file shared by the whole app. With
-- one event that was merely awkward; with several it is wrong, because every
-- event would show the same notice. (It is currently an empty array, so there
-- is nothing to migrate across - the file stays only as a fallback for a
-- deployment where this table does not exist yet.)
--
-- The columns are exactly the fields the existing announcement UI already
-- renders - no new concepts. `day` is "Day 3" and is resolved to a real date
-- at render time against the event's own dates, which is what lets a notice
-- survive the event moving.

create table if not exists public.event_announcements (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  tag text not null,
  title text not null,
  body text not null,
  tone text not null default 'info',
  day text,
  announce_date date,
  announce_time text,
  location text,
  created_by uuid references public.app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'event_announcements_tone_check') then
    alter table public.event_announcements
      add constraint event_announcements_tone_check
      check (tone in ('spotlight', 'info', 'alert'));
  end if;
end $$;

create index if not exists event_announcements_event_idx
  on public.event_announcements (event_id, created_at desc);

alter table public.event_announcements enable row level security;

-- RLS on with zero policies, the same deliberate choice as every table since
-- 009: this app authenticates through Firebase, not Supabase Auth, so the
-- browser's Supabase client never holds a session and auth.uid() never
-- resolves for it. A policy written against it would be dead code. All access
-- goes through /api/* with the service-role client, which checks the Firebase
-- identity server-side. Do not add anon/authenticated policies here.
