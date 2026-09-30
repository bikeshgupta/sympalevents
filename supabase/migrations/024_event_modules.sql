-- Pages become modules: per event, on or off, and named by the committee.
--
-- The registry already existed in disguise. `event_page_visibility` (015)
-- holds one row per event per page, and the sidebar, the mobile drawer, the
-- route guard and Member Access all filter on one server-resolved list of
-- those page keys. Everything needed to turn a feature off for an event was
-- there except the column that says so.
--
-- `is_enabled` is a different question from `visibility`, and both are needed:
--   visibility - who may look at this page
--   is_enabled - whether this event has this page at all
-- A sports meet has no Prasad. That is not "Prasad, restricted"; it is a
-- module the committee never turned on, and it should not appear in Settings,
-- in Member Access, or in the nav.

alter table public.event_page_visibility
  add column if not exists is_enabled boolean not null default true,
  -- What this event calls the module. "Collections" on a sports meet is
  -- "Entry fees"; "Prasad" on a cultural night is "Refreshments". Null means
  -- the app's own name for it.
  add column if not exists label_override text;

alter table public.events
  -- Which template shaped this event, and what kind of thing it is. Both are
  -- provenance and defaults, never runtime authority: what an event actually
  -- has is its module rows above, which the committee edits freely afterwards.
  add column if not exists event_type text not null default 'festival',
  add column if not exists template_key text,
  -- Phase 3 uses this: the word this event uses for the unit a person belongs
  -- to. "Flat" in a housing society, "House" in a school, "Team" in a league.
  add column if not exists unit_label text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'events_event_type_check'
  ) then
    alter table public.events
      add constraint events_event_type_check
      check (event_type in ('festival', 'sports', 'cultural', 'mixed', 'custom'));
  end if;
end $$;

-- Every event that exists today is the festival this app was built for, and
-- every module it has is on. The default above already says so; this is only
-- here to make that explicit for rows written before the column existed.
update public.event_page_visibility set is_enabled = true where is_enabled is null;
