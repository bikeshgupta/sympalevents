-- 043: event proposals - a society member suggests an event, a society admin decides.
--
-- STATUS: PREPARED, NOT APPLIED. Apply manually after 041 (042 is independent of this one).
-- Pre-check, verification and rollback: docs/migration-notes/043_event_proposals.txt
--
-- WHY A TABLE OF ITS OWN (Option B, approved)
-- A proposal is not an event. Until a society admin approves it, there is no event row, no
-- event_members row, no page visibility, no slug, nothing in any list or counter. That is
-- what makes "rejected and archived proposals never become events" true by construction
-- rather than by a filter that every query has to remember.
--
-- LIFECYCLE
--   submitted ──approve──▶ approved   (an event exists, as a DRAFT; the proposer is its admin)
--       │ ──request changes──▶ changes_requested ──resubmit──▶ submitted
--       │ ──reject──▶ rejected
--       └ ──discard / withdraw──▶ archived
--   changes_requested may also be rejected or archived. approved, rejected and archived are final.
--
-- WHAT IT CREATES (and nothing else)
--   * table  public.event_proposals   (RLS on, zero policies - Firebase auth, see CLAUDE.md)
--   * three indexes
--   * function public.approve_event_proposal(...)   (service_role only)
-- It changes no existing table, column, function or row.
--
-- APPROVAL IS ONE TRANSACTION
-- approve_event_proposal() locks the proposal row, re-checks everything, inserts the draft event,
-- makes the proposer its admin, writes its modules and registration settings, and marks the
-- proposal approved with the new event's id. Any failure rolls all of it back, so there is never
-- an approved proposal with no event, nor an orphan event with no proposal behind it.
--
-- WHAT APPROVAL DOES NOT DO
-- It never publishes. The event is created exactly as create_event_draft (033) creates one:
-- status_override = 'draft'. Publishing stays the separate, existing, readiness-checked step.

begin;

create table if not exists public.event_proposals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  -- Whose idea it is, and who becomes the event's admin on approval. A proposal does not
  -- outlive the account that made it.
  proposed_by uuid not null references public.app_users(id) on delete cascade,

  -- The event as proposed. The same fields create_event_draft takes, so approval needs no
  -- translation. Modules are NOT stored: they are chosen from the template at approval time,
  -- so a template corrected in a deploy applies to events approved after it.
  name text not null check (char_length(btrim(name)) between 2 and 100),
  event_type text not null default 'festival'
    check (event_type in ('festival', 'sports', 'cultural', 'mixed', 'custom')),
  template_key text,
  unit_label text,
  start_date date not null,
  end_date date not null,
  start_time time,
  end_time time,
  location text not null default '' check (char_length(location) <= 200),
  description text not null default '' check (char_length(description) <= 2000),
  -- What the proposer wants the admins to know ("we have the DJ booked for the 17th").
  note text not null default '' check (char_length(note) <= 1000),

  status text not null default 'submitted'
    check (status in ('submitted', 'changes_requested', 'approved', 'rejected', 'archived')),
  -- Counts submissions. Approval is conditional on the revision the admin was looking at, so a
  -- proposer resubmitting while it is open on somebody's screen cannot be approved unseen.
  revision integer not null default 1,

  submitted_at timestamptz not null default now(),
  reviewed_by uuid references public.app_users(id) on delete set null,
  reviewed_at timestamptz,
  -- The reason for "changes requested" or "rejected", shown to the proposer.
  review_note text check (review_note is null or char_length(review_note) <= 1000),

  -- Set on approval; the event the proposal became. If that event is ever deleted the proposal
  -- keeps its history and simply points at nothing.
  event_id uuid references public.events(id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  check (end_date >= start_date)
);

-- The admin's queue: this society's proposals by state, oldest waiting first.
create index if not exists event_proposals_queue_idx
  on public.event_proposals (organization_id, status, submitted_at);

-- "Your proposals": one person's, newest first.
create index if not exists event_proposals_proposer_idx
  on public.event_proposals (proposed_by, created_at desc);

-- One proposal becomes at most one event, and an event comes from at most one proposal.
create unique index if not exists event_proposals_event_key
  on public.event_proposals (event_id)
  where event_id is not null;

-- Same stance as every table since 009: the browser's Supabase client never holds a session
-- (Firebase auth), so a policy written against auth.uid() would be dead code. All access goes
-- through /api with the service role. Do NOT add anon/authenticated policies.
alter table public.event_proposals enable row level security;
revoke all on table public.event_proposals from anon, authenticated;

-- ---------------------------------------------------------------------------
-- approve_event_proposal
--   p_proposal           the proposal
--   p_reviewer           the society admin approving (checked here, not only in the API)
--   p_modules            [{page_key, visibility, is_enabled, label_override}] - computed by the
--                        API from the template, exactly the shape create_event_draft takes
--   p_expected_revision  optional: refuse if the proposal has been resubmitted since it was read
-- Returns the new event's id.
--
-- Error codes the API maps:  P0002 not found (404) | 42501 not a society admin (403) |
--                            P0001 anything else the reviewer should read (409)
-- ---------------------------------------------------------------------------
create or replace function public.approve_event_proposal(
  p_proposal uuid,
  p_reviewer uuid,
  p_modules jsonb,
  p_expected_revision integer default null
)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  prop public.event_proposals%rowtype;
  new_event uuid;
begin
  -- Lock the proposal. Two admins approving at once queue here; the second reads the result of
  -- the first and is refused below, so one proposal can never become two events.
  select * into prop from public.event_proposals where id = p_proposal for update;
  if not found then
    raise exception 'That proposal does not exist' using errcode = 'P0002';
  end if;

  if not exists (
    select 1 from public.organization_members
    where organization_id = prop.organization_id and user_id = p_reviewer and role = 'admin'
  ) then
    raise exception 'Only a society admin can review proposals' using errcode = '42501';
  end if;

  if prop.status <> 'submitted' then
    raise exception 'This proposal is not waiting for review (it is %)', prop.status using errcode = 'P0001';
  end if;

  if p_expected_revision is not null and prop.revision <> p_expected_revision then
    raise exception 'This proposal was changed after you opened it. Open it again to review the new version.'
      using errcode = 'P0001';
  end if;

  -- Somebody who has left the society cannot be made admin of one of its events.
  if not exists (
    select 1 from public.organization_members
    where organization_id = prop.organization_id and user_id = prop.proposed_by
  ) then
    raise exception 'The person who proposed this is no longer a member of the society' using errcode = 'P0001';
  end if;

  if p_modules is null or jsonb_typeof(p_modules) <> 'array' or jsonb_array_length(p_modules) = 0 then
    raise exception 'The event needs its modules' using errcode = 'P0001';
  end if;

  -- Same columns, same draft state as create_event_draft (033).
  insert into public.events (
    organization_id, name, start_date, end_date, start_time, end_time,
    location, description, event_type, template_key, unit_label, status_override
  ) values (
    prop.organization_id, prop.name, prop.start_date, prop.end_date, prop.start_time, prop.end_time,
    prop.location, prop.description, prop.event_type, prop.template_key, prop.unit_label, 'draft'
  ) returning id into new_event;

  insert into public.event_members (event_id, user_id, role) values (new_event, prop.proposed_by, 'admin');

  insert into public.event_page_visibility (event_id, page_key, visibility, is_enabled, label_override)
  select new_event, m->>'page_key', m->>'visibility', (m->>'is_enabled')::boolean, m->>'label_override'
  from jsonb_array_elements(p_modules) m;

  insert into public.event_registration_settings (event_id) values (new_event);

  update public.event_proposals
  set status = 'approved',
      event_id = new_event,
      reviewed_by = p_reviewer,
      reviewed_at = now(),
      review_note = null,
      updated_at = now()
  where id = prop.id;

  return new_event;
end $$;

revoke all on function public.approve_event_proposal(uuid, uuid, jsonb, integer) from public, anon, authenticated;
grant execute on function public.approve_event_proposal(uuid, uuid, jsonb, integer) to service_role;

commit;
