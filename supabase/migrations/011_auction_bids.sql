-- Append-only bid ledger for online auctions (see 009_auctions.sql and
-- 010_auction_registrations.sql for the tables this depends on). Bids are
-- never updated or deleted - the history is the record.
create table if not exists public.auction_bids (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  auction_id uuid not null references public.auctions(id) on delete cascade,
  user_id uuid not null references public.app_users(id) on delete cascade,
  display_name text not null,
  flat_no text,
  amount numeric(12,2) not null check (amount > 0),
  created_at timestamptz not null default now()
);

-- Bids are read back ordered by time (chronological = amount order, since the
-- API only ever accepts a bid strictly higher than the current one) and
-- filtered by event+auction, so that is the index shape.
create index if not exists auction_bids_lookup_idx
  on public.auction_bids (event_id, auction_id, created_at);

alter table public.auction_bids enable row level security;

-- Same rationale as auction_registrations: this app has no Supabase Auth
-- session in the browser (Firebase handles sign-in), so auth.uid() never
-- resolves for the anon-key client and a policy written against it would be
-- dead code. RLS is enabled with zero policies - the only way in is
-- /api/auction-bids, which verifies the Firebase ID token, checks the bidder
-- is registered for this auction, and validates the bid amount server-side
-- before writing with the service-role client (bypasses RLS by design).
