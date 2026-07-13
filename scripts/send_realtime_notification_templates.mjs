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
    const key = t.slice(0, idx).trim();
    const val = t.slice(idx + 1).trim();
    out[key] = val;
  }
  return out;
}

const env = { ...process.env, ...loadEnv('.env') };
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const RESEND_API_KEY = env.RESEND_API_KEY;
const RESEND_FROM_EMAIL = env.RESEND_FROM_EMAIL || 'wms@siragirivel.in';
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
const TARGET = 'srinithinoffl@gmail.com';

if (!SUPABASE_URL || !SERVICE_KEY || !RESEND_API_KEY) {
  console.error('Missing required env vars');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function pad(n) { return String(n).padStart(2, '0'); }
function formatDate(date) {
  const d = new Date(date);
  return `${d.getDate()} ${d.toLocaleString('en-US', { month: 'short' })} ${d.getFullYear()}, ${pad(d.getHours())}:${pad(d.getMinutes())} ${d.getHours() >= 12 ? 'PM' : 'AM'}`;
}
function ymd(date) {
  const d = new Date(date);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function addMonths(date, months) {
  const d = new Date(date);
  const day = d.getDate();
  d.setMonth(d.getMonth() + months);
  if (d.getDate() < day) d.setDate(0);
  return d;
}
function diffCalDays(a, b) {
  const da = new Date(a.getFullYear(), a.getMonth(), a.getDate());
  const db = new Date(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((da - db) / 86400000);
}
function escapeCsv(value) {
  const text = String(value ?? '');
  if (!text.includes(',') && !text.includes('"') && !text.includes('\n')) return text;
  return `"${text.replace(/"/g, '""')}"`;
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

const PRODUCT_NAME = 'SIRAGIRI VEL AUTOMOBILES WMS';
function wrapHtml(content) {
  return `<!doctype html><html><body style="margin:0;padding:0;background:#f8fafc;font-family:Arial,Helvetica,sans-serif;color:#0f172a;"><table width="100%" cellpadding="0" cellspacing="0" style="padding:24px 12px;"><tr><td align="center"><table width="640" cellpadding="0" cellspacing="0" style="max-width:640px;background:#ffffff;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden;"><tr><td style="background:#0f172a;color:#ffffff;padding:16px 24px;font-size:14px;font-weight:700;letter-spacing:0.3px;">${PRODUCT_NAME}</td></tr><tr><td style="padding:24px;line-height:1.55;font-size:14px;color:#0f172a;">${content}</td></tr><tr><td style="padding:14px 24px;border-top:1px solid #e2e8f0;color:#64748b;font-size:12px;">Sent from wms@siragirivel.in</td></tr></table></td></tr></table></body></html>`;
}
function notificationDigestMail(input) {
  return {
    subject: 'Workshop alerts and weekly report',
    html: wrapHtml(`
      <h2 style="margin:0 0 10px;font-size:20px;">Alerts and weekly summary</h2>
      <p style="margin:0 0 14px;">Generated at ${input.generatedAt}.</p>
      <table cellpadding="0" cellspacing="0" style="margin:0 0 16px;">
        <tr><td style="padding:4px 0;"><strong>Low stock alerts:</strong> ${input.lowStockCount}</td></tr>
        <tr><td style="padding:4px 0;"><strong>Credit dues:</strong> ${input.creditDueCount}</td></tr>
        <tr><td style="padding:4px 0;"><strong>Pickup overdue:</strong> ${input.pickupOverdueCount}</td></tr>
        <tr><td style="padding:4px 0;"><strong>Open enquiries:</strong> ${input.openEnquiryCount}</td></tr>
        <tr><td style="padding:4px 0;"><strong>Service due within 7 days:</strong> ${input.serviceDueCount}</td></tr>
        <tr><td style="padding:4px 0;"><strong>Weekly transactions:</strong> ${input.weeklyTransactionCount}</td></tr>
      </table>
      <p style="margin:0 0 14px;">The weekly CSV report is attached to this email.</p>
      <p style="margin:0;"><a href="${input.loginUrl}" style="color:#1d4ed8;">Open WMS Dashboard</a></p>
    `),
    text:
      'Workshop alerts and weekly report\n' +
      `Generated at: ${input.generatedAt}\n` +
      `Low stock alerts: ${input.lowStockCount}\n` +
      `Credit dues: ${input.creditDueCount}\n` +
      `Pickup overdue: ${input.pickupOverdueCount}\n` +
      `Open enquiries: ${input.openEnquiryCount}\n` +
      `Service due within 7 days: ${input.serviceDueCount}\n` +
      `Weekly transactions: ${input.weeklyTransactionCount}\n` +
      `Dashboard: ${input.loginUrl}`,
  };
}

async function resendSend({subject, html, text, attachments}) {
  const payload = { from: RESEND_FROM_EMAIL, to: [TARGET], subject, html, text };
  if (attachments?.length) payload.attachments = attachments;
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${RESEND_API_KEY}` },
    body: JSON.stringify(payload),
  });
  const j = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, id: j.id || null, error: j?.error?.message || j?.message || null };
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
    const serviceDate = new Date(invoice.created_at);
    const nextDate = addMonths(serviceDate, 6);
    return {
      id: String(invoice.id),
      invoiceNumber: String(invoice.invoice_number || '—'),
      carId: String(invoice.vehicles?.car_id || '—'),
      ownerName: String(invoice.vehicles?.owner_name || 'Vehicle'),
      nextServiceDate: nextDate,
      nextServiceOdo: extractOdoReading(invoice.note || '') || null,
      daysLeft: diffCalDays(nextDate, new Date()),
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
    return {
      id: purchase.id,
      description: purchase.description,
      pendingAmount,
      date: purchase.date || String(purchase.created_at || '').split('T')[0] || '',
    };
  })
  .filter((item) => item.pendingAmount > 0);

const startDate = ymd(new Date(Date.now() - (6 * 24 * 60 * 60 * 1000)));
const weeklyTransactions = allTransactions.filter((txn) => {
  const date = String(txn.date || '').slice(0, 10);
  return date >= startDate && date <= today;
});

const csvRows = [];
csvRows.push(['Category', 'Title', 'Details', 'Amount', 'Date']);
lowStockItems.forEach((item) => csvRows.push(['Low Stock', item.name, `Stock ${item.stock} / Threshold ${item.threshold}`, Number(item.cost || 0), today]));
creditDueItems.forEach((item) => csvRows.push(['Credit Due', 'Pending vendor payment', item.description, item.pendingAmount, item.date || today]));
pickupOverdue.forEach((item) => csvRows.push(['Pickup Overdue', item.customer_name, `Phone ${item.phone_number} | Pickup ${item.pickup_date || 'N/A'}`, '', item.pickup_date || today]));
openEnquiries.forEach((item) => csvRows.push(['Open Enquiry', item.customer_name, `Phone ${item.phone_number} | Pickup ${item.pickup_date || 'Not set'}`, '', item.pickup_date || today]));
serviceAlerts.forEach((item) => csvRows.push(['Service Due', `${item.carId} - ${item.ownerName}`, `Invoice ${item.invoiceNumber} | Next ODO ${item.nextServiceOdo || 'N/A'} | ${item.daysLeft} day(s)`, '', ymd(item.nextServiceDate)]));
weeklyTransactions.forEach((item) => csvRows.push(['Weekly Transaction', item.type === 'credit' ? 'Money In' : 'Money Out', item.description, Number(item.amount || 0), item.date || today]));
const csvContent = csvRows.map((row) => row.map((cell) => escapeCsv(cell)).join(',')).join('\n');
const csvBase64 = Buffer.from(csvContent, 'utf8').toString('base64');

const digest = notificationDigestMail({
  generatedAt: formatDate(new Date()),
  lowStockCount: lowStockItems.length,
  creditDueCount: creditDueItems.length,
  pickupOverdueCount: pickupOverdue.length,
  openEnquiryCount: openEnquiries.length,
  serviceDueCount: serviceAlerts.length,
  weeklyTransactionCount: weeklyTransactions.length,
  loginUrl: `${APP_URL}/login`,
});

const results = [];
results.push({ template: 'alerts', ...(await resendSend({ subject: 'Workshop alerts notification', html: digest.html, text: digest.text })) });
results.push({ template: 'weekly-report', ...(await resendSend({ subject: 'Weekly workshop report (CSV)', html: digest.html, text: digest.text, attachments: [{ filename: `weekly-report-${today}.csv`, content: csvBase64, type: 'text/csv' }] })) });
results.push({ template: 'all', ...(await resendSend({ subject: digest.subject, html: digest.html, text: digest.text, attachments: [{ filename: `weekly-report-${today}.csv`, content: csvBase64, type: 'text/csv' }] })) });

console.log(JSON.stringify({ to: TARGET, summary: {
  lowStock: lowStockItems.length,
  creditDue: creditDueItems.length,
  pickupOverdue: pickupOverdue.length,
  openEnquiries: openEnquiries.length,
  serviceAlerts: serviceAlerts.length,
  weeklyTransactions: weeklyTransactions.length,
}, results }, null, 2));
