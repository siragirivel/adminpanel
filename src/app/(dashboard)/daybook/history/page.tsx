"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useSearchParams } from "next/navigation";
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
import { format } from "date-fns";
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
  bill_url?: string | null;
  bill_public_id?: string | null;
  bill_resource_type?: string | null;
  bill_uploaded_at?: string | null;
  bill_expires_at?: string | null;
  bill_type?: "company" | "employee" | null;
  expense_vendor?: string | null;
  expense_vendor_id?: string | null;
  expense_employee_id?: string | null;
  expense_employee_name?: string | null;
  expense_remarks?: string | null;
  created_at: string;
  profiles?: {
    username?: string;
  } | null;
}

type DayBookModeFilter = "cash" | "eft" | null;
type DayBookEditMode = "cash" | "eft";
type ExpenseBillFilter = "all" | "company" | "employee";
type DayBookHistoryView = "all" | "expense-bills";
type DayBookCategoryFilter =
  | "all"
  | "invoice"
  | "spare_purchase"
  | "credit_payment"
  | "daybook"
  | "other";

function isCashMode(mode: TransactionRow["payment_mode"]) {
  return mode === "cash";
}

function isCreditPurchaseMode(note?: string | null) {
  return String(note || "").toLowerCase().includes("mode: credit");
}

function getModeLabel(mode: TransactionRow["payment_mode"] | DayBookEditMode) {
  return mode === "cash" ? "Cash" : "EFT";
}

function getEntryCategory(entry: TransactionRow): DayBookCategoryFilter {
  const desc = String(entry.description || "").toLowerCase();
  const note = String(entry.note || "").toLowerCase();
  if (desc.includes("invoice")) return "invoice";
  if (desc.includes("spare parts purchase")) return "spare_purchase";
  if (desc.includes("credit payment -") || note.includes("credit_payment_for:")) return "credit_payment";
  if (desc.includes("day book") || desc.includes("daybook")) return "daybook";
  return "other";
}

function extractTagValue(note: string | null | undefined, tag: string) {
  const match = String(note || "").match(new RegExp(`${tag}:([^\\n|]+)`, "i"));
  return match?.[1]?.trim() || "";
}

function sanitizeFileNamePart(value: string) {
  return String(value || "")
    .trim()
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

function isPdfBill(entry: TransactionRow) {
  const url = String(entry.bill_url || "").toLowerCase();
  return entry.bill_resource_type === "raw" || url.endsWith(".pdf") || url.includes(".pdf?");
}

function getBillFileExtension(entry: TransactionRow) {
  if (isPdfBill(entry)) return "pdf";
  const url = String(entry.bill_url || "");
  const match = url.match(/\.([a-z0-9]+)(?:\?|$)/i);
  return match?.[1]?.toLowerCase() || "jpg";
}

function buildExpenseBillFileName(entry: TransactionRow, index: number) {
  const dateLabel = entry.date ? format(new Date(entry.date), "yyyyMMdd") : `entry-${index + 1}`;
  const typeLabel = entry.bill_type || "bill";
  const ownerLabel =
    entry.expense_employee_name ||
    entry.expense_vendor ||
    entry.description ||
    `bill-${index + 1}`;
  const safeOwner = sanitizeFileNamePart(ownerLabel) || `bill-${index + 1}`;
  return `${dateLabel}_${typeLabel}_${safeOwner}.${getBillFileExtension(entry)}`;
}

async function cleanupExpiredExpenseBills() {
  try {
    await fetch("/api/maintenance/expense-bills/cleanup", { method: "POST" });
  } catch {}
}

export default function DayBookHistoryPage() {
  const searchParams = useSearchParams();
  const viewMode: DayBookHistoryView =
    searchParams?.get("view") === "expense-bills" ? "expense-bills" : "all";
  const isExpenseBillView = viewMode === "expense-bills";
  const [data, setData] = useState<TransactionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingEntry, setEditingEntry] = useState<TransactionRow | null>(null);
  const [deletingEntry, setDeletingEntry] = useState<TransactionRow | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  const [ownerEmail, setOwnerEmail] = useState("");
  const [otpModalOpen, setOtpModalOpen] = useState(false);
  const [otpValue, setOtpValue] = useState("");
  const [otpSending, setOtpSending] = useState(false);
  const [otpVerifying, setOtpVerifying] = useState(false);
  const [otpError, setOtpError] = useState("");
  const [otpVerifiedUntil, setOtpVerifiedUntil] = useState<Date | null>(null);
  const [pendingAction, setPendingAction] = useState<"edit" | "delete" | null>(null);
  const [pendingEntry, setPendingEntry] = useState<TransactionRow | null>(null);
  const [editForm, setEditForm] = useState({
    description: "",
    type: "debit" as "debit" | "credit",
    amount: "",
    payment_mode: "eft" as DayBookEditMode,
    note: "",
    date: format(new Date(), "yyyy-MM-dd"),
  });

  const [searchQuery, setSearchQuery] = useState("");
  const [dateFrom, setDateFrom] = useState(format(new Date(), "yyyy-MM-dd"));
  const [dateTo, setDateTo] = useState(format(new Date(), "yyyy-MM-dd"));
  const [monthFilter, setMonthFilter] = useState("");
  const [activeFilter, setActiveFilter] = useState<"all" | "debit" | "credit">("all");
  const [activeModeFilter, setActiveModeFilter] = useState<DayBookModeFilter>(null);
  const [activeCategoryFilter, setActiveCategoryFilter] = useState<DayBookCategoryFilter>("all");
  const [billTypeFilter, setBillTypeFilter] = useState<ExpenseBillFilter>("all");
  const [createdByFilter, setCreatedByFilter] = useState("all");
  const [minAmountFilter, setMinAmountFilter] = useState("");
  const [maxAmountFilter, setMaxAmountFilter] = useState("");
  const [hasNoteOnly, setHasNoteOnly] = useState(false);
  const [hasBillOnly, setHasBillOnly] = useState(false);
  const [downloadingZip, setDownloadingZip] = useState(false);

  useEffect(() => {
    void cleanupExpiredExpenseBills();
    void fetchTransactions();
  }, []);

  useEffect(() => {
    if (!isExpenseBillView) return;
    setDateFrom("");
    setDateTo("");
    setMonthFilter("");
    setActiveFilter("all");
    setActiveModeFilter(null);
    setActiveCategoryFilter("all");
    setHasNoteOnly(false);
    setHasBillOnly(false);
  }, [isExpenseBillView]);

  useEffect(() => {
    const loadRole = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return;
      const { data: profile } = await supabase
        .from("profiles")
        .select("role, email, is_active")
        .eq("id", session.user.id)
        .maybeSingle();

      const owner = profile?.role === "owner" && profile?.is_active !== false;
      setIsOwner(owner);
      setOwnerEmail(String(profile?.email || session.user.email || ""));
    };

    void loadRole();
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

  const hasValidOtp = Boolean(otpVerifiedUntil && otpVerifiedUntil.getTime() > Date.now());

  const getAccessToken = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token || "";
  };

  const requestOwnerOtp = async () => {
    setOtpSending(true);
    setOtpError("");
    try {
      const accessToken = await getAccessToken();
      if (!accessToken) {
        setOtpError("Unable to authenticate. Please sign in again.");
        return;
      }
      const response = await fetch("/api/security/daybook-otp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ action: "request" }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setOtpError(data.error || "Failed to send OTP");
        return;
      }
      toast.success(`OTP sent to ${ownerEmail || "owner email"}`);
    } catch (error) {
      setOtpError(error instanceof Error ? error.message : "Failed to send OTP");
    } finally {
      setOtpSending(false);
    }
  };

  const verifyOwnerOtp = async () => {
    if (otpValue.trim().length !== 9) {
      setOtpError("Enter the 9-character OTP.");
      return;
    }
    setOtpVerifying(true);
    setOtpError("");
    try {
      const accessToken = await getAccessToken();
      if (!accessToken) {
        setOtpError("Unable to authenticate. Please sign in again.");
        return;
      }
      const response = await fetch("/api/security/daybook-otp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ action: "verify", otp: otpValue.trim() }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setOtpError(data.error || "Invalid OTP");
        return;
      }
      const verifiedUntil = data.verifiedUntil ? new Date(data.verifiedUntil) : new Date(Date.now() + 10 * 60 * 1000);
      setOtpVerifiedUntil(verifiedUntil);
      setOtpModalOpen(false);
      setOtpValue("");
      setOtpError("");
      if (pendingAction && pendingEntry) {
        if (pendingAction === "edit") {
          openEditModal(pendingEntry);
        } else {
          setDeletingEntry(pendingEntry);
        }
      }
      setPendingAction(null);
      setPendingEntry(null);
      toast.success("OTP verified");
    } catch (error) {
      setOtpError(error instanceof Error ? error.message : "Failed to verify OTP");
    } finally {
      setOtpVerifying(false);
    }
  };

  const openOwnerAction = (action: "edit" | "delete", entry: TransactionRow) => {
    if (!isOwner) {
      toast.error("Only owner can edit or delete day book history.");
      return;
    }
    if (hasValidOtp) {
      if (action === "edit") {
        openEditModal(entry);
      } else {
        setDeletingEntry(entry);
      }
      return;
    }
    setPendingAction(action);
    setPendingEntry(entry);
    setOtpModalOpen(true);
    void requestOwnerOtp();
  };

  const handleSaveEdit = async () => {
    if (!isOwner) {
      toast.error("Only owner can edit day book history.");
      return;
    }
    if (!hasValidOtp) {
      setPendingAction("edit");
      setPendingEntry(editingEntry);
      setOtpModalOpen(true);
      void requestOwnerOtp();
      toast.error("Owner OTP verification required.");
      return;
    }
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
    if (!isOwner) {
      toast.error("Only owner can delete day book history.");
      return;
    }
    if (!hasValidOtp) {
      setPendingAction("delete");
      setPendingEntry(deletingEntry);
      setOtpModalOpen(true);
      void requestOwnerOtp();
      toast.error("Owner OTP verification required.");
      return;
    }
    try {
      if (deletingEntry.bill_public_id) {
        await fetch("/api/cloudinary/delete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            publicId: deletingEntry.bill_public_id,
            resourceType: deletingEntry.bill_resource_type === "raw" ? "raw" : "image",
          }),
        }).catch(() => null);
      }
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
    const exportRows = isExpenseBillView ? expenseBillEntries : filteredData;
    if (exportRows.length === 0) {
      toast.error("No entries to export");
      return;
    }

    const headers = ["Date", "Description", "Type", "Amount", "Mode", "Bill Type", "Vendor", "Employee", "Bill URL", "Note", "Created By"];
    const rows = exportRows.map((entry) => [
      format(new Date(entry.date), "dd MMM yyyy"),
      entry.description,
      entry.type,
      entry.amount,
      entry.payment_mode,
      entry.bill_type || "",
      entry.expense_vendor || "",
      entry.expense_employee_name || "",
      entry.bill_url || "",
      entry.note || "",
      entry.profiles?.username || "Admin",
    ]);

    const csvContent = [headers, ...rows].map((row) => row.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute(
      "download",
      `${isExpenseBillView ? "Expense_Bill_Logs" : "DayBook_History"}_${format(new Date(), "yyyy-MM-dd")}.csv`,
    );
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("CSV Downloaded");
  };

  const filteredData = useMemo(() => {
    return data.filter((entry) => {
      const query = searchQuery.trim().toLowerCase();
      const searchIndex = [
        entry.description,
        entry.note || "",
        entry.expense_vendor || "",
        entry.expense_vendor_id || "",
        entry.expense_employee_id || "",
        entry.expense_employee_name || "",
        entry.expense_remarks || "",
        entry.bill_type || "",
        extractTagValue(entry.note, "vendor_id"),
        extractTagValue(entry.note, "vendor_payment_for"),
        extractTagValue(entry.note, "employee_id"),
        extractTagValue(entry.note, "employee_name"),
        extractTagValue(entry.note, "party_id"),
        extractTagValue(entry.note, "party_name"),
        extractTagValue(entry.note, "car_id"),
        extractTagValue(entry.note, "invoice_payment_for"),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      const matchSearch = !query || searchIndex.includes(query);

      const matchType = activeFilter === "all" || entry.type === activeFilter;
      const matchMode =
        !activeModeFilter ||
        (activeModeFilter === "cash"
          ? entry.payment_mode === "cash"
          : entry.payment_mode !== "cash");
      const transDate = entry.date;
      const matchFrom = !dateFrom || transDate >= dateFrom;
      const matchTo = !dateTo || transDate <= dateTo;
      const matchMonth = !monthFilter || transDate.startsWith(monthFilter);
      const entryCategory = getEntryCategory(entry);
      const matchCategory = activeCategoryFilter === "all" || entryCategory === activeCategoryFilter;
      const matchBillType = billTypeFilter === "all" || entry.bill_type === billTypeFilter;
      const entryCreatedBy = entry.profiles?.username || "Admin";
      const matchCreatedBy = createdByFilter === "all" || entryCreatedBy === createdByFilter;
      const amount = Number(entry.amount) || 0;
      const minAmount = minAmountFilter === "" ? null : Number(minAmountFilter);
      const maxAmount = maxAmountFilter === "" ? null : Number(maxAmountFilter);
      const matchMinAmount = minAmount === null || amount >= minAmount;
      const matchMaxAmount = maxAmount === null || amount <= maxAmount;
      const matchHasNote = !hasNoteOnly || Boolean(String(entry.note || "").trim());
      const matchHasBill = !hasBillOnly || Boolean(String(entry.bill_url || "").trim());

      return (
        matchSearch &&
        matchType &&
        matchMode &&
        matchFrom &&
        matchTo &&
        matchMonth &&
        matchCategory &&
        matchBillType &&
        matchCreatedBy &&
        matchMinAmount &&
        matchMaxAmount &&
        matchHasNote &&
        matchHasBill
      );
    });
  }, [
    activeCategoryFilter,
    activeFilter,
    activeModeFilter,
    billTypeFilter,
    createdByFilter,
    data,
    dateFrom,
    dateTo,
    hasBillOnly,
    hasNoteOnly,
    maxAmountFilter,
    minAmountFilter,
    monthFilter,
    searchQuery,
  ]);

  const expenseBillEntries = useMemo(
    () => filteredData.filter((entry) => Boolean(String(entry.bill_url || "").trim())),
    [filteredData],
  );

  const createdByOptions = useMemo(() => {
    const names = Array.from(
      new Set(data.map((entry) => entry.profiles?.username || "Admin")),
    ).sort((a, b) => a.localeCompare(b));
    return names;
  }, [data]);

  const resetFilters = () => {
    setSearchQuery("");
    setDateFrom(isExpenseBillView ? "" : format(new Date(), "yyyy-MM-dd"));
    setDateTo(isExpenseBillView ? "" : format(new Date(), "yyyy-MM-dd"));
    setMonthFilter("");
    setActiveFilter("all");
    setActiveModeFilter(null);
    setActiveCategoryFilter("all");
    setBillTypeFilter("all");
    setCreatedByFilter("all");
    setMinAmountFilter("");
    setMaxAmountFilter("");
    setHasNoteOnly(false);
    setHasBillOnly(false);
  };

  const handleDownloadBillZip = async () => {
    if (expenseBillEntries.length === 0) {
      toast.error("No uploaded bills to download");
      return;
    }

    setDownloadingZip(true);
    try {
      const uzipModule = await import("uzip");
      const UZIP = (uzipModule.default || uzipModule) as {
        encode: (files: Record<string, Uint8Array>) => ArrayBuffer;
      };
      const files: Record<string, Uint8Array> = {};
      const usedNames = new Set<string>();

      const reserveName = (baseName: string) => {
        if (!usedNames.has(baseName)) {
          usedNames.add(baseName);
          return baseName;
        }
        const dotIndex = baseName.lastIndexOf(".");
        const stem = dotIndex >= 0 ? baseName.slice(0, dotIndex) : baseName;
        const ext = dotIndex >= 0 ? baseName.slice(dotIndex) : "";
        let counter = 2;
        let nextName = `${stem}-${counter}${ext}`;
        while (usedNames.has(nextName)) {
          counter += 1;
          nextName = `${stem}-${counter}${ext}`;
        }
        usedNames.add(nextName);
        return nextName;
      };

      await Promise.all(
        expenseBillEntries.map(async (entry, index) => {
          const billUrl = String(entry.bill_url || "").trim();
          if (!billUrl) return;
          const response = await fetch(billUrl);
          if (!response.ok) {
            throw new Error(`Failed to fetch bill for ${entry.description}`);
          }
          const buffer = await response.arrayBuffer();
          const fileName = reserveName(buildExpenseBillFileName(entry, index));
          files[fileName] = new Uint8Array(buffer);
        }),
      );

      const archive = UZIP.encode(files);
      const blob = new Blob([archive], { type: "application/zip" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const rangeLabel = monthFilter
        ? monthFilter
        : dateFrom || dateTo
          ? `${dateFrom || "start"}_to_${dateTo || "latest"}`
          : "all-time";
      link.href = url;
      link.download = `expense-bills_${sanitizeFileNamePart(rangeLabel) || "all-time"}_${format(new Date(), "yyyyMMdd_HHmm")}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success("Expense bill ZIP downloaded");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to download ZIP");
    } finally {
      setDownloadingZip(false);
    }
  };

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
        if (!isCreditPurchaseMode(entry.note) && entry.payment_mode === "cash") pettyCashDebit += entry.amount;
      } else {
        creditSum += entry.amount;
        creditCount++;
        if (!isCreditPurchaseMode(entry.note) && entry.payment_mode === "cash") pettyCashCredit += entry.amount;
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
  const visibleEntries = isExpenseBillView ? expenseBillEntries : filteredData;
  const visibleCountLabel = isExpenseBillView ? "bills" : "entries";

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
            <h1 className="text-[24px] font-semibold text-[#111827] tracking-tight">
              {isExpenseBillView ? "Expense Bill Logs" : "Full History"}
            </h1>
            <p className="text-[16px] text-[#6b7280] mt-1">
              {isExpenseBillView
                ? "Search, filter, preview, and download uploaded day book bills."
                : "All recorded debit and credit entries."}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {isExpenseBillView ? (
              <button
                onClick={() => void handleDownloadBillZip()}
                disabled={downloadingZip}
                className="flex items-center gap-2 border border-[#e5e7eb] text-[#374151] rounded-[8px] px-5 h-10 text-[13px] font-semibold hover:bg-slate-50 transition-all font-['DM_Sans'] disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Download className="w-4 h-4" />
                {downloadingZip ? "Preparing ZIP..." : "Download ZIP"}
              </button>
            ) : (
              <Link
                href="/daybook/history?view=expense-bills"
                className="flex items-center gap-2 border border-[#e5e7eb] text-[#374151] rounded-[8px] px-5 h-10 text-[13px] font-semibold hover:bg-slate-50 transition-all font-['DM_Sans'] decoration-none"
              >
                <FileText className="w-4 h-4" />
                Expense bill logs
              </Link>
            )}
            <button
              onClick={handleDownloadCSV}
              className="flex items-center gap-2 border border-[#e5e7eb] text-[#374151] rounded-[8px] px-5 h-10 text-[13px] font-semibold hover:bg-slate-50 transition-all font-['DM_Sans']"
            >
              <Download className="w-4 h-4" />
              Download CSV
            </button>
            {isExpenseBillView ? (
              <Link
                href="/daybook/history"
                className="flex items-center gap-2 border border-[#e5e7eb] text-[#374151] rounded-[8px] px-5 h-10 text-[13px] font-semibold hover:bg-slate-50 transition-all decoration-none"
              >
                <FileText className="w-4 h-4" />
                Full history
              </Link>
            ) : null}
            <Link
              href="/daybook"
              className="flex items-center gap-2 bg-[#6366f1] text-white rounded-[8px] px-5 h-10 text-[13px] font-semibold hover:opacity-90 transition-all decoration-none"
            >
              <Plus className="w-4 h-4" />
              New entry
            </Link>
          </div>
        </div>

        {!isExpenseBillView ? (
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
        ) : null}

        <div className="flex flex-wrap items-center gap-3 mb-6">
          <div className="relative flex-1 min-w-[220px] max-w-[320px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9ca3af]" />
            <input
              type="text"
              placeholder={
                isExpenseBillView
                  ? "Search bill name, vendor, employee, remarks, or ID…"
                  : "Search name, vendor, employee, bill, or ID…"
              }
              className="w-full h-10 pl-10 pr-4 bg-transparent border-0 border-b-2 border-[#e5e7eb] outline-none focus:border-[#6366f1] text-[16px] transition-all"
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

          <input
            type="month"
            className="h-10 border-b-2 border-[#e5e7eb] outline-none focus:border-[#6366f1] text-[13px] font-['DM_Mono'] bg-transparent px-1 transition-all"
            value={monthFilter}
            onChange={(e) => setMonthFilter(e.target.value)}
          />

          {!isExpenseBillView ? (
            <>
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

              <select
                className="h-10 rounded-lg border border-[#e5e7eb] bg-white px-3 text-[14px] text-[#374151] outline-none focus:border-[#6366f1]"
                value={activeCategoryFilter}
                onChange={(e) => setActiveCategoryFilter(e.target.value as DayBookCategoryFilter)}
              >
                <option value="all">All categories</option>
                <option value="invoice">Invoice</option>
                <option value="spare_purchase">Spare purchase</option>
                <option value="credit_payment">Credit payment</option>
                <option value="daybook">Day book</option>
                <option value="other">Other</option>
              </select>
            </>
          ) : null}

          <select
            className="h-10 rounded-lg border border-[#e5e7eb] bg-white px-3 text-[14px] text-[#374151] outline-none focus:border-[#6366f1]"
            value={billTypeFilter}
            onChange={(e) => setBillTypeFilter(e.target.value as ExpenseBillFilter)}
          >
            <option value="all">All bill types</option>
            <option value="company">Company bill</option>
            <option value="employee">Employee bill</option>
          </select>

          <select
            className="h-10 rounded-lg border border-[#e5e7eb] bg-white px-3 text-[14px] text-[#374151] outline-none focus:border-[#6366f1]"
            value={createdByFilter}
            onChange={(e) => setCreatedByFilter(e.target.value)}
          >
            <option value="all">All users</option>
            {createdByOptions.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>

          <div className="flex items-center gap-2">
            <input
              type="number"
              min={0}
              placeholder="Min ₹"
              className="h-10 w-[92px] rounded-lg border border-[#e5e7eb] bg-white px-2 text-[14px] text-[#374151] outline-none focus:border-[#6366f1]"
              value={minAmountFilter}
              onChange={(e) => setMinAmountFilter(e.target.value)}
            />
            <span className="text-[#9ca3af] text-[14px]">to</span>
            <input
              type="number"
              min={0}
              placeholder="Max ₹"
              className="h-10 w-[92px] rounded-lg border border-[#e5e7eb] bg-white px-2 text-[14px] text-[#374151] outline-none focus:border-[#6366f1]"
              value={maxAmountFilter}
              onChange={(e) => setMaxAmountFilter(e.target.value)}
            />
          </div>

          {!isExpenseBillView ? (
            <>
              <button
                type="button"
                onClick={() => setHasNoteOnly((current) => !current)}
                className={cn(
                  "h-10 rounded-lg border px-3 text-[14px] font-medium transition-all",
                  hasNoteOnly
                    ? "border-[#6366f1] bg-indigo-50 text-[#4f46e5]"
                    : "border-[#e5e7eb] text-[#6b7280] hover:border-[#6366f1] hover:text-[#6366f1]",
                )}
              >
                Has Note
              </button>

              <button
                type="button"
                onClick={() => setHasBillOnly((current) => !current)}
                className={cn(
                  "h-10 rounded-lg border px-3 text-[14px] font-medium transition-all",
                  hasBillOnly
                    ? "border-[#6366f1] bg-indigo-50 text-[#4f46e5]"
                    : "border-[#e5e7eb] text-[#6b7280] hover:border-[#6366f1] hover:text-[#6366f1]",
                )}
              >
                Has Bill
              </button>
            </>
          ) : null}

          <button
            type="button"
            onClick={resetFilters}
            className="h-10 rounded-lg border border-[#e5e7eb] px-3 text-[14px] font-medium text-[#6b7280] hover:border-[#6366f1] hover:text-[#6366f1] transition-all"
          >
            Reset
          </button>

          <span className="ml-auto text-[14px] text-[#9ca3af] font-['DM_Mono'] whitespace-nowrap">
            {visibleEntries.length} {visibleCountLabel} matching
          </span>
        </div>

        <div className="overflow-x-auto border-t-2 border-[#e5e7eb]">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-24 gap-4">
              <Loader2 className="w-8 h-8 animate-spin text-[#6366f1]" />
              <p className="text-[16px] text-[#9ca3af] font-medium tracking-tight">
                {isExpenseBillView ? "Loading expense bills..." : "Loading ledger entries..."}
              </p>
            </div>
          ) : visibleEntries.length === 0 ? (
            <div className="py-24 text-center">
              <FileText className="w-12 h-12 mx-auto text-[#e5e7eb] mb-4" />
              <p className="text-[16px] text-[#9ca3af]">
                {isExpenseBillView ? "No expense bills match your filters." : "No entries match your filters."}
              </p>
            </div>
          ) : isExpenseBillView ? (
            <div className="grid gap-5 py-6 sm:grid-cols-2 xl:grid-cols-3">
              {visibleEntries.map((entry, index) => (
                <ExpenseBillCard key={entry.id} entry={entry} index={index} />
              ))}
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
                {visibleEntries.map((entry) => (
                  <tr key={entry.id} className="hover:bg-[#f9fafb] transition-colors group">
                    <td className="p-3 py-4 text-[14px] font-['DM_Mono'] text-[#6b7280]">
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
                          <div className="text-[16px] font-medium text-[#111827]">{entry.description}</div>
                          {entry.note ? (
                            <div className="text-[11px] text-[#9ca3af] mt-0.5 font-['DM_Mono']">Ref: {entry.note}</div>
                          ) : null}
                          {entry.bill_url ? (
                            <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px]">
                              <span className="rounded-full bg-indigo-50 px-2 py-0.5 font-semibold uppercase tracking-wide text-indigo-600">
                                {entry.bill_type === "employee" ? "Employee bill" : "Company bill"}
                              </span>
                              {entry.expense_vendor ? (
                                <span className="text-[#6b7280]">Vendor: {entry.expense_vendor}</span>
                              ) : null}
                              {entry.expense_employee_name ? (
                                <span className="text-[#6b7280]">Employee: {entry.expense_employee_name}</span>
                              ) : null}
                              {entry.bill_expires_at ? (
                                <span className="text-[#9ca3af]">
                                  Expires {format(new Date(entry.bill_expires_at), "dd MMM yyyy")}
                                </span>
                              ) : null}
                              <button
                                type="button"
                                onClick={() => window.open(entry.bill_url || "", "_blank")}
                                className="font-semibold text-[#4f46e5] hover:text-[#4338ca]"
                              >
                                View bill
                              </button>
                            </div>
                          ) : null}
                          <div className="text-[12px] text-[#9ca3af] mt-0.5 font-semibold uppercase tracking-wide">
                            By {entry.profiles?.username || "Admin"}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="p-3 py-4">
                      <span
                        className={cn(
                          "inline-flex text-[12px] font-semibold px-2 py-0.5 rounded-full uppercase",
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
                        "p-3 py-4 text-right font-['DM_Mono'] text-[16px] font-semibold",
                        entry.type === "debit" ? "text-[#dc2626]" : "text-[#d1d5db]",
                      )}
                    >
                      {entry.type === "debit" ? fmt(entry.amount) : "—"}
                    </td>
                    <td
                      className={cn(
                        "p-3 py-4 text-right font-['DM_Mono'] text-[16px] font-semibold",
                        entry.type === "credit" ? "text-[#16a34a]" : "text-[#d1d5db]",
                      )}
                    >
                      {entry.type === "credit" ? fmt(entry.amount) : "—"}
                    </td>
                    <td className="p-3 py-4">
                      <div className="flex items-center justify-end gap-2   transition-opacity">
                        {entry.bill_url ? (
                          <button
                            type="button"
                            onClick={() => window.open(entry.bill_url || "", "_blank")}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-sky-50 hover:text-sky-600"
                            title="View bill"
                          >
                            <FileText className="w-4 h-4" />
                          </button>
                        ) : null}
                        {isOwner ? (
                          <>
                            <button
                              type="button"
                              onClick={() => openOwnerAction("edit", entry)}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-indigo-50 hover:text-indigo-600"
                              title="Edit entry"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => openOwnerAction("delete", entry)}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
                              title="Delete entry"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </>
                        ) : (
                          <span className="text-[11px] font-medium text-slate-300">Owner only</span>
                        )}
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

        {!isExpenseBillView ? (
          <div className="flex items-center justify-between mt-8 pt-6 border-t border-[#e5e7eb]">
            <span className="text-[14px] text-[#9ca3af] font-['DM_Mono']">
              Showing 1–{Math.min(visibleEntries.length, visibleEntries.length)} of {visibleEntries.length} entries
            </span>
            <div className="flex gap-1">
              <button className="w-8 h-8 flex items-center justify-center border border-[#e5e7eb] rounded-md text-[#9ca3af] hover:border-[#6366f1] hover:text-[#6366f1] transition-all">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button className="w-8 h-8 flex items-center justify-center bg-[#6366f1] text-white rounded-md text-[14px] font-bold">
                1
              </button>
              <button className="w-8 h-8 flex items-center justify-center border border-[#e5e7eb] rounded-md text-[#9ca3af] transition-all">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        ) : null}
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
                <label className="text-[14px] font-semibold text-[#6b7280] uppercase tracking-wider">Description</label>
                <input
                  type="text"
                  value={editForm.description}
                  onChange={(e) => setEditForm((current) => ({ ...current, description: e.target.value }))}
                  className="w-full bg-transparent border-0 border-b-2 border-[#e5e7eb] outline-none focus:border-[#6366f1] py-2 text-[15px] text-[#111827] transition-colors"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[14px] font-semibold text-[#6b7280] uppercase tracking-wider">Amount</label>
                  <input
                    type="number"
                    value={editForm.amount}
                    onChange={(e) => setEditForm((current) => ({ ...current, amount: e.target.value }))}
                    className="w-full bg-transparent border-0 border-b-2 border-[#e5e7eb] outline-none focus:border-[#6366f1] py-2 text-[15px] text-[#111827] transition-colors"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[14px] font-semibold text-[#6b7280] uppercase tracking-wider">Date</label>
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
                  <label className="text-[14px] font-semibold text-[#6b7280] uppercase tracking-wider">Entry type</label>
                  <select
                    value={editForm.type}
                    onChange={(e) => setEditForm((current) => ({ ...current, type: e.target.value as "debit" | "credit" }))}
                    className="w-full rounded-xl border border-[#e5e7eb] bg-white px-3 py-2 text-[16px] text-[#111827] outline-none focus:border-[#6366f1]"
                  >
                    <option value="debit">Debit</option>
                    <option value="credit">Credit</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-[14px] font-semibold text-[#6b7280] uppercase tracking-wider">Payment mode</label>
                  <select
                    value={editForm.payment_mode}
                    onChange={(e) =>
                      setEditForm((current) => ({
                        ...current,
                        payment_mode: e.target.value as DayBookEditMode,
                      }))
                    }
                    className="w-full rounded-xl border border-[#e5e7eb] bg-white px-3 py-2 text-[16px] text-[#111827] outline-none focus:border-[#6366f1]"
                  >
                    <option value="cash">Cash</option>
                    <option value="eft">EFT</option>
                  </select>
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-[14px] font-semibold text-[#6b7280] uppercase tracking-wider">Note</label>
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
      {otpModalOpen ? (
        <div className="fixed inset-0 z-[160] flex items-center justify-center p-6 animate-in fade-in duration-200">
          <div className="absolute inset-0 bg-slate-950/45 backdrop-blur-sm" onClick={() => setOtpModalOpen(false)} />
          <div className="relative z-10 w-full max-w-[420px] rounded-[24px] border border-slate-200 bg-white p-6 shadow-[0_24px_60px_rgba(15,23,42,0.28)]">
            <button
              type="button"
              onClick={() => setOtpModalOpen(false)}
              className="absolute right-4 top-4 inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
            >
              <X className="w-4 h-4" />
            </button>
            <h3 className="text-lg font-semibold text-[#111827]">Owner OTP verification</h3>
            <p className="mt-1 text-[13px] text-slate-500">
              Enter the 9-character OTP sent to {ownerEmail || "your owner email"} to continue.
            </p>
            <div className="mt-5 space-y-3">
              <div className="space-y-2">
                <label className="text-[12px] font-semibold uppercase tracking-wider text-slate-400">OTP Code</label>
                <input
                  type="text"
                  value={otpValue}
                  onChange={(e) =>
                    setOtpValue(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 9))
                  }
                  placeholder="9-character OTP"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-[15px] font-semibold tracking-[0.2em] text-slate-900 outline-none focus:border-indigo-500"
                />
              </div>
              {otpError ? (
                <div className="rounded-xl border border-rose-100 bg-rose-50 px-3 py-2 text-[12px] font-medium text-rose-600">
                  {otpError}
                </div>
              ) : null}
            </div>
            <div className="mt-6 flex flex-col gap-2">
              <button
                type="button"
                onClick={verifyOwnerOtp}
                disabled={otpVerifying}
                className="inline-flex h-11 items-center justify-center rounded-2xl bg-[#6366f1] px-4 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {otpVerifying ? "Verifying..." : "Verify OTP"}
              </button>
              <button
                type="button"
                onClick={requestOwnerOtp}
                disabled={otpSending}
                className="inline-flex h-10 items-center justify-center rounded-2xl border border-slate-200 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {otpSending ? "Sending OTP..." : "Send OTP"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ExpenseBillCard({ entry, index }: { entry: TransactionRow; index: number }) {
  const isPdf = isPdfBill(entry);
  const billTypeLabel = entry.bill_type === "employee" ? "Employee bill" : "Company bill";
  const amountLabel = "₹" + Number(entry.amount || 0).toLocaleString("en-IN");
  const previewTitle = entry.description || `Expense bill ${index + 1}`;

  return (
    <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
      <div className="relative aspect-[4/3] bg-slate-100">
        {entry.bill_url && !isPdf ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={entry.bill_url}
            alt={previewTitle}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-slate-50 text-slate-400">
            <FileText className="h-10 w-10" />
            <span className="text-[12px] font-semibold uppercase tracking-[0.2em]">
              {isPdf ? "PDF Bill" : "Uploaded Bill"}
            </span>
          </div>
        )}
      </div>
      <div className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[16px] font-semibold text-slate-900">{previewTitle}</div>
            <div className="mt-1 text-[12px] text-slate-500">
              {format(new Date(entry.date), "dd MMM yyyy")} · {amountLabel}
            </div>
          </div>
          <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-indigo-600">
            {billTypeLabel}
          </span>
        </div>

        <div className="grid gap-2 text-[12px] text-slate-600">
          {entry.expense_vendor ? <div>Vendor: <span className="font-medium text-slate-900">{entry.expense_vendor}</span></div> : null}
          {entry.expense_employee_name ? <div>Employee: <span className="font-medium text-slate-900">{entry.expense_employee_name}</span></div> : null}
          {entry.expense_remarks ? <div>Remarks: <span className="font-medium text-slate-900">{entry.expense_remarks}</span></div> : null}
          <div>Uploaded by: <span className="font-medium text-slate-900">{entry.profiles?.username || "Admin"}</span></div>
          {entry.bill_uploaded_at ? (
            <div>Uploaded at: <span className="font-medium text-slate-900">{format(new Date(entry.bill_uploaded_at), "dd MMM yyyy, hh:mm a")}</span></div>
          ) : null}
          {entry.bill_expires_at ? (
            <div>Expires: <span className="font-medium text-slate-900">{format(new Date(entry.bill_expires_at), "dd MMM yyyy")}</span></div>
          ) : null}
        </div>

        <div className="flex items-center gap-2 pt-1">
          <button
            type="button"
            onClick={() => window.open(entry.bill_url || "", "_blank")}
            className="inline-flex h-10 items-center justify-center rounded-xl bg-[#111827] px-4 text-[12px] font-semibold text-white transition hover:opacity-90"
          >
            View bill
          </button>
          <a
            href={entry.bill_url || "#"}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-200 px-4 text-[12px] font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            Open file
          </a>
        </div>
      </div>
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
