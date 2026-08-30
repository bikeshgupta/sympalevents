insert into public.organizations (id, name)
values ('00000000-0000-0000-0000-000000000101', 'Tru WindChimes Committee')
on conflict do nothing;

insert into public.events (id, organization_id, name, start_date, end_date, location, status, description)
values (
  '00000000-0000-0000-0000-000000000201',
  '00000000-0000-0000-0000-000000000101',
  'Ganesh Chaturthi 2026',
  '2026-09-14',
  '2026-09-16',
  'Tru WindChimes',
  'planning',
  'Demo seed event based on the original workbook workflow.'
)
on conflict do nothing;

insert into public.residents (event_id, flat_no, resident_name, resident_type, phone, interested)
values
  ('00000000-0000-0000-0000-000000000201', 'A-101', 'Aarav Sharma', 'Owner', '9000000001', true),
  ('00000000-0000-0000-0000-000000000201', 'B-204', 'Meera Iyer', 'Tenant', '9000000002', true),
  ('00000000-0000-0000-0000-000000000201', 'C-308', 'Rohan Desai', 'Owner', '9000000003', false);

insert into public.sponsors (event_id, sponsor_name, flat_no, contact, category, item_slot, committed_amount, received_amount, is_in_kind, status)
values
  ('00000000-0000-0000-0000-000000000201', 'Patel Family', 'A-302', '9000000010', 'Decoration', 'Flowers', 15000, 15000, false, 'Received'),
  ('00000000-0000-0000-0000-000000000201', 'WindChimes Cultural Group', null, '9000000011', 'Prasad', 'Day 2', 5100, 5100, true, 'Received');

insert into public.budgets (event_id, category, item, estimated_qty, unit, unit_cost, actual_cost, funding_type, status)
values
  ('00000000-0000-0000-0000-000000000201', 'Idol', 'Idol booking', 1, 'lot', 15000, 5000, 'Common Fund', 'In Progress'),
  ('00000000-0000-0000-0000-000000000201', 'Decoration', 'Mandap and flowers', 1, 'lot', 34000, 0, 'Sponsorship', 'Planned'),
  ('00000000-0000-0000-0000-000000000201', 'Prasad', 'Daily prasad', 3, 'day', 10000, 6500, 'Sponsorship', 'Planned');

insert into public.tasks (event_id, category, task, owner_name, priority, due_date, status, completion_percent)
values
  ('00000000-0000-0000-0000-000000000201', 'Idol', 'Confirm idol delivery', 'Aarav', 'Critical', '2026-09-10', 'In Progress', 50),
  ('00000000-0000-0000-0000-000000000201', 'Prasad', 'Finalize prasad menu', 'Meera', 'High', '2026-09-08', 'Not Started', 0),
  ('00000000-0000-0000-0000-000000000201', 'Volunteers', 'Volunteer briefing', 'Rohan', 'Medium', '2026-09-13', 'Blocked', 20);
