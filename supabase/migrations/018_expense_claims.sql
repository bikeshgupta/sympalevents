-- Out-of-pocket expense claims.
--
-- How a society committee actually spends: a member pays a vendor from their
-- own pocket, records it here (optionally with a photo of the bill), and the
-- admin pays them back later and marks it settled. This adds just enough to
-- the existing `expenses` table to track that - it does not create a second
-- table, because a claim *is* an expense and the dashboard's "Actual
-- Expenses" total must keep counting it.
--
-- Nothing existing is renamed or dropped. payment_mode / expense_type /
-- approved_by stay (older rows carry them); the form just stops asking.

alter table public.expenses
  -- Who recorded it. A committee member can always see, and while it is
  -- unsettled edit or withdraw, their own claims.
  add column if not exists submitted_by uuid,
  -- null        - recorded before claims existed; not tracked either way
  -- 'pending'   - paid out of pocket, waiting to be paid back
  -- 'settled'   - paid back (settled_at / settled_by say when and by whom)
  -- 'not_needed'- paid straight from event funds, nobody to pay back
  add column if not exists reimbursement_status text,
  add column if not exists settled_at timestamptz,
  add column if not exists settled_by uuid,
  -- A path inside the private "expense-bills" bucket below - never a URL.
  -- The API hands out short-lived signed links to people allowed to see it.
  add column if not exists bill_path text;

-- Named explicitly: the API embeds app_users through both of these, and with
-- two foreign keys to the same table PostgREST needs the constraint name to
-- tell them apart (api/expenses.ts spells these names out).
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'expenses_submitted_by_fkey') then
    alter table public.expenses
      add constraint expenses_submitted_by_fkey
      foreign key (submitted_by) references public.app_users(id) on delete set null;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'expenses_settled_by_fkey') then
    alter table public.expenses
      add constraint expenses_settled_by_fkey
      foreign key (settled_by) references public.app_users(id) on delete set null;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'expenses_reimbursement_status_check') then
    alter table public.expenses
      add constraint expenses_reimbursement_status_check
      check (reimbursement_status is null or reimbursement_status in ('pending', 'settled', 'not_needed'));
  end if;
end $$;

create index if not exists expenses_submitted_by_idx on public.expenses (event_id, submitted_by);

-- Bills are PRIVATE, unlike the public "uploads" bucket that auction images
-- and closing-page photos use. A bill can carry a vendor's phone number, a
-- UPI id, or the payer's own details, and `expenses` rows are readable by the
-- anon key (the dashboard totals them), so a public URL stored here would be
-- one query away from anyone. With a private bucket the stored path is
-- useless on its own: /api/expenses signs a one-hour link per request, and
-- only for a committee member, a member granted the Expenses page, or the
-- person who filed the claim.
--
-- Same zero-policy reasoning as every table in this app: there is no Supabase
-- Auth session in the browser, so all reads and writes go through the API
-- with the service-role client. Do not add storage.objects policies.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'expense-bills',
  'expense-bills',
  false,
  3145728, -- 3MB, the same cap api/expenses.ts enforces
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do nothing;
