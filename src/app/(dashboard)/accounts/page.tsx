"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Building2,
  CalendarDays,
  FileText,
  Info,
  Landmark,
  Plus,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { format } from "date-fns";
import { supabase } from "@/lib/supabase";
import { logActivity } from "@/lib/activity-log";
import { computeCreditPendingRows, extractCreditPaymentSourceId } from "@/lib/vendor-credit";

type TxnType = "credit" | "debit";
type PaymentMode = "cash" | "upi" | "card" | "cheque";
type FilterType = "all" | TxnType;

interface TransactionRow {
  id: string;
  description: string;
  amount: number;
  type: TxnType;
  payment_mode: PaymentMode;
  date: string;
  created_at: string;
  note?: string | null;
}

interface MonthSummary {
  month: string;
  income: number;
  expense: number;
}

interface CreditDueRow {
  id: string;
  description: string;
  seller: string;
  partNames: string[];
  date: string;
  originalAmount: number;
  paidAmount: number;
  pendingAmount: number;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DEFAULT_CHART_MAX = 50000;
const CHART_HEIGHT = 160;
const CHART_PADDING_BOTTOM = 24;
const BAR_MAX_HEIGHT = CHART_HEIGHT - CHART_PADDING_BOTTOM;

function formatAmount(value: number) {
  return `₹${Math.round(value).toLocaleString("en-IN")}`;
}

function formatSignedAmount(value: number) {
  const prefix = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${prefix}${formatAmount(Math.abs(value))}`;
}

function formatAxisValue(value: number) {
  if (value >= 1000000) {
    const formatted = (value / 1000000).toFixed(1).replace(/\.0$/, "");
    return `${formatted}M`;
  }
  if (value >= 1000) {
    const formatted = (value / 1000).toFixed(value % 1000 === 0 ? 0 : 1).replace(/\.0$/, "");
    return `${formatted}K`;
  }
  return String(Math.round(value));
}

function formatModeLabel(mode: PaymentMode) {
  return mode === "cash" ? "CASH" : "EFT";
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

function isCreditPurchaseMode(note?: string | null) {
  return (note || "").toLowerCase().includes("mode: credit");
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

function playCreditDueTone() {
  if (typeof window === "undefined") return;
  const audioWindow = window as Window & {
    AudioContext?: typeof AudioContext;
    webkitAudioContext?: typeof AudioContext;
  };
  const AudioContextClass =
    audioWindow.AudioContext || audioWindow.webkitAudioContext;
  if (!AudioContextClass) return;

  const context = new AudioContextClass();
  const now = context.currentTime;
  const beep = (time: number, frequency: number, duration: number) => {
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.type = "sine";
    osc.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(0.09, time + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    osc.connect(gain);
    gain.connect(context.destination);
    osc.start(time);
    osc.stop(time + duration + 0.02);
  };

  beep(now + 0.02, 880, 0.12);
  beep(now + 0.22, 660, 0.16);
}

export default function AccountsPage() {
  const [transactions, setTransactions] = useState<TransactionRow[]>([]);
  const [invoiceOutstanding, setInvoiceOutstanding] = useState({
    total: 0,
    count: 0,
  });
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterType>("all");
  const [creditNoticeShown, setCreditNoticeShown] = useState(false);
  const [payingCreditId, setPayingCreditId] = useState<string | null>(null);
  const [selectedCreditSeller, setSelectedCreditSeller] = useState<string>("");
  const [creditSellerQuery, setCreditSellerQuery] = useState("");
  const [creditSellerSort, setCreditSellerSort] = useState<"due_desc" | "name_asc">("due_desc");
  const [creditDetailPage, setCreditDetailPage] = useState(1);

  const loadTransactions = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("transactions")
      .select("id, description, amount, type, payment_mode, date, created_at, note")
      .order("date", { ascending: false })
      .order("created_at", { ascending: false });

    const { data: invoices, error: invoicesError } = await supabase
      .from("invoices")
      .select("id, outstanding_amount");

    if (!error && data) {
      setTransactions(
        data.map((row) => ({
          ...row,
          amount: Number(row.amount),
        })),
      );
    }

    if (!invoicesError && invoices) {
      const summary = invoices.reduce(
        (acc, invoice) => {
          const outstandingAmount = Math.max(0, Number(invoice.outstanding_amount || 0));
          if (outstandingAmount > 0) {
            acc.total += outstandingAmount;
            acc.count += 1;
          }
          return acc;
        },
        { total: 0, count: 0 },
      );
      setInvoiceOutstanding(summary);
    }

    setLoading(false);
  };

  useEffect(() => {
    void loadTransactions();
  }, []);

  const todayKey = format(new Date(), "yyyy-MM-dd");
  const todayLabel = format(new Date(), "dd MMM yyyy");

  const metrics = useMemo(() => {
    let pettyCash = 0;
    let bankBalance = 0;
    let cashInToday = 0;
    let cashOutToday = 0;
    let bankInToday = 0;
    let bankOutToday = 0;
    let totalIncomeToday = 0;
    let totalExpenseToday = 0;
    let creditCountToday = 0;
    let debitCountToday = 0;

    const monthlyMap = new Map<number, MonthSummary>(
      MONTHS.map((month, index) => [index, { month, income: 0, expense: 0 }]),
    );

    transactions.forEach((txn) => {
      const amount = Number(txn.amount || 0);
      const isCredit = txn.type === "credit";
      const isCash = txn.payment_mode === "cash";
      const isCreditPurchase = isCreditPurchaseTransaction(txn);
      const skipBalanceImpact = isCreditPurchaseMode(txn.note);
      const txnDate = new Date(getTxnDate(txn));
      const txnDay = format(txnDate, "yyyy-MM-dd");

      if (!skipBalanceImpact) {
        if (isCash) {
          pettyCash += isCredit ? amount : -amount;
        } else {
          bankBalance += isCredit ? amount : -amount;
        }

        if (txnDate.getFullYear() === new Date().getFullYear()) {
          const entry = monthlyMap.get(txnDate.getMonth());
          if (entry) {
            if (isCredit) {
              entry.income += amount;
            } else {
              entry.expense += amount;
            }
          }
        }

        if (txnDay === todayKey) {
          if (isCredit) {
            totalIncomeToday += amount;
            creditCountToday += 1;
            if (isCash) {
              cashInToday += amount;
            } else {
              bankInToday += amount;
            }
          } else {
            totalExpenseToday += amount;
            debitCountToday += 1;
            if (isCash) {
              cashOutToday += amount;
            } else {
              bankOutToday += amount;
            }
          }
        }
      }
    });

    const monthly = MONTHS.map((_, index) => monthlyMap.get(index)!);
    const totalIncomeYear = monthly.reduce((sum, month) => sum + month.income, 0);
    const totalExpenseYear = monthly.reduce((sum, month) => sum + month.expense, 0);

    const creditPurchases = transactions.filter(isCreditPurchaseTransaction);
    const creditPendingRows: CreditDueRow[] = computeCreditPendingRows(
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
    const creditOutstandingTotal = creditPendingRows.reduce((sum, row) => sum + row.pendingAmount, 0);

    return {
      pettyCash,
      bankBalance,
      cashInToday,
      cashOutToday,
      bankInToday,
      bankOutToday,
      cashNetToday: cashInToday - cashOutToday,
      bankNetToday: bankInToday - bankOutToday,
      totalIncomeToday,
      totalExpenseToday,
      netToday: totalIncomeToday - totalExpenseToday,
      transactionsToday: creditCountToday + debitCountToday,
      creditCountToday,
      debitCountToday,
      monthly,
      totalIncomeYear,
      totalExpenseYear,
      netYear: totalIncomeYear - totalExpenseYear,
      creditPendingRows,
      creditOutstandingTotal,
    };
  }, [todayKey, transactions]);

  const recentTransactions = useMemo(() => {
    const filtered =
      filter === "all"
        ? transactions
        : transactions.filter((txn) => txn.type === filter);

    return filtered.slice(0, 10);
  }, [filter, transactions]);

  const creditSellerSummary = useMemo(() => {
    const summary = new Map<string, { seller: string; totalPending: number; rows: CreditDueRow[] }>();
    metrics.creditPendingRows.forEach((row) => {
      const seller = row.seller || "—";
      const current = summary.get(seller) || { seller, totalPending: 0, rows: [] };
      current.totalPending += Number(row.pendingAmount || 0);
      current.rows.push(row);
      summary.set(seller, current);
    });
    return Array.from(summary.values());
  }, [metrics.creditPendingRows]);

  const filteredCreditSellerSummary = useMemo(() => {
    const query = creditSellerQuery.trim().toLowerCase();
    const base = creditSellerSummary.filter((row) =>
      !query ? true : row.seller.toLowerCase().includes(query),
    );
    if (creditSellerSort === "name_asc") {
      return [...base].sort((a, b) => a.seller.localeCompare(b.seller));
    }
    return [...base].sort((a, b) => b.totalPending - a.totalPending);
  }, [creditSellerQuery, creditSellerSort, creditSellerSummary]);

  const selectedCreditSellerGroup = useMemo(
    () =>
      filteredCreditSellerSummary.find((group) => group.seller === selectedCreditSeller) || null,
    [filteredCreditSellerSummary, selectedCreditSeller],
  );

  const CREDIT_DETAIL_PAGE_SIZE = 20;
  const creditDetailTotalPages = selectedCreditSellerGroup
    ? Math.max(1, Math.ceil(selectedCreditSellerGroup.rows.length / CREDIT_DETAIL_PAGE_SIZE))
    : 1;
  const pagedCreditSellerRows = selectedCreditSellerGroup
    ? selectedCreditSellerGroup.rows.slice(
        (creditDetailPage - 1) * CREDIT_DETAIL_PAGE_SIZE,
        creditDetailPage * CREDIT_DETAIL_PAGE_SIZE,
      )
    : [];

  useEffect(() => {
    setCreditDetailPage(1);
  }, [selectedCreditSeller]);

  const chartMax = useMemo(() => {
    const rawMax = metrics.monthly.reduce(
      (max, month) => Math.max(max, month.income, month.expense),
      0,
    );
    if (rawMax <= 0) return DEFAULT_CHART_MAX;
    const magnitude = Math.pow(10, Math.floor(Math.log10(rawMax)));
    const normalized = rawMax / magnitude;
    const nice =
      normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
    return nice * magnitude;
  }, [metrics.monthly]);

  const chartTicks = useMemo(() => {
    const step = chartMax / 4;
    return [chartMax, chartMax - step, chartMax - 2 * step, chartMax - 3 * step, 0];
  }, [chartMax]);

  useEffect(() => {
    if (metrics.creditOutstandingTotal <= 0 || creditNoticeShown) return;
    const today = format(new Date(), "yyyy-MM-dd");
    const key = "accounts_credit_due_notified_date";
    const alreadyNotifiedToday =
      typeof window !== "undefined" && window.localStorage.getItem(key) === today;
    if (alreadyNotifiedToday) return;

    playCreditDueTone();
    if (typeof window !== "undefined") {
      window.localStorage.setItem(key, today);
    }
    setCreditNoticeShown(true);
  }, [creditNoticeShown, metrics.creditOutstandingTotal]);

  const markCreditDueAsPaid = async (
    dueRow: CreditDueRow,
    paymentMode: "cash" | "upi",
  ) => {
    if (dueRow.pendingAmount <= 0) return;
    try {
      setPayingCreditId(dueRow.id);
      const { data: auth } = await supabase.auth.getUser();
      const username =
        String(auth.user?.user_metadata?.username || "").trim() || "User";
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
    <div className="min-h-screen bg-[#f4f6fb] p-5">
      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=DM+Mono:wght@400;500;600&display=swap');

        :root {
          --accounts-accent: #6366f1;
          --accounts-accent-dim: rgba(99, 102, 241, 0.08);
          --accounts-accent-bd: rgba(99, 102, 241, 0.18);
          --accounts-text: #111827;
          --accounts-muted: #6b7280;
          --accounts-hint: #9ca3af;
          --accounts-border: #e5e7eb;
          --accounts-bg: #f9fafb;
          --accounts-card: #ffffff;
          --accounts-green: #16a34a;
          --accounts-green-dim: rgba(22, 163, 74, 0.08);
          --accounts-red: #dc2626;
          --accounts-red-dim: rgba(220, 38, 38, 0.08);
          --accounts-amber: #d97706;
          --accounts-amber-dim: rgba(217, 119, 6, 0.08);
          --accounts-font: 'DM Sans', sans-serif;
          --accounts-mono: 'DM Mono', monospace;
        }
      `}</style>

      <div
        style={{
          borderRadius: 28,
          border: "1px solid #e2e8f0",
          background: "#ffffff",
          boxShadow: "0 24px 60px rgba(15,23,42,0.07)",
          minHeight: "calc(100vh - 40px)",
        }}
      >
      <div
        style={{
          padding: 40,
          maxWidth: 1120,
          fontFamily: "var(--accounts-font)",
          color: "var(--accounts-text)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "space-between",
            marginBottom: 28,
            gap: 16,
            flexWrap: "wrap",
          }}
        >
          <div>
            <h1
              style={{
                fontSize: 24,
                fontWeight: 600,
                letterSpacing: "-0.3px",
              }}
            >
              Accounts
            </h1>
            <p style={{ fontSize: 14, color: "var(--accounts-muted)", marginTop: 4 }}>
              Balance overview and transaction history
            </p>
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <span
              style={{
                fontSize: 12,
                color: "var(--accounts-hint)",
                fontFamily: "var(--accounts-mono)",
              }}
            >
              {format(new Date(), "dd MMM yyyy")} · {format(new Date(), "EEEE")}
            </span>
            <Link
              href="/daybook/history"
              style={{
                height: 40,
                padding: "0 16px",
                borderRadius: 10,
                border: "1px solid var(--accounts-border)",
                display: "inline-flex",
                alignItems: "center",
                textDecoration: "none",
                color: "var(--accounts-muted)",
                fontSize: 13,
                fontWeight: 600,
                background: "#ffffff",
              }}
            >
              View Day Book
            </Link>
            <Link
              href="/daybook"
              style={{
                height: 40,
                padding: "0 16px",
                borderRadius: 10,
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                textDecoration: "none",
                color: "#ffffff",
                fontSize: 13,
                fontWeight: 600,
                background: "#4f46e5",
                boxShadow: "0 8px 18px rgba(79,70,229,0.18)",
              }}
            >
              <Plus size={14} />
              New Entry
            </Link>
          </div>
        </div>

        {metrics.creditOutstandingTotal > 0 ? (
          <div
            style={{
              marginBottom: 16,
              borderRadius: 12,
              border: "1px solid #f5c27d",
              background: "#fff7ed",
              color: "#9a3412",
              padding: "12px 14px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 600 }}>
              Credit Due Alert: {formatAmount(metrics.creditOutstandingTotal)} pending to pay
            </div>
            <div style={{ fontSize: 11, color: "#b45309" }}>
              Daily sound reminder enabled for pending credit dues
            </div>
            <Link
              href="/accounts/credit-management"
              style={{
                height: 32,
                padding: "0 12px",
                borderRadius: 8,
                border: "1px solid #fdba74",
                background: "#ffffff",
                color: "#9a3412",
                fontSize: 12,
                fontWeight: 700,
                textDecoration: "none",
                display: "inline-flex",
                alignItems: "center",
              }}
            >
              Open Credit Management
            </Link>
            <Link
              href="/accounts/vendors"
              style={{
                height: 32,
                padding: "0 12px",
                borderRadius: 8,
                border: "1px solid #c7d2fe",
                background: "#eef2ff",
                color: "#4338ca",
                fontSize: 12,
                fontWeight: 700,
                textDecoration: "none",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <Building2 className="h-3.5 w-3.5" />
              Vendors
            </Link>
          </div>
        ) : null}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
            gap: 16,
            marginBottom: 20,
          }}
        >
          <div
            style={{
              background: "var(--accounts-card)",
              borderRadius: 14,
              border: "1px solid var(--accounts-border)",
              padding: "22px 24px",
              position: "relative",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                height: 3,
                background: "var(--accounts-amber)",
              }}
            />
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 10,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: 14,
                background: "var(--accounts-amber-dim)",
              }}
            >
              <Wallet size={20} color="#d97706" />
            </div>
            <div
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: "var(--accounts-hint)",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                marginBottom: 6,
              }}
            >
              Petty Cash
            </div>
            <div
              style={{
                fontSize: 32,
                fontWeight: 700,
                fontFamily: "var(--accounts-mono)",
                letterSpacing: "-0.04em",
                lineHeight: 1,
                color: "var(--accounts-amber)",
              }}
            >
              {formatAmount(metrics.pettyCash)}
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                marginTop: 10,
                flexWrap: "wrap",
              }}
            >
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  fontSize: 11,
                  fontWeight: 500,
                  padding: "3px 9px",
                  borderRadius: 20,
                  background: "#dcfce7",
                  color: "#15803d",
                }}
              >
                <TrendingUp size={10} />
                +{formatAmount(metrics.cashInToday)} in
              </span>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  fontSize: 11,
                  fontWeight: 500,
                  padding: "3px 9px",
                  borderRadius: 20,
                  background: "#fee2e2",
                  color: "#dc2626",
                }}
              >
                <TrendingDown size={10} />
                −{formatAmount(metrics.cashOutToday)} out
              </span>
            </div>
            <div
              style={{
                fontSize: 11,
                color: "var(--accounts-hint)",
                marginTop: 8,
                display: "flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              <Info size={11} />
              Cash transactions only · Updated today
            </div>
          </div>

          <div
            style={{
              background: "var(--accounts-card)",
              borderRadius: 14,
              border: "1px solid var(--accounts-border)",
              padding: "22px 24px",
              position: "relative",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                height: 3,
                background: "var(--accounts-green)",
              }}
            />
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 10,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: 14,
                background: "var(--accounts-green-dim)",
              }}
            >
              <Landmark size={20} color="#16a34a" />
            </div>
            <div
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: "var(--accounts-hint)",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                marginBottom: 6,
              }}
            >
              Bank Account
            </div>
            <div
              style={{
                fontSize: 32,
                fontWeight: 700,
                fontFamily: "var(--accounts-mono)",
                letterSpacing: "-0.04em",
                lineHeight: 1,
                color: "var(--accounts-green)",
              }}
            >
              {formatAmount(metrics.bankBalance)}
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                marginTop: 10,
                flexWrap: "wrap",
              }}
            >
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  fontSize: 11,
                  fontWeight: 500,
                  padding: "3px 9px",
                  borderRadius: 20,
                  background: "#dcfce7",
                  color: "#15803d",
                }}
              >
                <TrendingUp size={10} />
                +{formatAmount(metrics.bankInToday)} in
              </span>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  fontSize: 11,
                  fontWeight: 500,
                  padding: "3px 9px",
                  borderRadius: 20,
                  background: "#fee2e2",
                  color: "#dc2626",
                }}
              >
                <TrendingDown size={10} />
                −{formatAmount(metrics.bankOutToday)} out
              </span>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  fontSize: 11,
                  fontWeight: 500,
                  padding: "3px 9px",
                  borderRadius: 20,
                  background: "var(--accounts-accent-dim)",
                  color: "var(--accounts-accent)",
                }}
              >
                Today net {formatSignedAmount(metrics.bankNetToday)}
              </span>
            </div>
            <div
              style={{
                fontSize: 11,
                color: "var(--accounts-hint)",
                marginTop: 8,
                display: "flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              <Info size={11} />
              EFT transactions
            </div>
          </div>

          <div
            style={{
              background: "var(--accounts-card)",
              borderRadius: 14,
              border: "1px solid var(--accounts-border)",
              padding: "22px 24px",
              position: "relative",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                height: 3,
                background: "var(--accounts-accent)",
              }}
            />
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 10,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: 14,
                background: "var(--accounts-accent-dim)",
              }}
            >
              <FileText size={20} color="#6366f1" />
            </div>
            <div
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: "var(--accounts-hint)",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                marginBottom: 6,
              }}
            >
              Total Outstanding
            </div>
            <div
              style={{
                fontSize: 32,
                fontWeight: 700,
                fontFamily: "var(--accounts-mono)",
                letterSpacing: "-0.04em",
                lineHeight: 1,
                color: "var(--accounts-accent)",
              }}
            >
              {formatAmount(invoiceOutstanding.total)}
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                marginTop: 10,
                flexWrap: "wrap",
              }}
            >
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  fontSize: 11,
                  fontWeight: 500,
                  padding: "3px 9px",
                  borderRadius: 20,
                  background: "var(--accounts-accent-dim)",
                  color: "var(--accounts-accent)",
                }}
              >
                {invoiceOutstanding.count} open invoice{invoiceOutstanding.count === 1 ? "" : "s"}
              </span>
              <Link
                href="/billing"
                style={{
                  fontSize: 11,
                  color: "var(--accounts-accent)",
                  textDecoration: "none",
                  fontWeight: 600,
                }}
              >
                Open billing
              </Link>
            </div>
            <div
              style={{
                fontSize: 11,
                color: "var(--accounts-hint)",
                marginTop: 8,
                display: "flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              <Info size={11} />
              Sum of invoice outstanding amounts
            </div>
          </div>
        </div>

        <div
          style={{
            background: "var(--accounts-card)",
            borderRadius: 14,
            border: "1px solid var(--accounts-border)",
            padding: "20px 24px",
            marginBottom: 20,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 18,
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <div
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: "var(--accounts-text)",
                display: "flex",
                alignItems: "center",
                gap: 7,
              }}
            >
              <CalendarDays size={14} color="#6366f1" />
              Today&apos;s Summary
            </div>
            <span
              style={{
                fontSize: 11,
                fontWeight: 500,
                color: "var(--accounts-accent)",
                background: "var(--accounts-accent-dim)",
                padding: "3px 10px",
                borderRadius: 20,
                fontFamily: "var(--accounts-mono)",
              }}
            >
              {todayLabel}
            </span>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, 1fr)",
            }}
          >
            {[
              {
                label: "Total Income",
                value: formatAmount(metrics.totalIncomeToday),
                color: "#16a34a",
                sub: `${metrics.creditCountToday} transactions in`,
              },
              {
                label: "Total Expense",
                value: formatAmount(metrics.totalExpenseToday),
                color: "#dc2626",
                sub: `${metrics.debitCountToday} transactions out`,
              },
              {
                label: "Net Today",
                value: formatSignedAmount(metrics.netToday),
                color: "#6366f1",
                sub: "Cash + Bank combined",
              },
              {
                label: "Transactions",
                value: String(metrics.transactionsToday),
                color: "#111827",
                sub: `${metrics.debitCountToday} debit · ${metrics.creditCountToday} credit`,
              },
            ].map((stat, index) => (
              <div
                key={stat.label}
                style={{
                  padding: index === 0 ? "0 20px 0 0" : "0 20px",
                  borderRight:
                    index === 3 ? "none" : "1px solid var(--accounts-border)",
                }}
              >
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    color: "var(--accounts-hint)",
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    marginBottom: 6,
                  }}
                >
                  {stat.label}
                </div>
                <div
                  style={{
                    fontSize: 20,
                    fontWeight: 700,
                    fontFamily: "var(--accounts-mono)",
                    letterSpacing: "-0.03em",
                    color: stat.color,
                  }}
                >
                  {stat.value}
                </div>
                <div
                  style={{
                    fontSize: 11,
                    color: "var(--accounts-hint)",
                    marginTop: 3,
                  }}
                >
                  {stat.sub}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 420px",
            gap: 16,
          }}
        >
          <div
            style={{
              background: "var(--accounts-card)",
              borderRadius: 14,
              border: "1px solid var(--accounts-border)",
              padding: "20px 24px",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 20,
                gap: 16,
                flexWrap: "wrap",
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 600 }}>
                Monthly Overview — {format(new Date(), "yyyy")}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 5,
                    fontSize: 11,
                    color: "var(--accounts-muted)",
                  }}
                >
                  <div
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background: "#16a34a",
                    }}
                  />
                  Income
                </div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 5,
                    fontSize: 11,
                    color: "var(--accounts-muted)",
                  }}
                >
                  <div
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background: "#dc2626",
                    }}
                  />
                  Expense
                </div>
              </div>
            </div>

            <div style={{ position: "relative", paddingLeft: 40 }}>
              <div
                style={{
                  position: "absolute",
                  left: 0,
                  top: 0,
                  bottom: CHART_PADDING_BOTTOM,
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                }}
              >
                {chartTicks.map((value) => (
                  <span
                    key={value}
                    style={{
                      fontSize: 9,
                      color: "var(--accounts-hint)",
                      fontFamily: "var(--accounts-mono)",
                    }}
                  >
                    {formatAxisValue(value)}
                  </span>
                ))}
              </div>

              <div
                style={{
                  display: "flex",
                  alignItems: "flex-end",
                  gap: 10,
                  height: CHART_HEIGHT,
                  paddingBottom: CHART_PADDING_BOTTOM,
                  position: "relative",
                  background:
                    "repeating-linear-gradient(to bottom, transparent, transparent calc(25% - 0.5px), var(--accounts-border) calc(25% - 0.5px), var(--accounts-border) 25%)",
                  backgroundSize: `100% calc(100% - ${CHART_PADDING_BOTTOM}px)`,
                  backgroundRepeat: "no-repeat",
                }}
              >
                {metrics.monthly.map((month) => {
                  const incomeHeight = month.income
                    ? Math.min(
                        BAR_MAX_HEIGHT,
                        Math.max(4, Math.round((month.income / chartMax) * BAR_MAX_HEIGHT))
                      )
                    : 0;
                  const expenseHeight = month.expense
                    ? Math.min(
                        BAR_MAX_HEIGHT,
                        Math.max(4, Math.round((month.expense / chartMax) * BAR_MAX_HEIGHT))
                      )
                    : 0;

                  return (
                    <div
                      key={month.month}
                      style={{
                        flex: 1,
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: 3,
                        height: "100%",
                        justifyContent: "flex-end",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "flex-end",
                          gap: 2,
                          width: "100%",
                          justifyContent: "center",
                        }}
                      >
                        <div
                          title={month.income ? formatAmount(month.income) : ""}
                          style={{
                            width: 14,
                            height: incomeHeight || 0,
                            minHeight: month.income ? 4 : 0,
                            borderRadius: "4px 4px 0 0",
                            background: "#16a34a",
                          }}
                        />
                        <div
                          title={month.expense ? formatAmount(month.expense) : ""}
                          style={{
                            width: 14,
                            height: expenseHeight || 0,
                            minHeight: month.expense ? 4 : 0,
                            borderRadius: "4px 4px 0 0",
                            background: "#dc2626",
                          }}
                        />
                      </div>
                      <div
                        style={{
                          fontSize: 9,
                          color: "var(--accounts-hint)",
                          fontFamily: "var(--accounts-mono)",
                          textAlign: "center",
                        }}
                      >
                        {month.month}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginTop: 14,
                paddingTop: 12,
                borderTop: "1px solid var(--accounts-border)",
                gap: 16,
              }}
            >
              <div>
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    color: "var(--accounts-hint)",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    marginBottom: 3,
                  }}
                >
                  Total Income ({format(new Date(), "yyyy")})
                </div>
                <div
                  style={{
                    fontSize: 16,
                    fontWeight: 700,
                    fontFamily: "var(--accounts-mono)",
                    color: "#16a34a",
                  }}
                >
                  {formatAmount(metrics.totalIncomeYear)}
                </div>
              </div>
              <div style={{ textAlign: "center" }}>
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    color: "var(--accounts-hint)",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    marginBottom: 3,
                  }}
                >
                  Net Profit
                </div>
                <div
                  style={{
                    fontSize: 16,
                    fontWeight: 700,
                    fontFamily: "var(--accounts-mono)",
                    color: "#6366f1",
                  }}
                >
                  {formatSignedAmount(metrics.netYear)}
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    color: "var(--accounts-hint)",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    marginBottom: 3,
                  }}
                >
                  Total Expense ({format(new Date(), "yyyy")})
                </div>
                <div
                  style={{
                    fontSize: 16,
                    fontWeight: 700,
                    fontFamily: "var(--accounts-mono)",
                    color: "#dc2626",
                  }}
                >
                  {formatAmount(metrics.totalExpenseYear)}
                </div>
              </div>
            </div>
          </div>

          <div style={{ display: "grid", gap: 14 }}>
            <div
              style={{
                background: "var(--accounts-card)",
                borderRadius: 14,
                border: "1px solid var(--accounts-border)",
                padding: "18px",
                backgroundImage: "linear-gradient(180deg, #ffffff 0%, #fafcff 100%)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 10 }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: "#0f172a" }}>Credit Management</div>
                <div style={{ fontSize: 13, fontFamily: "var(--accounts-mono)", color: "#b45309", fontWeight: 700 }}>
                  {formatAmount(metrics.creditOutstandingTotal)}
                </div>
              </div>
              <div style={{ marginBottom: 10 }}>
                <Link
                  href="/accounts/credit-management"
                  style={{
                    border: "1px solid #c7d2fe",
                    background: "#eef2ff",
                    color: "#3730a3",
                    borderRadius: 8,
                    padding: "7px 10px",
                    textDecoration: "none",
                    fontSize: 12,
                    fontWeight: 700,
                    display: "inline-flex",
                    alignItems: "center",
                  }}
                >
                  Open full page
                </Link>
              </div>
              {metrics.creditPendingRows.length > 0 ? (
                <>
                  <div style={{ display: "grid", gap: 8, marginBottom: 12, gridTemplateColumns: "1fr 170px" }}>
                    <input
                      type="text"
                      placeholder="Search seller..."
                      value={creditSellerQuery}
                      onChange={(event) => setCreditSellerQuery(event.target.value)}
                      style={{
                        width: "100%",
                        border: "1px solid #e2e8f0",
                        borderRadius: 8,
                        padding: "10px 12px",
                        fontSize: 13,
                        outline: "none",
                      }}
                    />
                    <select
                      value={creditSellerSort}
                      onChange={(event) => setCreditSellerSort(event.target.value as "due_desc" | "name_asc")}
                      style={{
                        width: "100%",
                        border: "1px solid #e2e8f0",
                        borderRadius: 8,
                        padding: "10px 12px",
                        fontSize: 13,
                        outline: "none",
                      }}
                    >
                      <option value="due_desc">Sort: Highest Due</option>
                      <option value="name_asc">Sort: Seller Name</option>
                    </select>
                  </div>
                  <div style={{ maxHeight: 280, overflowY: "auto", border: "1px solid #e2e8f0", borderRadius: 10, padding: 8, background: "#ffffff" }}>
                    <div style={{ display: "grid", gap: 6 }}>
                      {filteredCreditSellerSummary.map((sellerRow) => (
                        <button
                          key={sellerRow.seller}
                          type="button"
                          onClick={() => setSelectedCreditSeller(sellerRow.seller)}
                          style={{
                            border: selectedCreditSeller === sellerRow.seller ? "1px solid #6366f1" : "1px solid #e2e8f0",
                            background: selectedCreditSeller === sellerRow.seller ? "#eef2ff" : "#ffffff",
                            borderRadius: 8,
                            padding: "10px 11px",
                            textAlign: "left",
                            cursor: "pointer",
                          }}
                        >
                          <div style={{ fontSize: 12, fontWeight: 700, color: "#0f172a" }}>{sellerRow.seller}</div>
                          <div style={{ fontSize: 11, marginTop: 2, color: "#64748b", fontFamily: "var(--accounts-mono)" }}>
                            {formatAmount(sellerRow.totalPending)}
                          </div>
                        </button>
                      ))}
                      {filteredCreditSellerSummary.length === 0 ? (
                        <div style={{ fontSize: 11, color: "var(--accounts-muted)", padding: "4px 2px" }}>
                          No sellers found.
                        </div>
                      ) : null}
                    </div>
                  </div>
                  <div style={{ marginTop: 8 }}>
                    {selectedCreditSellerGroup ? (
                      <div style={{ border: "1px solid #e2e8f0", borderRadius: 10, padding: 12, background: "#ffffff" }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: "#0f172a", marginBottom: 8 }}>
                          {selectedCreditSellerGroup.seller} · {formatAmount(selectedCreditSellerGroup.totalPending)}
                        </div>
                        <div style={{ display: "grid", gap: 7, maxHeight: 280, overflowY: "auto" }}>
                          {pagedCreditSellerRows.map((row) => (
                            <div key={row.id} style={{ border: "1px solid #e2e8f0", borderRadius: 8, background: "#f8fafc", padding: 10 }}>
                              <div style={{ fontSize: 11, color: "#334155" }}>
                                Due {formatAmount(row.pendingAmount)} · {format(new Date(row.date), "dd MMM")}
                              </div>
                              <div style={{ marginTop: 5, display: "flex", gap: 6 }}>
                                <button
                                  type="button"
                                  onClick={() => void markCreditDueAsPaid(row, "cash")}
                                  disabled={payingCreditId === row.id}
                                  style={{
                                    border: "1px solid #86efac",
                                    background: "#dcfce7",
                                    color: "#166534",
                                    borderRadius: 7,
                                    fontSize: 11,
                                    fontWeight: 600,
                                    padding: "6px 10px",
                                    cursor: payingCreditId === row.id ? "not-allowed" : "pointer",
                                    opacity: payingCreditId === row.id ? 0.6 : 1,
                                  }}
                                >
                                  Pay Cash
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void markCreditDueAsPaid(row, "upi")}
                                  disabled={payingCreditId === row.id}
                                  style={{
                                    border: "1px solid #c7d2fe",
                                    background: "#eef2ff",
                                    color: "#3730a3",
                                    borderRadius: 7,
                                    fontSize: 11,
                                    fontWeight: 600,
                                    padding: "6px 10px",
                                    cursor: payingCreditId === row.id ? "not-allowed" : "pointer",
                                    opacity: payingCreditId === row.id ? 0.6 : 1,
                                  }}
                                >
                                  Pay EFT
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                        {creditDetailTotalPages > 1 ? (
                          <div style={{ marginTop: 8, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                            <div style={{ fontSize: 10, color: "#64748b" }}>
                              Page {creditDetailPage} of {creditDetailTotalPages}
                            </div>
                            <div style={{ display: "flex", gap: 6 }}>
                              <button
                                type="button"
                                onClick={() => setCreditDetailPage((current) => Math.max(1, current - 1))}
                                disabled={creditDetailPage <= 1}
                                style={{
                                  border: "1px solid #e2e8f0",
                                  background: "#ffffff",
                                  color: "#334155",
                                  borderRadius: 6,
                                  fontSize: 10,
                                  padding: "4px 8px",
                                  cursor: creditDetailPage <= 1 ? "not-allowed" : "pointer",
                                  opacity: creditDetailPage <= 1 ? 0.6 : 1,
                                }}
                              >
                                Prev
                              </button>
                              <button
                                type="button"
                                onClick={() => setCreditDetailPage((current) => Math.min(creditDetailTotalPages, current + 1))}
                                disabled={creditDetailPage >= creditDetailTotalPages}
                                style={{
                                  border: "1px solid #e2e8f0",
                                  background: "#ffffff",
                                  color: "#334155",
                                  borderRadius: 6,
                                  fontSize: 10,
                                  padding: "4px 8px",
                                  cursor: creditDetailPage >= creditDetailTotalPages ? "not-allowed" : "pointer",
                                  opacity: creditDetailPage >= creditDetailTotalPages ? 0.6 : 1,
                                }}
                              >
                                Next
                              </button>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    ) : (
                      <div style={{ fontSize: 11, color: "var(--accounts-muted)" }}>Select a seller to view details.</div>
                    )}
                  </div>
                </>
              ) : (
                <div style={{ fontSize: 11, color: "var(--accounts-muted)" }}>
                  No pending credit dues.
                </div>
              )}
            </div>

            <div
              style={{
                background: "var(--accounts-card)",
                borderRadius: 14,
                border: "1px solid var(--accounts-border)",
                padding: "14px",
              }}
            >
              <div style={{ fontSize: 14, fontWeight: 600, color: "#0f172a", marginBottom: 10 }}>
                Bank Account
              </div>
              <div
                style={{
                  fontSize: 24,
                  fontWeight: 700,
                  fontFamily: "var(--accounts-mono)",
                  letterSpacing: "-0.03em",
                  color: "#16a34a",
                  marginBottom: 10,
                }}
              >
                {formatAmount(metrics.bankBalance)}
              </div>
              <div style={{ display: "grid", gap: 8 }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    border: "1px solid #dcfce7",
                    background: "#f0fdf4",
                    borderRadius: 8,
                    padding: "8px 10px",
                  }}
                >
                  <span style={{ fontSize: 11, color: "#166534", fontWeight: 600 }}>Today In</span>
                  <span style={{ fontSize: 11, color: "#166534", fontFamily: "var(--accounts-mono)", fontWeight: 700 }}>
                    +{formatAmount(metrics.bankInToday)}
                  </span>
                </div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    border: "1px solid #fee2e2",
                    background: "#fef2f2",
                    borderRadius: 8,
                    padding: "8px 10px",
                  }}
                >
                  <span style={{ fontSize: 11, color: "#b91c1c", fontWeight: 600 }}>Today Out</span>
                  <span style={{ fontSize: 11, color: "#b91c1c", fontFamily: "var(--accounts-mono)", fontWeight: 700 }}>
                    -{formatAmount(metrics.bankOutToday)}
                  </span>
                </div>
                <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>
                  Net Today: <strong>{formatSignedAmount(metrics.bankNetToday)}</strong>
                </div>
              </div>
            </div>

            <div
              style={{
                background: "var(--accounts-card)",
                borderRadius: 14,
                border: "1px solid var(--accounts-border)",
                overflow: "hidden",
              }}
            >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "16px 18px",
                borderBottom: "1px solid var(--accounts-border)",
                gap: 8,
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 600 }}>Recent Transactions</div>
              <div
                style={{
                  display: "flex",
                  gap: 4,
                  background: "var(--accounts-bg)",
                  border: "1px solid var(--accounts-border)",
                  borderRadius: 8,
                  padding: 2,
                }}
              >
                {[
                  { label: "All", value: "all" as const },
                  { label: "In", value: "credit" as const },
                  { label: "Out", value: "debit" as const },
                ].map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() => setFilter(item.value)}
                    style={{
                      padding: "4px 10px",
                      fontSize: 11,
                      fontWeight: 500,
                      borderRadius: 6,
                      border: "none",
                      cursor: "pointer",
                      fontFamily: "var(--accounts-font)",
                      color:
                        filter === item.value
                          ? "var(--accounts-text)"
                          : "var(--accounts-muted)",
                      background:
                        filter === item.value
                          ? "var(--accounts-card)"
                          : "transparent",
                      boxShadow:
                        filter === item.value
                          ? "0 1px 3px rgba(0,0,0,0.08)"
                          : "none",
                    }}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            <div
              style={{
                maxHeight: 320,
                overflowY: "auto",
              }}
            >
              {loading ? (
                <div
                  style={{
                    padding: "20px 18px",
                    fontSize: 12,
                    color: "var(--accounts-muted)",
                  }}
                >
                  Loading transactions…
                </div>
              ) : recentTransactions.length > 0 ? (
                recentTransactions.map((txn) => {
                  const isCredit = txn.type === "credit";
                  const amountColor = isCredit ? "#16a34a" : "#dc2626";
                  const prefix = isCredit ? "+" : "−";
                  const modeClass =
                    txn.payment_mode === "cash"
                      ? { bg: "#dcfce7", color: "#15803d" }
                      : { bg: "var(--accounts-accent-dim)", color: "var(--accounts-accent)" };

                  return (
                    <div
                      key={txn.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        padding: "12px 18px",
                        borderBottom: "1px solid #f9fafb",
                      }}
                    >
                      <div
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: "50%",
                          flexShrink: 0,
                          background: amountColor,
                        }}
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            fontSize: 13,
                            fontWeight: 500,
                            color: "var(--accounts-text)",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {txn.description}
                        </div>
                        <div
                          style={{
                            fontSize: 11,
                            color: "var(--accounts-hint)",
                            marginTop: 1,
                            display: "flex",
                            alignItems: "center",
                            gap: 5,
                            flexWrap: "wrap",
                          }}
                        >
                          <span
                            style={{
                              display: "inline-flex",
                              fontSize: 9,
                              fontWeight: 600,
                              padding: "1px 6px",
                              borderRadius: 20,
                              background: modeClass.bg,
                              color: modeClass.color,
                            }}
                          >
                            {formatModeLabel(txn.payment_mode)}
                          </span>
                          {txn.note || `Recorded on ${format(new Date(getTxnDate(txn)), "dd MMM")}`}
                        </div>
                      </div>
                      <div style={{ textAlign: "right", flexShrink: 0 }}>
                        <div
                          style={{
                            fontSize: 13,
                            fontWeight: 700,
                            fontFamily: "var(--accounts-mono)",
                            color: amountColor,
                          }}
                        >
                          {prefix}
                          {formatAmount(txn.amount)}
                        </div>
                        <div
                          style={{
                            fontSize: 10,
                            color: "var(--accounts-hint)",
                            marginTop: 1,
                          }}
                        >
                          {format(new Date(getTxnDate(txn)), "dd MMM")}
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div
                  style={{
                    padding: "20px 18px",
                    fontSize: 12,
                    color: "var(--accounts-muted)",
                  }}
                >
                  No transactions found.
                </div>
              )}
            </div>

            <div
              style={{
                padding: "12px 18px",
                borderTop: "1px solid var(--accounts-border)",
                textAlign: "center",
              }}
            >
              <Link
                href="/daybook/history"
                style={{
                  fontSize: 12,
                  fontWeight: 500,
                  color: "var(--accounts-accent)",
                  textDecoration: "none",
                }}
              >
                View all in Day Book →
              </Link>
            </div>
          </div>
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}
