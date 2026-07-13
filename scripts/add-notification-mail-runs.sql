create table if not exists public.notification_mail_runs (
  run_key text primary key,
  delivery_type text not null check (delivery_type in ('alerts', 'weekly-report', 'all')),
  run_date date not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create index if not exists idx_notification_mail_runs_date
  on public.notification_mail_runs(run_date desc);

