create extension if not exists "pgcrypto";

create type member_role as enum ('owner', 'admin', 'committee', 'finance', 'volunteer', 'viewer');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role member_role not null default 'viewer',
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create table public.events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  start_date date not null,
  end_date date not null,
  location text,
  status text not null default 'planning',
  description text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.event_members (
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role member_role not null default 'viewer',
  created_at timestamptz not null default now(),
  primary key (event_id, user_id)
);

create table public.residents (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  flat_no text not null,
  resident_name text not null,
  resident_type text check (resident_type in ('Owner', 'Tenant')),
  phone text,
  interested boolean default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.contributions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  resident_id uuid references public.residents(id) on delete set null,
  expected_amount numeric(12,2) not null default 0 check (expected_amount >= 0),
  received_amount numeric(12,2) not null default 0 check (received_amount >= 0),
  received_date date,
  payment_mode text check (payment_mode in ('UPI', 'Cash', 'Bank Transfer', 'Card', 'Other')),
  reference text,
  status text not null default 'Pending' check (status in ('Pending', 'Partially Paid', 'Received', 'Declined')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.sponsors (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  sponsor_name text not null,
  flat_no text,
  contact text,
  category text not null,
  item_slot text,
  estimated_value numeric(12,2) default 0 check (estimated_value >= 0),
  committed_amount numeric(12,2) default 0 check (committed_amount >= 0),
  received_amount numeric(12,2) default 0 check (received_amount >= 0),
  is_in_kind boolean not null default false,
  payment_date date,
  status text not null default 'Pending',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.vendors (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  category text not null,
  vendor_name text not null,
  contact_person text,
  phone text,
  item_service text,
  quotation numeric(12,2) default 0,
  final_amount numeric(12,2) default 0,
  advance_paid numeric(12,2) default 0,
  due_date date,
  status text not null default 'Pending',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.budgets (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  category text not null,
  item text not null,
  estimated_qty numeric(12,2) default 1 check (estimated_qty >= 0),
  unit text,
  unit_cost numeric(12,2) default 0 check (unit_cost >= 0),
  actual_cost numeric(12,2) default 0 check (actual_cost >= 0),
  funding_type text,
  sponsor_id uuid references public.sponsors(id) on delete set null,
  status text not null default 'Planned',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  vendor_id uuid references public.vendors(id) on delete set null,
  sponsor_id uuid references public.sponsors(id) on delete set null,
  expense_date date not null default current_date,
  category text not null,
  item text not null,
  amount numeric(12,2) not null check (amount >= 0),
  paid_by text,
  payment_mode text,
  expense_type text,
  sponsored boolean default false,
  approved_by text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.procurements (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  vendor_id uuid references public.vendors(id) on delete set null,
  category text not null,
  item text not null,
  quantity numeric(12,2) default 1 check (quantity >= 0),
  unit text,
  required_by date,
  purchase_by text,
  estimated_cost numeric(12,2) default 0,
  actual_cost numeric(12,2) default 0,
  payment_status text,
  lifecycle_status text not null default 'Pending' check (lifecycle_status in ('Pending', 'Purchased', 'Received', 'Handed Over')),
  handed_over_to text,
  location text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  category text,
  task text not null,
  sub_task text,
  owner_name text,
  priority text not null default 'Medium' check (priority in ('Critical', 'High', 'Medium', 'Low')),
  start_date date,
  due_date date,
  status text not null default 'Not Started' check (status in ('Not Started', 'In Progress', 'Blocked', 'Completed', 'Cancelled')),
  dependency text,
  completion_percent int default 0 check (completion_percent between 0 and 100),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.volunteers (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  name text not null,
  flat text,
  phone text,
  area_of_interest text,
  availability text,
  assigned_role text,
  day text,
  time text,
  task text,
  is_lead boolean default false,
  is_confirmed boolean default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.event_schedule (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  day text,
  activity_date date not null,
  activity text not null,
  start_time time,
  end_time time,
  location text,
  expected_attendance int,
  owner_name text,
  status text not null default 'Planned',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.run_sheet (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  activity_date date not null,
  activity_time time not null,
  activity text not null,
  location text,
  responsible_person text,
  volunteers_required int,
  materials_required text,
  vendor_id uuid references public.vendors(id) on delete set null,
  status text not null default 'Pending',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.prasad_items (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  day text,
  prasad_date date,
  slot text,
  item text not null,
  qty_required numeric(12,2) default 0,
  unit text,
  sponsor_contributor text,
  arranged_by text,
  pickup_delivery_time timestamptz,
  location text,
  status text not null default 'Pending',
  actual_qty numeric(12,2) default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.inventory (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  item text not null,
  quantity numeric(12,2) default 1,
  source text,
  acquired_type text,
  received_by text,
  received_date date,
  stored_at text,
  issued_to text,
  issue_date date,
  returned boolean default false,
  return_date date,
  condition text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  name text not null,
  flat text,
  role text,
  area text,
  phone text,
  backup_person text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.risks (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  area text not null,
  risk text not null,
  probability text,
  impact text,
  risk_level text not null default 'Medium' check (risk_level in ('Low', 'Medium', 'High', 'Critical')),
  preventive_action text,
  owner_name text,
  emergency_contact text,
  status text not null default 'Open',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.attachments (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  entity_table text not null,
  entity_id uuid not null,
  file_path text not null,
  file_name text not null,
  mime_type text,
  size_bytes bigint,
  uploaded_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.events enable row level security;
alter table public.event_members enable row level security;
alter table public.residents enable row level security;
alter table public.contributions enable row level security;
alter table public.sponsors enable row level security;
alter table public.vendors enable row level security;
alter table public.budgets enable row level security;
alter table public.expenses enable row level security;
alter table public.procurements enable row level security;
alter table public.tasks enable row level security;
alter table public.volunteers enable row level security;
alter table public.event_schedule enable row level security;
alter table public.run_sheet enable row level security;
alter table public.prasad_items enable row level security;
alter table public.inventory enable row level security;
alter table public.contacts enable row level security;
alter table public.risks enable row level security;
alter table public.attachments enable row level security;

create policy "Users can read own profile" on public.profiles for select using (auth.uid() = id);
create policy "Users can update own profile" on public.profiles for update using (auth.uid() = id);

create or replace function public.is_event_member(target_event_id uuid)
returns boolean language sql security definer set search_path = public as $$
  select exists (
    select 1 from public.event_members
    where event_id = target_event_id and user_id = auth.uid()
  );
$$;

create or replace function public.can_manage_event(target_event_id uuid)
returns boolean language sql security definer set search_path = public as $$
  select exists (
    select 1 from public.event_members
    where event_id = target_event_id
      and user_id = auth.uid()
      and role in ('owner', 'admin', 'committee', 'finance')
  );
$$;

create policy "Event members can read events" on public.events for select using (public.is_event_member(id));
create policy "Managers can update events" on public.events for update using (public.can_manage_event(id));

create policy "Event members can read event data" on public.residents for select using (public.is_event_member(event_id));
create policy "Managers can manage residents" on public.residents for all using (public.can_manage_event(event_id));

create policy "Event members can read tasks" on public.tasks for select using (public.is_event_member(event_id));
create policy "Managers can manage tasks" on public.tasks for all using (public.can_manage_event(event_id));

create policy "Event members can read operations" on public.procurements for select using (public.is_event_member(event_id));
create policy "Managers can manage operations" on public.procurements for all using (public.can_manage_event(event_id));

create policy "Event members can read schedule" on public.event_schedule for select using (public.is_event_member(event_id));
create policy "Managers can manage schedule" on public.event_schedule for all using (public.can_manage_event(event_id));

create policy "Event members can read run sheet" on public.run_sheet for select using (public.is_event_member(event_id));
create policy "Managers can manage run sheet" on public.run_sheet for all using (public.can_manage_event(event_id));

create policy "Managers can manage financial data" on public.contributions for all using (public.can_manage_event(event_id));
create policy "Managers can manage sponsor data" on public.sponsors for all using (public.can_manage_event(event_id));
create policy "Managers can manage budget data" on public.budgets for all using (public.can_manage_event(event_id));
create policy "Managers can manage expense data" on public.expenses for all using (public.can_manage_event(event_id));
create policy "Managers can manage vendors" on public.vendors for all using (public.can_manage_event(event_id));
create policy "Managers can manage remaining modules" on public.volunteers for all using (public.can_manage_event(event_id));
create policy "Managers can manage prasad" on public.prasad_items for all using (public.can_manage_event(event_id));
create policy "Managers can manage inventory" on public.inventory for all using (public.can_manage_event(event_id));
create policy "Managers can manage contacts" on public.contacts for all using (public.can_manage_event(event_id));
create policy "Managers can manage risks" on public.risks for all using (public.can_manage_event(event_id));
create policy "Managers can manage attachments" on public.attachments for all using (public.can_manage_event(event_id));
