-- Registration for online auctions run from the dashboard (e.g. the laddoo
-- auction). The auction itself is defined in the app's announcements data
-- file, not a database row, so registrations are keyed by a stable
-- `auction_id` string (an announcement's `id`) rather than a foreign key.
create table if not exists public.auction_registrations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  auction_id text not null,
  user_id uuid not null references public.app_users(id) on delete cascade,
  display_name text not null,
  flat_no text,
  phone text not null,
  status text not null default 'registered' check (status in ('registered', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, auction_id, user_id)
);

create index if not exists auction_registrations_lookup_idx
  on public.auction_registrations (event_id, auction_id, status);

alter table public.auction_registrations enable row level security;

-- Deliberately no anon/authenticated policies.
--
-- This app authenticates through Firebase, not Supabase Auth, so the browser
-- Supabase client never holds a session and auth.uid() never resolves for it -
-- policies written against auth.uid() would be unreachable dead code here.
-- All access instead goes through /api/auction-registrations, which verifies
-- the Firebase ID token server-side and uses the service role key (which
-- bypasses RLS by design). Enabling RLS with zero policies is what actually
-- locks this table to that one verified path.
