export interface CreditPurchaseRow {
  id: string;
  seller: string;
  originalAmount: number;
  date: string;
}

export interface VendorPaymentTransactionRow {
  id?: string;
  type: "credit" | "debit";
  amount: number;
  note?: string | null;
}

export type CreditPurchaseWithPending<T extends CreditPurchaseRow> = T & {
  paidAmount: number;
  pendingAmount: number;
};

export function normalizeVendorKey(value?: string | null) {
  return String(value || "").trim().toLowerCase();
}

export function extractCreditPaymentSourceId(note?: string | null) {
  if (!note) return null;
  const match = String(note).match(/credit_payment_for:([a-z0-9-]+)/i);
  return match?.[1] || null;
}

export function extractVendorPaymentSellerKey(note?: string | null) {
  if (!note) return null;
  const match = String(note).match(/vendor_payment_for:([^\n|]+)/i);
  return normalizeVendorKey(match?.[1] || "");
}

export function computeCreditPendingRows<T extends CreditPurchaseRow>(
  purchases: T[],
  transactions: VendorPaymentTransactionRow[],
) {
  const paymentsBySource = new Map<string, number>();
  const vendorPaymentsBySeller = new Map<string, number>();

  transactions.forEach((txn) => {
    const amount = Math.max(0, Number(txn.amount || 0));
    if (amount <= 0 || txn.type !== "debit") {
      return;
    }

    const sourceId = extractCreditPaymentSourceId(txn.note);
    if (sourceId) {
      paymentsBySource.set(sourceId, (paymentsBySource.get(sourceId) || 0) + amount);
    }

    const sellerKey = extractVendorPaymentSellerKey(txn.note);
    if (sellerKey) {
      vendorPaymentsBySeller.set(sellerKey, (vendorPaymentsBySeller.get(sellerKey) || 0) + amount);
    }
  });

  const pendingRows = purchases
    .map((purchase) => {
      const directPaidAmount = Math.max(0, paymentsBySource.get(purchase.id) || 0);
      const remainingAfterDirect = Math.max(
        Math.max(0, Number(purchase.originalAmount || 0)) - directPaidAmount,
        0,
      );

      return {
        ...purchase,
        paidAmount: directPaidAmount,
        pendingAmount: remainingAfterDirect,
      } as CreditPurchaseWithPending<T>;
    })
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  pendingRows.forEach((row) => {
    const sellerKey = normalizeVendorKey(row.seller);
    if (!sellerKey || row.pendingAmount <= 0) {
      return;
    }

    const sellerPaymentBalance = vendorPaymentsBySeller.get(sellerKey) || 0;
    if (sellerPaymentBalance <= 0) {
      return;
    }

    const allocatedAmount = Math.min(row.pendingAmount, sellerPaymentBalance);
    row.paidAmount += allocatedAmount;
    row.pendingAmount -= allocatedAmount;
    vendorPaymentsBySeller.set(sellerKey, sellerPaymentBalance - allocatedAmount);
  });

  return pendingRows;
}
