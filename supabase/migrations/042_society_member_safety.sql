-- 042: a society can never be left without an admin.
--
-- WHY THIS EXISTS
-- The API already refuses to remove or demote a society's last admin
-- (api/_lib/society-admin.ts). An API check cannot be the whole answer: two
-- admins demoting each other in the same instant can both pass a check made
-- before either has written. This puts the rule where it cannot be raced - in
-- the database, on the table itself.
--
-- WHAT IT CHANGES (and nothing else)
--   * one trigger function: public.organization_members_keep_admin()
--   * one trigger on public.organization_members (before update or delete)
-- It changes no data, no column and no existing function. Everything keeps
-- working exactly as before, except that a change which would leave a society
-- with zero admins now fails with a plain sentence.
--
-- HOW IT BEHAVES
--   * Only a row that IS an admin and is ceasing to be one (role changed, row
--     deleted, or moved to another society / user) is checked. Changing or
--     removing a committee member or a resident is never affected.
--   * It first locks the society's row (SELECT ... FOR UPDATE). Two concurrent
--     demotions therefore queue: the second one is evaluated after the first has
--     committed, sees the real remaining admins, and is refused.
--   * It then counts the OTHER admins. None left -> the change is refused.
--     That also covers an admin demoting or removing themselves when they are the
--     last one.
--   * If the society row is gone (the whole society is being deleted, so its
--     members cascade away) there is nothing left to protect and the change is
--     allowed.
--   * Deleting an app_users row whose cascade would remove a society's last admin
--     is refused as well. That is deliberate: fix the society first.
--
-- Pre-check, verification and rollback are in
-- docs/migration-notes/042_society_member_safety.txt - read them before running.
-- Apply manually after 041. Nothing runs this automatically.

begin;

create or replace function public.organization_members_keep_admin()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  remaining integer;
begin
  -- Only an admin row that is leaving the admin role matters.
  if old.role <> 'admin' then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  if tg_op = 'UPDATE'
     and new.role = 'admin'
     and new.organization_id = old.organization_id
     and new.user_id = old.user_id then
    return new;
  end if;

  -- Serialise every change to this society's admins. Without this, two
  -- transactions can each see "the other admin is still there" and both succeed.
  perform 1 from public.organizations where id = old.organization_id for update;
  if not found then
    -- The society itself is being deleted; its members are cascading away.
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  -- Counted AFTER the lock, so it reflects anything a concurrent change committed.
  select count(*) into remaining
  from public.organization_members
  where organization_id = old.organization_id
    and role = 'admin'
    and user_id <> old.user_id;

  if remaining = 0 then
    raise exception 'A society must keep at least one admin. Make somebody else an admin first.'
      using errcode = 'P0001';
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;

drop trigger if exists organization_members_keep_admin on public.organization_members;
create trigger organization_members_keep_admin
  before update or delete on public.organization_members
  for each row execute function public.organization_members_keep_admin();

commit;
