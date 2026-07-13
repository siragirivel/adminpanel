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

alter table public.profiles
  add column if not exists created_at timestamp with time zone default timezone('utc'::text, now()) not null;

update public.profiles
set role = coalesce(role, 'owner')
where role is null;

update public.profiles
set access = coalesce(
  access,
  '{
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
  }'::jsonb
)
where access is null;
