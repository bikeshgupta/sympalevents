-- Who tried to open the Platform Control Center, and what they were told.
--
-- The owner-only area (/platform/analytics) refuses everybody who is not on PLATFORM_ADMIN_USER_IDS with the
-- same plain 404. Until now the only trace of a refusal was one line in the Vercel function log, which is not
-- something the owner can look at inside the product and which is not kept for long. This table is that record,
-- shown on the Control Center's Activity & Audit page.
--
-- What it keeps, and what it deliberately does not:
--   - outcome  allowed | refused
--   - reason   a short fixed word ('ok', 'not_listed')
--   - part     which part of the area was asked for ('session', 'overview', ...)
--   - user_id  the signed-in account, when there was one
--   NO IP ADDRESS, NO USER AGENT, NO TOKEN, NO EMAIL. The account is named by its id and the name is looked up
--   when the page is read. This is the same rule 028 set for visits: a record of who looked must not itself
--   become a fingerprint.
--
-- It is written ONLY for a signed-in account: the owner opening the area, and a signed-in person who is not the
-- owner trying it - at most one row per person per outcome per five minutes, so refreshing cannot fill it. A
-- request with no or an invalid token writes nothing, so a stranger hammering the address cannot fill this table
-- either; those stay in the function log only.
--
-- Additive and starting empty. Nothing in the app reads or writes it until this has been applied; the Control
-- Center checks for it and says "not recorded yet" while it is absent.

begin;

do $$
begin
  if to_regclass('public.app_users') is null then
    raise exception '047 needs the app_users table. Apply the base migrations first.';
  end if;
end $$;

create table if not exists public.platform_access_log (
  id bigserial primary key,
  occurred_at timestamptz not null default now(),
  outcome text not null check (outcome in ('allowed', 'refused')),
  -- A fixed vocabulary, enforced by shape so nothing free-form (an address, a token) can be written here.
  reason text not null check (reason ~ '^[a-z][a-z_]{0,39}$'),
  part text check (part is null or part ~ '^[a-z][a-z_]{0,39}$'),
  user_id uuid references public.app_users(id) on delete set null
);

create index if not exists platform_access_log_time_idx
  on public.platform_access_log (occurred_at desc);
create index if not exists platform_access_log_user_idx
  on public.platform_access_log (user_id, occurred_at desc) where user_id is not null;

alter table public.platform_access_log enable row level security;

-- RLS on with zero policies, the standing choice since 009: the browser never holds a Supabase session, so a
-- policy against auth.uid() would be dead code. Only the service-role client in /api/events?resource=platform
-- touches this table. Do not add anon/authenticated policies.
--
-- NO RETENTION PRUNE here either, for the same reason as audit_log (030): what to keep, and for how long, is a
-- decision for the owner, and a read must never delete data.

commit;
