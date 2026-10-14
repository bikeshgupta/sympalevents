-- 046: event role history - who held which role on an event, and when it ended.
--
-- STATUS: DESIGN APPROVED, NOT APPLIED. Run only when you are ready, after reading
-- docs/society-platform-plan-v2.3.txt (section 2) and docs/migration-notes/046_event_role_history.txt
-- and running the pre-checks.
--
-- THE THREE TABLES, AND WHAT EACH ONE ANSWERS (they are never mixed)
--   event_members       what role each person holds on an event NOW
--   event_role_history  which role a person held BEFORE, and when it ended      <- this file
--   audit_log           WHO did it, and what they changed
--
-- WHY IT EXISTS
-- The closing credits derive the core committee from event_members (admin and committee only).
-- Removing a member, or changing their role, deletes or rewrites that row - so the person
-- vanishes from the credits of an event they actually ran. Society member removal (not built)
-- makes that worse. Copying names into event_closing.extra_core would paper over it but change
-- what that column means, so history gets a home of its own.
--
-- HOW IT IS WRITTEN: A TRIGGER ON event_members, NOT APPLICATION CODE
-- Every way a role can end passes through event_members: Settings removal, an admin or committee
-- role changed, an access request approved over an existing role, a society removal that
-- revokes event access, even SQL run by hand. A trigger sees all of them, in the same
-- transaction as the change, and cannot be forgotten by the next route someone writes.
--   * DELETE of a row                      -> one history row (role ended, became nothing)
--   * UPDATE that changes the role         -> one history row for the OLD role (became the new one)
--   * an UPDATE that does not change role  -> nothing
--   * a DELETE caused by deleting the event, or the account, is skipped: with the parent gone
--     there is nothing left to describe, and writing a row would fail its foreign key.
-- ended_by and end_reason are filled from two optional transaction settings
-- (app.actor, app.role_end_reason) that a SQL function can set; a plain API call leaves them
-- empty and the reason is inferred ('removed' / 'role_changed'). audit_log remains the record of who.
--
-- WHAT IT CREATES (and nothing else)
--   * table    public.event_role_history   (RLS on, zero policies - Firebase auth, see CLAUDE.md)
--   * 2 indexes
--   * function public.event_members_record_history() and trigger event_members_record_history
-- It changes no existing table, column or row and does not alter what any query returns.
-- Until the API and the closing page read it (a later, separate change) nothing visible differs.

begin;

create table if not exists public.event_role_history (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  -- Identity is the account, never the display name: two people called "Rohan" stay two people,
  -- and a person who later corrects their name is still the same person.
  user_id uuid not null references public.app_users(id) on delete cascade,
  -- The role that ENDED.
  role public.event_role not null,
  -- The role they moved to, when this was a change rather than a removal. Null = removed.
  became_role public.event_role,
  -- When they were given that role (event_members.created_at). Best effort: a role upserted
  -- again keeps its original created_at, and rows recovered from the audit log have none.
  started_at timestamptz,
  ended_at timestamptz not null default now(),
  ended_by uuid references public.app_users(id) on delete set null,
  end_reason text not null default 'removed'
    check (end_reason in ('removed', 'role_changed', 'society_removed', 'audit_backfill')),
  -- 'trigger' for everything written live; 'audit_backfill' for rows recovered once, from audit_log.
  source text not null default 'trigger' check (source in ('trigger', 'audit_backfill')),
  created_at timestamptz not null default now()
);

-- The credits ask: "which admin/committee roles did anybody hold on this event?"
create index if not exists event_role_history_event_idx
  on public.event_role_history (event_id, role);

-- "What did this person do across events" - profile / society member history, later.
create index if not exists event_role_history_user_idx
  on public.event_role_history (user_id, ended_at desc);

alter table public.event_role_history enable row level security;
revoke all on table public.event_role_history from anon, authenticated;

create or replace function public.event_members_record_history()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  actor uuid;
  reason text;
begin
  -- A cascade from deleting the event or the account: the parent row is already gone.
  if not exists (select 1 from public.events where id = old.event_id)
     or not exists (select 1 from public.app_users where id = old.user_id) then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  if tg_op = 'UPDATE' and new.role is not distinct from old.role then
    return new;
  end if;

  begin
    actor := nullif(current_setting('app.actor', true), '')::uuid;
  exception when others then
    actor := null;
  end;
  reason := nullif(current_setting('app.role_end_reason', true), '');
  if reason is null or reason not in ('removed', 'role_changed', 'society_removed') then
    reason := case when tg_op = 'DELETE' then 'removed' else 'role_changed' end;
  end if;
  -- A made-up actor id must not be able to fail the member change it is describing.
  if actor is not null and not exists (select 1 from public.app_users where id = actor) then
    actor := null;
  end if;

  insert into public.event_role_history (event_id, user_id, role, became_role, started_at, ended_by, end_reason)
  values (
    old.event_id, old.user_id, old.role,
    case when tg_op = 'UPDATE' then new.role else null end,
    old.created_at, actor, reason
  );

  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;

drop trigger if exists event_members_record_history on public.event_members;
create trigger event_members_record_history
  after update or delete on public.event_members
  for each row execute function public.event_members_record_history();

commit;
