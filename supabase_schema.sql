-- Profiles table to store public user data
create table if not exists public.profiles (
  id uuid references auth.users(id) primary key,
  username text not null,
  email text not null,
  role text not null default 'owner' check (role in ('owner', 'admin', 'manager', 'staff')),
  access jsonb not null default '{
    "dashboard": true,
    "vehicles": true,
    "enquiries": true,
    "inventory": true,
    "billing": true,
    "estimates": true,
    "daybook": true,
    "accounts": true,
    "logs": true,
    "settings": true
  }'::jsonb,
  is_active boolean not null default true,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.profiles
  add column if not exists role text not null default 'owner' check (role in ('owner', 'admin', 'manager', 'staff'));
alter table public.profiles
  add column if not exists access jsonb not null default '{
    "dashboard": true,
    "vehicles": true,
    "enquiries": true,
    "inventory": true,
    "billing": true,
    "estimates": true,
    "daybook": true,
    "accounts": true,
    "logs": true,
    "settings": true
  }'::jsonb;
alter table public.profiles
  add column if not exists is_active boolean not null default true;

-- Sync auth.users with public.profiles (Supabase Pattern)
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, username, email)
  values (new.id, coalesce(new.raw_user_meta_data->>'username', 'Admin'), new.email);
  return new;
end;
$$ language plpgsql security definer;

-- Trigger to run on every new user signup
-- Note: Manually run this if not already exists:
-- create trigger on_auth_user_created
--   after insert on auth.users
--   for each row execute procedure public.handle_new_user();

create table if not exists public.spare_parts (
  id varchar primary key,
  name text not null,
  seller text not null,
  cat text not null,
  parts_category text not null default 'others',
  car_name text,
  cost numeric not null,
  sell numeric not null,
  stock integer not null default 0,
  threshold integer not null default 5,
  created_by uuid references public.profiles(id), -- Audit tracking
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create table if not exists public.spare_orders (
  id varchar primary key,
  supplier text not null,
  part text not null,
  qty integer not null default 1,
  total numeric not null,
  mode text not null,
  bill boolean not null default false,
  bill_url text,
  status text not null default 'pending',
  date date not null,
  created_by uuid references public.profiles(id),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create table if not exists public.vehicles (
  id uuid default gen_random_uuid() primary key,
  car_id text unique not null,
  owner_name text not null,
  phone_number text not null,
  alternate_phone text,
  vehicle_reg text unique not null,
  entry_date date not null default current_date,
  make_model text,
  odometer_km text,
  status text not null default 'In Service',
  work_description text,
  chassis_number text,
  front_image_url text,
  back_image_url text,
  chassis_image_url text,
  created_by uuid references public.profiles(id), -- Audit tracking
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create table if not exists public.enquiries (
  id varchar primary key,
  customer_name text not null,
  phone_number text not null,
  vehicle_details text not null,
  status text not null default 'open' check (status in ('open', 'closed')),
  enquiry_date date default current_date,
  pickup_date date,
  created_by uuid references public.profiles(id),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create table if not exists public.invoices (
  id uuid default gen_random_uuid() primary key,
  invoice_number text unique not null,
  vehicle_id uuid references public.vehicles(id) on delete cascade,
  items jsonb not null default '[]'::jsonb,
  labour jsonb not null default '[]'::jsonb,
  total_spare numeric not null default 0,
  total_labour numeric not null default 0,
  grand_total numeric not null,
  payment_mode text not null,
  payment_status text not null default 'unpaid' check (payment_status in ('unpaid', 'partial', 'paid')),
  paid_amount numeric not null default 0,
  outstanding_amount numeric not null default 0,
  payment_date date,
  status text not null default 'completed',
  odometer_km text,
  note text,
  created_by uuid references public.profiles(id), -- Audit tracking
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create table if not exists public.quotations (
  id uuid default gen_random_uuid() primary key,
  quotation_number text unique not null,
  vehicle_id uuid references public.vehicles(id) on delete cascade,
  items jsonb not null default '[]'::jsonb,
  labour jsonb not null default '[]'::jsonb,
  start_date date not null,
  end_date date not null,
  discount numeric not null default 0,
  total_spare numeric not null default 0,
  total_labour numeric not null default 0,
  subtotal_before_tax numeric not null default 0,
  total_tax numeric not null default 0,
  grand_total numeric not null,
  odometer_km text,
  note text,
  created_by uuid references public.profiles(id),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create table if not exists public.transactions (
  id uuid default gen_random_uuid() primary key,
  description text not null,
  amount numeric not null,
  type text not null check (type in ('credit', 'debit')),
  payment_mode text not null check (payment_mode in ('cash', 'upi', 'card', 'cheque')),
  date date not null default current_date,
  note text,
  bill_url text,
  bill_public_id text,
  bill_resource_type text,
  bill_uploaded_at timestamp with time zone,
  bill_expires_at timestamp with time zone,
  bill_type text check (bill_type in ('company', 'employee')),
  expense_vendor text,
  expense_vendor_id text,
  expense_employee_id text,
  expense_employee_name text,
  expense_remarks text,
  created_by uuid references public.profiles(id), -- Audit tracking
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create table if not exists public.vendors (
  id uuid default gen_random_uuid() primary key,
  vendor_id text unique,
  name text unique not null,
  phone text,
  email text,
  address text,
  gstin text,
  notes text,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create table if not exists public.employees (
  id uuid default gen_random_uuid() primary key,
  employee_id text unique,
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
  bank_name text,
  bank_account_number text,
  bank_ifsc text,
  bank_branch text,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

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

create table if not exists public.activity_logs (
  id uuid default gen_random_uuid() primary key,
  action text not null check (action in ('create', 'edit', 'delete')),
  entity_type text not null check (entity_type in ('vehicle', 'enquiry', 'spare_part', 'spare_order', 'transaction', 'invoice', 'quotation', 'account', 'employee')),
  entity_id text not null,
  entity_label text not null,
  description text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create table if not exists public.notification_mail_runs (
  run_key text primary key,
  delivery_type text not null check (delivery_type in ('alerts', 'weekly-report', 'all')),
  run_date date not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create table if not exists public.otp_verifications (
  id uuid default gen_random_uuid() primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  purpose text not null,
  otp_hash text not null,
  expires_at timestamp with time zone not null,
  consumed_at timestamp with time zone,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Indices for performance
create index if not exists idx_vehicles_reg on public.vehicles(vehicle_reg);
create index if not exists idx_invoices_number on public.invoices(invoice_number);
create index if not exists idx_quotations_number on public.quotations(quotation_number);
create index if not exists idx_transactions_date on public.transactions(date);
create index if not exists idx_transactions_bill_expires_at on public.transactions(bill_expires_at);
create index if not exists idx_vendors_name on public.vendors(name);
create unique index if not exists idx_vendors_vendor_id on public.vendors(vendor_id);
create index if not exists idx_employees_name on public.employees(name);
create index if not exists idx_employee_work_logs_employee_date on public.employee_work_logs(employee_id, work_date desc);
create index if not exists idx_employee_payments_employee_date on public.employee_payments(employee_id, payment_date desc);
create index if not exists idx_activity_logs_created_at on public.activity_logs(created_at desc);
create index if not exists idx_activity_logs_entity on public.activity_logs(entity_type, action);
create index if not exists idx_notification_mail_runs_date on public.notification_mail_runs(run_date desc);
create index if not exists idx_otp_verifications_user_purpose on public.otp_verifications(user_id, purpose);
create index if not exists idx_otp_verifications_expires on public.otp_verifications(expires_at desc);
create index if not exists idx_spare_parts_name on public.spare_parts(name);
create index if not exists idx_spare_parts_car_name on public.spare_parts(car_name);
create index if not exists idx_spare_orders_status on public.spare_orders(status);
create index if not exists idx_created_by_user on public.vehicles(created_by);
create index if not exists idx_enquiries_status on public.enquiries(status);

alter table if exists public.vehicles add column if not exists odometer_km text;
alter table if exists public.invoices add column if not exists odometer_km text;
alter table if exists public.quotations add column if not exists odometer_km text;
alter table if exists public.transactions add column if not exists bill_url text;
alter table if exists public.transactions add column if not exists bill_public_id text;
alter table if exists public.transactions add column if not exists bill_resource_type text;
alter table if exists public.transactions add column if not exists bill_uploaded_at timestamp with time zone;
alter table if exists public.transactions add column if not exists bill_expires_at timestamp with time zone;
alter table if exists public.transactions add column if not exists bill_type text;
alter table if exists public.transactions add column if not exists expense_vendor text;
alter table if exists public.transactions add column if not exists expense_vendor_id text;
alter table if exists public.transactions add column if not exists expense_employee_id text;
alter table if exists public.transactions add column if not exists expense_employee_name text;
alter table if exists public.transactions add column if not exists expense_remarks text;
alter table if exists public.vendors add column if not exists vendor_id text;
alter table if exists public.employees add column if not exists blood_group text;
alter table if exists public.employees add column if not exists aadhaar_number text;
alter table if exists public.employees add column if not exists aadhaar_image_url text;
alter table if exists public.employees add column if not exists photo_url text;
alter table if exists public.employees add column if not exists address text;
alter table if exists public.employees add column if not exists nationality text;
alter table if exists public.employees add column if not exists state text;
alter table if exists public.employees add column if not exists district text;
alter table if exists public.employees add column if not exists religion text;
alter table if exists public.employees add column if not exists employee_id text;
alter table if exists public.employees add column if not exists bank_name text;
alter table if exists public.employees add column if not exists bank_account_number text;
alter table if exists public.employees add column if not exists bank_ifsc text;
alter table if exists public.employees add column if not exists bank_branch text;
alter table if exists public.spare_parts add column if not exists car_name text;
alter table if exists public.spare_parts add column if not exists parts_category text not null default 'others';
alter table if exists public.spare_orders add column if not exists bill_url text;
alter table if exists public.spare_orders add column if not exists status text not null default 'pending';
alter table if exists public.spare_orders add column if not exists created_by uuid references public.profiles(id);
alter table if exists public.invoices add column if not exists payment_status text not null default 'unpaid';
alter table if exists public.invoices add column if not exists paid_amount numeric not null default 0;
alter table if exists public.invoices add column if not exists outstanding_amount numeric not null default 0;
alter table if exists public.invoices add column if not exists payment_date date;

-- Enable RLS on all tables
alter table if exists public.profiles enable row level security;
alter table if exists public.spare_parts enable row level security;
alter table if exists public.spare_orders enable row level security;
alter table if exists public.vehicles enable row level security;
alter table if exists public.enquiries enable row level security;
alter table if exists public.invoices enable row level security;
alter table if exists public.quotations enable row level security;
alter table if exists public.transactions enable row level security;
alter table if exists public.vendors enable row level security;
alter table if exists public.employees enable row level security;
alter table if exists public.employee_work_logs enable row level security;
alter table if exists public.employee_payments enable row level security;
alter table if exists public.activity_logs enable row level security;
alter table if exists public.notification_mail_runs enable row level security;
alter table if exists public.otp_verifications enable row level security;

-- RLS helper functions
create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select role from public.profiles where id = auth.uid()),
    'staff'
  );
$$;

create or replace function public.is_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_user_role() = 'owner';
$$;

-- RLS policies
drop policy if exists "profiles_select_authenticated" on public.profiles;
create policy "profiles_select_authenticated"
  on public.profiles
  for select
  to authenticated
  using (true);

drop policy if exists "spare_parts_full_access_authenticated" on public.spare_parts;
create policy "spare_parts_full_access_authenticated"
  on public.spare_parts
  for all
  to authenticated
  using (true)
  with check (true);

drop policy if exists "spare_orders_full_access_authenticated" on public.spare_orders;
create policy "spare_orders_full_access_authenticated"
  on public.spare_orders
  for all
  to authenticated
  using (true)
  with check (true);

drop policy if exists "vehicles_full_access_authenticated" on public.vehicles;
create policy "vehicles_full_access_authenticated"
  on public.vehicles
  for all
  to authenticated
  using (true)
  with check (true);

drop policy if exists "enquiries_full_access_authenticated" on public.enquiries;
create policy "enquiries_full_access_authenticated"
  on public.enquiries
  for all
  to authenticated
  using (true)
  with check (true);

drop policy if exists "quotations_full_access_authenticated" on public.quotations;
create policy "quotations_full_access_authenticated"
  on public.quotations
  for all
  to authenticated
  using (true)
  with check (true);

drop policy if exists "vendors_full_access_authenticated" on public.vendors;
create policy "vendors_full_access_authenticated"
  on public.vendors
  for all
  to authenticated
  using (true)
  with check (true);

drop policy if exists "employees_full_access_authenticated" on public.employees;
create policy "employees_full_access_authenticated"
  on public.employees
  for all
  to authenticated
  using (true)
  with check (true);

drop policy if exists "employee_work_logs_full_access_authenticated" on public.employee_work_logs;
create policy "employee_work_logs_full_access_authenticated"
  on public.employee_work_logs
  for all
  to authenticated
  using (true)
  with check (true);

drop policy if exists "employee_payments_full_access_authenticated" on public.employee_payments;
create policy "employee_payments_full_access_authenticated"
  on public.employee_payments
  for all
  to authenticated
  using (true)
  with check (true);

drop policy if exists "invoices_select_authenticated" on public.invoices;
create policy "invoices_select_authenticated"
  on public.invoices
  for select
  to authenticated
  using (true);

drop policy if exists "invoices_insert_authenticated" on public.invoices;
create policy "invoices_insert_authenticated"
  on public.invoices
  for insert
  to authenticated
  with check (true);

drop policy if exists "invoices_update_authenticated" on public.invoices;
create policy "invoices_update_authenticated"
  on public.invoices
  for update
  to authenticated
  using (true)
  with check (true);

drop policy if exists "invoices_delete_owner" on public.invoices;
create policy "invoices_delete_owner"
  on public.invoices
  for delete
  to authenticated
  using (public.is_owner());

drop policy if exists "transactions_select_authenticated" on public.transactions;
create policy "transactions_select_authenticated"
  on public.transactions
  for select
  to authenticated
  using (true);

drop policy if exists "transactions_insert_authenticated" on public.transactions;
create policy "transactions_insert_authenticated"
  on public.transactions
  for insert
  to authenticated
  with check (true);

drop policy if exists "transactions_update_owner" on public.transactions;
create policy "transactions_update_owner"
  on public.transactions
  for update
  to authenticated
  using (public.is_owner())
  with check (public.is_owner());

drop policy if exists "transactions_delete_owner" on public.transactions;
create policy "transactions_delete_owner"
  on public.transactions
  for delete
  to authenticated
  using (public.is_owner());

drop policy if exists "activity_logs_select_authenticated" on public.activity_logs;
create policy "activity_logs_select_authenticated"
  on public.activity_logs
  for select
  to authenticated
  using (true);

drop policy if exists "activity_logs_insert_authenticated" on public.activity_logs;
create policy "activity_logs_insert_authenticated"
  on public.activity_logs
  for insert
  to authenticated
  with check (created_by = auth.uid());
