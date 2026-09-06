-- The closing page: the thank-you note a committee writes once the
-- celebration is over, the photographs they upload with captions, and the
-- ratings/reviews residents leave afterwards.
--
-- Nothing here is hardcoded to one event or one society - every event gets
-- its own (empty) closing record, gallery and review list, the same way
-- auctions are per-event.

-- One row per event. `is_closed` is what flips the dashboard over to
-- "celebration summary first, money second", and is deliberately separate
-- from the event's dates: an event can be over on the calendar while the
-- committee is still collecting photos and writing the note.
create table if not exists public.event_closing (
  event_id uuid primary key references public.events(id) on delete cascade,
  headline text not null default '',
  message text not null default '',
  is_closed boolean not null default false,
  closed_at timestamptz,
  updated_by uuid references public.app_users(id) on delete set null,
  updated_at timestamptz not null default now()
);

-- Photographs for the closing page. `album` groups them ("Puja mandap",
-- "Cultural evening", "Our team") and `caption` is the line printed over the
-- bottom of the photo. Both are free text entered by the uploader; there is
-- no fixed album list, because a different event will want different ones.
create table if not exists public.event_gallery_photos (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  image_url text not null,
  caption text not null default '',
  album text not null default '',
  sort_order integer not null default 0,
  created_by uuid references public.app_users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists event_gallery_photos_event_idx
  on public.event_gallery_photos (event_id, album, sort_order, created_at);

-- One review per person per event, editable by its author - the Google
-- review model the committee asked for. The unique constraint is what makes
-- "write or edit my review" a single upsert.
create table if not exists public.event_feedback (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid not null references public.app_users(id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  comment text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, user_id)
);

create index if not exists event_feedback_event_idx
  on public.event_feedback (event_id, updated_at desc);

alter table public.event_closing enable row level security;
alter table public.event_gallery_photos enable row level security;
alter table public.event_feedback enable row level security;

-- Same reasoning as the auction tables (009-011) and the uploads bucket
-- (012), repeated here so it is not lost: this app authenticates through
-- Firebase, not Supabase Auth, so the browser's Supabase client never holds
-- a session and auth.uid() never resolves for it. A policy written against
-- it would be dead code. RLS is therefore enabled with zero policies and
-- every read/write goes through /api/events?resource=closing|gallery|feedback,
-- which uses the service-role client and checks event_members.role (for
-- committee writes) or the Firebase identity (for a person's own review)
-- server-side. Do not add anon/authenticated policies to these three
-- expecting a direct browser supabase.from(...) call to work - it will not,
-- and that would remove the only enforcement these tables have.
