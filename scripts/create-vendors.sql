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

alter table if exists public.vendors add column if not exists vendor_id text;

create index if not exists idx_vendors_name on public.vendors(name);
create unique index if not exists idx_vendors_vendor_id on public.vendors(vendor_id);
