"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  CalendarDays,
  Info,
  Landmark,
  Plus,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { format } from "date-fns";
import { supabase } from "@/lib/supabase";

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

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MAX_CHART_VALUE = 50000;

function formatAmount(value: number) {
  return `₹${Math.round(value).toLocaleString("en-IN")}`;
}

function formatSignedAmount(value: number) {
  const prefix = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${prefix}${formatAmount(Math.abs(value))}`;
}

function formatModeLabel(mode: PaymentMode) {
  return mode === "cash" ? "CASH" : "EFT";
}

function getTxnDate(txn: TransactionRow) {
  return txn.date || txn.created_at;
}

export default function AccountsPage() {
  const [transactions, setTransactions] = useState<TransactionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterType>("all");

  useEffect(() => {
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
      const txnDate = new Date(getTxnDate(txn));
      const txnDay = format(txnDate, "yyyy-MM-dd");

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
    });

    const monthly = MONTHS.map((_, index) => monthlyMap.get(index)!);
    const totalIncomeYear = monthly.reduce((sum, month) => sum + month.income, 0);
    const totalExpenseYear = monthly.reduce((sum, month) => sum + month.expense, 0);

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
    };
  }, [todayKey, transactions]);

  const recentTransactions = useMemo(() => {
    const filtered =
      filter === "all"
        ? transactions
        : transactions.filter((txn) => txn.type === filter);

    return filtered.slice(0, 10);
  }, [filter, transactions]);

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

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
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
            gridTemplateColumns: "1fr 300px",
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
                  bottom: 24,
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                }}
              >
                {[50000, 37500, 25000, 12500, 0].map((value) => (
                  <span
                    key={value}
                    style={{
                      fontSize: 9,
                      color: "var(--accounts-hint)",
                      fontFamily: "var(--accounts-mono)",
                    }}
                  >
                    {value === 0 ? "0" : `${Math.round(value / 1000)}K`}
                  </span>
                ))}
              </div>

              <div
                style={{
                  display: "flex",
                  alignItems: "flex-end",
                  gap: 10,
                  height: 160,
                  paddingBottom: 24,
                  position: "relative",
                  background:
                    "repeating-linear-gradient(to bottom, transparent, transparent calc(25% - 0.5px), var(--accounts-border) calc(25% - 0.5px), var(--accounts-border) 25%)",
                  backgroundSize: "100% calc(100% - 24px)",
                  backgroundRepeat: "no-repeat",
                }}
              >
                {metrics.monthly.map((month) => {
                  const incomeHeight = month.income
                    ? Math.max(4, Math.round((month.income / MAX_CHART_VALUE) * 136))
                    : 0;
                  const expenseHeight = month.expense
                    ? Math.max(4, Math.round((month.expense / MAX_CHART_VALUE) * 136))
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
  );
}
