-- What everybody did, and what changed when they did it.
--
-- Until now the app kept provenance but no history: `created_by`,
-- `submitted_by` and `settled_by` say who a row belongs to *now*, and an edit
-- overwrites them while a delete erases them. Nothing said who changed a
-- contribution from 5,000 to 500, who removed a member, or who made the
-- expense ledger public. For a committee handling other people's money that
-- is the gap that matters.
--
-- Two tables, both append-only in practice, both additive and starting empty.

-- ---------------------------------------------------------------------------
-- 1. Every write
-- ---------------------------------------------------------------------------

create table if not exists public.audit_log (
  -- bigserial rather than uuid: this is written far more often than it is
  -- read, it is always read in time order, and the id itself is that order.
  id bigserial primary key,
  occurred_at timestamptz not null default now(),

  actor_user_id uuid references public.app_users(id) on delete set null,
  -- Denormalised on purpose. An audit row has to stay readable after the
  -- account that made it is gone, and `on delete set null` above would
  -- otherwise leave an action with nobody attached to it.
  actor_email text,

  -- Scope. Both nullable: a society-level action has no event, and an action
  -- against an event whose society row is missing still has to record.
  event_id uuid references public.events(id) on delete set null,
  organization_id uuid references public.organizations(id) on delete set null,

  -- 'create' | 'update' | 'delete', plus the few verbs that are their own
  -- thing because the field they move does not describe them: 'settle',
  -- 'unsettle', 'publish', 'unpublish', 'rotate_share_token'.
  action text not null,
  -- The kind of thing: 'expense', 'event_member', 'contribution', ...
  entity_type text not null,
  -- Text rather than uuid: not every entity this logs is keyed by one
  -- (page visibility is keyed by event + page_key).
  entity_id text,

  -- One human-readable line, so the table can be read without decoding jsonb.
  summary text,

  -- WHAT CHANGED. On an update, only the fields that actually moved, as
  -- { "amount": { "from": 5000, "to": 500 } }. Storing both whole rows buries
  -- the one field that moved among forty that did not. On a create or a
  -- delete, the row itself.
  --
  -- Credentials are redacted before they reach here - see api/_lib/audit.ts.
  -- An audit log that leaks a share token is a new hole, not a record of one.
  changes jsonb,

  -- Groups the rows written by a single request, so a member edit that
  -- touches a role and four page permissions reads as one action.
  request_id text
);

create index if not exists audit_log_event_idx on public.audit_log (event_id, occurred_at desc);
create index if not exists audit_log_actor_idx on public.audit_log (actor_user_id, occurred_at desc);
create index if not exists audit_log_entity_idx on public.audit_log (entity_type, entity_id);

-- ---------------------------------------------------------------------------
-- 2. Every read, page by page
-- ---------------------------------------------------------------------------
--
-- 028's `event_visits` answers "who was here, and for how long" as one row per
-- visit. This answers "which pages, in what order, and how long on each".
--
-- It does NOT replace event_visits. The two are different questions and the
-- summary is the cheaper one to ask; a visit row is still what the Traffic
-- panel reads. This table is the detail underneath it.

create table if not exists public.event_page_views (
  id bigserial primary key,
  -- The visit this page view belongs to - event_visits.id. Deliberately not a
  -- foreign key: the heartbeat writes both, and a page view must never fail
  -- because the visit row was pruned or never landed.
  visit_id uuid not null,
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid references public.app_users(id) on delete set null,

  page_key text not null,
  opened_at timestamptz not null default now(),
  -- Filled when the next heartbeat arrives on a different page. A tab closed
  -- outright leaves these null, which is honest: navigator.sendBeacon cannot
  -- carry the Authorization header this API needs, so there is no reliable
  -- close-out. See src/lib/traffic.ts.
  left_at timestamptz,
  seconds integer
);

create index if not exists event_page_views_event_idx on public.event_page_views (event_id, opened_at desc);
create index if not exists event_page_views_visit_idx on public.event_page_views (visit_id, opened_at);

-- ---------------------------------------------------------------------------

alter table public.audit_log enable row level security;
alter table public.event_page_views enable row level security;

-- RLS on with zero policies, the standing choice since 009: this app
-- authenticates through Firebase, not Supabase Auth, so the browser's Supabase
-- client never holds a session and auth.uid() never resolves for it. A policy
-- written against it would be dead code. Everything goes through /api/* with
-- the service-role client.
--
-- These two more than any other table: audit_log is the record of who did
-- what, and event_page_views is the record of what each person read. Neither
-- should ever be reachable from a browser directly. Do not add
-- anon/authenticated policies.

-- NO RETENTION PRUNE, deliberately - these are kept indefinitely so an
-- accounting dispute from two festivals ago can still be answered. The indexes
-- above are what keep them usable as they grow. If event_page_views ever
-- becomes large enough to matter, the thing to prune is that one, not the
-- audit log.
