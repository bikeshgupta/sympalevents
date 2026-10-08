-- Apply manually AFTER 029 (which created event_announcements). Additive only:
-- every new column is nullable or has a default, and no existing row changes
-- meaning. Nothing in this app could write to event_announcements before this
-- release, so there is nothing to backfill.
--
-- What it adds
-- ------------
-- An announcement becomes a "post" an organiser writes and publishes, rather
-- than a line in a committed file:
--
--   status        'draft' | 'published'. Drafts are visible only to people who
--                 can edit the dashboard. Defaults to 'published' so a row
--                 inserted by anything that predates this column behaves as it
--                 always would have.
--   published_at  when it went live; set by the API, null while a draft.
--   pinned        shown first, before newer posts.
--   kind          what sort of post this is. Only 'message' exists today. It
--                 is deliberately NOT constrained here: polls, questions and
--                 auction posts are added by teaching the API and the client
--                 about a new kind, not by another migration widening a check
--                 constraint. The API validates it against an allowlist.
--
-- RLS stays on with zero policies, exactly as 029 left it: Firebase auth means
-- auth.uid() never resolves for the browser's Supabase client, so everything
-- goes through /api/events?resource=announcements with the service-role
-- client. Do not add anon/authenticated policies.

alter table public.event_announcements
  add column if not exists status text not null default 'published',
  add column if not exists published_at timestamptz,
  add column if not exists pinned boolean not null default false,
  add column if not exists kind text not null default 'message';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'event_announcements_status_check') then
    alter table public.event_announcements
      add constraint event_announcements_status_check
      check (status in ('draft', 'published'));
  end if;
end $$;

create index if not exists event_announcements_feed_idx
  on public.event_announcements (event_id, status, pinned desc, published_at desc);
