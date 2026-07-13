import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

function loadEnv(path = '.env') {
  const out = {};
  const raw = fs.readFileSync(path, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const idx = t.indexOf('=');
    if (idx === -1) continue;
    out[t.slice(0, idx).trim()] = t.slice(idx + 1).trim();
  }
  return out;
}

const env = { ...process.env, ...loadEnv('.env') };
const DEFAULT_APP_URL = 'https://wms.siragirivel.in';
function resolveAppUrl(value) {
  const normalized = String(value || '').trim().replace(/\/+$/, '');
  if (!normalized) return DEFAULT_APP_URL;
  try {
    const parsed = new URL(normalized);
    if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') {
      return DEFAULT_APP_URL;
    }
    return parsed.toString().replace(/\/+$/, '');
  } catch {
    return DEFAULT_APP_URL;
  }
}
const APP_URL = resolveAppUrl(env.NEXT_PUBLIC_APP_URL);
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const TARGET = 'srinithinoffl@gmail.com';

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
function wrapHtml(content) {
  return `<!doctype html><html><body style="margin:0;padding:0;background:#f8fafc;font-family:Arial,Helvetica,sans-serif;color:#0f172a;"><table width="100%" cellpadding="0" cellspacing="0" style="padding:24px 12px;"><tr><td align="center"><table width="640" cellpadding="0" cellspacing="0" style="max-width:640px;background:#ffffff;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden;"><tr><td style="background:#0f172a;color:#ffffff;padding:16px 24px;font-size:14px;font-weight:700;letter-spacing:0.3px;">SIRAGIRI VEL AUTOMOBILES WMS</td></tr><tr><td style="padding:24px;line-height:1.55;font-size:14px;color:#0f172a;">${content}</td></tr><tr><td style="padding:14px 24px;border-top:1px solid #e2e8f0;color:#64748b;font-size:12px;">Sent from wms@siragirivel.in</td></tr></table></td></tr></table></body></html>`;
}
function renderList(items) {
  if (!items.length) return '<p style="margin:8px 0 0;color:#64748b;font-size:13px;">No active notifications in this section.</p>';
  return `<ul style="list-style:none;margin:10px 0 0;padding:0;">${items.map((i) => `<li style="margin:0 0 8px;padding:10px 12px;border:1px solid #e2e8f0;border-radius:10px;background:#ffffff;">${escapeHtml(i)}</li>`).join('')}</ul>`;
}

function parseCreditPaymentSourceId(note = '') {
  const m = String(note).match(/credit_payment_for:([a-z0-9-]+)/i);
  return m?.[1] || null;
}
function parseModeFromNote(note = '') {
  return String(note).toLowerCase().includes('mode: credit') ? 'credit' : 'cash_carry';
}
function extractOdoReading(source = '') {
  const m = String(source).match(/odometer:\s*([\d,]+)(?:\s*km)?/i);
  if (!m?.[1]) return null;
  const parsed = Number(m[1].replace(/,/g, ''));
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}
function addMonths(date, months) {
  const d = new Date(date);
  const day = d.getDate();
  d.setMonth(d.getMonth() + months);
  if (d.getDate() < day) d.setDate(0);
  return d;
}
function ymd(date) {
  const d = new Date(date);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function formatGeneratedAt(date) {
  const d = new Date(date);
  const p = (n) => String(n).padStart(2, '0');
  const hh = d.getHours();
  const ampm = hh >= 12 ? 'PM' : 'AM';
  return `${d.getDate()} ${d.toLocaleString('en-US', { month: 'short' })} ${d.getFullYear()}, ${p(hh)}:${p(d.getMinutes())} ${ampm}`;
}
function diffCalDays(a, b) {
  const da = new Date(a.getFullYear(), a.getMonth(), a.getDate());
  const db = new Date(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((da - db) / 86400000);
}

const [partsResponse, enquiriesResponse, invoicesResponse, transactionsResponse] = await Promise.all([
  supabase.from('spare_parts').select('id, name, stock, threshold, cost'),
  supabase.from('enquiries').select('id, customer_name, phone_number, pickup_date, status'),
  supabase.from('invoices').select('id, invoice_number, vehicle_id, created_at, note, vehicles(car_id, owner_name)').order('created_at', { ascending: false }),
  supabase.from('transactions').select('id, description, amount, type, date, created_at, note').order('date', { ascending: false }).order('created_at', { ascending: false }),
]);

if (partsResponse.error || enquiriesResponse.error || invoicesResponse.error || transactionsResponse.error) {
  console.error(JSON.stringify({
    parts: partsResponse.error?.message,
    enquiries: enquiriesResponse.error?.message,
    invoices: invoicesResponse.error?.message,
    transactions: transactionsResponse.error?.message,
  }, null, 2));
  process.exit(1);
}

const lowStockItems = (partsResponse.data || []).filter((item) => Number(item.stock || 0) <= Number(item.threshold || 0));
const today = ymd(new Date());
const openEnquiries = (enquiriesResponse.data || []).filter((row) => row.status === 'open');
const pickupOverdue = openEnquiries.filter((row) => row.pickup_date && row.pickup_date < today);

const invoices = invoicesResponse.data || [];
const latestByVehicle = new Map();
for (const invoice of invoices) {
  const vehicleId = String(invoice.vehicle_id || '');
  if (!vehicleId || latestByVehicle.has(vehicleId)) continue;
  latestByVehicle.set(vehicleId, invoice);
}

const serviceAlerts = Array.from(latestByVehicle.values())
  .map((invoice) => {
    const nextServiceDate = addMonths(new Date(invoice.created_at), 6);
    return {
      invoiceNumber: String(invoice.invoice_number || '—'),
      carId: String(invoice.vehicles?.car_id || '—'),
      ownerName: String(invoice.vehicles?.owner_name || 'Vehicle'),
      nextServiceDate,
      nextServiceOdo: extractOdoReading(invoice.note || '') || null,
      daysLeft: diffCalDays(nextServiceDate, new Date()),
    };
  })
  .filter((item) => item.daysLeft <= 7)
  .sort((a, b) => a.daysLeft - b.daysLeft);

const allTransactions = transactionsResponse.data || [];
const paymentsBySource = new Map();
for (const txn of allTransactions) {
  const sourceId = parseCreditPaymentSourceId(txn.note);
  if (!sourceId) continue;
  paymentsBySource.set(sourceId, (paymentsBySource.get(sourceId) || 0) + Math.max(0, Number(txn.amount || 0)));
}
const creditDueItems = allTransactions
  .filter((txn) => {
    const desc = String(txn.description || '').toLowerCase();
    return txn.type === 'debit' && desc.includes('spare parts purchase') && !desc.includes('credit payment -') && parseModeFromNote(txn.note) === 'credit';
  })
  .map((purchase) => {
    const originalAmount = Math.max(0, Number(purchase.amount || 0));
    const paidAmount = Math.max(0, paymentsBySource.get(purchase.id) || 0);
    const pendingAmount = Math.max(originalAmount - paidAmount, 0);
    return { description: purchase.description, pendingAmount };
  })
  .filter((item) => item.pendingAmount > 0);

const startDate = ymd(new Date(Date.now() - (6 * 24 * 60 * 60 * 1000)));
const weeklyTransactions = allTransactions.filter((txn) => {
  const date = String(txn.date || '').slice(0, 10);
  return date >= startDate && date <= today;
});

const lowStockDetails = lowStockItems.map((item) => `${item.name} (Stock ${item.stock}, Threshold ${item.threshold})`).slice(0, 5);
const creditDueDetails = creditDueItems.map((item) => `${item.description} (Pending ₹${Math.round(item.pendingAmount).toLocaleString('en-IN')})`).slice(0, 5);
const pickupOverdueDetails = pickupOverdue.map((item) => `${item.customer_name} · ${item.phone_number} · Pickup ${item.pickup_date || 'N/A'}`).slice(0, 5);
const openEnquiryDetails = openEnquiries.map((item) => `${item.customer_name} · ${item.phone_number} · Pickup ${item.pickup_date || 'Not set'}`).slice(0, 5);
const serviceDueDetails = serviceAlerts.map((item) => `${item.carId} (${item.ownerName}) · Invoice ${item.invoiceNumber} · ${item.daysLeft} day(s) left${item.nextServiceOdo ? ` · Next ODO ${item.nextServiceOdo.toLocaleString('en-IN')} km` : ''}`).slice(0, 5);

const generatedAt = formatGeneratedAt(new Date());
const loginUrl = `${APP_URL}/login`;

const html = wrapHtml(`
  <div style="margin:0 0 14px;">
    <h2 style="margin:0;font-size:22px;line-height:1.25;">Workshop Alerts</h2>
    <p style="margin:8px 0 0;color:#475569;">Generated at ${escapeHtml(generatedAt)}</p>
  </div>

  <table cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 18px;">
    <tr>
      <td style="width:50%;padding:0 6px 10px 0;">
        <div style="border:1px solid #e2e8f0;border-radius:12px;padding:12px;background:#f8fafc;">
          <div style="font-size:12px;color:#64748b;margin:0 0 4px;">Low Stock</div>
          <div style="font-size:22px;font-weight:700;">${lowStockItems.length}</div>
        </div>
      </td>
      <td style="width:50%;padding:0 0 10px 6px;">
        <div style="border:1px solid #e2e8f0;border-radius:12px;padding:12px;background:#f8fafc;">
          <div style="font-size:12px;color:#64748b;margin:0 0 4px;">Credit Due</div>
          <div style="font-size:22px;font-weight:700;">${creditDueItems.length}</div>
        </div>
      </td>
    </tr>
    <tr>
      <td style="width:50%;padding:0 6px 10px 0;">
        <div style="border:1px solid #e2e8f0;border-radius:12px;padding:12px;background:#f8fafc;">
          <div style="font-size:12px;color:#64748b;margin:0 0 4px;">Pickup Overdue</div>
          <div style="font-size:22px;font-weight:700;">${pickupOverdue.length}</div>
        </div>
      </td>
      <td style="width:50%;padding:0 0 10px 6px;">
        <div style="border:1px solid #e2e8f0;border-radius:12px;padding:12px;background:#f8fafc;">
          <div style="font-size:12px;color:#64748b;margin:0 0 4px;">Open Enquiries</div>
          <div style="font-size:22px;font-weight:700;">${openEnquiries.length}</div>
        </div>
      </td>
    </tr>
    <tr>
      <td style="width:50%;padding:0 6px 0 0;">
        <div style="border:1px solid #e2e8f0;border-radius:12px;padding:12px;background:#f8fafc;">
          <div style="font-size:12px;color:#64748b;margin:0 0 4px;">Service Due (7 Days)</div>
          <div style="font-size:22px;font-weight:700;">${serviceAlerts.length}</div>
        </div>
      </td>
      <td style="width:50%;padding:0 0 0 6px;">
        <div style="border:1px solid #e2e8f0;border-radius:12px;padding:12px;background:#f8fafc;">
          <div style="font-size:12px;color:#64748b;margin:0 0 4px;">Weekly Transactions</div>
          <div style="font-size:22px;font-weight:700;">${weeklyTransactions.length}</div>
        </div>
      </td>
    </tr>
  </table>

  <h3 style="margin:0 0 10px;font-size:16px;">Notification Details</h3>

  <div style="margin:0 0 14px;padding:12px;border:1px solid #e2e8f0;border-radius:12px;background:#f8fafc;">
    <p style="margin:0;font-weight:700;">Low stock (${lowStockItems.length})</p>
    ${renderList(lowStockDetails)}
  </div>
  <div style="margin:0 0 14px;padding:12px;border:1px solid #e2e8f0;border-radius:12px;background:#f8fafc;">
    <p style="margin:0;font-weight:700;">Credit due (${creditDueItems.length})</p>
    ${renderList(creditDueDetails)}
  </div>
  <div style="margin:0 0 14px;padding:12px;border:1px solid #e2e8f0;border-radius:12px;background:#f8fafc;">
    <p style="margin:0;font-weight:700;">Pickup overdue (${pickupOverdue.length})</p>
    ${renderList(pickupOverdueDetails)}
  </div>
  <div style="margin:0 0 14px;padding:12px;border:1px solid #e2e8f0;border-radius:12px;background:#f8fafc;">
    <p style="margin:0;font-weight:700;">Open enquiries (${openEnquiries.length})</p>
    ${renderList(openEnquiryDetails)}
  </div>
  <div style="margin:0 0 16px;padding:12px;border:1px solid #e2e8f0;border-radius:12px;background:#f8fafc;">
    <p style="margin:0;font-weight:700;">Service due (${serviceAlerts.length})</p>
    ${renderList(serviceDueDetails)}
  </div>
  <p style="margin:0 0 14px;color:#475569;">The weekly CSV report is attached to this email.</p>
  <p style="margin:0;"><a href="${escapeHtml(loginUrl)}" style="display:inline-block;background:#0f172a;color:#ffffff;text-decoration:none;padding:10px 14px;border-radius:8px;font-weight:700;">Open WMS Dashboard</a></p>
`);

const text = [
  'Workshop alerts and weekly report',
  `Generated at: ${generatedAt}`,
  `Low stock alerts: ${lowStockItems.length}`,
  `Credit dues: ${creditDueItems.length}`,
  `Pickup overdue: ${pickupOverdue.length}`,
  `Open enquiries: ${openEnquiries.length}`,
  `Service due within 7 days: ${serviceAlerts.length}`,
  `Weekly transactions: ${weeklyTransactions.length}`,
  '',
  'Low stock details:',
  lowStockDetails.join('\n') || 'None',
  '',
  'Credit due details:',
  creditDueDetails.join('\n') || 'None',
  '',
  'Pickup overdue details:',
  pickupOverdueDetails.join('\n') || 'None',
  '',
  'Open enquiry details:',
  openEnquiryDetails.join('\n') || 'None',
  '',
  'Service due details:',
  serviceDueDetails.join('\n') || 'None',
  '',
  `Dashboard: ${loginUrl}`,
].join('\n');

const response = await fetch('https://api.resend.com/emails', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${env.RESEND_API_KEY}`,
  },
  body: JSON.stringify({
    from: env.RESEND_FROM_EMAIL || 'wms@siragirivel.in',
    to: [TARGET],
    subject: 'Workshop alerts and weekly report',
    html,
    text,
  }),
});

const body = await response.json().catch(() => ({}));
console.log(JSON.stringify({
  ok: response.ok,
  status: response.status,
  id: body?.id || null,
  error: body?.error?.message || body?.message || null,
  to: TARGET,
}, null, 2));
