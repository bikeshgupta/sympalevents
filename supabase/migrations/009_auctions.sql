-- Auctions are now fully user-created data, not a hardcoded notice. Any
-- event admin/committee member can create one or more auctions for their
-- event; every detail (title, prize, starting bid, increment, window) is
-- entered through the app rather than living in a source file.
create table if not exists public.auctions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  title text not null,
  tag text not null default 'Auction',
  description text not null default '',
  prize text,
  -- Optional external image URL. There is no upload/template system yet -
  -- this is deliberately just a URL field until one exists.
  image_url text,
  starting_bid numeric(12,2) not null check (starting_bid > 0),
  min_increment numeric(12,2) not null check (min_increment > 0),
  opens_at timestamptz not null,
  closes_at timestamptz not null,
  status text not null default 'active' check (status in ('active', 'cancelled')),
  created_by uuid references public.app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint auctions_window_order check (closes_at > opens_at)
);

create index if not exists auctions_event_idx on public.auctions (event_id, status, opens_at);

alter table public.auctions enable row level security;

-- Same rationale as auction_registrations/auction_bids (see those migrations):
-- this app has no Supabase Auth session in the browser, so auth.uid() never
-- resolves for the anon-key client. RLS is enabled with zero policies - the
-- only way in is /api/auctions, which uses the service-role client and
-- checks event_members.role server-side for create/update/cancel. Listing
-- auctions is intentionally public (no auth required for that GET), the same
-- way dashboard/budget already are.
