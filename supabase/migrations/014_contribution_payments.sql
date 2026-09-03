-- Self-service UPI contributions.
--
-- A resident opens their own UPI app (PhonePe / Google Pay / anything else)
-- from a `upi://pay` deep link and pays the committee's VPA directly. There is
-- no payment gateway and no merchant account in this flow, so nothing calls us
-- back to say the money arrived: a UPI intent link hands control to another app
-- and never returns a trustworthy result to the browser.
--
-- This table is that missing receipt. Every attempt is recorded before the
-- hand-off, the payer tells us afterwards whether they completed it, and a
-- committee member confirms against the bank/UPI statement. Only on confirm do
-- we touch `contributions` - so an unverified claim can never inflate the
-- collected figure on the dashboard.
create table if not exists public.contribution_payments (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,

  -- Filled in on confirmation, pointing at the rows this payment produced or
  -- topped up. Null while the payment is still unconfirmed.
  contribution_id uuid references public.contributions(id) on delete set null,
  resident_id uuid references public.residents(id) on delete set null,

  -- What the payer told us about themselves. Kept verbatim even after
  -- confirmation so the committee can always see what was actually submitted.
  flat_no text not null,
  resident_name text not null,
  resident_type text,
  phone text,
  amount numeric(12,2) not null check (amount > 0),
  note text,

  -- `reference` is generated server-side and travels in the UPI link's `tr`
  -- field, so it shows up in the payer's app and in the committee's statement -
  -- that string is how a claim gets matched to a real transfer. It doubles as
  -- the payer's capability token: the payer-side status updates below require
  -- it, which is what stops a stranger closing out somebody else's payment.
  reference text not null unique,
  -- The transaction id the payer copied back from their UPI app, if they did.
  payer_reference text,
  -- The VPA the link actually pointed at, captured because that config can
  -- change between one payment and the next.
  upi_vpa text,

  -- Set only when the payer happened to be signed in; this flow is open to
  -- residents without an account, so it is nullable on purpose.
  app_user_id uuid references public.app_users(id) on delete set null,

  status text not null default 'initiated' check (
    status in ('initiated', 'awaiting_confirmation', 'confirmed', 'rejected', 'cancelled')
  ),
  reviewed_by uuid references public.app_users(id) on delete set null,
  reviewed_at timestamptz,
  review_note text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- The review queue reads exactly this: one event, ordered by age.
create index if not exists contribution_payments_review_idx
  on public.contribution_payments (event_id, status, created_at desc);

alter table public.contribution_payments enable row level security;

-- Deliberately no anon/authenticated policies, for the same reason as the
-- auction tables.
--
-- This app authenticates through Firebase, not Supabase Auth, so the browser
-- Supabase client never holds a session and auth.uid() never resolves for it -
-- policies written against auth.uid() would be unreachable dead code here.
-- All access instead goes through /api/events?resource=contribution-payments,
-- which uses the service role key (which bypasses RLS by design) and does the
-- role checks itself. Enabling RLS with zero policies is what actually locks
-- this table - which holds residents' names and phone numbers - to that one
-- verified path.
