-- Credits the app cannot work out for itself, kept on the event's own
-- closing row so an admin can edit them from the page instead of a
-- developer editing a file and deploying.
--
-- The closing page derives most of its honour roll from real rows: the core
-- committee from event_members, volunteers from whoever owns a task or a slot
-- on the schedule, contributors and sponsors from their own tables, prasad
-- sponsors from prasad_items. But plenty of people did the work without ever
-- being typed into any of those - and the committee list in particular wants
-- a deliberate order, not "admins first, then alphabetical".
--
-- Requires 014_event_closing.sql, which creates public.event_closing. Run
-- that first if it has not been applied yet.
--
-- All four are jsonb arrays rather than a child table for the same reason
-- 019 made the prasad people lists jsonb: saving the credits is one row
-- write, so there is never a moment where the old names are gone and the new
-- ones not yet in, and reordering is the array's own order rather than a
-- sort_order column to renumber.
alter table public.event_closing
  -- Names added by hand to the core committee, on top of event_members.
  add column if not exists extra_core jsonb not null default '[]'::jsonb,
  -- Names added by hand to the volunteers.
  add column if not exists extra_volunteers jsonb not null default '[]'::jsonb,
  -- The committee's display order: an array of names, in the order they
  -- should be listed. A name not in it sorts after the ones that are, so a
  -- member who joins later simply appears at the end instead of vanishing,
  -- and a member who leaves leaves a stale entry that is ignored.
  add column if not exists core_order jsonb not null default '[]'::jsonb,
  -- The shout-outs printed under the committee list: an array of
  -- { name, role, note }, for somebody who ran a whole strand of the
  -- celebration and would otherwise be one name among two hundred.
  add column if not exists shoutouts jsonb not null default '[]'::jsonb;

-- RLS on event_closing is already enabled with zero policies by 014, and
-- these columns inherit that. Every read and write goes through
-- /api/events?resource=closing with the service-role client, which checks
-- event_members.role before accepting a write. Reading the page is public;
-- writing these lists needs admin or committee, the same as the note itself.
