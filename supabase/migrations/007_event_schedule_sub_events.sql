alter table public.event_schedule
add column if not exists sub_events text;

grant select on public.event_schedule to anon;
grant select, insert, update, delete on public.event_schedule to authenticated;

drop policy if exists "Public can view dashboard schedule" on public.event_schedule;
create policy "Public can view dashboard schedule"
on public.event_schedule
for select
to anon, authenticated
using (
  public.can_view_event_page(event_id, 'dashboard')
  or public.can_view_event_page(event_id, 'event-plan')
);

drop policy if exists "Members can edit event plan schedule" on public.event_schedule;
create policy "Members can edit event plan schedule"
on public.event_schedule
for all
to authenticated
using (public.can_edit_event_page(event_id, 'event-plan'))
with check (public.can_edit_event_page(event_id, 'event-plan'));
