-- Apply manually. Independent of 037. One new table, additive.
--
-- A record of what an organiser prepared to send, so "who told the households
-- about payment, and when, and to whom" has an answer. This app does not send
-- messages: it writes them for WhatsApp, where residents already are, and the
-- organiser copies or shares the text. So a row is recorded when they copy it -
-- the intent, not a delivery receipt, which is the honest thing to call it.
--
--   template        the kind of message ('registration_reminder', ...)
--   audience        who it was for, as a segment key ('payment_pending', ...)
--   audience_count  how many households that was at the time. A count and not
--                   the list: no copy of anybody's household is kept here, and
--                   the message body never names recipients either.
--   body            the text as it was copied, after any edits.
--
-- RLS on, zero policies, like every table since 009: all access goes through
-- /api/events?resource=communications with the service-role client.

create table if not exists public.communication_campaigns (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  template text not null,
  audience text not null,
  audience_count integer not null default 0 check (audience_count >= 0),
  body text not null check (char_length(body) between 1 and 4000),
  channel text not null default 'copy' check (channel in ('copy', 'share')),
  created_by uuid references public.app_users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists communication_campaigns_event_idx
  on public.communication_campaigns (event_id, created_at desc);

alter table public.communication_campaigns enable row level security;
