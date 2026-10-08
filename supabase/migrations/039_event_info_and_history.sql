-- Apply manually. Independent of the others. Two nullable columns on events;
-- no existing row changes meaning.
--
--   good_to_know   What an organiser tells residents that is not on the schedule:
--                  where to park, what to bring, who to ask. One jsonb object -
--                  { directionsUrl?: https URL, items: [{ title, text }] } - read
--                  and written as a unit, like hero_options (035) and for the same
--                  reason. NULL means "nothing written", and the event page then
--                  shows only the venue and dates it already has. The API cleans
--                  every key before it is stored; jsonb takes anything.
--
--   copied_from    The event this one was copied from (Settings -> Run this event
--                  again). It is what lets next year's page say "Remember last
--                  year?" with last year's photographs. ON DELETE SET NULL: deleting
--                  the old event must not delete the new one.

alter table public.events
  add column if not exists good_to_know jsonb,
  add column if not exists copied_from uuid references public.events(id) on delete set null;

create index if not exists events_copied_from_idx on public.events (copied_from);
