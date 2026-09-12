-- Publish/unpublish control, separate from cancel. Cancelling ends an
-- auction for good; unpublishing just pulls it off the dashboard and the
-- bell while leaving it fully intact (still manageable, still bookmarkable
-- via the Auctions page) - for "we're not ready to announce this yet" or
-- "pull this off the homepage for now" without losing anything.
--
-- 009_auctions.sql has already been applied to the live project (unlike
-- most migrations in this repo, which were written and reviewed before ever
-- being run) - hence a fresh ALTER here instead of editing that file in place.
alter table public.auctions
  add column if not exists is_published boolean not null default true;

-- New auctions are published by default: the ask that produced this column
-- was "I created an auction and it isn't showing up," so the default favors
-- visible-unless-hidden, not the other way around.
create index if not exists auctions_published_idx
  on public.auctions (event_id, is_published, status, opens_at);
