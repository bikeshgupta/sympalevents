-- Prasad slots: who arranges the prasad, and who hands it out.
--
-- `prasad_items` (001) already is "a prasad slot on a date" - prasad_date,
-- slot, item - but it holds one sponsor and one arranger as plain text. A
-- real slot has several families bringing the prasad and several volunteers
-- distributing it, so each gets a list:
--
--   arrangers     the prasad sponsors - who arranges / brings the prasad
--   distributors  who hands it out at the counter
--
-- Each is a JSON array of { "name": text, "flat": text }. They live on the
-- slot row rather than in a child table so saving a slot is one write: there
-- is no moment where the old people are deleted and the new ones not yet in.
-- The API (api/_lib/prasad.ts) validates the shape before anything is stored.
--
-- Nothing existing is renamed or dropped. sponsor_contributor / arranged_by /
-- qty / unit / status stay; the page reads the old two as arrangers until a
-- slot is saved again.
alter table public.prasad_items
  add column if not exists arrangers jsonb not null default '[]'::jsonb,
  add column if not exists distributors jsonb not null default '[]'::jsonb;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'prasad_items_arrangers_is_array') then
    alter table public.prasad_items
      add constraint prasad_items_arrangers_is_array check (jsonb_typeof(arrangers) = 'array');
  end if;

  if not exists (select 1 from pg_constraint where conname = 'prasad_items_distributors_is_array') then
    alter table public.prasad_items
      add constraint prasad_items_distributors_is_array check (jsonb_typeof(distributors) = 'array');
  end if;
end $$;

create index if not exists prasad_items_event_date_idx on public.prasad_items (event_id, prasad_date);

-- No new policies. prasad_items has RLS on, and its only policy (001) keys on
-- Supabase Auth, which this app never uses in the browser (Firebase instead),
-- and it was never granted to anon - so the browser cannot read it at all.
-- Every read and write goes through /api/event-schedule?resource=prasad with
-- the service-role client, which is also what lets the API leave flat numbers
-- out for signed-out visitors. Keep it that way: do not grant anon select.
