create table if not exists public.otp_verifications (
  id uuid default gen_random_uuid() primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  purpose text not null,
  otp_hash text not null,
  expires_at timestamp with time zone not null,
  consumed_at timestamp with time zone,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create index if not exists idx_otp_verifications_user_purpose on public.otp_verifications(user_id, purpose);
create index if not exists idx_otp_verifications_expires on public.otp_verifications(expires_at desc);
