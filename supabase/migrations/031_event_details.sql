-- Event details that could not be set before: a time of day, and whether the
-- amounts raised are shown or only how many people took part.
--
-- Three columns on `events`, all additive, all safe to run twice, and nothing
-- that exists today changes meaning:
--
--   start_time, end_time  -- the time of day the event opens and closes
--   finance_visibility    -- 'full' (today's behaviour) or 'count_only'
--
-- ---------------------------------------------------------------------------
-- 1. Time of day
-- ---------------------------------------------------------------------------
--
-- `events.start_date` and `end_date` are `date` columns, so an event could say
-- WHICH day it starts but never WHEN. They are left exactly as they are - a
-- dozen places read them - and the time is a separate, optional column beside
-- each.
--
-- `time` (without a zone) matches `event_schedule.start_time` / `end_time`: it
-- is a wall-clock time in the event's own zone (Asia/Kolkata), which is how
-- the app has always read the schedule. A zone-less time on a zone-less date
-- is also what makes "6 pm on the 14th" mean 6 pm on the 14th wherever the
-- server happens to run.
--
-- NULL means "the whole day", which is what every existing event is: it is
-- upcoming until its first day begins and live until its last day ends. So no
-- event that exists now changes status or countdown because this ran.

alter table public.events
  add column if not exists start_time time,
  add column if not exists end_time time;

-- ---------------------------------------------------------------------------
-- 2. Collections visibility
-- ---------------------------------------------------------------------------
--
-- A private event, or one run on an entry fee, may want to say HOW MANY
-- residents took part without saying what each paid or who gave. This is the
-- admin's switch for that:
--
--   'full'        -- today's behaviour: amounts, names and progress are shown
--                    wherever the page's own visibility allows
--   'count_only'  -- the server withholds contribution and sponsorship amounts
--                    and who gave, from everyone except the event's admins and
--                    members explicitly granted the Contributions or Sponsors
--                    page. Counts are always shown.
--
-- It is enforced in the API, not in the browser: hiding a widget would leave
-- every figure in the response for anyone who opens the network tab.
--
-- Default 'full' and NOT NULL, so every existing event is unchanged and a row
-- can never be in an undefined state. Budget and expenses are not collections
-- and keep following their own page visibility.

alter table public.events
  add column if not exists finance_visibility text not null default 'full';

-- Guarded so a second run does not fail on a constraint that already exists.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'events_finance_visibility_check'
      and conrelid = 'public.events'::regclass
  ) then
    alter table public.events
      add constraint events_finance_visibility_check
      check (finance_visibility in ('full', 'count_only'));
  end if;
end $$;

-- RLS: unchanged. These columns hold nothing secret, and the API - not a row
-- policy - decides who is told what.
