-- Admin-controlled page visibility, per event.
--
-- Until now "which pages are open to the whole society" was a hardcoded set
-- (`publicPageKeys` in the client, duplicated in two API routes). This table
-- moves that decision to the event admin, for every page, with three levels:
--
--   public        - anyone with the link, no sign-in
--   authenticated - any signed-in user
--   restricted    - only the admin, plus members granted view/edit for that
--                   page in event_page_permissions (today's default)
--
-- Edit rights are unchanged and still come from event_members.role /
-- event_page_permissions: visibility widens *viewing* only. "settings" is
-- deliberately not stored here - it stays admin-only and is not something an
-- admin can open up.
create table if not exists public.event_page_visibility (
  event_id uuid not null references public.events(id) on delete cascade,
  page_key text not null,
  visibility text not null default 'restricted'
    check (visibility in ('public', 'authenticated', 'restricted')),
  updated_at timestamptz not null default now(),
  primary key (event_id, page_key)
);

-- RLS on, zero policies - the same deliberate choice as the auction tables:
-- this app authenticates through Firebase, so the browser's Supabase client
-- never has a session and auth.uid() never resolves for it. Every read and
-- write goes through /api/page-access with the service-role client.
alter table public.event_page_visibility enable row level security;

-- Seed every existing event with exactly today's behaviour, so applying this
-- migration changes nothing until an admin edits it in Settings.
insert into public.event_page_visibility (event_id, page_key, visibility)
select events.id, defaults.page_key, defaults.visibility
from public.events
cross join (
  values
    ('dashboard', 'public'),
    ('budget', 'public'),
    ('auctions', 'public'),
    ('closing', 'public'),
    ('contributions', 'restricted'),
    ('sponsors', 'restricted'),
    ('expenses', 'restricted'),
    ('prasad', 'restricted'),
    ('tasks', 'restricted'),
    ('volunteers', 'restricted'),
    ('event-plan', 'restricted'),
    ('contacts', 'restricted')
) as defaults(page_key, visibility)
on conflict (event_id, page_key) do nothing;
