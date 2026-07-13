alter table if exists public.invoices
  add column if not exists payment_status text not null default 'unpaid';

alter table if exists public.invoices
  add column if not exists paid_amount numeric not null default 0;

alter table if exists public.invoices
  add column if not exists outstanding_amount numeric not null default 0;

alter table if exists public.invoices
  add column if not exists payment_date date;

update public.invoices
set
  paid_amount = coalesce(grand_total, 0),
  outstanding_amount = 0,
  payment_status = 'paid',
  payment_date = coalesce(payment_date, created_at::date)
where coalesce(payment_status, '') not in ('unpaid', 'partial', 'paid');

update public.invoices
set
  paid_amount = coalesce(paid_amount, grand_total, 0),
  outstanding_amount = greatest(coalesce(grand_total, 0) - coalesce(paid_amount, 0), 0),
  payment_status = case
    when greatest(coalesce(grand_total, 0) - coalesce(paid_amount, 0), 0) <= 0 then 'paid'
    when coalesce(paid_amount, 0) > 0 then 'partial'
    else 'unpaid'
  end
where true;
