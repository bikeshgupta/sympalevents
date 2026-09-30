-- A dashboard an admin arranges, and a nav they can put in their own order.
--
-- Until now the dashboard was a fixed sequence of sections in JSX and the
-- sidebar was a fixed array in `nav-items.ts`. Both are the committee's call
-- now: which widgets are on the dashboard, in what order, and whether each
-- shows its short or its full form.

alter table public.events
  -- An array of { key, variant, isVisible }, in the order they appear.
  --
  -- jsonb rather than a table with a `sort_order`, for the reason 020 gives
  -- for the closing credits: reordering is then the array's own order, rather
  -- than a column full of numbers to renumber every time something moves.
  -- One row write, and no half-applied reorder.
  --
  -- NULL is meaningful and is the default: it means "the layout this kind of
  -- event starts with", computed in src/lib/widgets.ts. Every event that
  -- exists today keeps rendering exactly as it does until somebody arranges
  -- it, and "Reset to default" is a write of NULL rather than a copy of the
  -- defaults frozen at the moment they pressed it.
  add column if not exists dashboard_layout jsonb;

alter table public.event_page_visibility
  -- Where this module sits in the nav. NULL sorts after everything numbered,
  -- in the registry's own order, so a module added by a later deploy appears
  -- at the end rather than vanishing or jumping to the top.
  add column if not exists sort_order integer;
