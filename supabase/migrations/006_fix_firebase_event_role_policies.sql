create or replace function public.is_event_admin(target_event_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.event_members
    where event_id = target_event_id
      and user_id = auth.uid()
      and role = 'admin'
  );
$$;

create or replace function public.can_manage_event(target_event_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.event_members
    where event_id = target_event_id
      and user_id = auth.uid()
      and role in ('admin', 'committee')
  );
$$;

create or replace function public.can_view_event_page(target_event_id uuid, target_page_key text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select
    target_page_key in ('dashboard', 'expenses')
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

create or replace function public.can_edit_event_page(target_event_id uuid, target_page_key text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select
    exists (
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
        and access_level = 'edit'
    );
$$;
