-- How an event's committee has customised the credits on its closing page:
-- the heading, which groups show and in what order, each group's title and
-- description, which names are hidden, and names added to the sponsor and
-- contributor groups. See shared/credits-settings.ts for the shape, which the
-- API cleans on the way in and on the way out.
--
-- Requires 014_event_closing.sql and 020_closing_credits.sql.
--
-- One jsonb object rather than new tables, for the reason 020 gives: saving the
-- credits is one row write. NULL means "exactly what the page has always drawn".
-- RLS on event_closing is unchanged (on, no policies; the API uses the service
-- role).
begin;

alter table public.event_closing
  add column if not exists credits_settings jsonb;

comment on column public.event_closing.credits_settings is
  'Closing-page credit customisation (shared/credits-settings.ts). NULL = defaults.';

commit;
