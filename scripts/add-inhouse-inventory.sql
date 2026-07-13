-- Add "Inhouse Inventory" as a permanent vehicle record
-- This allows assignments and tracking of internal spare stock
INSERT INTO public.vehicles (
  id,
  car_id,
  owner_name,
  phone_number,
  vehicle_reg,
  entry_date,
  make_model,
  status,
  work_description
) VALUES (
  gen_random_uuid(),
  'INHOUSE',
  'Inhouse Inventory',
  '—',
  'INTERNAL-INV',
  CURRENT_DATE,
  'Purpose',
  'Active',
  'System record for internal spare purposes'
) ON CONFLICT (car_id) DO NOTHING;
