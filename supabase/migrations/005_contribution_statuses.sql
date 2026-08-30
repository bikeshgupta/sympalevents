alter table public.contributions
drop constraint if exists contributions_status_check;

alter table public.contributions
add constraint contributions_status_check
check (status in ('Received', 'Committed', 'Returned'));
