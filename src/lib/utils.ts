import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
  }).format(amount);
}

function getFinancialYearStart(date = new Date()) {
  const year = date.getFullYear();
  const monthIndex = date.getMonth();
  return monthIndex >= 3 ? year : year - 1;
}

export function createInvoicePrefix(date = new Date()) {
  const month = date.toLocaleString('en', { month: 'short' }).toUpperCase();
  const financialYear = getFinancialYearStart(date);

  return `SRV/${month}/${financialYear}/`;
}

export function createInvoiceNumber(count = 1, date = new Date()) {
  return `${createInvoicePrefix(date)}${String(count).padStart(3, '0')}`;
}

export function createQuotationNumber(count = 1, date = new Date()) {
  const month = date.toLocaleString('en', { month: 'short' }).toUpperCase();
  const year = date.getFullYear();

  return `QTN/${month}/${year}/${String(count).padStart(3, '0')}`;
}

export function createVehicleId(count = 1, date = new Date()) {
  const year = date.getFullYear();

  return `SGV-${year}-${String(count).padStart(3, '0')}`;
}
