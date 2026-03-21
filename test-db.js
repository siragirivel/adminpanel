import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function check() {
  const { data: parts, error: partsErr } = await supabase.from('parts').select('*').limit(1);
  console.log("parts:", partsErr ? partsErr.message : parts);

  const { data: rawParts, error: rpErr } = await supabase.from('spare_parts').select('*').limit(1);
  console.log("spare_parts:", rpErr ? rpErr.message : rawParts);

  const { data: orders, error: ordersErr } = await supabase.from('orders').select('*').limit(1);
  console.log("orders:", ordersErr ? ordersErr.message : orders);
  
  const { data: rawOrders, error: roErr } = await supabase.from('spare_orders').select('*').limit(1);
  console.log("spare_orders:", roErr ? roErr.message : rawOrders);
}
check();
