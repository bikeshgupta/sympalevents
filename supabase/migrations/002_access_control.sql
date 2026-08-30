create type page_access_level as enum ('none', 'view', 'edit');

create table if not exists public.event_page_permissions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  page_key text not null,
  access_level page_access_level not null default 'none',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, user_id, page_key)
);

alter table public.event_page_permissions enable row level security;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email))
  on conflict (id) do update
    set full_name = excluded.full_name,
        updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

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
      and role in ('owner', 'admin')
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
        and role in ('owner', 'admin')
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
        and role in ('owner', 'admin')
    )
    or exists (
      select 1 from public.event_page_permissions
      where event_id = target_event_id
        and user_id = auth.uid()
        and page_key = target_page_key
        and access_level = 'edit'
    );
$$;

create or replace function public.create_event_with_admin(
  event_name text,
  event_start_date date,
  event_end_date date,
  event_location text default null,
  event_description text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  org_id uuid;
  new_event_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  insert into public.profiles (id, full_name)
  values (auth.uid(), auth.jwt()->>'email')
  on conflict (id) do nothing;

  insert into public.organizations (name, created_by)
  values (event_name || ' Organization', auth.uid())
  returning id into org_id;

  insert into public.organization_members (organization_id, user_id, role)
  values (org_id, auth.uid(), 'owner');

  insert into public.events (
    organization_id,
    name,
    start_date,
    end_date,
    location,
    description,
    created_by
  )
  values (
    org_id,
    event_name,
    event_start_date,
    event_end_date,
    event_location,
    event_description,
    auth.uid()
  )
  returning id into new_event_id;

  insert into public.event_members (event_id, user_id, role)
  values (new_event_id, auth.uid(), 'owner');

  return new_event_id;
end;
$$;

create or replace function public.grant_event_page_access(
  target_event_id uuid,
  member_email text,
  member_role member_role,
  target_page_key text,
  target_access_level page_access_level
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_user_id uuid;
begin
  if not public.is_event_admin(target_event_id) then
    raise exception 'Only event admins can grant access';
  end if;

  select id into target_user_id
  from auth.users
  where lower(email) = lower(member_email)
  limit 1;

  if target_user_id is null then
    raise exception 'No Supabase user found for %. Ask the member to sign in once with Google first.', member_email;
  end if;

  insert into public.profiles (id, full_name)
  values (target_user_id, member_email)
  on conflict (id) do nothing;

  insert into public.event_members (event_id, user_id, role)
  values (target_event_id, target_user_id, member_role)
  on conflict (event_id, user_id) do update
    set role = excluded.role;

  insert into public.event_page_permissions (event_id, user_id, page_key, access_level)
  values (target_event_id, target_user_id, target_page_key, target_access_level)
  on conflict (event_id, user_id, page_key) do update
    set access_level = excluded.access_level,
        updated_at = now();
end;
$$;

create policy "Authenticated users can read own profile"
on public.profiles
for select
to authenticated
using (auth.uid() = id);

create policy "Authenticated users can update own profile"
on public.profiles
for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

create policy "Event admins can read page permissions"
on public.event_page_permissions
for select
to authenticated
using (public.is_event_admin(event_id) or user_id = auth.uid());

create policy "Event admins can insert page permissions"
on public.event_page_permissions
for insert
to authenticated
with check (public.is_event_admin(event_id));

create policy "Event admins can update page permissions"
on public.event_page_permissions
for update
to authenticated
using (public.is_event_admin(event_id))
with check (public.is_event_admin(event_id));

create policy "Event admins can delete page permissions"
on public.event_page_permissions
for delete
to authenticated
using (public.is_event_admin(event_id));

drop policy if exists "Event members can read events" on public.events;
create policy "Public dashboard can read events"
on public.events
for select
to anon, authenticated
using (true);

create policy "Authenticated users can create events through app"
on public.events
for insert
to authenticated
with check (created_by = auth.uid());

create policy "Event admins can manage event members"
on public.event_members
for all
to authenticated
using (public.is_event_admin(event_id) or user_id = auth.uid())
with check (public.is_event_admin(event_id));

create policy "Event admins can manage organizations"
on public.organizations
for all
to authenticated
using (created_by = auth.uid())
with check (created_by = auth.uid());

create policy "Event admins can manage organization members"
on public.organization_members
for all
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

grant usage on schema public to authenticated;
grant select, insert, update, delete on
  public.organizations,
  public.organization_members,
  public.events,
  public.event_members,
  public.event_page_permissions,
  public.residents,
  public.contributions,
  public.sponsors,
  public.budgets,
  public.expenses,
  public.vendors,
  public.procurements,
  public.tasks,
  public.volunteers,
  public.event_schedule,
  public.run_sheet,
  public.prasad_items,
  public.inventory,
  public.contacts,
  public.risks,
  public.attachments
to authenticated;

grant execute on function public.create_event_with_admin(text, date, date, text, text) to authenticated;
grant execute on function public.grant_event_page_access(uuid, text, member_role, text, page_access_level) to authenticated;

grant select on
  public.events,
  public.contributions,
  public.sponsors,
  public.budgets,
  public.expenses,
  public.tasks
to anon;

drop policy if exists "Public can view dashboard contributions" on public.contributions;
create policy "Public can view dashboard contributions"
on public.contributions
for select
to anon, authenticated
using (public.can_view_event_page(event_id, 'dashboard'));

drop policy if exists "Public can view dashboard sponsors" on public.sponsors;
create policy "Public can view dashboard sponsors"
on public.sponsors
for select
to anon, authenticated
using (public.can_view_event_page(event_id, 'dashboard'));

drop policy if exists "Public can view dashboard budgets" on public.budgets;
create policy "Public can view dashboard budgets"
on public.budgets
for select
to anon, authenticated
using (public.can_view_event_page(event_id, 'dashboard'));

drop policy if exists "Public can view dashboard expenses" on public.expenses;
create policy "Public can view dashboard expenses"
on public.expenses
for select
to anon, authenticated
using (public.can_view_event_page(event_id, 'dashboard') or public.can_view_event_page(event_id, 'expenses'));

drop policy if exists "Public can view dashboard tasks" on public.tasks;
create policy "Public can view dashboard tasks"
on public.tasks
for select
to anon, authenticated
using (public.can_view_event_page(event_id, 'dashboard'));

drop policy if exists "Members can view contributions page data" on public.contributions;
create policy "Members can view contributions page data"
on public.contributions
for select
to authenticated
using (public.can_view_event_page(event_id, 'contributions'));

drop policy if exists "Members can edit contributions page data" on public.contributions;
create policy "Members can edit contributions page data"
on public.contributions
for all
to authenticated
using (public.can_edit_event_page(event_id, 'contributions'))
with check (public.can_edit_event_page(event_id, 'contributions'));

drop policy if exists "Members can view contribution residents" on public.residents;
create policy "Members can view contribution residents"
on public.residents
for select
to authenticated
using (public.can_view_event_page(event_id, 'contributions'));

drop policy if exists "Members can edit contribution residents" on public.residents;
create policy "Members can edit contribution residents"
on public.residents
for all
to authenticated
using (public.can_edit_event_page(event_id, 'contributions'))
with check (public.can_edit_event_page(event_id, 'contributions'));

drop policy if exists "Members can view sponsors page data" on public.sponsors;
create policy "Members can view sponsors page data"
on public.sponsors
for select
to authenticated
using (public.can_view_event_page(event_id, 'sponsors'));

drop policy if exists "Members can edit sponsors page data" on public.sponsors;
create policy "Members can edit sponsors page data"
on public.sponsors
for all
to authenticated
using (public.can_edit_event_page(event_id, 'sponsors'))
with check (public.can_edit_event_page(event_id, 'sponsors'));

drop policy if exists "Members can view budget page data" on public.budgets;
create policy "Members can view budget page data"
on public.budgets
for select
to authenticated
using (public.can_view_event_page(event_id, 'budget'));

drop policy if exists "Members can edit budget page data" on public.budgets;
create policy "Members can edit budget page data"
on public.budgets
for all
to authenticated
using (public.can_edit_event_page(event_id, 'budget'))
with check (public.can_edit_event_page(event_id, 'budget'));

drop policy if exists "Members can view task page data" on public.tasks;
create policy "Members can view task page data"
on public.tasks
for select
to authenticated
using (public.can_view_event_page(event_id, 'tasks'));

drop policy if exists "Members can edit task page data" on public.tasks;
create policy "Members can edit task page data"
on public.tasks
for all
to authenticated
using (public.can_edit_event_page(event_id, 'tasks'))
with check (public.can_edit_event_page(event_id, 'tasks'));
