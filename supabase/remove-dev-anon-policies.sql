-- Run this before testing real authentication and page-level access control.

drop policy if exists "Temporary anon read events" on public.events;
drop policy if exists "Temporary anon read residents" on public.residents;
drop policy if exists "Temporary anon read contributions" on public.contributions;
drop policy if exists "Temporary anon read sponsors" on public.sponsors;
drop policy if exists "Temporary anon read budgets" on public.budgets;
drop policy if exists "Temporary anon read expenses" on public.expenses;
drop policy if exists "Temporary anon read tasks" on public.tasks;

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
