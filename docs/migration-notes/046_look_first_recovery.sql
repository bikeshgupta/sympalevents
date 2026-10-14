-- 046 - LOOK FIRST. READ-ONLY. Changes nothing. Safe to run before, or without, migration 046.
--
-- Purpose: show exactly which historical event-role endings the audit log lets us recover, so you can
-- decide whether to run the recovery in docs/migration-notes/046_event_role_history.txt section 4.
-- Nothing is written by this file: it is only select statements.
-- Send me the output of all four queries (or tell me which rows look wrong).
--
-- Needs migration 030 (audit_log). If 030 was applied after members were removed, those earlier removals
-- were never logged and cannot be recovered - query 1 shows the date the log starts.

-- 1. How far back does the audit log go, and how many member events does it hold?
select min(occurred_at) as log_starts,
       count(*) filter (where entity_type = 'event_member')                       as member_events,
       count(*) filter (where entity_type = 'event_member' and action = 'delete') as removals,
       count(*) filter (where entity_type = 'event_member' and action = 'update') as role_changes,
       count(*) filter (where entity_type = 'event_member' and action = 'create') as additions
from public.audit_log;

-- (The recovery step itself never writes the same ending twice, so running it again is harmless.)
-- 2. Every ending the recovery WOULD write: an admin or committee role that ended by removal or by a
--    change to another role. One row per ending, oldest first.
--      status = 'recoverable'            will be written
--      status = 'skipped: event deleted' / 'skipped: person deleted'   the parent row no longer exists
with endings as (
  select a.id as audit_id, a.occurred_at, a.event_id, a.actor_user_id, a.action,
         case when a.action = 'delete' then a.changes->'user_id'->>'from' else a.entity_id end as user_text,
         a.changes->'role'->>'from' as was_role,
         a.changes->'role'->>'to'   as became_role
  from public.audit_log a
  where a.entity_type = 'event_member' and a.event_id is not null
    and a.action in ('delete', 'update')
    and a.changes->'role'->>'from' in ('admin', 'committee')
    and (a.action = 'delete' or a.changes->'role'->>'to' is distinct from a.changes->'role'->>'from')
)
select e.occurred_at,
       ev.name                                   as event,
       u.full_name                               as person,
       e.was_role,
       coalesce(e.became_role, '(removed)')      as became,
       actor.full_name                           as done_by,
       (select m.role::text from public.event_members m
         where m.event_id = e.event_id and m.user_id = u.id) as role_today,
       case
         when ev.id is null then 'skipped: event deleted'
         when u.id is null  then 'skipped: person deleted'
         else 'recoverable'
       end as status
from endings e
left join public.events    ev    on ev.id = e.event_id
left join public.app_users u     on u.id::text = e.user_text
left join public.app_users actor on actor.id = e.actor_user_id
order by e.occurred_at;

-- 3. Per event: who would be added to its closing credits by the recovery (people who hold NO admin or
--    committee role there today). This is the list that changes what a closing page shows. "credited_as" is
--    the LAST admin/committee role they held when their access ended - not the highest they ever held.
with endings as (
  select a.event_id, a.occurred_at,
         case when a.action = 'delete' then a.changes->'user_id'->>'from' else a.entity_id end as user_text,
         a.changes->'role'->>'from' as was_role
  from public.audit_log a
  where a.entity_type = 'event_member' and a.event_id is not null and a.action in ('delete', 'update')
    and a.changes->'role'->>'from' in ('admin', 'committee')
    and (a.action = 'delete' or a.changes->'role'->>'to' is distinct from a.changes->'role'->>'from')
), last_role as (
  select distinct on (event_id, user_text) event_id, user_text, was_role, occurred_at
  from endings order by event_id, user_text, occurred_at desc
)
select ev.name as event, u.full_name as person, l.was_role as credited_as, l.occurred_at as role_ended
from last_role l
join public.events ev on ev.id = l.event_id
join public.app_users u on u.id::text = l.user_text
where not exists (select 1 from public.event_members m
                  where m.event_id = l.event_id and m.user_id = u.id and m.role in ('admin', 'committee'))
order by ev.name, l.was_role, u.full_name;

-- 4. Sanity: people whose removal rows have no readable person (these cannot be recovered). Expect 0 rows.
select a.occurred_at, a.event_id, a.entity_id
from public.audit_log a
where a.entity_type = 'event_member' and a.action = 'delete' and a.event_id is not null
  and a.changes->'role'->>'from' in ('admin', 'committee')
  and (a.changes->'user_id'->>'from') is null
order by a.occurred_at;
