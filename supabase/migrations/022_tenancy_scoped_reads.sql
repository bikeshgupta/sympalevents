-- Scope anonymous reads to the event actually being looked at.
--
-- THE BUG THIS FIXES
--
-- 008 defined can_view_event_page() with this as its first branch:
--
--     target_page_key in ('dashboard', 'budget', 'expenses')
--
-- which never looks at target_event_id. Every policy written against that
-- function therefore returned true for EVERY event in the database, and 002
-- had already granted select on contributions, sponsors, budgets, expenses
-- and tasks to `anon`. The browser's useEventData() read those tables
-- directly, so the net effect was: any visitor, with nothing but the public
-- anon key, could read the money of every event stored here.
--
-- With one society that is invisible. The moment a second society signs up it
-- is a cross-tenant leak, so it has to be closed before self-serve signup.
--
-- The first branch is now the admin's own per-event setting, from
-- event_page_visibility (015). A page the admin has set to "Anyone with the
-- link" stays anonymously readable, for that event only. Everything else
-- needs a membership or an explicit grant, exactly as Settings claims.
--
-- WHAT THIS DOES NOT DO
--
-- It does not revoke any grant. The three feature pages that still write
-- directly from the browser (contributions, sponsors, budget) are untouched,
-- deliberately: this migration is about who can read what, and a grant change
-- underneath a live write path is a separate decision with its own blast
-- radius. Reads no longer depend on these grants at all - every screen read
-- now goes through /api/events?resource=data with the service-role client,
-- which resolves the same visibility server-side (api/_lib/event-data.ts).

create or replace function public.can_view_event_page(target_event_id uuid, target_page_key text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select
    -- The admin's setting for THIS event's page.
    exists (
      select 1 from public.event_page_visibility
      where event_id = target_event_id
        and page_key = target_page_key
        and visibility = 'public'
    )
    -- No row stored for it yet: either the event predates 015 or it was made
    -- by a code path that does not seed. Fall back to the pages that used to
    -- be hardcoded public, which is what api/_lib/page-visibility.ts does in
    -- the same situation (defaultVisibility there). Keeping the two in step
    -- matters: they are the same question asked in two places.
    or (
      not exists (
        select 1 from public.event_page_visibility
        where event_id = target_event_id
          and page_key = target_page_key
      )
      and target_page_key in ('dashboard', 'budget', 'auctions', 'closing')
    )
    -- An admin of this event.
    or exists (
      select 1 from public.event_members
      where event_id = target_event_id
        and user_id = auth.uid()
        and role = 'admin'
    )
    -- Somebody granted this page explicitly in Settings -> Member Access.
    or exists (
      select 1 from public.event_page_permissions
      where event_id = target_event_id
        and user_id = auth.uid()
        and page_key = target_page_key
        and access_level in ('view', 'edit')
    );
$$;

-- The events table itself was readable by anyone, unconditionally:
--
--     create policy "Public dashboard can read events" ... to anon using (true)
--
-- That is what let the event switcher enumerate every society's events and
-- auto-select the earliest one in the database. An event is now visible
-- anonymously only when its own dashboard is, which is precisely the case
-- where somebody is meant to be able to open it from a link.
drop policy if exists "Public dashboard can read events" on public.events;
create policy "Public dashboard can read events"
on public.events
for select
to anon, authenticated
using (public.can_view_event_page(id, 'dashboard'));
