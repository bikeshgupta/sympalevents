-- Apply manually AFTER 032 (event_registrations). Additive only: new columns
-- with defaults, indexes, and three new functions. Existing bookings keep their
-- meaning; each gets a pass token and a booking code the moment this runs.
--
-- What it adds
-- ------------
--   pass_token    The opaque secret behind a booking's QR code. 122 random bits
--                 from gen_random_uuid(), unique, and NOT derived from anything
--                 visible: not the id, the flat, a sequence or the payment
--                 reference. Changing what is printed on the pass can never make
--                 another booking's pass guessable, and the QR carries nothing a
--                 stranger could use except presenting it at the gate.
--                 Postgres evaluates a volatile default per row, so every
--                 existing booking gets its own.
--   booking_code  Eight characters a volunteer can read aloud ("A1B2C3D4"):
--                 the first eight of the id, upper-cased, stored so it can be
--                 searched. It identifies a booking; it is not a credential.
--   is_walk_in    Added at the gate rather than booked beforehand.
--
--   gate_check_in / gate_serve_food
--                 What the gate does. Unlike update_event_registration these
--                 are IDEMPOTENT - a second scan of the same pass returns the
--                 booking as it stands instead of failing on a stale version -
--                 and they take an `override` for an authorised person to admit
--                 somebody whose payment is not confirmed. The override is
--                 recorded in the history as 'check_in_unpaid'; whether a caller
--                 may use it is the API's decision, not this function's.
--   gate_walk_in  A booking made on the day. book_event refuses once the
--                 registration deadline has passed - which is exactly when
--                 walk-ins happen - so this skips the deadline and the
--                 self-service switch, and keeps the capacity limit.
--   gate_cash_received
--                 Marks a payment verified when cash was handed over at the
--                 gate. History says 'cash_received', so it reads differently
--                 from a bank-statement verification.
--
-- RLS is already on for these tables with zero policies (032). The functions are
-- service_role only, like every function there.

alter table public.event_registrations
  add column if not exists pass_token text not null default replace(gen_random_uuid()::text, '-', ''),
  add column if not exists is_walk_in boolean not null default false,
  add column if not exists booking_code text generated always as (upper(left(id::text, 8))) stored;

create unique index if not exists event_registrations_pass_token
  on public.event_registrations (pass_token);
create index if not exists event_registrations_booking_code
  on public.event_registrations (event_id, booking_code);

create or replace function public.gate_check_in(
  p_event uuid, p_id uuid, p_actor uuid, p_count integer, p_override boolean, p_version integer)
returns public.event_registrations language plpgsql set search_path=public as $$
declare r public.event_registrations; e public.events;
begin
 select * into r from event_registrations where id=p_id and event_id=p_event for update;
 if not found then raise exception 'Registration not found'; end if;
 -- A repeat of something already done is not an error: show the booking as it is.
 if p_count<=r.checked_in_count then return r; end if;
 select * into e from events where id=p_event;
 if e.status_override is not null then raise exception 'Event is not published'; end if;
 if r.status<>'active' then raise exception 'This booking is cancelled'; end if;
 if r.version<>p_version then raise exception 'Booking changed. Refresh and try again'; end if;
 if p_count>r.adults+r.children then raise exception 'Invalid check-in count'; end if;
 if r.payment_status not in ('verified','free') and not coalesce(p_override,false) then
  raise exception 'Payment is not confirmed'; end if;
 update event_registrations set checked_in_count=p_count, version=version+1, updated_at=now()
  where id=r.id returning * into r;
 insert into event_registration_history(registration_id,actor_id,action)
  values(r.id,p_actor,case when r.payment_status in ('verified','free') then 'check_in' else 'check_in_unpaid' end);
 return r;
end $$;

create or replace function public.gate_serve_food(
  p_event uuid, p_id uuid, p_actor uuid, p_count integer, p_override boolean, p_version integer)
returns public.event_registrations language plpgsql set search_path=public as $$
declare r public.event_registrations; e public.events;
begin
 select * into r from event_registrations where id=p_id and event_id=p_event for update;
 if not found then raise exception 'Registration not found'; end if;
 if p_count<=r.food_served_count then return r; end if;
 select * into e from events where id=p_event;
 if e.status_override is not null then raise exception 'Event is not published'; end if;
 if r.status<>'active' then raise exception 'This booking is cancelled'; end if;
 if r.version<>p_version then raise exception 'Booking changed. Refresh and try again'; end if;
 if r.payment_status not in ('verified','free') and not coalesce(p_override,false) then
  raise exception 'Payment is not confirmed'; end if;
 if p_count>least(r.food_count,r.checked_in_count) then
  raise exception 'Check in attendees before serving their booked meals'; end if;
 update event_registrations set food_served_count=p_count, version=version+1, updated_at=now()
  where id=r.id returning * into r;
 insert into event_registration_history(registration_id,actor_id,action) values(r.id,p_actor,'serve_food');
 return r;
end $$;

create or replace function public.gate_cash_received(
  p_event uuid, p_id uuid, p_actor uuid, p_version integer)
returns public.event_registrations language plpgsql set search_path=public as $$
declare r public.event_registrations;
begin
 select * into r from event_registrations where id=p_id and event_id=p_event for update;
 if not found then raise exception 'Registration not found'; end if;
 if r.payment_status in ('verified','free') then return r; end if;
 if r.version<>p_version then raise exception 'Booking changed. Refresh and try again'; end if;
 if r.status<>'active' or r.payment_status not in ('unpaid','submitted') then
  raise exception 'Payment cannot be recorded for this booking'; end if;
 update event_registrations set payment_status='verified', verified_by=p_actor, verified_at=now(),
  version=version+1, updated_at=now() where id=r.id returning * into r;
 insert into event_registration_history(registration_id,actor_id,action) values(r.id,p_actor,'cash_received');
 return r;
end $$;

create or replace function public.gate_walk_in(p_event uuid, p_actor uuid, p_input jsonb)
returns public.event_registrations language plpgsql set search_path=public as $$
declare c public.event_registration_settings; e public.events; r public.event_registrations;
 n integer; a integer:=coalesce((p_input->>'adults')::integer,1); k integer:=coalesce((p_input->>'children')::integer,0);
 f integer:=coalesce((p_input->>'food_count')::integer,0); total integer;
begin
 select * into c from event_registration_settings where event_id=p_event for update;
 if not found then raise exception 'Registration is not configured'; end if;
 select * into r from event_registrations where idempotency_key=(p_input->>'idempotency_key')::uuid;
 if found then
  if r.booked_by<>p_actor or r.event_id<>p_event then raise exception 'Invalid booking request'; end if;
  return r;
 end if;
 select * into e from events where id=p_event;
 if e.status_override is not null then raise exception 'Event is not published'; end if;
 if exists(select 1 from event_closing where event_id=p_event and is_closed) then raise exception 'This event has ended'; end if;
 if a+k<1 or a+k>40 then raise exception 'Choose between 1 and 40 attendees'; end if;
 if f>0 and not c.food_enabled then raise exception 'Food booking is not available'; end if;
 if f>a+k then raise exception 'Food portions cannot exceed attendees'; end if;
 select coalesce(sum(adults+children),0) into n from event_registrations where event_id=p_event and status='active';
 if c.capacity is not null and n+a+k>c.capacity then raise exception 'Not enough places remain for this group'; end if;
 total:=a*c.adult_price+k*c.child_price+f*c.food_price;
 insert into event_registrations(event_id,user_id,booked_by,idempotency_key,contact_name,flat,adults,children,guests,food_count,price_snapshot,amount_due,payment_status,is_walk_in)
 values(p_event,null,p_actor,(p_input->>'idempotency_key')::uuid,p_input->>'contact_name',p_input->>'flat',a,k,0,f,
  jsonb_build_object('adult',c.adult_price,'child',c.child_price,'food',c.food_price,'child_age_limit',c.child_age_limit),
  total,case when total=0 then 'free' else 'unpaid' end,true) returning * into r;
 insert into event_registration_history(registration_id,actor_id,action) values(r.id,p_actor,'walk_in');
 return r;
end $$;

revoke all on function public.gate_check_in(uuid,uuid,uuid,integer,boolean,integer) from public,anon,authenticated;
revoke all on function public.gate_serve_food(uuid,uuid,uuid,integer,boolean,integer) from public,anon,authenticated;
revoke all on function public.gate_cash_received(uuid,uuid,uuid,integer) from public,anon,authenticated;
revoke all on function public.gate_walk_in(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.gate_check_in(uuid,uuid,uuid,integer,boolean,integer) to service_role;
grant execute on function public.gate_serve_food(uuid,uuid,uuid,integer,boolean,integer) to service_role;
grant execute on function public.gate_cash_received(uuid,uuid,uuid,integer) to service_role;
grant execute on function public.gate_walk_in(uuid,uuid,jsonb) to service_role;
