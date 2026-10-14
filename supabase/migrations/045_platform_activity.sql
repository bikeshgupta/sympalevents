-- 045: platform activity - one visit model for every tracked surface, and app_users.last_seen_at.
--
-- STATUS: PREPARED, NOT APPLIED. Apply manually after the pre-checks in
-- docs/migration-notes/045_platform_activity.txt. Nothing runs this automatically.
--
-- GENERALISE, DO NOT DUPLICATE (approved)
-- event_visits (028) and event_page_views (030) already hold exactly what a platform needs: a visit with
-- a random browser-held visitor key, an optional signed-in user, coarse device/browser/place, and one row
-- per page opened with its dwell time. The only things that tied them to events were event_id NOT NULL
-- and ON DELETE CASCADE. This file loosens those two things and adds the scope columns, instead of
-- creating a second pair of tables that would collect a different version of the same traffic.
-- THE TABLE NAMES ARE KEPT (approved): renaming a hot table in a live app opens a window where deployed
-- code and schema disagree and this code deliberately swallows "missing table". The comments below
-- document that these legacy-named tables now serve every tracked Sympal surface.
--
-- WHAT IT CHANGES (all additive or loosening - code written before this file keeps working unchanged)
--   event_visits, event_page_views:
--     + surface          text not null default 'event'   existing rows are all event traffic = 'event'
--     + organization_id  uuid null -> organizations, ON DELETE SET NULL      (backfilled for old rows)
--     ~ event_id         NOT NULL dropped; FK changed from ON DELETE CASCADE to ON DELETE SET NULL
--     + 2 indexes each
--   app_users:
--     + last_seen_at     timestamptz null, SEEDED ONCE from updated_at (see below)
-- It changes no existing value except filling the new columns, drops nothing, and deletes nothing.
--
-- SCOPE (approved)
-- A visit is one continuous stay within one analytical scope: surface + organization_id + event_id,
-- in one browser tab. A visit therefore has ONE surface for its whole life; moving between pages of
-- the same scope (an event's Overview -> Schedule -> Gallery) stays one visit and is recorded as page
-- views. Entering a different surface or entity starts a new visit. That rule is applied by the client
-- and the server (code, later); the database only stores the scope.
-- Allowed surfaces (enforced by the SERVER, deliberately not by a CHECK so that adding one is a reviewed
-- code change and not a migration): event, society, society_admin, profile, event_create, proposal.
-- Login is not tracked. The CHECK below only keeps the column tidy.
--
-- DELETION (approved)
-- event_id and organization_id are both ON DELETE SET NULL. Deleting an event (or a whole society, which
-- cascades to its events) keeps its traffic facts; they stop being attributable to the deleted thing.
-- Nothing here introduces a cascade that deletes traffic history. User deletion was already SET NULL.
--
-- RETENTION
-- None added. Nothing deletes raw visits or page views. Future retention and rollups are a Platform
-- Control Center decision.
--
-- app_users.last_seen_at (approved definition)
-- "The most recent qualifying authenticated Sympal application activity, written at most once per hour."
-- It is NOT last login and must never be labelled that way. Anonymous activity never affects it.
-- THE ONE-TIME SEED: until now requireAppUser rewrote app_users.updated_at on every authenticated
-- request, so updated_at is the best record there is of when each person was last active. This file
-- copies it into last_seen_at ONCE, only where last_seen_at is null, so the field is not empty on day one.
-- Those seeded values are APPROXIMATE historical authenticated activity inferred from legacy behaviour
-- (a profile edit also moves updated_at). They are not recorded activity: do not use them to claim
-- historical daily/weekly active users or to reconstruct any activity that was not actually recorded.
-- From this point last_seen_at is the authoritative activity field; updated_at is intended to return to
-- meaning "the stored user record was modified" - but that only becomes true when the separate, later
-- change to requireAppUser ships. Until then it is still rewritten per request.
--
-- The visit and page-view tables stay privacy-safe: still no IP address in any form, coarse
-- device/browser/city only, names only for signed-in visitors, no per-click paths.

-- ---------------------------------------------------------------------------
-- PART 1 - one transaction: all or nothing.
-- ---------------------------------------------------------------------------
begin;

-- Prerequisites, checked first so a missing earlier migration fails with a clear sentence instead of an
-- obscure "relation does not exist" half-way down. Nothing has been changed when this raises.
do $$
begin
  if to_regclass('public.event_visits') is null then
    raise exception '045 needs migration 028 (event_visits). Apply 028 first, then run 045 again.';
  end if;
  if to_regclass('public.event_page_views') is null then
    raise exception '045 needs migration 030 (audit_log and event_page_views). Apply 030 first, then run 045 again.';
  end if;
  if to_regclass('public.organizations') is null or to_regclass('public.events') is null or to_regclass('public.app_users') is null then
    raise exception '045 needs the base tables (organizations, events, app_users).';
  end if;
end $$;

-- event_visits ----------------------------------------------------------------
alter table public.event_visits
  add column if not exists surface text not null default 'event',
  add column if not exists organization_id uuid references public.organizations(id) on delete set null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'event_visits_surface_shape') then
    alter table public.event_visits
      add constraint event_visits_surface_shape check (surface ~ '^[a-z][a-z_]{0,39}$');
  end if;
end $$;

alter table public.event_visits alter column event_id drop not null;

-- Replace the cascading foreign key on event_id, whatever it happens to be called.
do $$
declare fk text;
begin
  for fk in
    select c.conname from pg_constraint c
    where c.conrelid = 'public.event_visits'::regclass and c.contype = 'f'
      and c.confrelid = 'public.events'::regclass
      and c.conkey = array[(select attnum from pg_attribute where attrelid = 'public.event_visits'::regclass and attname = 'event_id')]
  loop
    execute format('alter table public.event_visits drop constraint %I', fk);
  end loop;
  alter table public.event_visits
    add constraint event_visits_event_id_fkey
    foreign key (event_id) references public.events(id) on delete set null not valid;
end $$;

-- event_page_views ------------------------------------------------------------
alter table public.event_page_views
  add column if not exists surface text not null default 'event',
  add column if not exists organization_id uuid references public.organizations(id) on delete set null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'event_page_views_surface_shape') then
    alter table public.event_page_views
      add constraint event_page_views_surface_shape check (surface ~ '^[a-z][a-z_]{0,39}$');
  end if;
end $$;

alter table public.event_page_views alter column event_id drop not null;

do $$
declare fk text;
begin
  for fk in
    select c.conname from pg_constraint c
    where c.conrelid = 'public.event_page_views'::regclass and c.contype = 'f'
      and c.confrelid = 'public.events'::regclass
      and c.conkey = array[(select attnum from pg_attribute where attrelid = 'public.event_page_views'::regclass and attname = 'event_id')]
  loop
    execute format('alter table public.event_page_views drop constraint %I', fk);
  end loop;
  alter table public.event_page_views
    add constraint event_page_views_event_id_fkey
    foreign key (event_id) references public.events(id) on delete set null not valid;
end $$;

-- Attribute existing traffic to its society (idempotent; see the post-deploy note in the migration notes).
update public.event_visits v
   set organization_id = e.organization_id
  from public.events e
 where e.id = v.event_id and v.organization_id is null;

update public.event_page_views p
   set organization_id = e.organization_id
  from public.events e
 where e.id = p.event_id and p.organization_id is null;

-- Indexes for per-society and per-surface reads (the existing per-event indexes stay).
create index if not exists event_visits_org_started_idx
  on public.event_visits (organization_id, started_at desc) where organization_id is not null;
create index if not exists event_visits_surface_started_idx
  on public.event_visits (surface, started_at desc);
create index if not exists event_page_views_org_opened_idx
  on public.event_page_views (organization_id, opened_at desc) where organization_id is not null;
create index if not exists event_page_views_surface_opened_idx
  on public.event_page_views (surface, opened_at desc);

-- Documentation that travels with the schema.
comment on table public.event_visits is
  'One row per visit - one continuous stay in one scope (surface + organization_id + event_id) in one browser tab. LEGACY NAME: it now holds every tracked Sympal surface (event, society, society_admin, profile, event_create, proposal), not only events. event_id is set only for the event surface and becomes null if the event is deleted; organization_id becomes null if the society is deleted. No IP address is stored, in any form. Nothing deletes these rows.';
comment on table public.event_page_views is
  'One row per page opened within a visit, with dwell time. LEGACY NAME: it now holds every tracked Sympal surface, not only events. Same scope columns and deletion rules as event_visits. visit_id is deliberately not a foreign key. No IP address is stored. Nothing deletes these rows.';
comment on column public.event_visits.surface is
  'Which part of Sympal: event, society, society_admin, profile, event_create or proposal. Validated by the server (api/_lib/traffic.ts), not by a constraint, so adding one is a reviewed code change. Login is not tracked.';
comment on column public.event_page_views.surface is
  'Which part of Sympal this page belongs to. Same list and rule as event_visits.surface.';
comment on column public.event_visits.organization_id is
  'The society this visit belongs to; null for surfaces with no society (profile, event_create) and after the society is deleted (ON DELETE SET NULL).';
comment on column public.event_page_views.organization_id is
  'The society this page view belongs to; null for surfaces with no society and after the society is deleted (ON DELETE SET NULL).';

-- app_users.last_seen_at, seeded exactly once --------------------------------
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'app_users' and column_name = 'last_seen_at'
  ) then
    alter table public.app_users add column last_seen_at timestamptz;
    -- One-time seed. Approximate historical authenticated activity inferred from the legacy behaviour in
    -- which requireAppUser rewrote updated_at on every authenticated request. NOT recorded activity.
    update public.app_users set last_seen_at = updated_at where last_seen_at is null;
  end if;
end $$;

comment on column public.app_users.last_seen_at is
  'Most recent qualifying authenticated Sympal application activity, written at most once per hour (conditional update: last_seen_at is null or older than one hour). NOT last login. Anonymous activity never sets it. Values present before migration 045 were seeded once from updated_at and are approximate: they reflect the legacy behaviour in which requireAppUser rewrote updated_at on every authenticated request, not recorded activity - do not use them to reconstruct historical DAU/WAU. Never shown in the product; platform analytics only.';
comment on column public.app_users.updated_at is
  'Intended meaning: the stored user record was modified (name, chosen photo, flat, phone, or Google email/photo changed). NOTE: until the separate requireAppUser change ships, the server still rewrites this on every authenticated request. Use last_seen_at for activity.';

commit;

-- ---------------------------------------------------------------------------
-- PART 2 - validate the two relaxed foreign keys. Run as its own step (not inside the transaction above):
-- validation then takes only a light lock, so visitors' heartbeats are not blocked while existing rows
-- are checked. Until it runs the constraints are already enforced for every new row and every delete.
-- ---------------------------------------------------------------------------
alter table public.event_visits validate constraint event_visits_event_id_fkey;
alter table public.event_page_views validate constraint event_page_views_event_id_fkey;
