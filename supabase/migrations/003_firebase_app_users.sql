create table if not exists public.app_users (
  id uuid primary key default gen_random_uuid(),
  firebase_uid text not null unique,
  email text not null unique,
  full_name text,
  photo_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from pg_type where typname = 'event_role') then
    create type public.event_role as enum ('admin', 'committee', 'read_only');
  end if;
end $$;

drop table if exists public.event_page_permissions cascade;
drop table if exists public.event_members cascade;

create table public.event_members (
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid not null references public.app_users(id) on delete cascade,
  role public.event_role not null default 'read_only',
  created_at timestamptz not null default now(),
  primary key (event_id, user_id)
);

create table public.event_page_permissions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid not null references public.app_users(id) on delete cascade,
  page_key text not null,
  access_level text not null default 'none' check (access_level in ('none', 'view', 'edit')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, user_id, page_key)
);
