-- Add dedicated car field for inventory spare parts and align spare_orders columns
alter table if exists public.spare_parts
  add column if not exists car_name text;

alter table if exists public.spare_orders
  add column if not exists bill_url text;

alter table if exists public.spare_orders
  add column if not exists status text not null default 'pending';

alter table if exists public.spare_orders
  add column if not exists created_by uuid references public.profiles(id);

-- Normalize old spare order statuses into the new UI statuses
update public.spare_orders
set status = case
  when lower(coalesce(status, '')) in ('completed', 'received') then 'completed'
  when lower(coalesce(status, '')) = 'rejected' then 'rejected'
  else 'pending'
end;

create index if not exists idx_spare_parts_car_name on public.spare_parts(car_name);
create index if not exists idx_spare_orders_status on public.spare_orders(status);
