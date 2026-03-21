-- Profiles table to store public user data
create table if not exists public.profiles (
  id uuid references auth.users(id) primary key,
  username text not null,
  email text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

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
  date date not null,
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
  status text not null default 'completed',
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
  created_by uuid references public.profiles(id), -- Audit tracking
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create table if not exists public.activity_logs (
  id uuid default gen_random_uuid() primary key,
  action text not null check (action in ('create', 'edit', 'delete')),
  entity_type text not null check (entity_type in ('vehicle', 'enquiry', 'spare_part', 'spare_order', 'transaction', 'invoice', 'quotation')),
  entity_id text not null,
  entity_label text not null,
  description text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Indices for performance
create index if not exists idx_vehicles_reg on public.vehicles(vehicle_reg);
create index if not exists idx_invoices_number on public.invoices(invoice_number);
create index if not exists idx_quotations_number on public.quotations(quotation_number);
create index if not exists idx_transactions_date on public.transactions(date);
create index if not exists idx_activity_logs_created_at on public.activity_logs(created_at desc);
create index if not exists idx_activity_logs_entity on public.activity_logs(entity_type, action);
create index if not exists idx_spare_parts_name on public.spare_parts(name);
create index if not exists idx_created_by_user on public.vehicles(created_by);
create index if not exists idx_enquiries_status on public.enquiries(status);
