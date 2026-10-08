-- Apply manually. Independent of the others (needs 023's societies and 003's
-- app_users, as everything does). Two new tables and one function, additive.
--
-- "Get involved": things an event needs people for, and people saying yes.
--
--   event_opportunities  What an organiser asks for. `kind` is 'volunteer' ("Parking
--                        help, 4 people") or 'performance' ("Open call for the
--                        cultural evening"). `slots` caps how many may join; NULL is
--                        no cap. `closes_at` and `status` close it.
--   event_signups        One row per person per opportunity - the unique constraint is
--                        the rule. `details` is what a performance entry needs (act,
--                        duration, performers); `contact` is a phone number for the
--                        organiser to coordinate with and is PRIVATE: no route sends it
--                        to anybody but an organiser. `status` is 'confirmed' for a
--                        volunteer (a place was free), 'pending' for a performance
--                        until an organiser approves it, 'declined' if they decline.
--
--   join_opportunity     The sign-up, atomically. It locks the opportunity row, so two
--                        people taking the last place cannot both get it, and joining
--                        twice is an update rather than an error.
--
-- RLS on, zero policies, as every table since 009.

create table if not exists public.event_opportunities (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  kind text not null check (kind in ('volunteer', 'performance')),
  title text not null check (char_length(title) between 2 and 100),
  description text not null default '' check (char_length(description) <= 1000),
  slots integer check (slots between 1 and 500),
  closes_at timestamptz,
  status text not null default 'open' check (status in ('open', 'closed')),
  sort_order integer not null default 0,
  created_by uuid references public.app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists event_opportunities_event_idx
  on public.event_opportunities (event_id, kind, sort_order);

create table if not exists public.event_signups (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references public.event_opportunities(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid not null references public.app_users(id) on delete cascade,
  details jsonb not null default '{}'::jsonb,
  note text not null default '' check (char_length(note) <= 500),
  contact text not null default '' check (char_length(contact) <= 40),
  status text not null default 'confirmed' check (status in ('confirmed', 'pending', 'declined')),
  created_at timestamptz not null default now(),
  unique (opportunity_id, user_id)
);

create index if not exists event_signups_event_idx on public.event_signups (event_id, status);

alter table public.event_opportunities enable row level security;
alter table public.event_signups enable row level security;

create or replace function public.join_opportunity(
  p_opportunity uuid, p_user uuid, p_details jsonb, p_note text, p_contact text)
returns public.event_signups language plpgsql set search_path=public as $$
declare o public.event_opportunities; s public.event_signups; n integer; st text;
begin
 -- The lock is what makes "the last place" mean one person.
 select * into o from event_opportunities where id=p_opportunity for update;
 if not found then raise exception 'That no longer exists'; end if;
 if o.status<>'open' or (o.closes_at is not null and now()>=o.closes_at) then
  raise exception 'Sign-up for this has closed'; end if;

 select * into s from event_signups where opportunity_id=p_opportunity and user_id=p_user;
 if found then
  update event_signups set details=coalesce(p_details,'{}'::jsonb), note=coalesce(p_note,''), contact=coalesce(p_contact,'')
   where id=s.id returning * into s;
  return s;
 end if;

 if o.kind='volunteer' then
  select count(*) into n from event_signups where opportunity_id=p_opportunity and status='confirmed';
  if o.slots is not null and n>=o.slots then raise exception 'All the places for this are taken'; end if;
  st:='confirmed';
 else
  select count(*) into n from event_signups where opportunity_id=p_opportunity and status in ('pending','confirmed');
  if o.slots is not null and n>=o.slots then raise exception 'All the places for this are taken'; end if;
  st:='pending';
 end if;

 insert into event_signups(opportunity_id,event_id,user_id,details,note,contact,status)
  values(p_opportunity,o.event_id,p_user,coalesce(p_details,'{}'::jsonb),coalesce(p_note,''),coalesce(p_contact,''),st)
  returning * into s;
 return s;
end $$;

revoke all on function public.join_opportunity(uuid,uuid,jsonb,text,text) from public,anon,authenticated;
grant execute on function public.join_opportunity(uuid,uuid,jsonb,text,text) to service_role;
