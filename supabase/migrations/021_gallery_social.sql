-- The gallery stops being a committee noticeboard and becomes the society's
-- own album: any signed-in resident adds photographs, and anybody who can see
-- a photograph can react to it and say something about it.
--
-- Requires 014_event_closing.sql, which creates public.event_gallery_photos.
-- Run that first if it has not been applied yet.
--
-- Who may upload is enforced in api/_lib/closing.ts, not here, along with the
-- ten-photographs-per-person cap. The cap is a per-person limit rather than a
-- per-event one on purpose: it stops one phone's camera roll from becoming
-- the whole gallery without telling anybody else they are too late.

-- One reaction per person per photograph - picking a second replaces the
-- first, which is what the primary key expresses. `emoji` is checked in the
-- API against a fixed set rather than by a constraint here, so adding one
-- later is a deploy and not a migration.
create table if not exists public.event_gallery_reactions (
  photo_id uuid not null references public.event_gallery_photos(id) on delete cascade,
  user_id uuid not null references public.app_users(id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now(),
  primary key (photo_id, user_id)
);

create index if not exists event_gallery_reactions_photo_idx
  on public.event_gallery_reactions (photo_id);

-- Append-only in practice, like task_comments: there is no edit UI, and the
-- thread is the record. Deleting a photograph takes its thread with it, which
-- is the one case where losing the words is right - they were about a picture
-- that is gone.
create table if not exists public.event_gallery_comments (
  id uuid primary key default gen_random_uuid(),
  photo_id uuid not null references public.event_gallery_photos(id) on delete cascade,
  user_id uuid not null references public.app_users(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists event_gallery_comments_photo_idx
  on public.event_gallery_comments (photo_id, created_at);

alter table public.event_gallery_reactions enable row level security;
alter table public.event_gallery_comments enable row level security;

-- Same reasoning as every other table in this app, repeated so it is not
-- lost: this app authenticates through Firebase, not Supabase Auth, so the
-- browser's Supabase client never holds a session and auth.uid() never
-- resolves for it. A policy written against it would be dead code. RLS is
-- therefore enabled with zero policies and every read and write goes through
-- /api/events?resource=gallery, which uses the service-role client and checks
-- the Firebase identity server-side. Do not add anon/authenticated policies to
-- either of these expecting a direct browser supabase.from(...) call to work.
