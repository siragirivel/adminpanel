-- Add enquiry_date to enquiries for explicit enquiry logging date.
alter table if exists public.enquiries
add column if not exists enquiry_date date default current_date;

-- Backfill existing rows from created_at when enquiry_date is null.
update public.enquiries
set enquiry_date = created_at::date
where enquiry_date is null;

create index if not exists idx_enquiries_enquiry_date on public.enquiries(enquiry_date);
