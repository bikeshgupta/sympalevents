-- Apply manually AFTER 034 (which gave event_announcements its `kind`).
-- Additive only: one new column with a default, three new tables.
--
-- What it adds
-- ------------
-- Two more kinds of announcement post - a poll and an ask-me-anything - on the
-- `kind` column 034 left open for exactly this (it is deliberately not a check
-- constraint, so no migration has to widen one).
--
--   event_announcements.payload   what is particular to a kind, as jsonb:
--     poll: { options: [{ id, label }], showResults: 'always' | 'after_vote' |
--             'after_close', closesAt: iso | null }
--     ask:  { closesAt: iso | null }
--   Cleaned by the API before it is stored; jsonb takes anything.
--
--   announcement_poll_votes       one row per person per poll. The primary key
--                                 IS the rule: a second vote replaces the first
--                                 (a person may change their mind until it
--                                 closes) and can never add a second.
--   announcement_questions        what a resident asks. `status` starts at
--                                 'pending' and is invisible to everybody but
--                                 the asker and the organisers until one of
--                                 them approves or answers it - this is a
--                                 public page, and an open box is an invitation.
--                                 `user_id` is always kept so an abusive
--                                 question can be traced; `anonymous` only
--                                 decides whether the name is shown.
--   announcement_question_votes   an upvote, one per person per question.
--
-- Who voted for what is never read back out by any route - results are counts.
--
-- RLS on, zero policies, as every table since 009: Firebase auth means
-- auth.uid() never resolves for the browser's client, so everything goes
-- through /api/events?resource=announcements with the service-role client.

alter table public.event_announcements
  add column if not exists payload jsonb not null default '{}'::jsonb;

create table if not exists public.announcement_poll_votes (
  announcement_id uuid not null references public.event_announcements(id) on delete cascade,
  user_id uuid not null references public.app_users(id) on delete cascade,
  option_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (announcement_id, user_id)
);

create table if not exists public.announcement_questions (
  id uuid primary key default gen_random_uuid(),
  announcement_id uuid not null references public.event_announcements(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid references public.app_users(id) on delete set null,
  body text not null check (char_length(body) between 3 and 500),
  anonymous boolean not null default true,
  status text not null default 'pending' check (status in ('pending', 'approved', 'answered', 'hidden')),
  answer text,
  answered_by uuid references public.app_users(id) on delete set null,
  answered_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists announcement_questions_post_idx
  on public.announcement_questions (announcement_id, status, created_at desc);
create index if not exists announcement_questions_event_idx
  on public.announcement_questions (event_id, status);

create table if not exists public.announcement_question_votes (
  question_id uuid not null references public.announcement_questions(id) on delete cascade,
  user_id uuid not null references public.app_users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (question_id, user_id)
);

alter table public.announcement_poll_votes enable row level security;
alter table public.announcement_questions enable row level security;
alter table public.announcement_question_votes enable row level security;
