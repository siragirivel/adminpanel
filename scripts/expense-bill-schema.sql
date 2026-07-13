-- Expense bill schema for daybook transactions
-- Run this in Supabase SQL editor if these columns are missing.

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

create index if not exists idx_transactions_bill_expires_at
  on public.transactions(bill_expires_at);
