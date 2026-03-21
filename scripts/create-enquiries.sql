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

create index if not exists idx_enquiries_status on public.enquiries(status);

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'activity_logs_entity_type_check'
      and conrelid = 'public.activity_logs'::regclass
  ) then
    alter table public.activity_logs drop constraint activity_logs_entity_type_check;
  end if;

  alter table public.activity_logs
    add constraint activity_logs_entity_type_check
    check (
      entity_type in (
        'vehicle',
        'enquiry',
        'spare_part',
        'spare_order',
        'transaction',
        'invoice',
        'quotation'
      )
    );
exception
  when duplicate_object then
    null;
end $$;

insert into public.enquiries (
  id,
  customer_name,
  phone_number,
  vehicle_details,
  status,
  pickup_date,
  created_by
)
select
  seed.id,
  seed.customer_name,
  seed.phone_number,
  seed.vehicle_details,
  seed.status,
  seed.pickup_date,
  p.id
from (
  values
    ('ENQ-1001', 'Saravanan M', '+91 98420 11122', 'TN 33 AX 4421 · Hyundai i10 · General service and pickup tomorrow morning', 'open', date '2026-03-20'),
    ('ENQ-1002', 'Kavitha R', '+91 97877 55443', 'TN 72 BB 9088 · Maruti WagonR · Brake pad price enquiry', 'closed', date '2026-03-19'),
    ('ENQ-1003', 'Vignesh P', '+91 93611 22990', 'TN 86 Z 7001 · Mahindra Bolero · Clutch complaint and tentative pickup next week', 'open', date '2026-03-24')
) as seed(id, customer_name, phone_number, vehicle_details, status, pickup_date)
cross join lateral (
  select id
  from public.profiles
  order by id asc
  limit 1
) as p
on conflict (id) do update
set
  customer_name = excluded.customer_name,
  phone_number = excluded.phone_number,
  vehicle_details = excluded.vehicle_details,
  status = excluded.status,
  pickup_date = excluded.pickup_date;
