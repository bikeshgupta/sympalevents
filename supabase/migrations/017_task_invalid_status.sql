-- "Invalid" joins the task statuses.
--
-- Deleting a task is now admin-only and deliberately rare: a task that turned
-- out to be wrong, a duplicate, or no longer needed gets *marked* rather than
-- removed, so the board keeps its history and nobody wonders where an item
-- went. "Cancelled" already meant "we decided not to do this"; "Invalid" means
-- "this should not have been raised."
--
-- Same drop-and-recreate shape as 005_contribution_statuses.sql - the
-- constraint carries Postgres's default name for an inline column check.
alter table public.tasks
drop constraint if exists tasks_status_check;

alter table public.tasks
add constraint tasks_status_check
check (status in ('Not Started', 'In Progress', 'Blocked', 'Completed', 'Cancelled', 'Invalid'));
