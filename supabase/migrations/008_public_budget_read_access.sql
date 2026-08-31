create or replace function public.can_view_event_page(target_event_id uuid, target_page_key text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select
    target_page_key in ('dashboard', 'budget', 'expenses')
    or exists (
      select 1 from public.event_members
      where event_id = target_event_id
        and user_id = auth.uid()
        and role = 'admin'
    )
    or exists (
      select 1 from public.event_page_permissions
      where event_id = target_event_id
        and user_id = auth.uid()
        and page_key = target_page_key
        and access_level in ('view', 'edit')
    );
$$;

drop policy if exists "Public can view budget page data" on public.budgets;
create policy "Public can view budget page data"
on public.budgets
for select
to anon, authenticated
using (public.can_view_event_page(event_id, 'budget'));
