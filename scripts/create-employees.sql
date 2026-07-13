create table if not exists public.employees (
  id uuid default gen_random_uuid() primary key,
  name text unique not null,
  role text not null,
  payment_type text not null default 'salary' check (payment_type in ('salary', 'against_vehicle')),
  vehicle_id uuid references public.vehicles(id) on delete set null,
  daily_salary numeric not null default 0,
  phone text,
  blood_group text,
  aadhaar_number text,
  aadhaar_image_url text,
  photo_url text,
  address text,
  nationality text,
  state text,
  district text,
  religion text,
  notes text,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table if exists public.employees
  add column if not exists vehicle_id uuid references public.vehicles(id) on delete set null;

alter table if exists public.employees add column if not exists blood_group text;
alter table if exists public.employees add column if not exists aadhaar_number text;
alter table if exists public.employees add column if not exists aadhaar_image_url text;
alter table if exists public.employees add column if not exists photo_url text;
alter table if exists public.employees add column if not exists address text;
alter table if exists public.employees add column if not exists nationality text;
alter table if exists public.employees add column if not exists state text;
alter table if exists public.employees add column if not exists district text;
alter table if exists public.employees add column if not exists religion text;

create table if not exists public.employee_work_logs (
  id uuid default gen_random_uuid() primary key,
  employee_id uuid not null references public.employees(id) on delete cascade,
  work_date date not null default current_date,
  entry_type text not null check (entry_type in ('attendance', 'vehicle_contract')),
  attendance_status text check (attendance_status in ('present', 'absent')),
  vehicle_id uuid references public.vehicles(id) on delete set null,
  amount_due numeric not null default 0,
  note text,
  created_by uuid references public.profiles(id),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create table if not exists public.employee_payments (
  id uuid default gen_random_uuid() primary key,
  employee_id uuid not null references public.employees(id) on delete cascade,
  payment_date date not null default current_date,
  payment_type text not null check (payment_type in ('salary', 'advance', 'against_vehicle')),
  payment_mode text not null check (payment_mode in ('cash', 'upi')),
  amount numeric not null default 0,
  vehicle_id uuid references public.vehicles(id) on delete set null,
  note text,
  transaction_id uuid references public.transactions(id) on delete set null,
  created_by uuid references public.profiles(id),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create index if not exists idx_employees_name on public.employees(name);
create index if not exists idx_employee_work_logs_employee_date on public.employee_work_logs(employee_id, work_date desc);
create index if not exists idx_employee_payments_employee_date on public.employee_payments(employee_id, payment_date desc);

alter table public.activity_logs
  drop constraint if exists activity_logs_entity_type_check;

alter table public.activity_logs
  add constraint activity_logs_entity_type_check
  check (entity_type in ('vehicle', 'enquiry', 'spare_part', 'spare_order', 'transaction', 'invoice', 'quotation', 'account', 'employee'));
