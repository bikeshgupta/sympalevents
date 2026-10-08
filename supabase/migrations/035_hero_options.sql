-- Apply manually. Independent of 034 - either can be run without the other.
--
-- How an event's hero is dressed, as one jsonb object rather than a column
-- per setting, for the reason 020 and 026 give: it is read and written as a
-- unit, and a setting added later is a new key rather than another migration.
--
--   { "focusX": 0-100, "focusY": 0-100,   -- where the photo is anchored
--     "hideTitle": boolean,               -- the picture already says it
--     "subtitle": "text" }                -- one line under the event name
--
-- NULL means "exactly what the hero has always done", which is why this is
-- nullable with no default: an event that never touches the setting is
-- rendered by the same code path it was before this existed.
--
-- The API cleans every key (clamps the numbers, trims and caps the text)
-- before it is stored; jsonb will take anything.

alter table public.events
  add column if not exists hero_options jsonb;
