-- Apply manually AFTER migrations 001–030. Existing event data stays unchanged.
begin;
alter table public.events add column if not exists start_time time, add column if not exists end_time time;
create table public.event_registration_settings (
 event_id uuid primary key references public.events(id) on delete cascade,
 enabled boolean not null default false,
 self_service boolean not null default false,
 audience text not null default 'society' check(audience in ('society','public')),
 adult_price integer not null default 0 check(adult_price between 0 and 10000000),
 child_price integer not null default 0 check(child_price between 0 and 10000000),
 child_age_limit integer not null default 18 check(child_age_limit between 1 and 21),
 food_enabled boolean not null default false,
 food_price integer not null default 0 check(food_price between 0 and 10000000),
 allow_guests boolean not null default false,
 capacity integer check(capacity between 1 and 100000), closes_at timestamptz,
 payment_instructions text not null default '', cancellation_policy text not null default '',
 updated_at timestamptz not null default now()
);
create table public.event_registrations (
 id uuid primary key default gen_random_uuid(), event_id uuid not null references public.events(id) on delete cascade,
 user_id uuid references public.app_users(id), booked_by uuid not null references public.app_users(id), idempotency_key uuid not null unique,
 contact_name text not null check(length(contact_name) between 2 and 100), flat text not null check(length(flat) between 1 and 40),
 adults integer not null check(adults between 0 and 20), children integer not null check(children between 0 and 20),
 guests integer not null default 0 check(guests>=0), food_count integer not null default 0 check(food_count>=0),
 price_snapshot jsonb not null, amount_due integer not null check(amount_due>=0),
 payment_status text not null check(payment_status in ('unpaid','submitted','verified','free','refund_pending','refunded')),
 payment_reference text not null default '', status text not null default 'active' check(status in ('active','cancelled')),
 checked_in_count integer not null default 0, food_served_count integer not null default 0, version integer not null default 1,
 verified_by uuid references public.app_users(id), verified_at timestamptz,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check(adults+children between 1 and 40), check(guests<=adults+children), check(food_count<=adults+children),
 check(checked_in_count between 0 and adults+children), check(food_served_count between 0 and food_count)
);
create unique index event_registration_active_user on public.event_registrations(event_id,user_id) where status='active';
create index event_registration_event on public.event_registrations(event_id,created_at);
create table public.event_registration_history (
 id bigint generated always as identity primary key, registration_id uuid not null references public.event_registrations(id),
 actor_id uuid not null references public.app_users(id), action text not null, created_at timestamptz not null default now()
);
alter table public.event_registration_settings enable row level security;
alter table public.event_registrations enable row level security;
alter table public.event_registration_history enable row level security;
revoke all on public.event_registration_settings,public.event_registrations,public.event_registration_history from anon,authenticated;

-- Serialized booking/capacity check; API verifies Firebase and module access.
create or replace function public.book_event(p_event uuid,p_user uuid,p_manager boolean,p_input jsonb)
returns public.event_registrations language plpgsql set search_path=public as $$
declare c public.event_registration_settings; e public.events; r public.event_registrations;
 n integer; a integer:=(p_input->>'adults')::integer; k integer:=(p_input->>'children')::integer;
 f integer:=(p_input->>'food_count')::integer; g integer:=(p_input->>'guests')::integer; total integer;
begin
 select * into c from event_registration_settings where event_id=p_event for update;
 if not found then raise exception 'Registration is not configured'; end if;
 select * into r from event_registrations where idempotency_key=(p_input->>'idempotency_key')::uuid;
 if found then
  if r.booked_by<>p_user or r.event_id<>p_event then raise exception 'Invalid booking request'; end if;
  return r;
 end if;
 if coalesce((p_input->>'on_behalf')::boolean,false) and not p_manager then raise exception 'Organiser access required'; end if;
 if not coalesce((p_input->>'on_behalf')::boolean,false) and not c.self_service then raise exception 'Please contact the organiser to register'; end if;
 select * into e from events where id=p_event;
 if not c.enabled or e.status_override='cancelled' or (e.status_override='draft' and not p_manager) or
  ((e.end_date+coalesce(e.end_time,'23:59:59'::time)) at time zone 'Asia/Kolkata')<now() or
  exists(select 1 from event_closing where event_id=p_event and is_closed) then raise exception 'Registration is closed'; end if;
 if c.closes_at is not null and now()>=c.closes_at then raise exception 'Registration deadline has passed'; end if;
 if not p_manager and c.audience='society' and not exists(select 1 from organization_members where organization_id=e.organization_id and user_id=p_user)
  and not exists(select 1 from event_members where event_id=p_event and user_id=p_user) then raise exception 'Join this society before registering'; end if;
 if g>0 and not c.allow_guests then raise exception 'Guest registration is not available'; end if;
 if f>0 and not c.food_enabled then raise exception 'Food booking is not available'; end if;
 select coalesce(sum(adults+children),0) into n from event_registrations where event_id=p_event and status='active';
 if c.capacity is not null and n+a+k>c.capacity then raise exception 'Not enough places remain for this group'; end if;
 total:=a*c.adult_price+k*c.child_price+f*c.food_price;
 if p_input ? 'quoted_amount' and (p_input->>'quoted_amount')::integer<>total then raise exception 'Prices changed. Refresh before booking'; end if;
 insert into event_registrations(event_id,user_id,booked_by,idempotency_key,contact_name,flat,adults,children,guests,food_count,price_snapshot,amount_due,payment_status)
 values(p_event,case when coalesce((p_input->>'on_behalf')::boolean,false) then null else p_user end,p_user,(p_input->>'idempotency_key')::uuid,p_input->>'contact_name',p_input->>'flat',a,k,g,f,
 jsonb_build_object('adult',c.adult_price,'child',c.child_price,'food',c.food_price,'child_age_limit',c.child_age_limit),total,case when total=0 then 'free' else 'unpaid' end) returning * into r;
 insert into event_registration_history(registration_id,actor_id,action) values(r.id,p_user,'registered');
 return r;
end $$;
revoke all on function public.book_event(uuid,uuid,boolean,jsonb) from public,anon,authenticated;
grant execute on function public.book_event(uuid,uuid,boolean,jsonb) to service_role;

-- Version check prevents duplicate admission and overwriting another organiser.
create or replace function public.update_event_registration(p_event uuid,p_id uuid,p_actor uuid,p_manager boolean,p_action text,p_version integer,p_value text default '')
returns public.event_registrations language plpgsql set search_path=public as $$
declare r public.event_registrations; e public.events; c public.event_registration_settings; b jsonb; n integer; total integer;
begin
 perform 1 from event_registration_settings where event_id=p_event for update;
 select * into r from event_registrations where id=p_id and event_id=p_event for update;
 if not found then raise exception 'Registration not found'; end if;
 if not p_manager and r.user_id is distinct from p_actor then raise exception 'Registration not found'; end if;
 if r.version<>p_version then raise exception 'Registration changed. Refresh and try again'; end if;
 if p_manager and p_action='edit' then
  if r.status<>'active' or r.checked_in_count>0 or r.payment_status not in ('unpaid','free') then raise exception 'Only unpaid, unchecked bookings can be edited. Cancel and rebook after refund review for other changes.'; end if;
  b:=p_value::jsonb;
  select * into c from event_registration_settings where event_id=p_event;
  select coalesce(sum(adults+children),0) into n from event_registrations where event_id=p_event and status='active' and id<>r.id;
  if c.capacity is not null and n+(b->>'adults')::integer+(b->>'children')::integer>c.capacity then raise exception 'Not enough places remain for this group'; end if;
  if (b->>'guests')::integer>0 and not c.allow_guests then raise exception 'Guest registration is not available'; end if;
  if (b->>'food_count')::integer>0 and not c.food_enabled then raise exception 'Food booking is not available'; end if;
  r.contact_name:=b->>'contact_name'; r.flat:=b->>'flat'; r.adults:=(b->>'adults')::integer; r.children:=(b->>'children')::integer;
  r.guests:=(b->>'guests')::integer; r.food_count:=(b->>'food_count')::integer;
  r.amount_due:=r.adults*(r.price_snapshot->>'adult')::integer+r.children*(r.price_snapshot->>'child')::integer+r.food_count*(r.price_snapshot->>'food')::integer;
  r.payment_status:=case when r.amount_due=0 then 'free' else 'unpaid' end;
 elsif p_action='submit_payment' then
  if r.status<>'active' or r.payment_status not in ('unpaid','submitted') then raise exception 'Payment cannot be submitted'; end if;
  if length(trim(p_value))<3 or length(p_value)>120 then raise exception 'Enter a payment reference'; end if;
  r.payment_status:='submitted'; r.payment_reference:=trim(p_value);
 elsif p_action='cancel' then
  if r.status<>'active' or r.checked_in_count>0 then raise exception 'This registration cannot be cancelled'; end if;
  r.status:='cancelled';
  if r.payment_status in ('submitted','verified') then r.payment_status:='refund_pending'; end if;
 elsif p_manager and p_action='verify' then
  if r.status<>'active' or r.payment_status<>'submitted' then raise exception 'Only submitted payments can be verified'; end if;
  r.payment_status:='verified'; r.verified_by:=p_actor; r.verified_at:=now();
 elsif p_manager and p_action='reject' then
  if r.status<>'active' or r.payment_status<>'submitted' then raise exception 'Only submitted payments can be rejected'; end if;
  r.payment_status:='unpaid';
 elsif p_manager and p_action='refund' then
  if r.status<>'cancelled' or r.payment_status<>'refund_pending' then raise exception 'No refund is pending'; end if;
  r.payment_status:='refunded';
 elsif p_manager and p_action in ('check_in','serve_food') then
  select * into e from events where id=p_event;
  if e.status_override is not null then raise exception 'Event is not published'; end if;
  if r.status<>'active' or r.payment_status not in ('verified','free') then raise exception 'Confirm payment before admission'; end if;
  if p_action='check_in' then
   if (p_value::integer)<=r.checked_in_count or (p_value::integer)>r.adults+r.children then raise exception 'Invalid check-in count'; end if;
   r.checked_in_count:=p_value::integer;
  else
   if (p_value::integer)<=r.food_served_count or (p_value::integer)>least(r.food_count,r.checked_in_count) then raise exception 'Check in attendees before serving their booked meals'; end if;
   r.food_served_count:=p_value::integer;
  end if;
 else raise exception 'Action is not allowed'; end if;
 update event_registrations set contact_name=r.contact_name,flat=r.flat,adults=r.adults,children=r.children,guests=r.guests,food_count=r.food_count,amount_due=r.amount_due,status=r.status,payment_status=r.payment_status,payment_reference=r.payment_reference,
 checked_in_count=r.checked_in_count,food_served_count=r.food_served_count,verified_by=r.verified_by,verified_at=r.verified_at,
 version=version+1,updated_at=now() where id=r.id returning * into r;
 insert into event_registration_history(registration_id,actor_id,action) values(r.id,p_actor,p_action);
 return r;
end $$;
revoke all on function public.update_event_registration(uuid,uuid,uuid,boolean,text,integer,text) from public,anon,authenticated;
grant execute on function public.update_event_registration(uuid,uuid,uuid,boolean,text,integer,text) to service_role;

create or replace function public.event_registration_summary(p_event uuid)
returns jsonb language sql stable set search_path=public as $$
 select jsonb_build_object(
 'attendees',coalesce(sum(adults+children) filter(where status='active'),0),
 'households',count(*) filter(where status='active'),
 'food',coalesce(sum(food_count) filter(where status='active'),0),
 'checkedIn',coalesce(sum(checked_in_count),0),
 'foodServed',coalesce(sum(food_served_count),0),
 'verifiedAmount',coalesce(sum(amount_due) filter(where payment_status='verified'),0),
 'pendingAmount',coalesce(sum(amount_due) filter(where status='active' and payment_status in ('unpaid','submitted')),0),
 'refundAmount',coalesce(sum(amount_due) filter(where payment_status='refund_pending'),0))
 from event_registrations where event_id=p_event;
$$;
revoke all on function public.event_registration_summary(uuid) from public,anon,authenticated;
grant execute on function public.event_registration_summary(uuid) to service_role;

create or replace function public.save_registration_settings(p_event uuid,p_config jsonb)
returns void language plpgsql set search_path=public as $$
declare n integer;
begin
 insert into event_registration_settings(event_id) values(p_event) on conflict do nothing;
 perform 1 from event_registration_settings where event_id=p_event for update;
 select coalesce(sum(adults+children),0) into n from event_registrations where event_id=p_event and status='active';
 if (p_config->>'capacity')::integer<n then raise exception 'Capacity cannot be below existing registrations'; end if;
 if (p_config->>'enabled')::boolean and ((p_config->>'adult_price')::integer>0 or (p_config->>'child_price')::integer>0 or ((p_config->>'food_enabled')::boolean and (p_config->>'food_price')::integer>0))
 and length(trim(p_config->>'payment_instructions'))<5 then raise exception 'Add payment instructions before opening paid registration'; end if;
 update event_registration_settings set enabled=(p_config->>'enabled')::boolean,self_service=(p_config->>'self_service')::boolean,audience=p_config->>'audience',
 adult_price=(p_config->>'adult_price')::integer,child_price=(p_config->>'child_price')::integer,child_age_limit=(p_config->>'child_age_limit')::integer,
 food_enabled=(p_config->>'food_enabled')::boolean,food_price=(p_config->>'food_price')::integer,allow_guests=(p_config->>'allow_guests')::boolean,
 capacity=(p_config->>'capacity')::integer,closes_at=(p_config->>'closes_at')::timestamptz,
 payment_instructions=p_config->>'payment_instructions',cancellation_policy=p_config->>'cancellation_policy',updated_at=now() where event_id=p_event;
end $$;
revoke all on function public.save_registration_settings(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.save_registration_settings(uuid,jsonb) to service_role;

create or replace function public.set_event_publication(p_event uuid,p_action text)
returns void language plpgsql set search_path=public as $$
begin
 perform 1 from event_registration_settings where event_id=p_event for update;
 perform 1 from events where id=p_event for update;
 if not found then raise exception 'Event not found'; end if;
 if p_action='draft' and exists(select 1 from event_registrations where event_id=p_event) then
 raise exception 'An event with registrations cannot return to draft. Close registration or cancel the event.'; end if;
 if p_action='cancel' then
 update event_registration_settings set enabled=false where event_id=p_event;
 update event_registrations set status='cancelled',payment_status=case when payment_status in ('verified','submitted') then 'refund_pending' else payment_status end,version=version+1,updated_at=now()
 where event_id=p_event and status='active';
 end if;
 update events set status_override=case when p_action='publish' then null when p_action='cancel' then 'cancelled' else 'draft' end where id=p_event;
end $$;
revoke all on function public.set_event_publication(uuid,text) from public,anon,authenticated;
grant execute on function public.set_event_publication(uuid,text) to service_role;
commit;
