-- Apply manually after 032. New events become drafts; existing events unchanged.
begin;
create or replace function public.create_event_draft(p_user uuid,p_input jsonb,p_modules jsonb)
returns uuid language plpgsql set search_path=public as $$
declare society uuid; event uuid;
begin
 -- Serialize creation by this user so the creation cap cannot be raced.
 perform 1 from app_users where id=p_user for update;
 if (select count(*) from event_members where user_id=p_user and role='admin')>=40 then raise exception 'Event creation limit reached'; end if;
 society:=nullif(p_input->>'societyId','')::uuid;
 if society is not null then
  if not exists(select 1 from organization_members where organization_id=society and user_id=p_user and role in ('admin','committee')) then raise exception 'You cannot add an event to that society'; end if;
 else
  if (select count(*) from organization_members where user_id=p_user and role='admin')>=10 then raise exception 'Society creation limit reached'; end if;
  insert into organizations(name) values(p_input->>'societyName') returning id into society;
  insert into organization_members(organization_id,user_id,role) values(society,p_user,'admin');
 end if;
 insert into events(organization_id,name,start_date,end_date,start_time,end_time,location,description,event_type,template_key,unit_label,status_override)
 values(society,p_input->>'eventName',(p_input->>'startDate')::date,(p_input->>'endDate')::date,
 nullif(p_input->>'startTime','')::time,nullif(p_input->>'endTime','')::time,
 coalesce(p_input->>'location',''),coalesce(p_input->>'description',''),p_input->>'eventType',p_input->>'templateKey',p_input->>'unitLabel','draft') returning id into event;
 insert into event_members(event_id,user_id,role) values(event,p_user,'admin');
 insert into event_page_visibility(event_id,page_key,visibility,is_enabled,label_override)
 select event,m->>'page_key',m->>'visibility',(m->>'is_enabled')::boolean,m->>'label_override' from jsonb_array_elements(p_modules) m;
 insert into event_registration_settings(event_id) values(event);
 return event;
end $$;
revoke all on function public.create_event_draft(uuid,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.create_event_draft(uuid,jsonb,jsonb) to service_role;
commit;
