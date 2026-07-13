-- ============================================================
-- Schema changes — 2026-07-13
-- New Purchase invoice date, Add Old Stock bill section,
-- Whole Bill mode, vendor ledger date-range filtering
-- Safe to run multiple times (IF NOT EXISTS)
-- ============================================================

-- transactions: invoice / received date
-- Written directly on every purchase/old-stock/whole-bill save.
-- No graceful degradation — column must exist.
alter table public.transactions
  add column if not exists date date not null default current_date;

-- spare_parts: optional columns with graceful degradation in app
-- App will retry without these if they are missing, but add them
-- so barcode tracking, part categorisation, and model matching work.
alter table public.spare_parts
  add column if not exists barcode        text,
  add column if not exists parts_category text,
  add column if not exists model_name     text;

-- indexes
create index if not exists idx_transactions_date   on public.transactions(date);
create index if not exists idx_spare_parts_barcode on public.spare_parts(barcode);
