-- READ-ONLY. Changes nothing. One row; every column true = that migration's main object exists.
-- Run it in the Supabase SQL editor and send me the row. It covers 028-046 (earlier ones: see
-- "One query to see where you are" in docs/MIGRATION_CHECKLIST.md).
-- A "false" for 042, 043, 045 or 046 is expected until you have run them.
select
  (to_regclass('public.event_visits') is not null)                                             as m028,
  (exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'events' and column_name = 'slug'))                as m029,
  (to_regclass('public.audit_log') is not null and to_regclass('public.event_page_views') is not null)                                             as m030,
  (exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'events' and column_name = 'finance_visibility')) as m031,
  (to_regclass('public.event_registrations') is not null)                                      as m032,
  (to_regprocedure('public.create_event_draft(uuid,jsonb,jsonb)') is not null)                 as m033,
  (exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'event_announcements' and column_name = 'kind'))  as m034,
  (exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'events' and column_name = 'hero_options'))       as m035,
  (to_regclass('public.announcement_questions') is not null)                                   as m036,
  (exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'event_registrations' and column_name = 'pass_token')) as m037,
  (to_regclass('public.communication_campaigns') is not null)                                  as m038,
  (exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'events' and column_name = 'good_to_know'))       as m039,
  (to_regclass('public.event_opportunities') is not null)                                      as m040,
  (exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'app_users' and column_name = 'custom_photo_url')) as m041,
  (exists (select 1 from pg_trigger where tgrelid = 'public.organization_members'::regclass and tgname = 'organization_members_keep_admin'))        as m042,
  (to_regclass('public.event_proposals') is not null)                                          as m043,
  (exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'event_visits' and column_name = 'surface'))      as m045,
  (to_regclass('public.event_role_history') is not null)                                       as m046;
