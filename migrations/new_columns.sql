-- ============================================================
-- NEW COLUMNS — add to existing Supabase tables
-- Safe to run multiple times (IF NOT EXISTS)
-- ============================================================

-- spare_parts: columns the app uses but may be missing
alter table public.spare_parts
  add column if not exists barcode        text,
  add column if not exists parts_category text,
  add column if not exists model_name     text,
  add column if not exists purchase_mode  text default 'cash_carry',
  add column if not exists bill_urls      text[] not null default '{}',
  add column if not exists tax_rate       numeric(5,2) not null default 18;

-- transactions: date column for invoice date / received date
alter table public.transactions
  add column if not exists date date not null default current_date;

-- vendors: extra fields used by vendor profile + ledger
alter table public.vendors
  add column if not exists vendor_id  text unique,
  add column if not exists address    text,
  add column if not exists notes      text,
  add column if not exists is_active  boolean not null default true,
  add column if not exists created_by uuid references public.profiles(id) on delete set null;

-- indexes for the new columns used in ledger queries
create index if not exists idx_transactions_date   on public.transactions(date);
create index if not exists idx_spare_parts_barcode on public.spare_parts(barcode);
