-- D6: the exact Society Admin list, and where each admin's role comes from.
-- READ-ONLY. Run in the Supabase SQL editor. Nothing here changes any data, and
-- nobody is demoted by it - you decide manually who stays a Society Admin.
--
-- Background: migration 023 made everybody with a role on an event a member of that
-- event's society carrying the SAME role (admin wherever they were admin anywhere).
-- So a person who is only an EVENT admin today may also be a SOCIETY admin.
--
-- Q1 - the main list: one row per society admin.
--   society                 the society
--   society_admin           the person (name, then email so you can recognise them)
--   society_role            their role on the society (will be 'admin' in every row)
--   member_since            organization_members.created_at (rows made by 023's backfill
--                           carry the day 023 was run, not the day the person joined)
--   events_where_event_admin   events of this society where they are an EVENT admin NOW
--   events_other_roles         events of this society where they hold another role NOW
--   backed_by_event_admin   true  = they are an admin of at least one event in the society,
--                                   i.e. exactly what 023's backfill would have promoted
--                           false = society admin with NO event admin role (e.g. created the
--                                   society, or was added to the society by hand)
select
  o.name                                                     as society,
  coalesce(nullif(trim(u.full_name), ''), '(no name)')       as society_admin_name,
  u.email                                                    as society_admin_email,
  m.role::text                                               as society_role,
  m.created_at                                               as member_since,
  coalesce((
    select string_agg(e.name, '; ' order by e.name)
    from public.events e
    join public.event_members em on em.event_id = e.id
    where e.organization_id = o.id and em.user_id = m.user_id and em.role = 'admin'
  ), '')                                                     as events_where_event_admin,
  coalesce((
    select string_agg(e.name || ' (' || em.role::text || ')', '; ' order by e.name)
    from public.events e
    join public.event_members em on em.event_id = e.id
    where e.organization_id = o.id and em.user_id = m.user_id and em.role <> 'admin'
  ), '')                                                     as events_other_roles,
  exists (
    select 1
    from public.events e
    join public.event_members em on em.event_id = e.id
    where e.organization_id = o.id and em.user_id = m.user_id and em.role = 'admin'
  )                                                          as backed_by_event_admin
from public.organization_members m
join public.organizations o on o.id = m.organization_id
join public.app_users u on u.id = m.user_id
where m.role = 'admin'
order by o.name, backed_by_event_admin desc, society_admin_name;

-- Q2 - how many admins each society has (a society with 1 is the one the safety trigger guards).
select o.name as society,
       count(*) filter (where m.role = 'admin')     as society_admins,
       count(*) filter (where m.role = 'committee') as committee,
       count(*) filter (where m.role = 'read_only') as residents
from public.organizations o
left join public.organization_members m on m.organization_id = o.id
group by o.id, o.name
order by o.name;

-- Q3 - was the society role ever changed after 023? (audit entries, if any exist).
select occurred_at, actor_email, entity_type, action, summary
from public.audit_log
where entity_type in ('society', 'society_member')
order by occurred_at desc
limit 50;
