"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { Building2, FileText, Search, Users, Wallet } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { logActivity } from "@/lib/activity-log";
import { computeCreditPendingRows } from "@/lib/vendor-credit";

type PaymentMode = "cash" | "upi" | "card" | "cheque";
type TxnType = "credit" | "debit";

type TransactionRow = {
  id: string;
  description: string;
  amount: number;
  type: TxnType;
  payment_mode: PaymentMode;
  date: string;
  created_at: string;
  note?: string | null;
};

type CreditDueRow = {
  id: string;
  description: string;
  seller: string;
  partNames: string[];
  date: string;
  originalAmount: number;
  paidAmount: number;
  pendingAmount: number;
};

const PAGE_SIZE = 25;

function formatAmount(value: number) {
  return `₹${Math.round(value).toLocaleString("en-IN")}`;
}

function getTxnDate(txn: TransactionRow) {
  return txn.date || txn.created_at;
}

function isCreditPurchaseTransaction(txn: TransactionRow) {
  return (
    txn.type === "debit" &&
    txn.description.toLowerCase().includes("spare parts purchase") &&
    (txn.note || "").toLowerCase().includes("mode: credit")
  );
}

function extractSellerFromNote(note?: string | null) {
  const match = String(note || "").match(/Seller:\s*([^|]+)/i);
  return match?.[1]?.trim() || "—";
}

function extractPartsFromNote(note?: string | null) {
  const match = String(note || "").match(/Parts:\s*([^|]+)/i);
  if (!match?.[1]) return [] as string[];
  return match[1].split(",").map((item) => item.trim()).filter(Boolean);
}

export default function CreditManagementPage() {
  const [transactions, setTransactions] = useState<TransactionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [payingCreditId, setPayingCreditId] = useState<string | null>(null);
  const [sellerQuery, setSellerQuery] = useState("");
  const [sellerSort, setSellerSort] = useState<"due_desc" | "name_asc">("due_desc");
  const [selectedSeller, setSelectedSeller] = useState<string>("");
  const [detailPage, setDetailPage] = useState(1);

  const loadTransactions = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("transactions")
      .select("id, description, amount, type, payment_mode, date, created_at, note")
      .order("date", { ascending: false })
      .order("created_at", { ascending: false });

    if (!error && data) {
      setTransactions(
        data.map((row) => ({
          ...row,
          amount: Number(row.amount),
        })),
      );
    }
    setLoading(false);
  };

  useEffect(() => {
    void loadTransactions();
  }, []);

  const creditPendingRows = useMemo(() => {
    const creditPurchases = transactions.filter(isCreditPurchaseTransaction);
    return computeCreditPendingRows(
      creditPurchases.map((purchase) => ({
        id: purchase.id,
        description: purchase.description,
        seller: extractSellerFromNote(purchase.note),
        partNames: extractPartsFromNote(purchase.note),
        date: getTxnDate(purchase),
        originalAmount: Math.max(0, Number(purchase.amount || 0)),
      })),
      transactions,
    )
      .filter((row) => row.pendingAmount > 0)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [transactions]);

  const sellerSummary = useMemo(() => {
    const map = new Map<string, { seller: string; totalPending: number; rows: CreditDueRow[] }>();
    creditPendingRows.forEach((row) => {
      const seller = row.seller || "—";
      const current = map.get(seller) || { seller, totalPending: 0, rows: [] };
      current.totalPending += row.pendingAmount;
      current.rows.push(row);
      map.set(seller, current);
    });
    return Array.from(map.values());
  }, [creditPendingRows]);

  const filteredSellerSummary = useMemo(() => {
    const query = sellerQuery.trim().toLowerCase();
    const base = sellerSummary.filter((row) => (!query ? true : row.seller.toLowerCase().includes(query)));
    if (sellerSort === "name_asc") {
      return [...base].sort((a, b) => a.seller.localeCompare(b.seller));
    }
    return [...base].sort((a, b) => b.totalPending - a.totalPending);
  }, [sellerQuery, sellerSort, sellerSummary]);

  useEffect(() => {
    const exists = filteredSellerSummary.some((row) => row.seller === selectedSeller);
    if ((!selectedSeller || !exists) && filteredSellerSummary.length > 0) {
      setSelectedSeller(filteredSellerSummary[0].seller);
    }
  }, [filteredSellerSummary, selectedSeller]);

  const selectedSellerGroup = useMemo(
    () => filteredSellerSummary.find((group) => group.seller === selectedSeller) || null,
    [filteredSellerSummary, selectedSeller],
  );

  const detailTotalPages = selectedSellerGroup
    ? Math.max(1, Math.ceil(selectedSellerGroup.rows.length / PAGE_SIZE))
    : 1;

  const pagedRows = selectedSellerGroup
    ? selectedSellerGroup.rows.slice((detailPage - 1) * PAGE_SIZE, detailPage * PAGE_SIZE)
    : [];

  useEffect(() => {
    setDetailPage(1);
  }, [selectedSeller]);

  const totalOutstanding = useMemo(
    () => creditPendingRows.reduce((sum, row) => sum + row.pendingAmount, 0),
    [creditPendingRows],
  );

  const markCreditDueAsPaid = async (dueRow: CreditDueRow, paymentMode: "cash" | "upi") => {
    if (dueRow.pendingAmount <= 0) return;
    try {
      setPayingCreditId(dueRow.id);
      const { data: auth } = await supabase.auth.getUser();
      const username = String(auth.user?.user_metadata?.username || "").trim() || "User";
      const partsLabel = dueRow.partNames.length ? dueRow.partNames.join(", ") : "—";
      const description = `Credit Payment - ${dueRow.description} | Seller: ${dueRow.seller} | Parts: ${partsLabel}`;
      const today = format(new Date(), "yyyy-MM-dd");
      const note = `Ref: Credit dues payment | credit_payment_for:${dueRow.id}\nBy ${username} paid`;

      const { data: inserted, error } = await supabase
        .from("transactions")
        .insert([{
          description,
          amount: dueRow.pendingAmount,
          type: "debit",
          payment_mode: paymentMode,
          date: today,
          note,
          created_by: auth.user?.id,
        }])
        .select("id")
        .single();

      if (error) throw error;

      await logActivity({
        action: "create",
        entityType: "transaction",
        entityId: inserted?.id || dueRow.id,
        entityLabel: description,
        description: "Recorded credit dues payment",
        metadata: {
          credit_source_id: dueRow.id,
          amount: dueRow.pendingAmount,
          payment_mode: paymentMode,
          date: today,
        },
      });

      await loadTransactions();
    } finally {
      setPayingCreditId(null);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100/80 p-4 md:p-6">
      <div className="mx-auto max-w-[1380px] rounded-3xl border border-slate-200 bg-white p-4 shadow-[0_18px_45px_rgba(15,23,42,0.08)] md:p-6">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-black tracking-tight text-slate-900 md:text-3xl">Credit Management</h1>
            <p className="mt-1 text-sm text-slate-500">Seller-wise pending dues with quick payment actions</p>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/accounts" className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              Back to Accounts
            </Link>
            <Link href="/accounts/vendors" className="rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-100">
              <span className="inline-flex items-center gap-2">
                <Building2 className="h-4 w-4" />
                Vendors
              </span>
            </Link>
            <Link href="/daybook" className="rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-100">
              Add Day Book Entry
            </Link>
          </div>
        </div>

        <div className="mb-5 grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className="rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 to-white p-4">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-amber-700">
              <Wallet className="h-4 w-4" />
              Total Pending
            </div>
            <div className="mt-2 text-3xl font-black tracking-tight text-amber-800">{formatAmount(totalOutstanding)}</div>
          </div>
          <div className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-4">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-emerald-700">
              <Users className="h-4 w-4" />
              Sellers with Due
            </div>
            <div className="mt-2 text-3xl font-black text-emerald-800">{filteredSellerSummary.length}</div>
          </div>
          <div className="rounded-2xl border border-indigo-200 bg-gradient-to-br from-indigo-50 to-white p-4">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-indigo-700">
              <FileText className="h-4 w-4" />
              Pending Bills
            </div>
            <div className="mt-2 text-3xl font-black text-indigo-800">{creditPendingRows.length}</div>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[340px_minmax(0,1fr)]">
          <div className="rounded-2xl border border-slate-200 bg-white p-3">
            <div className="mb-3 grid gap-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search seller..."
                  className="w-full rounded-xl border border-slate-200 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-indigo-400"
                  value={sellerQuery}
                  onChange={(event) => setSellerQuery(event.target.value)}
                />
              </div>
              <select
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-indigo-400"
                value={sellerSort}
                onChange={(event) => setSellerSort(event.target.value as "due_desc" | "name_asc")}
              >
                <option value="due_desc">Sort: Highest Due</option>
                <option value="name_asc">Sort: Seller Name</option>
              </select>
            </div>
            <div className="max-h-[70vh] space-y-2 overflow-y-auto pr-1">
              {filteredSellerSummary.map((sellerRow) => (
                <button
                  key={sellerRow.seller}
                  type="button"
                  onClick={() => setSelectedSeller(sellerRow.seller)}
                  className={`w-full rounded-xl border px-3 py-2.5 text-left transition-all ${
                    selectedSeller === sellerRow.seller
                      ? "border-indigo-300 bg-indigo-50 shadow-sm"
                      : "border-slate-200 bg-white hover:bg-slate-50"
                  }`}
                >
                  <div className="text-sm font-bold text-slate-900">{sellerRow.seller}</div>
                  <div className="mt-1 flex items-center justify-between">
                    <span className="text-xs font-semibold text-amber-700">{formatAmount(sellerRow.totalPending)}</span>
                    <span className="text-[11px] text-slate-500">{sellerRow.rows.length} bill(s)</span>
                  </div>
                </button>
              ))}
              {!loading && filteredSellerSummary.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-center text-xs text-slate-500">
                  No pending sellers found.
                </div>
              ) : null}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            {!selectedSellerGroup ? (
              <div className="flex h-[70vh] items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 text-sm text-slate-500">
                Select a seller to view bills.
              </div>
            ) : (
              <div>
                <div className="mb-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-base font-bold text-slate-900">{selectedSellerGroup.seller}</div>
                    <div className="text-sm font-bold text-amber-700">
                      Total Due: {formatAmount(selectedSellerGroup.totalPending)}
                    </div>
                  </div>
                  <div className="mt-1 text-xs text-slate-500">{selectedSellerGroup.rows.length} pending bill(s)</div>
                </div>

                <div className="max-h-[62vh] space-y-3 overflow-y-auto pr-1">
                  {pagedRows.map((row) => (
                    <div key={row.id} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                      <div className="text-sm font-semibold text-slate-900">{row.description}</div>
                      <div className="mt-1 text-xs text-slate-600">
                        {format(new Date(row.date), "dd MMM yyyy")} · Due {formatAmount(row.pendingAmount)}
                      </div>
                      <div className="mt-1 text-xs text-slate-600">
                        Original {formatAmount(row.originalAmount)} · Paid {formatAmount(row.paidAmount)}
                      </div>
                      <div className="mt-1 text-xs text-slate-600">
                        Parts: {row.partNames.length ? row.partNames.join(", ") : "—"}
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => void markCreditDueAsPaid(row, "cash")}
                          disabled={payingCreditId === row.id}
                          className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          Pay Cash
                        </button>
                        <button
                          type="button"
                          onClick={() => void markCreditDueAsPaid(row, "upi")}
                          disabled={payingCreditId === row.id}
                          className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          Pay EFT
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {detailTotalPages > 1 ? (
                  <div className="mt-3 flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                    <div className="text-xs text-slate-500">
                      Page {detailPage} of {detailTotalPages}
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setDetailPage((current) => Math.max(1, current - 1))}
                        disabled={detailPage <= 1}
                        className="rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Prev
                      </button>
                      <button
                        type="button"
                        onClick={() => setDetailPage((current) => Math.min(detailTotalPages, current + 1))}
                        disabled={detailPage >= detailTotalPages}
                        className="rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
