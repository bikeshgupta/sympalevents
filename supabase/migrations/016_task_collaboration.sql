-- Tasks become collaborative: many assignees per task, and a comment thread
-- on each one.
--
-- `tasks.owner_name` (free text) stays exactly where it is and is still shown
-- as a fallback for rows created before this - it is not dropped and not
-- migrated automatically, because a typed name cannot be resolved to an
-- account reliably. New assignment goes through task_assignees.

create table if not exists public.task_assignees (
  task_id uuid not null references public.tasks(id) on delete cascade,
  user_id uuid not null references public.app_users(id) on delete cascade,
  assigned_by uuid references public.app_users(id) on delete set null,
  assigned_at timestamptz not null default now(),
  primary key (task_id, user_id)
);

-- "What is assigned to me" is the query this page opens with, so it gets the
-- index rather than relying on the primary key's leading column.
create index if not exists task_assignees_user_id_idx on public.task_assignees (user_id);

create table if not exists public.task_comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  user_id uuid not null references public.app_users(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists task_comments_task_id_created_at_idx
  on public.task_comments (task_id, created_at);

-- RLS on, zero policies - the same deliberate choice as the auction, upload
-- and page-visibility tables: this app authenticates through Firebase, so the
-- browser's Supabase client never holds a session and auth.uid() never
-- resolves for it. A policy written against it would be dead code. Every read
-- and write goes through /api/tasks with the service-role client, which checks
-- the caller's event role and page grant itself.
alter table public.task_assignees enable row level security;
alter table public.task_comments enable row level security;

-- The Tasks page is sign-in only by design: a task list names people and
-- carries their conversation, which is not something to hand out to anyone
-- with the link. /api/tasks requires a signed-in user on every branch, and
-- Settings -> Page Visibility does not offer "Anyone with the link" for this
-- page. Seeding 'authenticated' makes the stored value say the same thing:
-- any signed-in member opens Tasks and sees what is assigned to them. An
-- admin can still narrow it to "only members I give access to" afterwards.
--
-- Guarded because 015 creates this table - running 016 first should skip this
-- rather than fail, and 015's own seed will then set 'restricted' for tasks,
-- which an admin can widen in Settings.
do $$
begin
  if to_regclass('public.event_page_visibility') is not null then
    insert into public.event_page_visibility (event_id, page_key, visibility)
    select events.id, 'tasks', 'authenticated'
    from public.events
    on conflict (event_id, page_key) do update
      set visibility = 'authenticated',
          updated_at = now();
  end if;
end $$;
