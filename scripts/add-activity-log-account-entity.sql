-- Allow account-related entries in activity_logs.entity_type
-- Safe to run multiple times.

do $$
declare
  constraint_row record;
begin
  for constraint_row in
    select conname
    from pg_constraint
    where conrelid = 'public.activity_logs'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%entity_type%'
  loop
    execute format(
      'alter table public.activity_logs drop constraint %I',
      constraint_row.conname
    );
  end loop;

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
        'quotation',
        'account'
      )
    );
end
$$;

