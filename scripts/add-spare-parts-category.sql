alter table if exists public.spare_parts
  add column if not exists parts_category text not null default 'others';
