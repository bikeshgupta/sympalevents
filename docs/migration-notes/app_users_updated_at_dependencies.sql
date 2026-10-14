-- READ-ONLY. Changes nothing. Run in the Supabase SQL editor and send me the output.
--
-- Question: does anything INSIDE THE DATABASE depend on public.app_users.updated_at moving on every
-- authenticated request (the application code does not - I searched all of api/ and src/)?
-- Expect 0 rows from queries 1-6. Anything that comes back is a dependency I must look at before
-- changing how updated_at is written.

-- 1. Triggers on app_users (user-defined only).
select tgname from pg_trigger where tgrelid = 'public.app_users'::regclass and not tgisinternal;

-- 2. Functions whose body mentions both app_users and updated_at.
select n.nspname as schema, p.proname
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname not in ('pg_catalog', 'information_schema')
  and p.prosrc ilike '%app_users%' and p.prosrc ilike '%updated_at%';

-- 3. Views and materialized views that read app_users.
select schemaname, viewname from pg_views
where schemaname not in ('pg_catalog', 'information_schema') and definition ilike '%app_users%'
union all
select schemaname, matviewname from pg_matviews where definition ilike '%app_users%';

-- 4. Row-level-security policies that mention app_users.
select schemaname, tablename, policyname from pg_policies
where coalesce(qual, '') ilike '%app_users%' or coalesce(with_check, '') ilike '%app_users%';

-- 5. Realtime / logical publications that include app_users.
select pubname from pg_publication_tables where schemaname = 'public' and tablename = 'app_users';

-- 6. Indexes that include updated_at.
select indexname from pg_indexes
where schemaname = 'public' and tablename = 'app_users' and indexdef ilike '%updated_at%';

-- 7. INFORMATION: what updated_at actually holds today. If it is "the last authenticated request", then
--    users who were active in the last hour all have updated_at within the last hour.
select count(*)                                                       as users,
       count(*) filter (where updated_at > now() - interval '1 hour')  as touched_last_hour,
       count(*) filter (where updated_at > now() - interval '1 day')   as touched_last_day,
       count(*) filter (where updated_at > created_at + interval '1 minute') as ever_moved_after_creation,
       max(updated_at)                                                 as most_recent
from public.app_users;
