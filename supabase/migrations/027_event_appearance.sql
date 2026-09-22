-- What an event looks like, and the link that opens it.
--
-- Until now every event wore the same teal and the same bundled photograph:
-- `heroImageUrl` was hardcoded `null` in src/lib/event-data.ts, so the hero
-- always fell through to the image compiled into the bundle. A society
-- running three events a year had no way to tell them apart at a glance.

alter table public.events
  -- The hero photograph, uploaded to the `uploads` bucket under `events/`.
  -- Null keeps the bundled image, which stays the fallback rather than the
  -- only option.
  add column if not exists hero_image_url text,

  -- The name of a colour preset, not a hex value - see src/lib/themes.ts.
  --
  -- A free colour picker is the obvious design and the wrong one: the UI
  -- rules set a 4.5:1 floor for body text, and nothing stops a committee
  -- picking a pale yellow that fails it on white. Named presets are chosen
  -- once, checked once, and cannot be got wrong afterwards.
  add column if not exists theme text,

  -- The permanent link to this event. Minted server-side, rotatable, and
  -- unique so /s/<token> resolves to exactly one event.
  add column if not exists share_token text;

create unique index if not exists events_share_token_key
  on public.events (share_token)
  where share_token is not null;
