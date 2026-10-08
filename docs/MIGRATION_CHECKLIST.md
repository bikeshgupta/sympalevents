# Migration execution checklist — 014 to 038

**Which of these are applied is the owner's to know, not this file's.** 029 is
known to be in (the society and event slugs exist). Run the one-query status
check below to see the rest. Every feature a missing migration backs is shipped
code running on its fallback path.

**Run them in numeric order.** Order is not cosmetic here — see "Ordering traps"
below. Apply one at a time, run its verification query, and confirm the expected
result before moving to the next.

Nothing in this file should be run against production until the two **STOP**
items below have been decided.

---

## STOP 1 — 023 rewrites existing society names

023 contains an `UPDATE` against live rows:

```sql
update public.organizations
set name = regexp_replace(name, '\s+Organization$', '')
where name ~ '\s+Organization$';
```

Any society whose name ends in " Organization" is renamed in place. The intent
was to turn an auto-generated "Ganesh Chaturthi 2026 Organization" into
something an admin would want to see, but it is still a write to production
data, and it cannot be undone from the migration.

**Check what it would touch before running 023:**

```sql
select id, name, regexp_replace(name, '\s+Organization$', '') as would_become
from public.organizations
where name ~ '\s+Organization$';
```

- Returns no rows → nothing is renamed, run 023 as it stands.
- Returns rows you are happy to rename → run as is.
- Returns rows you want to keep → delete that `update` statement from 023
  before running it, and rename the society yourself in Settings afterwards.
  Removing it has no effect on anything else in the migration.

## STOP 2 — 016 is not safely re-runnable

016 ends with an upsert that forces the `tasks` page's visibility:

```sql
on conflict (event_id, page_key) do update set visibility = 'authenticated'
```

Running 016 a second time — after an admin has narrowed Tasks to "only members
I give access to" — silently puts it back to "any signed-in user". Run it once.
If you ever need to re-run it, delete that `do $$ ... $$` block first.

---

## Ordering traps

| Rule | Why |
|---|---|
| **015 before 016** | 016 seeds `tasks` as `authenticated`, 015 seeds it as `restricted`. Whichever runs last wins. Numeric order gives the intended result: 015 seeds everything, then 016 widens Tasks. Reversed, Tasks ends up restricted and an admin has to widen it by hand. |
| **015 before 022** | 022's `can_view_event_page()` reads `event_page_visibility`. The function tolerates a missing table (it falls back to the old hardcoded public set), but running 015 first is what makes 022 mean what it says. |
| **014 before 020 and 021** | 020 adds columns to `event_closing`; 021 references `event_gallery_photos`. Both are created by 014. |
| **015 before 024** | 024 adds `is_enabled` / `label_override` to `event_page_visibility`. |
| **023 before 024 is not required** | They touch different tables. Numeric order is still simplest. |

---

## The checklist

Legend: **A** additive · **D** destructive or data-modifying

| # | Purpose | Objects | A/D | Depends on |
|---|---|---|---|---|
| 014 | Closing page | +`event_closing`, `event_gallery_photos`, `event_feedback` | A | — |
| 015 | Per-page visibility | +`event_page_visibility`, seeds a row per event/page | A | — |
| 016 | Task assignees + comments | +`task_assignees`, `task_comments`; **upserts** Tasks visibility | A (see STOP 2) | 015 |
| 017 | `Invalid` task status | drops + recreates `tasks_status_check`, **widened** | A | — |
| 018 | Expense claims | +5 columns on `expenses`, 3 constraints, private `expense-bills` bucket | A | — |
| 019 | Prasad slots | +`arrangers`/`distributors` jsonb on `prasad_items`, 2 constraints | A | — |
| 020 | Editable credits | +4 jsonb columns on `event_closing` | A | **014** |
| 021 | Gallery reactions/comments | +`event_gallery_reactions`, `event_gallery_comments` | A | **014** |
| 022 | **Security fix** | replaces `can_view_event_page()`, replaces the `events` anon policy | A | **015** |
| 023 | Societies | +4 cols on `organizations`; **drops and recreates** `organization_members`; **renames** societies; backfills members | **D** | — |
| 024 | Modules + event types | +2 cols on `event_page_visibility`, +3 on `events`, 1 constraint, backfill | A | 015 |
| 025 | Sports | +`event_teams`, `event_fixtures` | A | — |
| 026 | Dashboard layout + nav order | +`events.dashboard_layout`, +`event_page_visibility.sort_order` | A | 015 |
| 027 | Appearance + share link | +`hero_image_url`, `theme`, `share_token` on `events` | A | — |
| 028 | Traffic | +`event_visits` | A | — |
| 029 | Society Home | +`slug` on `organizations` and `events`, +`events.status_override`, +`event_announcements` | A | 023 |
| 030 | Audit + page views | +`audit_log`, +`event_page_views` | A | — |
| 031 | Event details | +`events.start_time`, `end_time`, `finance_visibility` (+1 check) | A, safe to run twice | — |
| 032 | Registration | +registration settings, bookings, payment/check-in history and guarded RPCs | A | 023, 029, 030, 031 |
| 033 | Draft creation | atomic society/event/module creation; new events start private | A | 032 |

### Why 023 is the only D

It `drop table if exists public.organization_members` and recreates it against
`app_users`. **This is safe**: the 001 version keys on `public.profiles`, a table
nothing in this app has ever written to, so the table is empty. 003 did the
identical move for `event_members`. Confirm it is empty first anyway:

```sql
select count(*) from public.organization_members;   -- expect 0
```

If that returns anything other than 0, stop and tell me before running 023.

### 022 is the one with a security deadline

Until it runs, `can_view_event_page()` carries 008's bug — its first branch
never looks at `target_event_id`, so the public anon key can read every event's
contributions, sponsors, budgets, expenses and tasks. The application no longer
uses that path (all screen reads go through the service-role API), but anyone
holding the key still can. Run it early.

---

## Verification queries

Run after each migration. Each returns the evidence that it actually took —
a migration that "ran without an obvious error" is not the same as one that
applied.

```sql
-- 014
select count(*) = 3 as ok from information_schema.tables
where table_schema = 'public'
  and table_name in ('event_closing','event_gallery_photos','event_feedback');

-- 015  (second number is rows seeded; expect events × 13-ish)
select to_regclass('public.event_page_visibility') is not null as table_ok,
       (select count(*) from public.event_page_visibility) as seeded_rows;

-- 016
select count(*) = 2 as ok from information_schema.tables
where table_schema = 'public' and table_name in ('task_assignees','task_comments');

-- 017  (expect 'Invalid' present in the constraint body)
select pg_get_constraintdef(oid) like '%Invalid%' as ok
from pg_constraint where conname = 'tasks_status_check';

-- 018
select count(*) = 5 as cols_ok from information_schema.columns
where table_schema='public' and table_name='expenses'
  and column_name in ('submitted_by','reimbursement_status','settled_at','settled_by','bill_path');
select exists(select 1 from storage.buckets where id='expense-bills') as bucket_ok;

-- 019
select count(*) = 2 as ok from information_schema.columns
where table_schema='public' and table_name='prasad_items'
  and column_name in ('arrangers','distributors');

-- 020
select count(*) = 4 as ok from information_schema.columns
where table_schema='public' and table_name='event_closing'
  and column_name in ('extra_core','extra_volunteers','core_order','shoutouts');

-- 021
select count(*) = 2 as ok from information_schema.tables
where table_schema='public'
  and table_name in ('event_gallery_reactions','event_gallery_comments');

-- 022  THE IMPORTANT ONE: the new body must mention event_page_visibility.
--      If this is false the old, leaky function is still in place.
select prosrc like '%event_page_visibility%' as fixed
from pg_proc where proname = 'can_view_event_page';

-- 022b  the policy must call the function, not be `using (true)`
select qual::text like '%can_view_event_page%' as policy_ok
from pg_policies where tablename='events' and policyname='Public dashboard can read events';

-- 023
select count(*) = 4 as cols_ok from information_schema.columns
where table_schema='public' and table_name='organizations'
  and column_name in ('city','logo_url','invite_code','created_by_user');
-- members backfilled from event roles: expect >= the number of event_members rows
select (select count(*) from public.organization_members) as society_members,
       (select count(*) from public.event_members)        as event_members;

-- 024
select count(*) = 3 as event_cols from information_schema.columns
where table_schema='public' and table_name='events'
  and column_name in ('event_type','template_key','unit_label');
select count(*) = 2 as module_cols from information_schema.columns
where table_schema='public' and table_name='event_page_visibility'
  and column_name in ('is_enabled','label_override');

-- 025
select count(*) = 2 as ok from information_schema.tables
where table_schema='public' and table_name in ('event_teams','event_fixtures');

-- 026
select (select count(*) from information_schema.columns
        where table_schema='public' and table_name='events'
          and column_name='dashboard_layout') = 1 as layout_ok,
       (select count(*) from information_schema.columns
        where table_schema='public' and table_name='event_page_visibility'
          and column_name='sort_order') = 1 as sort_ok;

-- 027
select count(*) = 3 as ok from information_schema.columns
where table_schema='public' and table_name='events'
  and column_name in ('hero_image_url','theme','share_token');

-- 028
select to_regclass('public.event_visits') is not null as ok;

-- 029
select (select count(*) from information_schema.columns
        where table_schema='public' and table_name='events'
          and column_name in ('slug','status_override')) = 2 as events_ok,
       (select count(*) from information_schema.columns
        where table_schema='public' and table_name='organizations'
          and column_name = 'slug') = 1 as society_ok,
       to_regclass('public.event_announcements') is not null as announcements_ok;

-- 030
select count(*) = 2 as ok from information_schema.tables
where table_schema='public' and table_name in ('audit_log','event_page_views');

-- 031  expect three rows, and the constraint present
select column_name from information_schema.columns
where table_schema='public' and table_name='events'
  and column_name in ('start_time','end_time','finance_visibility')
order by 1;
select exists(select 1 from pg_constraint
  where conname='events_finance_visibility_check'
    and conrelid='public.events'::regclass) as constraint_ok;

-- 032
select count(*) = 3 as registration_tables from information_schema.tables
where table_schema='public'
  and table_name in ('event_registration_settings','event_registrations','event_registration_history');

-- 033
select to_regprocedure('public.create_event_draft(uuid,jsonb,jsonb)') is not null as draft_creation_ok;
```

### One query to see where you are

Run this at any point for a full picture:

```sql
select
  (to_regclass('public.event_closing')           is not null) as m014,
  (to_regclass('public.event_page_visibility')   is not null) as m015,
  (to_regclass('public.task_assignees')          is not null) as m016,
  (select pg_get_constraintdef(oid) like '%Invalid%'
     from pg_constraint where conname='tasks_status_check')    as m017,
  (exists(select 1 from information_schema.columns
     where table_name='expenses' and column_name='bill_path')) as m018,
  (exists(select 1 from information_schema.columns
     where table_name='prasad_items' and column_name='arrangers')) as m019,
  (exists(select 1 from information_schema.columns
     where table_name='event_closing' and column_name='core_order')) as m020,
  (to_regclass('public.event_gallery_reactions') is not null) as m021,
  (select prosrc like '%event_page_visibility%'
     from pg_proc where proname='can_view_event_page')        as m022,
  (exists(select 1 from information_schema.columns
     where table_name='organizations' and column_name='invite_code')) as m023,
  (exists(select 1 from information_schema.columns
     where table_name='events' and column_name='event_type')) as m024,
  (to_regclass('public.event_teams')             is not null) as m025,
  (exists(select 1 from information_schema.columns
     where table_name='events' and column_name='dashboard_layout')) as m026,
  (exists(select 1 from information_schema.columns
     where table_name='events' and column_name='share_token')) as m027,
  (to_regclass('public.event_visits')            is not null) as m028,
  (exists(select 1 from information_schema.columns
     where table_name='events' and column_name='status_override')) as m029,
  (to_regclass('public.audit_log')               is not null) as m030,
  (exists(select 1 from information_schema.columns
     where table_name='events' and column_name='finance_visibility')) as m031,
  (to_regclass('public.event_registrations')     is not null) as m032,
  (to_regprocedure('public.create_event_draft(uuid,jsonb,jsonb)') is not null) as m033;
```

---

## Rollback concerns

Most of these are additive and need no rollback: the application degrades on a
missing table or column by design, so an unapplied migration is a supported
state. The ones worth knowing about:

| # | Concern |
|---|---|
| 023 | The society rename cannot be undone by the migration. Decide STOP 1 first. The `organization_members` rebuild is reversible only in the sense that the table was empty. |
| 022 | Reverting means restoring 008's function, which restores the leak. If 022 causes a visibility problem, the fix is a row in `event_page_visibility`, not a revert. |
| 016 | Re-running resets Tasks visibility (STOP 2). |
| 017 | Widens a check constraint. Reverting fails if any task has been set to `Invalid` by then. |
| 018 | Creates a storage bucket. Dropping it would delete uploaded bills. |
| 034–036, 038 | Additive: new columns with defaults and new tables. Dropping the tables loses votes, questions and the record of prepared messages. |
| 037 | Adds `pass_token` to every booking. Dropping it invalidates every QR pass already shown to a resident. Re-running is safe. |

## What happens to the app as each lands

Nothing breaks part-way. Every read degrades and every write names its
migration, so the app stays usable throughout and features light up one at a
time as their migration lands:

- after **015**: Settings → Page Visibility starts storing real per-page settings
- after **022**: the cross-event read hole closes
- after **023**: Settings → Society becomes real; the switcher groups by society
- after **024**: event types, templates and module enable/disable become real
- after **026**: the dashboard builder and nav reordering start saving
- after **027**: per-event colour, hero photo and share links start working
- after **028**: the Traffic panel starts recording
- after **029**: events get readable addresses and Society Home can group them
- after **030**: every write and every page view starts being logged
- after **031**: Settings → Event details can save a start and end *time*, and
  Customise dashboard → Collections can switch an event to counts only. Until
  then the name, venue and dates still save, and the time and collections
  controls say which migration they are waiting for
- after **032**: admin-led registration, pricing, payment verification and check-in are active
- after **033**: new events are created atomically as private drafts
- after **034**: an organiser can write, draft, publish, pin and delete announcements
  from the dashboard card. Before it, the card still shows nothing and posting
  answers with the migration's name
- after **035**: the hero's focal point, "name is in the photo" and subtitle start saving
- after **036**: polls and ask-me-anything posts work. Plain messages never needed it
- after **037**: every booking gets a QR pass and a booking code, and Gate mode
  (check-in, meals, walk-ins, cash at the gate) works. Until then the Gate page
  says which migration it is waiting for, and the resident's pass page shows
  no QR code
- after **038**: Communications starts recording what was prepared and for whom.
  Writing and copying a message works without it

### Applying 034-038

They are independent of each other except that 036 needs 034 and 034 needs 029.
Each is safe to re-run. None changes an existing row's meaning. A one-line check
for each, to run after it:

```sql
select
  (select count(*) from information_schema.columns where table_name='event_announcements' and column_name in ('status','published_at','pinned','kind')) = 4 as m034,
  exists(select 1 from information_schema.columns where table_name='events' and column_name='hero_options') as m035,
  to_regclass('public.announcement_poll_votes') is not null as m036,
  (select count(*) from information_schema.columns where table_name='event_registrations' and column_name in ('pass_token','booking_code','is_walk_in')) = 3 as m037,
  to_regclass('public.communication_campaigns') is not null as m038;
```
