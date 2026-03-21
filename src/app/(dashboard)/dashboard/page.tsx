"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { 
  Plus, 
  Car, 
  FileText, 
  FileSignature,
  Search, 
  TrendingUp, 
  Wallet, 
  Landmark,   Package, 
   CreditCard, 
   AlertTriangle,
   ClipboardList
 } from "lucide-react";
import { cn, createInvoiceNumber, createQuotationNumber, formatCurrency } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { format } from "date-fns";
import { useRouter } from "next/navigation";

export default function Dashboard() {
  const router = useRouter();
  const [spareStock, setSpareStock] = useState<Array<{
    id: string;
    name: string;
    stock: number;
    threshold: number;
    sell: number;
  }>>([]);
  const [finance, setFinance] = useState({
    pettyCash: 0,
    bankBalance: 0,
    totalInToday: 0,
    totalOutToday: 0,
    cashChangeToday: 0,
    bankChangeToday: 0
  });

  useEffect(() => {
    const loadDashboardData = async () => {
      try {
        const { data: parts } = await supabase
          .from("spare_parts")
          .select("*")
          .order("stock", { ascending: true })
          .limit(5);

        if (parts) setSpareStock(parts);

        const { data: txs } = await supabase
          .from("transactions")
          .select("*");

        if (txs) {
          const today = format(new Date(), "yyyy-MM-dd");

          let pc = 0;
          let bb = 0;
          let inToday = 0;
          let outToday = 0;
          let pcc = 0;
          let bbc = 0;

          txs.forEach((t) => {
            const isCash = t.payment_mode === "cash";
            const isCredit = t.type === "credit";
            const amt = Number(t.amount);

            if (isCash) {
              pc += isCredit ? amt : -amt;
            } else {
              bb += isCredit ? amt : -amt;
            }

            if (t.date === today) {
              if (isCredit) inToday += amt;
              else outToday += amt;

              if (isCash) pcc += isCredit ? amt : -amt;
              else bbc += isCredit ? amt : -amt;
            }
          });

          setFinance({
            pettyCash: pc,
            bankBalance: bb,
            totalInToday: inToday,
            totalOutToday: outToday,
            cashChangeToday: pcc,
            bankChangeToday: bbc,
          });
        }
      } catch (err) {
        console.error(err);
      }
    };

    void loadDashboardData();
  }, []);

  const QUICK_ACTIONS: Array<{
    label: string;
    sub: string;
    icon: typeof Car;
    href?: string;
    type?: "invoice" | "quotation" | "search";
    bg: string;
    color: string;
  }> = [
    { label: "New vehicle", sub: "Register car", icon: Car, href: "/vehicles/add-new", bg: "rgba(99,102,241,0.1)", color: "#6366f1" },
    { label: "New enquiry", sub: "Note details", icon: ClipboardList, href: "/enquiries/add-new", bg: "rgba(239,68,68,0.1)", color: "#ef4444" },
    { label: "New invoice", sub: "Create bill", icon: FileText, type: 'invoice', bg: "rgba(22,163,74,0.1)", color: "#16a34a" },
    { label: "New quotation", sub: "Send estimate", icon: FileSignature, type: 'quotation', bg: "rgba(124,58,237,0.1)", color: "#7c3aed" },
    { label: "Price search", sub: "Find part rates", icon: Search, type: 'search', bg: "rgba(245,158,11,0.1)", color: "#d97706" },
    { label: "Day book", sub: "Log transaction", icon: TrendingUp, href: "/daybook", bg: "rgba(14,165,233,0.1)", color: "#0ea5e9" },
    { label: "Day history", sub: "View ledger", icon: CreditCard, href: "/daybook/history", bg: "rgba(15,23,42,0.08)", color: "#334155" },
    { label: "Accounts", sub: "Balances", icon: Landmark, href: "/accounts", bg: "rgba(16,185,129,0.1)", color: "#059669" },
  ];

  const handleAction = async (action: (typeof QUICK_ACTIONS)[number]) => {
    if (action.type === 'search') {
      window.dispatchEvent(new CustomEvent("open-price-search"));
      return;
    }

    if (action.type === "invoice") {
      const now = new Date();
      const month = now.toLocaleString("en", { month: "short" }).toUpperCase();
      const year = now.getFullYear();
      const prefix = `SRV/${month}/${year}/`;

      const { count, error } = await supabase
        .from("invoices")
        .select("*", { count: "exact", head: true })
        .ilike("invoice_number", `${prefix}%`);

      if (error) {
        return;
      }

      router.push(`/billing/${createInvoiceNumber((count || 0) + 1, now)}`);
      return;
    }

    if (action.type === "quotation") {
      const now = new Date();
      const month = now.toLocaleString("en", { month: "short" }).toUpperCase();
      const year = now.getFullYear();
      const prefix = `QTN/${month}/${year}/`;

      const { count, error } = await supabase
        .from("quotations")
        .select("*", { count: "exact", head: true })
        .ilike("quotation_number", `${prefix}%`);

      if (error) {
        return;
      }

      router.push(`/quotations/${createQuotationNumber((count || 0) + 1, now)}`);
    }
  };

  return (
    <div className="flex flex-col gap-5 max-w-[1240px]">
      {/* Page Actions Header */}
      <div className="flex items-center justify-between mb-1">
        <div>
          <h2 className="text-[13px] font-bold text-slate-800 uppercase tracking-tight">Main Overview</h2>
          <p className="text-[11px] text-zinc-400">Welcome back, here&apos;s what&apos;s happening today.</p>
        </div>
        <Link href="/vehicles/add-new" className="flex items-center gap-1.5 px-4 h-[34px] bg-[#6366f1] text-white rounded-lg text-[12px] font-bold shadow-sm hover:opacity-90 active:scale-95 transition-all decoration-none">
          <Plus className="w-4 h-4" />
          New Vehicle
        </Link>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-[14px]">
          {/* Petty Cash Card */}
          <div className="bg-white rounded-[12px] border border-black/5 p-[18px_20px] relative overflow-hidden shadow-sm hover:shadow-md transition-shadow">
            <div className="absolute top-0 left-0 right-0 h-[3px] bg-amber-600" />
            <div className="w-9 h-9 rounded-[10px] bg-amber-50 flex items-center justify-center mb-3">
               <Wallet className="w-4.5 text-amber-600" />
            </div>
            <div className="text-[11px] font-semibold text-zinc-400 uppercase tracking-widest mb-1">Petty Cash</div>
            <div className="text-[26px] font-bold text-[#0f0f1a] tracking-tight leading-none mb-2">{formatCurrency(finance.pettyCash)}</div>
            <div className="flex items-center gap-1.5">
                <span className={cn(
                  "text-[10px] font-semibold px-2 py-0.5 rounded-full flex items-center gap-1",
                  finance.cashChangeToday >= 0 ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-600"
                )}>
                    {finance.cashChangeToday >= 0 ? "+" : ""}{formatCurrency(finance.cashChangeToday)} today
                </span>
                <span className="text-[9px] text-zinc-400 font-medium italic">Cash only</span>
            </div>
          </div>

          {/* Bank Account Card */}
          <div className="bg-white rounded-[12px] border border-black/5 p-[18px_20px] relative overflow-hidden shadow-sm hover:shadow-md transition-shadow">
            <div className="absolute top-0 left-0 right-0 h-[3px] bg-emerald-600" />
            <div className="w-9 h-9 rounded-[10px] bg-emerald-50 flex items-center justify-center mb-3">
               <Landmark className="w-4.5 text-emerald-600" />
            </div>
            <div className="text-[11px] font-semibold text-zinc-400 uppercase tracking-widest mb-1">Bank Account</div>
            <div className="text-[26px] font-bold text-[#0f0f1a] tracking-tight leading-none mb-2">{formatCurrency(finance.bankBalance)}</div>
            <div className="flex items-center gap-1.5">
                <span className={cn(
                  "text-[10px] font-semibold px-2 py-0.5 rounded-full",
                  finance.bankChangeToday >= 0 ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-600"
                )}>
                    {finance.bankChangeToday >= 0 ? "+" : ""}{formatCurrency(finance.bankChangeToday)} today
                </span>
                <span className="text-[9px] text-zinc-400 font-medium italic">EFT</span>
            </div>
          </div>
      </div>

      {/* Quick Actions Card */}
      <div className="bg-white rounded-[12px] border border-black/5 shadow-sm overflow-hidden">
        <div className="flex items-center gap-1.5 p-[14px_18px] border-b border-black/5 bg-zinc-50/30">
            <Plus className="w-3.5 text-indigo-500" />
            <span className="text-[13px] font-bold text-[#0f0f1a]">Quick actions</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 p-[14px_18px]">
            {QUICK_ACTIONS.map((action) => {
                const isBtn = !!action.type;
                const Content = (
                  <>
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center group-hover:shadow-sm" style={{ background: action.bg }}>
                        <action.icon className="w-4" style={{ color: action.color }} />
                    </div>
                    <div>
                        <div className="text-[12px] font-bold text-[#0f0f1a]">{action.label}</div>
                        <div className="text-[10px] text-zinc-400 font-medium">{action.sub}</div>
                    </div>
                  </>
                );
                
                const classes = "flex flex-col gap-2 p-3.5 rounded-[12px] border border-black/[0.04] hover:border-indigo-500 hover:bg-indigo-50/20 transition-all hover:-translate-y-0.5 group cursor-pointer decoration-none";

                return isBtn ? (
                  <div key={action.label} onClick={() => handleAction(action)} className={classes}>
                    {Content}
                  </div>
                ) : (
                  <Link key={action.label} href={action.href!} className={classes}>
                    {Content}
                  </Link>
                );
            })}
        </div>
      </div>

      {/* Grid: Parts + Accounts + Alerts */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-[14px] mb-4">
        
        {/* Spare Parts Stock */}
        <div className="bg-white rounded-[12px] border border-black/5 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between p-[14px_18px] border-b border-black/5">
                <div className="flex items-center gap-1.5">
                    <Package className="w-3.5 text-indigo-500" />
                    <span className="text-[13px] font-bold text-[#0f0f1a]">Spare parts stock</span>
                </div>
                <Link href="/inventory" className="text-[11px] font-semibold text-[#6366f1] hover:underline decoration-none">View all →</Link>
            </div>
            <div className="divide-y divide-black/[0.03]">
                {spareStock.map((p) => {
                  const isLow = p.stock <= p.threshold;
                  return (
                    <div key={p.id} className="flex items-center justify-between p-[10px_18px] hover:bg-slate-50/50">
                        <div>
                            <div className="text-[12px] font-bold text-[#0f0f1a]">{p.name}</div>
                            <div className={cn("text-[11px] mt-0.5", isLow ? "text-red-500 font-semibold" : "text-zinc-400")}>
                                {p.stock} units {isLow && " — Low ⚠"}
                            </div>
                        </div>
                        <div className="text-[12px] font-bold text-[#0f0f1a]">{formatCurrency(p.sell)}</div>
                    </div>
                  );
                })}
                {spareStock.length === 0 && (
                  <div className="p-10 text-center text-zinc-400 text-xs">No spare parts found</div>
                )}
            </div>
        </div>

        {/* Account Summary */}
        <div className="bg-white rounded-[12px] border border-black/5 shadow-sm overflow-hidden bg-gradient-to-b from-white to-zinc-50/30">
            <div className="flex items-center justify-between p-[14px_18px] border-b border-black/5">
                <div className="flex items-center gap-1.5">
                    <CreditCard className="w-3.5 text-indigo-500" />
                    <span className="text-[13px] font-bold text-[#0f0f1a]">Account summary</span>
                </div>
                <Link href="/accounts" className="text-[11px] font-semibold text-[#6366f1] hover:underline decoration-none">Open accounts →</Link>
            </div>
            <div className="p-[16px_18px] space-y-3">
                <div className="flex items-center justify-between p-3 rounded-[10px] border border-yellow-200 bg-yellow-50/40">
                    <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-lg bg-yellow-100 flex items-center justify-center">
                            <Wallet className="w-4.5 text-yellow-700" />
                        </div>
                        <div>
                            <div className="text-[12px] font-bold text-yellow-900">Petty Cash</div>
                            <div className="text-[10px] text-yellow-700/60 font-medium tracking-tight">Cash on hand</div>
                        </div>
                    </div>
                    <div className="text-right">
                        <div className="text-[15px] font-bold text-yellow-900 tracking-tight">{formatCurrency(finance.pettyCash)}</div>
                        <div className={cn("text-[9px] font-bold", finance.cashChangeToday < 0 ? "text-red-500" : "text-emerald-500")}>
                          {finance.cashChangeToday >= 0 ? "+" : ""}{formatCurrency(finance.cashChangeToday)} today
                        </div>
                    </div>
                </div>
                <div className="flex items-center justify-between p-3 rounded-[10px] border border-emerald-200 bg-emerald-50/40">
                    <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-lg bg-emerald-100 flex items-center justify-center">
                            <Landmark className="w-4.5 text-emerald-700" />
                        </div>
                        <div>
                            <div className="text-[12px] font-bold text-emerald-900">Bank Account</div>
                            <div className="text-[10px] text-emerald-700/60 font-medium tracking-tight">EFT</div>
                        </div>
                    </div>
                    <div className="text-right">
                        <div className="text-[15px] font-bold text-emerald-900 tracking-tight">{formatCurrency(finance.bankBalance)}</div>
                        <div className={cn("text-[9px] font-bold", finance.bankChangeToday < 0 ? "text-red-500" : "text-emerald-500")}>
                          {finance.bankChangeToday >= 0 ? "+" : ""}{formatCurrency(finance.bankChangeToday)} today
                        </div>
                    </div>
                </div>
            </div>
            {/* Today Summary Bar */}
            <div className="mx-[18px] bg-[#0f0f1a] rounded-[10px] grid grid-cols-3 divide-x divide-white/5 overflow-hidden">
                <div className="p-3">
                    <div className="text-[9px] font-bold text-white/30 uppercase tracking-[0.07em]">Total In</div>
                    <div className="text-[14px] font-bold text-emerald-300 font-mono mt-0.5 tracking-tight">₹{finance.totalInToday.toLocaleString()}</div>
                </div>
                <div className="p-3">
                    <div className="text-[9px] font-bold text-white/30 uppercase tracking-[0.07em]">Total Out</div>
                    <div className="text-[14px] font-bold text-red-300 font-mono mt-0.5 tracking-tight">₹{finance.totalOutToday.toLocaleString()}</div>
                </div>
                <div className="p-3">
                    <div className="text-[9px] font-bold text-white/30 uppercase tracking-[0.07em]">Net</div>
                    <div className="text-[14px] font-bold text-white font-mono mt-0.5 tracking-tight">₹{(finance.totalInToday - finance.totalOutToday).toLocaleString()}</div>
                </div>
            </div>
            <div className="h-4" />
        </div>

        {/* Low Stock Alerts */}
        <div className="bg-white rounded-[12px] border border-black/5 shadow-sm overflow-hidden flex flex-col">
            <div className="flex items-center justify-between p-[14px_18px] border-b border-black/5">
                <div className="flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 text-red-500" />
                    <span className="text-[13px] font-bold text-[#0f0f1a]">Low stock alerts</span>
                </div>
                <Link href="/inventory" className="text-[11px] font-semibold text-red-500 hover:underline decoration-none">Reorder all →</Link>
            </div>
            <div className="bg-red-50/30 p-2 px-[18px] border-b border-red-500/10">
                <span className="text-[10px] text-red-600 font-bold tracking-tight">
                  {spareStock.filter(p => p.stock <= p.threshold).length} items need attention
                </span>
            </div>
            <div className="divide-y divide-red-500/[0.04] overflow-y-auto custom-scrollbar flex-1 max-h-[220px]">
                {spareStock.filter(p => p.stock <= p.threshold).map((p) => (
                    <div key={p.id} className="flex items-center justify-between p-[10px_18px] hover:bg-red-50/10 transition-all">
                        <div className="flex items-center gap-2">
                            <div className="w-1.5 h-1.5 rounded-full bg-red-500" />
                            <div>
                                <div className="text-[12px] font-bold text-red-600 truncate max-w-[120px]">{p.name}</div>
                                <div className="text-[10px] text-zinc-400 font-medium">Only {p.stock} units left</div>
                            </div>
                        </div>
                        <button className="text-[10px] font-bold text-red-700 bg-white px-2.5 py-1 rounded-md border border-red-200 hover:bg-red-50 transition-all">
                            Reorder
                        </button>
                    </div>
                ))}
                {spareStock.filter(p => p.stock <= p.threshold).length === 0 && (
                  <div className="p-10 text-center text-zinc-300 text-xs italic">All stock levels healthy</div>
                )}
            </div>
        </div>
      </div>
    </div>
  );
}
