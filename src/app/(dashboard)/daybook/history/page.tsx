"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  Plus,
  Search,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Edit2,
  Trash2,
  X,
  FileText,
  Download,
} from "lucide-react";
import { format, startOfMonth } from "date-fns";
import toast from "react-hot-toast";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { logActivity } from "@/lib/activity-log";
import { ConfirmDeleteModal } from "@/components/ConfirmDeleteModal";
import Link from "next/link";

interface TransactionRow {
  id: string;
  description: string;
  type: "debit" | "credit";
  amount: number;
  payment_mode: "cash" | "upi" | "card" | "cheque";
  note?: string | null;
  date: string;
  created_at: string;
  profiles?: {
    username?: string;
  } | null;
}

type DayBookModeFilter = "cash" | "eft" | null;
type DayBookEditMode = "cash" | "eft";

function isCashMode(mode: TransactionRow["payment_mode"]) {
  return mode === "cash";
}

function getModeLabel(mode: TransactionRow["payment_mode"] | DayBookEditMode) {
  return mode === "cash" ? "Cash" : "EFT";
}

export default function DayBookHistoryPage() {
  const [data, setData] = useState<TransactionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingEntry, setEditingEntry] = useState<TransactionRow | null>(null);
  const [deletingEntry, setDeletingEntry] = useState<TransactionRow | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editForm, setEditForm] = useState({
    description: "",
    type: "debit" as "debit" | "credit",
    amount: "",
    payment_mode: "eft" as DayBookEditMode,
    note: "",
    date: format(new Date(), "yyyy-MM-dd"),
  });

  const [searchQuery, setSearchQuery] = useState("");
  const [dateFrom, setDateFrom] = useState(format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [dateTo, setDateTo] = useState(format(new Date(), "yyyy-MM-dd"));
  const [activeFilter, setActiveFilter] = useState<"all" | "debit" | "credit">("all");
  const [activeModeFilter, setActiveModeFilter] = useState<DayBookModeFilter>(null);

  useEffect(() => {
    void fetchTransactions();
  }, []);

  const fetchTransactions = async () => {
    try {
      setLoading(true);
      const { data: transactions, error } = await supabase
        .from("transactions")
        .select("*, profiles(username)")
        .order("date", { ascending: false })
        .order("created_at", { ascending: false });

      if (error) throw error;
      if (transactions) setData(transactions as TransactionRow[]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to fetch entries");
    } finally {
      setLoading(false);
    }
  };

  const openEditModal = (entry: TransactionRow) => {
    setEditingEntry(entry);
    setEditForm({
      description: entry.description,
      type: entry.type,
      amount: String(entry.amount),
      payment_mode: isCashMode(entry.payment_mode) ? "cash" : "eft",
      note: entry.note || "",
      date: entry.date,
    });
  };

  const handleSaveEdit = async () => {
    if (!editingEntry || !editForm.description || !editForm.amount) {
      toast.error("Please fill in description and amount");
      return;
    }

    setSavingEdit(true);
    try {
      const storedPaymentMode: TransactionRow["payment_mode"] =
        editForm.payment_mode === "cash" ? "cash" : "upi";

      const payload = {
        description: editForm.description,
        type: editForm.type,
        amount: parseFloat(editForm.amount),
        payment_mode: storedPaymentMode,
        note: editForm.note || null,
        date: editForm.date,
      };

      const { error } = await supabase
        .from("transactions")
        .update(payload)
        .eq("id", editingEntry.id);

      if (error) throw error;

      await logActivity({
        action: "edit",
        entityType: "transaction",
        entityId: editingEntry.id,
        entityLabel: payload.description,
        description: "Edited day book entry",
        metadata: {
          before: {
            description: editingEntry.description,
            type: editingEntry.type,
            amount: editingEntry.amount,
            payment_mode: editingEntry.payment_mode,
            note: editingEntry.note || null,
            date: editingEntry.date,
          },
          after: payload,
        },
      });

      setData((current) =>
        current.map((entry) => (entry.id === editingEntry.id ? { ...entry, ...payload } : entry)),
      );
      setEditingEntry(null);
      toast.success("Entry updated");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update entry");
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDeleteEntry = async () => {
    if (!deletingEntry) return;
    try {
      const { error } = await supabase
        .from("transactions")
        .delete()
        .eq("id", deletingEntry.id);

      if (error) throw error;

      await logActivity({
        action: "delete",
        entityType: "transaction",
        entityId: deletingEntry.id,
        entityLabel: deletingEntry.description,
        description: "Deleted day book entry",
        metadata: {
          amount: deletingEntry.amount,
          type: deletingEntry.type,
          payment_mode: deletingEntry.payment_mode,
          date: deletingEntry.date,
        },
      });

      setData((current) => current.filter((entry) => entry.id !== deletingEntry.id));
      setDeletingEntry(null);
      toast.success("Entry deleted");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete entry");
    }
  };

  const handleDownloadCSV = () => {
    if (filteredData.length === 0) {
      toast.error("No entries to export");
      return;
    }

    const headers = ["Date", "Description", "Type", "Amount", "Mode", "Note", "Created By"];
    const rows = filteredData.map((entry) => [
      format(new Date(entry.date), "dd MMM yyyy"),
      entry.description,
      entry.type,
      entry.amount,
      entry.payment_mode,
      entry.note || "",
      entry.profiles?.username || "Admin",
    ]);

    const csvContent = [headers, ...rows].map((row) => row.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `DayBook_History_${format(new Date(), "yyyy-MM-dd")}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("CSV Downloaded");
  };

  const filteredData = useMemo(() => {
    return data.filter((entry) => {
      const matchSearch =
        !searchQuery ||
        entry.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (entry.note && entry.note.toLowerCase().includes(searchQuery.toLowerCase()));

      const matchType = activeFilter === "all" || entry.type === activeFilter;
      const matchMode =
        !activeModeFilter ||
        (activeModeFilter === "cash"
          ? entry.payment_mode === "cash"
          : entry.payment_mode !== "cash");
      const transDate = entry.date;
      const matchFrom = !dateFrom || transDate >= dateFrom;
      const matchTo = !dateTo || transDate <= dateTo;

      return matchSearch && matchType && matchMode && matchFrom && matchTo;
    });
  }, [activeFilter, activeModeFilter, data, dateFrom, dateTo, searchQuery]);

  const calculations = useMemo(() => {
    let debitSum = 0;
    let creditSum = 0;
    let debitCount = 0;
    let creditCount = 0;
    let pettyCashCredit = 0;
    let pettyCashDebit = 0;

    filteredData.forEach((entry) => {
      if (entry.type === "debit") {
        debitSum += entry.amount;
        debitCount++;
        if (entry.payment_mode === "cash") pettyCashDebit += entry.amount;
      } else {
        creditSum += entry.amount;
        creditCount++;
        if (entry.payment_mode === "cash") pettyCashCredit += entry.amount;
      }
    });

    return {
      debitSum,
      creditSum,
      debitCount,
      creditCount,
      netBalance: creditSum - debitSum,
      pettyCash: pettyCashCredit - pettyCashDebit,
    };
  }, [filteredData]);

  const fmt = (n: number) => "₹" + n.toLocaleString("en-IN");

  return (
    <div className="flex flex-col min-h-screen bg-white font-['DM_Sans'] -m-8">
      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&family=DM+Mono:wght@400;500&display=swap');
      `}</style>

      <div className="p-12 max-w-[1200px] mx-auto w-full">
        <div className="flex items-end justify-between mb-8 animate-in fade-in slide-in-from-top-2 duration-300">
          <div>
            <Link
              href="/daybook"
              className="flex items-center gap-1 text-[13px] text-[#6b7280] hover:text-[#111827] transition-all mb-2 decoration-none"
            >
              <ChevronLeft className="w-4 h-4" />
              Day Book
            </Link>
            <h1 className="text-[24px] font-semibold text-[#111827] tracking-tight">Full History</h1>
            <p className="text-[14px] text-[#6b7280] mt-1">All recorded debit and credit entries.</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleDownloadCSV}
              className="flex items-center gap-2 border border-[#e5e7eb] text-[#374151] rounded-[8px] px-5 h-10 text-[13px] font-semibold hover:bg-slate-50 transition-all font-['DM_Sans']"
            >
              <Download className="w-4 h-4" />
              Download CSV
            </button>
            <Link
              href="/daybook"
              className="flex items-center gap-2 bg-[#6366f1] text-white rounded-[8px] px-5 h-10 text-[13px] font-semibold hover:opacity-90 transition-all decoration-none"
            >
              <Plus className="w-4 h-4" />
              New entry
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4 mb-10 animate-in fade-in zoom-in-95 duration-500">
          <SummaryCard
            label="Total debit"
            val={fmt(calculations.debitSum)}
            sub={`${calculations.debitCount} entries`}
            type="debit"
          />
          <SummaryCard
            label="Total credit"
            val={fmt(calculations.creditSum)}
            sub={`${calculations.creditCount} entries`}
            type="credit"
          />
          <SummaryCard
            label="Net balance"
            val={fmt(Math.abs(calculations.netBalance))}
            sub=""
            type="net"
            isPositive={calculations.netBalance >= 0}
          />
        </div>

        <div className="flex flex-wrap items-center gap-3 mb-6">
          <div className="relative flex-1 min-w-[220px] max-w-[320px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9ca3af]" />
            <input
              type="text"
              placeholder="Search description…"
              className="w-full h-10 pl-10 pr-4 bg-transparent border-0 border-b-2 border-[#e5e7eb] outline-none focus:border-[#6366f1] text-[14px] transition-all"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              type="date"
              className="h-10 border-b-2 border-[#e5e7eb] outline-none focus:border-[#6366f1] text-[13px] font-['DM_Mono'] bg-transparent px-1 transition-all"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
            />
            <span className="text-[#9ca3af] text-[13px]">→</span>
            <input
              type="date"
              className="h-10 border-b-2 border-[#e5e7eb] outline-none focus:border-[#6366f1] text-[13px] font-['DM_Mono'] bg-transparent px-1 transition-all"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
            />
          </div>

          <div className="flex gap-1.5 ml-2">
            <FilterPill label="All" active={activeFilter === "all"} onClick={() => setActiveFilter("all")} />
            <FilterPill
              label="Debit"
              active={activeFilter === "debit"}
              onClick={() => setActiveFilter("debit")}
              color="debit"
            />
            <FilterPill
              label="Credit"
              active={activeFilter === "credit"}
              onClick={() => setActiveFilter("credit")}
              color="credit"
            />
          </div>

          <div className="flex gap-1.5 border-l border-[#e5e7eb] pl-4">
            <FilterPill
              label="Cash"
              active={activeModeFilter === "cash"}
              onClick={() => setActiveModeFilter(activeModeFilter === "cash" ? null : "cash")}
            />
            <FilterPill
              label="EFT"
              active={activeModeFilter === "eft"}
              onClick={() => setActiveModeFilter(activeModeFilter === "eft" ? null : "eft")}
            />
          </div>

          <span className="ml-auto text-[12px] text-[#9ca3af] font-['DM_Mono'] whitespace-nowrap">
            {filteredData.length} entries matching
          </span>
        </div>

        <div className="overflow-x-auto border-t-2 border-[#e5e7eb]">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-24 gap-4">
              <Loader2 className="w-8 h-8 animate-spin text-[#6366f1]" />
              <p className="text-[14px] text-[#9ca3af] font-medium tracking-tight">Loading ledger entries...</p>
            </div>
          ) : filteredData.length === 0 ? (
            <div className="py-24 text-center">
              <FileText className="w-12 h-12 mx-auto text-[#e5e7eb] mb-4" />
              <p className="text-[14px] text-[#9ca3af]">No entries match your filters.</p>
            </div>
          ) : (
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className="w-[110px] text-[11px] font-semibold text-[#9ca3af] uppercase tracking-widest text-left p-3 pt-4">Date</th>
                  <th className="text-[11px] font-semibold text-[#9ca3af] uppercase tracking-widest text-left p-3 pt-4">Description</th>
                  <th className="w-[90px] text-[11px] font-semibold text-[#9ca3af] uppercase tracking-widest text-left p-3 pt-4">Mode</th>
                  <th className="w-[120px] text-[11px] font-semibold text-[#dc2626] uppercase tracking-widest text-right p-3 pt-4">Debit (₹)</th>
                  <th className="w-[120px] text-[11px] font-semibold text-[#16a34a] uppercase tracking-widest text-right p-3 pt-4">Credit (₹)</th>
                  <th className="w-[90px] text-[11px] font-semibold text-[#9ca3af] uppercase tracking-widest text-right p-3 pt-4">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f3f4f6]">
                {filteredData.map((entry) => (
                  <tr key={entry.id} className="hover:bg-[#f9fafb] transition-colors group">
                    <td className="p-3 py-4 text-[12px] font-['DM_Mono'] text-[#6b7280]">
                      {format(new Date(entry.date), "dd MMM yyyy")}
                    </td>
                    <td className="p-3 py-4">
                      <div className="flex items-start gap-3">
                        <div
                          className={cn(
                            "w-2 h-2 rounded-full mt-1.5 shrink-0",
                            entry.type === "debit" ? "bg-[#dc2626]" : "bg-[#16a34a]",
                          )}
                        />
                        <div>
                          <div className="text-[14px] font-medium text-[#111827]">{entry.description}</div>
                          {entry.note ? (
                            <div className="text-[11px] text-[#9ca3af] mt-0.5 font-['DM_Mono']">Ref: {entry.note}</div>
                          ) : null}
                          <div className="text-[10px] text-[#9ca3af] mt-0.5 font-semibold uppercase tracking-wide">
                            By {entry.profiles?.username || "Admin"}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="p-3 py-4">
                      <span
                        className={cn(
                          "inline-flex text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase",
                          entry.payment_mode === "cash"
                            ? "bg-[#dcfce7] text-[#15803d]"
                            : "bg-[#e0e7ff] text-[#4338ca]",
                        )}
                      >
                        {getModeLabel(entry.payment_mode)}
                      </span>
                    </td>
                    <td
                      className={cn(
                        "p-3 py-4 text-right font-['DM_Mono'] text-[14px] font-semibold",
                        entry.type === "debit" ? "text-[#dc2626]" : "text-[#d1d5db]",
                      )}
                    >
                      {entry.type === "debit" ? fmt(entry.amount) : "—"}
                    </td>
                    <td
                      className={cn(
                        "p-3 py-4 text-right font-['DM_Mono'] text-[14px] font-semibold",
                        entry.type === "credit" ? "text-[#16a34a]" : "text-[#d1d5db]",
                      )}
                    >
                      {entry.type === "credit" ? fmt(entry.amount) : "—"}
                    </td>
                    <td className="p-3 py-4">
                      <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          type="button"
                          onClick={() => openEditModal(entry)}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-indigo-50 hover:text-indigo-600"
                          title="Edit entry"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeletingEntry(entry)}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
                          title="Delete entry"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 border-[#e5e7eb] bg-[#f9fafb]">
                <tr>
                  <td colSpan={4} className="p-4 text-[13px] font-semibold text-[#111827]">Total (Visible)</td>
                  <td className="p-4 text-right text-[#dc2626] font-['DM_Mono'] font-bold text-[15px]">{fmt(calculations.debitSum)}</td>
                  <td className="p-4 text-right text-[#16a34a] font-['DM_Mono'] font-bold text-[15px]">{fmt(calculations.creditSum)}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>

        <div className="flex items-center justify-between mt-8 pt-6 border-t border-[#e5e7eb]">
          <span className="text-[12px] text-[#9ca3af] font-['DM_Mono']">
            Showing 1–{Math.min(filteredData.length, filteredData.length)} of {filteredData.length} entries
          </span>
          <div className="flex gap-1">
            <button className="w-8 h-8 flex items-center justify-center border border-[#e5e7eb] rounded-md text-[#9ca3af] hover:border-[#6366f1] hover:text-[#6366f1] transition-all">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button className="w-8 h-8 flex items-center justify-center bg-[#6366f1] text-white rounded-md text-[12px] font-bold">
              1
            </button>
            <button className="w-8 h-8 flex items-center justify-center border border-[#e5e7eb] rounded-md text-[#9ca3af] transition-all">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
      {editingEntry ? (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-6 animate-in fade-in duration-200">
          <div className="absolute inset-0 bg-slate-950/45 backdrop-blur-sm" onClick={() => setEditingEntry(null)} />
          <div className="relative z-10 w-full max-w-[520px] rounded-[28px] border border-slate-200 bg-white p-8 shadow-[0_24px_60px_rgba(15,23,42,0.28)]">
            <button
              type="button"
              onClick={() => setEditingEntry(null)}
              className="absolute right-4 top-4 inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
            >
              <X className="w-4 h-4" />
            </button>
            <h3 className="text-xl font-semibold text-[#111827] tracking-tight">Edit day book entry</h3>
            <div className="mt-6 space-y-5">
              <div className="space-y-2">
                <label className="text-[12px] font-semibold text-[#6b7280] uppercase tracking-wider">Description</label>
                <input
                  type="text"
                  value={editForm.description}
                  onChange={(e) => setEditForm((current) => ({ ...current, description: e.target.value }))}
                  className="w-full bg-transparent border-0 border-b-2 border-[#e5e7eb] outline-none focus:border-[#6366f1] py-2 text-[15px] text-[#111827] transition-colors"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[12px] font-semibold text-[#6b7280] uppercase tracking-wider">Amount</label>
                  <input
                    type="number"
                    value={editForm.amount}
                    onChange={(e) => setEditForm((current) => ({ ...current, amount: e.target.value }))}
                    className="w-full bg-transparent border-0 border-b-2 border-[#e5e7eb] outline-none focus:border-[#6366f1] py-2 text-[15px] text-[#111827] transition-colors"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[12px] font-semibold text-[#6b7280] uppercase tracking-wider">Date</label>
                  <input
                    type="date"
                    value={editForm.date}
                    onChange={(e) => setEditForm((current) => ({ ...current, date: e.target.value }))}
                    className="w-full bg-transparent border-0 border-b-2 border-[#e5e7eb] outline-none focus:border-[#6366f1] py-2 text-[15px] text-[#111827] transition-colors"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[12px] font-semibold text-[#6b7280] uppercase tracking-wider">Entry type</label>
                  <select
                    value={editForm.type}
                    onChange={(e) => setEditForm((current) => ({ ...current, type: e.target.value as "debit" | "credit" }))}
                    className="w-full rounded-xl border border-[#e5e7eb] bg-white px-3 py-2 text-[14px] text-[#111827] outline-none focus:border-[#6366f1]"
                  >
                    <option value="debit">Debit</option>
                    <option value="credit">Credit</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-[12px] font-semibold text-[#6b7280] uppercase tracking-wider">Payment mode</label>
                  <select
                    value={editForm.payment_mode}
                    onChange={(e) =>
                      setEditForm((current) => ({
                        ...current,
                        payment_mode: e.target.value as DayBookEditMode,
                      }))
                    }
                    className="w-full rounded-xl border border-[#e5e7eb] bg-white px-3 py-2 text-[14px] text-[#111827] outline-none focus:border-[#6366f1]"
                  >
                    <option value="cash">Cash</option>
                    <option value="eft">EFT</option>
                  </select>
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-[12px] font-semibold text-[#6b7280] uppercase tracking-wider">Note</label>
                <input
                  type="text"
                  value={editForm.note}
                  onChange={(e) => setEditForm((current) => ({ ...current, note: e.target.value }))}
                  className="w-full bg-transparent border-0 border-b-2 border-[#e5e7eb] outline-none focus:border-[#6366f1] py-2 text-[15px] text-[#111827] transition-colors"
                />
              </div>
            </div>
            <div className="mt-8 flex gap-3">
              <button
                type="button"
                onClick={handleSaveEdit}
                disabled={savingEdit}
                className="inline-flex h-11 items-center justify-center rounded-2xl bg-[#6366f1] px-5 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {savingEdit ? "Saving..." : "Save changes"}
              </button>
              <button
                type="button"
                onClick={() => setEditingEntry(null)}
                className="inline-flex h-11 items-center justify-center rounded-2xl border border-[#e5e7eb] px-5 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {deletingEntry ? (
        <ConfirmDeleteModal
          title="Delete Day Book Entry?"
          description={`Delete ${deletingEntry.description}. This action cannot be undone.`}
          confirmLabel="Delete Entry"
          onConfirm={() => void handleDeleteEntry()}
          onCancel={() => setDeletingEntry(null)}
        />
      ) : null}
    </div>
  );
}

function SummaryCard({
  label,
  val,
  sub,
  type,
  isPositive,
}: {
  label: string;
  val: string;
  sub: string;
  type: "debit" | "credit" | "net" | "cash";
  isPositive?: boolean;
}) {
  const colors = {
    debit: "border-b-[#dc2626] text-[#dc2626]",
    credit: "border-b-[#16a34a] text-[#16a34a]",
    net: "border-b-[#6366f1] text-[#6366f1]",
    cash: "border-b-[#d97706] text-[#d97706]",
  };

  return (
    <div className={cn("pb-3 border-b-2 border-[#e5e7eb] transition-all", colors[type as keyof typeof colors])}>
      <div className="text-[11px] font-semibold text-[#9ca3af] uppercase tracking-wider mb-1">{label}</div>
      <div
        className={cn(
          "text-[24px] font-semibold font-['DM_Mono'] tracking-tight",
          type === "net" && (isPositive ? "text-[#16a34a]" : "text-[#dc2626]"),
        )}
      >
        {val}
      </div>
      <div className="text-[11px] text-[#9ca3af] font-medium mt-0.5">{sub}</div>
    </div>
  );
}

function FilterPill({
  label,
  active,
  onClick,
  color,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  color?: "debit" | "credit";
}) {
  const colors = {
    debit: "bg-[#dc2626] border-[#dc2626] text-white",
    credit: "bg-[#16a34a] border-[#16a34a] text-white",
    default: "bg-[#6366f1] border-[#6366f1] text-white",
  };

  return (
    <button
      onClick={onClick}
      className={cn(
        "px-4 py-1.5 rounded-full border-[1.5px] text-[12px] font-medium transition-all transition-colors",
        active
          ? colors[color as keyof typeof colors] || colors.default
          : "border-[#e5e7eb] text-[#6b7280] hover:border-[#6366f1] hover:text-[#6366f1]",
      )}
    >
      {label}
    </button>
  );
}
