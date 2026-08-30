-- Local development only.
-- These policies let the frontend test CRUD before Supabase Auth is wired.
-- Do not use these policies in production.

grant usage on schema public to anon;
grant select, insert, update, delete on
  public.events,
  public.residents,
  public.contributions,
  public.sponsors,
  public.budgets,
  public.expenses,
  public.tasks
to anon;

drop policy if exists "Dev anon read events" on public.events;
drop policy if exists "Dev anon read residents" on public.residents;
drop policy if exists "Dev anon read contributions" on public.contributions;
drop policy if exists "Dev anon read sponsors" on public.sponsors;
drop policy if exists "Dev anon read budgets" on public.budgets;
drop policy if exists "Dev anon read expenses" on public.expenses;
drop policy if exists "Dev anon read tasks" on public.tasks;
drop policy if exists "Dev anon insert residents" on public.residents;
drop policy if exists "Dev anon update residents" on public.residents;
drop policy if exists "Dev anon delete residents" on public.residents;
drop policy if exists "Dev anon insert contributions" on public.contributions;
drop policy if exists "Dev anon update contributions" on public.contributions;
drop policy if exists "Dev anon delete contributions" on public.contributions;
drop policy if exists "Dev anon insert sponsors" on public.sponsors;
drop policy if exists "Dev anon update sponsors" on public.sponsors;
drop policy if exists "Dev anon delete sponsors" on public.sponsors;
drop policy if exists "Dev anon insert budgets" on public.budgets;
drop policy if exists "Dev anon update budgets" on public.budgets;
drop policy if exists "Dev anon delete budgets" on public.budgets;
drop policy if exists "Dev anon insert tasks" on public.tasks;
drop policy if exists "Dev anon update tasks" on public.tasks;
drop policy if exists "Dev anon delete tasks" on public.tasks;

create policy "Dev anon read events"
on public.events
for select
to anon
using (true);

create policy "Dev anon read residents"
on public.residents
for select
to anon
using (true);

create policy "Dev anon read contributions"
on public.contributions
for select
to anon
using (true);

create policy "Dev anon read sponsors"
on public.sponsors
for select
to anon
using (true);

create policy "Dev anon read budgets"
on public.budgets
for select
to anon
using (true);

create policy "Dev anon read expenses"
on public.expenses
for select
to anon
using (true);

create policy "Dev anon read tasks"
on public.tasks
for select
to anon
using (true);

create policy "Dev anon insert residents"
on public.residents
for insert
to anon
with check (true);

create policy "Dev anon update residents"
on public.residents
for update
to anon
using (true)
with check (true);

create policy "Dev anon delete residents"
on public.residents
for delete
to anon
using (true);

create policy "Dev anon insert contributions"
on public.contributions
for insert
to anon
with check (true);

create policy "Dev anon update contributions"
on public.contributions
for update
to anon
using (true)
with check (true);

create policy "Dev anon delete contributions"
on public.contributions
for delete
to anon
using (true);

create policy "Dev anon insert sponsors"
on public.sponsors
for insert
to anon
with check (true);

create policy "Dev anon update sponsors"
on public.sponsors
for update
to anon
using (true)
with check (true);

create policy "Dev anon delete sponsors"
on public.sponsors
for delete
to anon
using (true);

create policy "Dev anon insert budgets"
on public.budgets
for insert
to anon
with check (true);

create policy "Dev anon update budgets"
on public.budgets
for update
to anon
using (true)
with check (true);

create policy "Dev anon delete budgets"
on public.budgets
for delete
to anon
using (true);

create policy "Dev anon insert tasks"
on public.tasks
for insert
to anon
with check (true);

create policy "Dev anon update tasks"
on public.tasks
for update
to anon
using (true)
with check (true);

create policy "Dev anon delete tasks"
on public.tasks
for delete
to anon
using (true);
