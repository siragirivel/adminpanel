"use client";

import React, { useState, useEffect } from "react";
import { InvoiceCreator } from "@/components/InvoiceCreator";
import { InvoiceViewer } from "@/components/InvoiceViewer";
import { 
  FileText, 
  Eye,
  Search, 
  Filter, 
  MoreVertical, 
  Copy, 
  ChevronDown, 
  ChevronLeft, 
  ChevronRight,
  MessageCircle,
  Clock,
  CheckCircle2,
  AlertCircle,
  ArrowUpRight,
  Download,
  Trash2,
  X
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { format } from "date-fns";
import { createInvoiceNumber, createInvoicePrefix, formatCurrency, cn } from "@/lib/utils";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { generateInvoicePDF } from "@/lib/pdf-service";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { ConfirmDeleteModal } from "@/components/ConfirmDeleteModal";
import { logActivity } from "@/lib/activity-log";

type TabStatus = "All Invoice" | "Draft" | "Open" | "Partial" | "Past Due" | "Paid";

function getInvoicePaymentStatus(inv: any): "Draft" | "Open" | "Partial" | "Paid" {
  if (inv.status === "draft") return "Draft";
  if (inv.payment_status === "paid") return "Paid";
  if (inv.payment_status === "partial") return "Partial";
  return "Open";
}

function getInvoicePaidAmount(inv: any) {
  return Number(inv.paid_amount || 0);
}

function getInvoiceOutstanding(inv: any) {
  const explicit = Number(inv.outstanding_amount);
  if (Number.isFinite(explicit)) {
    return Math.max(explicit, 0);
  }
  return Math.max(Number(inv.grand_total || 0) - getInvoicePaidAmount(inv), 0);
}

function getInvoiceDiscount(inv: any) {
  const grandTotal = Math.max(Number(inv.grand_total || 0), 0);
  const paidAmount = getInvoicePaidAmount(inv);
  const outstandingAmount = getInvoiceOutstanding(inv);
  return Math.max(grandTotal - paidAmount - outstandingAmount, 0);
}

function parseInvoiceAdvanceRef(note?: string | null) {
  const match = String(note || "").match(/invoice_advance_for:([^\s|]+)/i);
  return match?.[1]?.trim() || "";
}

function getInvoiceOpenRoute(inv: any) {
  return inv.status === "draft"
    ? `/billing/${inv.invoice_number}`
    : `/billing/view/${inv.id}`;
}

export default function BillingPage({ params }: { params: Promise<{ slug?: string[] }> }) {
  const router = useRouter();
  const unwrappedParams = React.use(params);
  const slug = unwrappedParams.slug;
  const isViewing = !!slug && slug[0] === "view" && !!slug[1];
  const isCreating = !!slug && slug.length > 0 && !isViewing;
  const currentInvoiceId = isCreating ? slug.join("/") : null;
  const viewInvoiceId = isViewing ? slug[1] : null;

  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabStatus>("All Invoice");
  const [searchTerm, setSearchTerm] = useState("");
  const [invoiceToDelete, setInvoiceToDelete] = useState<any | null>(null);
  const [isOwner, setIsOwner] = useState(false);
  const [ownerEmail, setOwnerEmail] = useState("");
  const [otpModalOpen, setOtpModalOpen] = useState(false);
  const [otpValue, setOtpValue] = useState("");
  const [otpSending, setOtpSending] = useState(false);
  const [otpVerifying, setOtpVerifying] = useState(false);
  const [otpError, setOtpError] = useState("");
  const [otpVerifiedUntil, setOtpVerifiedUntil] = useState<Date | null>(null);
  const [pendingInvoice, setPendingInvoice] = useState<any | null>(null);
  const [paymentInvoice, setPaymentInvoice] = useState<any | null>(null);
  const [paymentAmount, setPaymentAmount] = useState("0");
  const [paymentDate, setPaymentDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [paymentMode, setPaymentMode] = useState<"cash" | "upi">("upi");
  const [applyAdvance, setApplyAdvance] = useState(false);
  const [invoiceAdvances, setInvoiceAdvances] = useState<Record<string, number>>({});
  const [amountFilter, setAmountFilter] = useState<"all" | "paid" | "outstanding" | "discount" | "advance">("all");

  useEffect(() => {
    if (!isCreating) {
      fetchInvoices();
    }
  }, [isCreating]);

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
      const response = await fetch("/api/security/invoice-otp", {
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
      const response = await fetch("/api/security/invoice-otp", {
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
      if (pendingInvoice) {
        setInvoiceToDelete(pendingInvoice);
      }
      setPendingInvoice(null);
      toast.success("OTP verified");
    } catch (error) {
      setOtpError(error instanceof Error ? error.message : "Failed to verify OTP");
    } finally {
      setOtpVerifying(false);
    }
  };

  async function fetchInvoices() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('invoices')
        .select(`
          *,
          vehicles (
            owner_name,
            vehicle_reg,
            phone_number,
            make_model,
            car_id
          ),
          profiles (
            username
          )
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setInvoices(data || []);

      const { data: advanceRows } = await supabase
        .from("transactions")
        .select("amount, note")
        .ilike("note", "%invoice_advance_for:%")
        .order("created_at", { ascending: false })
        .limit(500);

      const advanceMap: Record<string, number> = {};
      (advanceRows || []).forEach((row) => {
        const invoiceNumber = parseInvoiceAdvanceRef(row.note);
        if (!invoiceNumber) return;
        advanceMap[invoiceNumber] = (advanceMap[invoiceNumber] || 0) + Number(row.amount || 0);
      });
      setInvoiceAdvances(advanceMap);
    } catch (err) {
      toast.error("Failed to load invoices");
    } finally {
      setLoading(false);
    }
  }

  const handleDeleteInvoice = async (invoice: any) => {
    if (!isOwner) {
      toast.error("Only owner can delete invoices.");
      return;
    }
    if (!hasValidOtp) {
      setPendingInvoice(invoice);
      setOtpModalOpen(true);
      void requestOwnerOtp();
      toast.error("Owner OTP verification required.");
      return;
    }
    try {
      const { error } = await supabase.from("invoices").delete().eq("id", invoice.id);
      if (error) throw error;

      await logActivity({
        action: "delete",
        entityType: "invoice",
        entityId: invoice.id,
        entityLabel: invoice.invoice_number,
        description: "Deleted invoice",
        metadata: { grand_total: invoice.grand_total },
      });

      setInvoices((current) => current.filter((item) => item.id !== invoice.id));
      setInvoiceToDelete(null);
      toast.success(`${invoice.invoice_number} deleted`);
    } catch {
      toast.error("Failed to delete invoice");
    }
  };

  const openDeleteWithOtp = (invoice: any) => {
    if (!isOwner) {
      toast.error("Only owner can delete invoices.");
      return;
    }
    if (hasValidOtp) {
      setInvoiceToDelete(invoice);
      return;
    }
    setPendingInvoice(invoice);
    setOtpModalOpen(true);
    void requestOwnerOtp();
  };

  const handleCreateNew = async () => {
    const now = new Date();
    const prefix = createInvoicePrefix(now);

    const { count, error } = await supabase
      .from("invoices")
      .select("*", { count: "exact", head: true })
      .ilike("invoice_number", `${prefix}%`);

    if (error) {
      toast.error("Failed to prepare invoice number");
      return;
    }

    const newId = createInvoiceNumber((count || 0) + 1, now);
    router.push(`/billing/${newId}`);
  };

  if (isViewing && viewInvoiceId) {
    return <InvoiceViewer invoiceId={viewInvoiceId} />;
  }

  if (isCreating) {
    return <InvoiceCreator initialInvoiceNumber={currentInvoiceId!} />;
  }

  const filteredInvoices = invoices.filter(inv => {
    const status = getInvoicePaymentStatus(inv);
    if (activeTab !== "All Invoice" && status !== activeTab) return false;

    if (amountFilter !== "all") {
      const paidAmount = getInvoicePaidAmount(inv);
      const outstandingAmount = getInvoiceOutstanding(inv);
      const discountAmount = getInvoiceDiscount(inv);
      const advanceAmount = invoiceAdvances[inv.invoice_number] || 0;
      const amountValue =
        amountFilter === "paid"
          ? paidAmount
          : amountFilter === "outstanding"
            ? outstandingAmount
            : amountFilter === "discount"
              ? discountAmount
              : advanceAmount;
      if (amountValue <= 0) return false;
    }

    return (
      inv.invoice_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      inv.vehicles?.owner_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      inv.vehicles?.vehicle_reg.toLowerCase().includes(searchTerm.toLowerCase())
    );
  });

  const getTabCount = (status: TabStatus) => {
    if (status === "All Invoice") return invoices.length;
    return invoices.filter(inv => getInvoicePaymentStatus(inv) === status).length;
  };

  const openPaymentDialog = (invoice: any) => {
    setPaymentInvoice(invoice);
    setPaymentAmount("0");
    setPaymentDate(invoice.payment_date || format(new Date(), "yyyy-MM-dd"));
    setPaymentMode(invoice.payment_mode === "cash" ? "cash" : "upi");
    setApplyAdvance(false);
  };

  const handleUpdatePayment = async () => {
    if (!paymentInvoice) return;
    const grandTotal = Number(paymentInvoice.grand_total || 0);
    const previousPaidAmount = getInvoicePaidAmount(paymentInvoice);
    const outstandingBefore = Math.max(grandTotal - previousPaidAmount, 0);
    const paymentInput = Math.max(Number(paymentAmount || 0), 0);
    const paymentToInvoice = Math.min(paymentInput, outstandingBefore);
    const extraPayment = Math.max(paymentInput - outstandingBefore, 0);
    const advanceAmount = applyAdvance ? extraPayment : 0;
    const nextPaidAmount = Math.max(0, Math.min(previousPaidAmount + paymentToInvoice, grandTotal));
    const nextOutstandingAmount = Math.max(grandTotal - nextPaidAmount, 0);
    const nextPaymentStatus = nextPaidAmount <= 0 ? "unpaid" : nextOutstandingAmount <= 0 ? "paid" : "partial";
    const paymentDelta = paymentToInvoice;

    const { error } = await supabase
      .from("invoices")
      .update({
        payment_mode: paymentMode,
        payment_status: nextPaymentStatus,
        paid_amount: nextPaidAmount,
        outstanding_amount: nextOutstandingAmount,
        payment_date: nextPaidAmount > 0 ? paymentDate : null,
      })
      .eq("id", paymentInvoice.id);

    if (error) {
      toast.error(error.message);
      return;
    }

    if (paymentDelta > 0) {
      const vehicleReg = paymentInvoice.vehicles?.vehicle_reg || "";
      const carId = paymentInvoice.vehicles?.car_id || "";
      const vehicleLabel = vehicleReg || carId;
      await supabase
        .from("transactions")
        .insert([{
          description: `Invoice ${paymentInvoice.invoice_number} payment update${vehicleLabel ? ` · ${vehicleLabel}` : ""}`,
          amount: paymentDelta,
          type: "credit",
          payment_mode: paymentMode,
          date: nextPaidAmount > 0 ? paymentDate : format(new Date(), "yyyy-MM-dd"),
          note: `Manual payment update | invoice_payment_for:${paymentInvoice.invoice_number} | outstanding:${nextOutstandingAmount}${vehicleReg ? ` | vehicle_reg:${vehicleReg}` : ""}${carId ? ` | car_id:${carId}` : ""}`,
        }]);
    }

    if (advanceAmount > 0) {
      const carId = paymentInvoice.vehicles?.car_id || "";
      await supabase
        .from("transactions")
        .insert([{
          description: `Advance for Invoice ${paymentInvoice.invoice_number}`,
          amount: advanceAmount,
          type: "credit",
          payment_mode: paymentMode,
          date: paymentDate,
          note: `Advance payment | invoice_advance_for:${paymentInvoice.invoice_number} | vehicle_id:${paymentInvoice.vehicle_id || ""}${carId ? ` | car_id:${carId}` : ""}`,
        }]);
    }

    {
      const vehicleReg = paymentInvoice.vehicles?.vehicle_reg || "";
      const carId = paymentInvoice.vehicles?.car_id || "";
      const vehicleLabel = vehicleReg || carId;
      const entityLabel = vehicleLabel
        ? `${paymentInvoice.invoice_number} · ${vehicleLabel}`
        : paymentInvoice.invoice_number;
      await logActivity({
        action: "edit",
        entityType: "invoice",
        entityId: paymentInvoice.id,
        entityLabel,
        description: `Invoice ${paymentInvoice.invoice_number} payment update${vehicleLabel ? ` · ${vehicleLabel}` : ""}`,
        metadata: {
          invoice_number: paymentInvoice.invoice_number,
          vehicle_reg: vehicleReg || null,
          car_id: carId || null,
          payment_mode: paymentMode,
          payment_amount: paymentDelta,
          outstanding_amount: nextOutstandingAmount,
          payment_status: nextPaymentStatus,
          advance_amount: advanceAmount,
        },
      });
    }

    await fetchInvoices();
    setPaymentInvoice(null);
    toast.success("Invoice payment updated");
  };

  const handleCloseOutstanding = async () => {
    if (!paymentInvoice) return;
    const grandTotal = Number(paymentInvoice.grand_total || 0);
    const previousPaidAmount = getInvoicePaidAmount(paymentInvoice);
    const outstandingBefore = Math.max(grandTotal - previousPaidAmount, 0);
    const paymentInput = Math.max(Number(paymentAmount || 0), 0);
    const paymentToInvoice = Math.min(paymentInput, outstandingBefore);
    const extraPayment = Math.max(paymentInput - outstandingBefore, 0);
    const advanceAmount = applyAdvance ? extraPayment : 0;
    const nextPaidAmount = Math.max(0, Math.min(previousPaidAmount + paymentToInvoice, grandTotal));
    const paymentDelta = paymentToInvoice;

    const { error } = await supabase
      .from("invoices")
      .update({
        payment_mode: paymentMode,
        payment_status: "paid",
        paid_amount: nextPaidAmount,
        outstanding_amount: 0,
        payment_date: paymentDate,
      })
      .eq("id", paymentInvoice.id);

    if (error) {
      toast.error(error.message);
      return;
    }

    if (paymentDelta > 0) {
      const vehicleReg = paymentInvoice.vehicles?.vehicle_reg || "";
      const carId = paymentInvoice.vehicles?.car_id || "";
      const vehicleLabel = vehicleReg || carId;
      await supabase
        .from("transactions")
        .insert([{
          description: `Invoice ${paymentInvoice.invoice_number} payment update${vehicleLabel ? ` · ${vehicleLabel}` : ""}`,
          amount: paymentDelta,
          type: "credit",
          payment_mode: paymentMode,
          date: paymentDate,
          note: `Manual payment close outstanding | invoice_payment_for:${paymentInvoice.invoice_number} | outstanding:0${vehicleReg ? ` | vehicle_reg:${vehicleReg}` : ""}${carId ? ` | car_id:${carId}` : ""}`,
        }]);
    }

    if (advanceAmount > 0) {
      const carId = paymentInvoice.vehicles?.car_id || "";
      await supabase
        .from("transactions")
        .insert([{
          description: `Advance for Invoice ${paymentInvoice.invoice_number}`,
          amount: advanceAmount,
          type: "credit",
          payment_mode: paymentMode,
          date: paymentDate,
          note: `Advance payment | invoice_advance_for:${paymentInvoice.invoice_number} | vehicle_id:${paymentInvoice.vehicle_id || ""}${carId ? ` | car_id:${carId}` : ""}`,
        }]);
    }

    {
      const vehicleReg = paymentInvoice.vehicles?.vehicle_reg || "";
      const carId = paymentInvoice.vehicles?.car_id || "";
      const vehicleLabel = vehicleReg || carId;
      const entityLabel = vehicleLabel
        ? `${paymentInvoice.invoice_number} · ${vehicleLabel}`
        : paymentInvoice.invoice_number;
      await logActivity({
        action: "edit",
        entityType: "invoice",
        entityId: paymentInvoice.id,
        entityLabel,
        description: `Invoice ${paymentInvoice.invoice_number} payment update${vehicleLabel ? ` · ${vehicleLabel}` : ""}`,
        metadata: {
          invoice_number: paymentInvoice.invoice_number,
          vehicle_reg: vehicleReg || null,
          car_id: carId || null,
          payment_mode: paymentMode,
          payment_amount: paymentDelta,
          outstanding_amount: 0,
          payment_status: "paid",
          advance_amount: advanceAmount,
        },
      });
    }

    await fetchInvoices();
    setPaymentInvoice(null);
    toast.success("Outstanding closed");
  };

  return (
    <div className="min-h-screen bg-[#f4f6fb] p-5 font-sans text-slate-900">
      <div className="min-h-[calc(100vh-40px)] rounded-[28px] border border-slate-200 bg-white shadow-[0_24px_60px_rgba(15,23,42,0.07)] overflow-hidden">
      {/* Top Simple Header */}
      <div className="px-8 py-6 flex items-center justify-between">
         <div className="flex items-center">
            <h1 className="text-2xl font-bold tracking-tight">Invoices</h1>
         </div>
         <button 
           onClick={handleCreateNew}
           className="px-5 py-2.5 bg-[#4f46e5] text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 transition-all flex items-center gap-2 shadow-sm"
         >
            Create New Invoice
         </button>
      </div>

      {/* Controls Bar */}
      <div className="px-8 border-b border-slate-100 py-6 flex items-center justify-between bg-zinc-50/20">
         <div>
            <h2 className="text-sm font-black text-slate-800 uppercase tracking-widest italic">Terminal Records</h2>
            <div className="flex items-center gap-6 mt-4">
               {(["All Invoice", "Draft", "Open", "Partial", "Paid"] as TabStatus[]).map(tab => (
                 <button
                   key={tab}
                   onClick={() => setActiveTab(tab)}
                   className={cn(
                     "text-[10px] font-black uppercase tracking-widest pb-2 border-b-2 transition-all relative group",
                     activeTab === tab 
                      ? "text-[#4f46e5] border-[#4f46e5]" 
                      : "text-slate-400 border-transparent hover:text-slate-600"
                   )}
                 >
                   {tab}
                   <span className={cn(
                     "ml-2 px-1.5 py-0.5 rounded-full text-[9px] font-black",
                     activeTab === tab ? "bg-indigo-50 text-[#4f46e5]" : "bg-slate-50 text-slate-400"
                   )}>
                     {getTabCount(tab)}
                   </span>
                 </button>
               ))}
            </div>
         </div>
         
         <div className="flex items-center gap-3">
            <div className="relative group">
               <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300 group-focus-within:text-[#4f46e5] transition-colors" />
               <input 
                 type="text" 
                 placeholder="Search ID, Name or Reg..."
                 className="pl-9 pr-4 py-2 bg-white border border-slate-100 rounded-lg text-sm font-medium focus:ring-4 ring-indigo-500/5 focus:border-indigo-500 outline-none w-72 transition-all shadow-sm"
                 value={searchTerm}
                 onChange={(e) => setSearchTerm(e.target.value)}
               />
            </div>
            <button className="p-2 border border-slate-100 rounded-lg hover:bg-slate-50 transition-colors bg-white shadow-sm">
               <Filter className="w-4.5 h-4.5 text-slate-400" />
            </button>
            <button className="p-2 border border-slate-100 rounded-lg hover:bg-slate-50 transition-colors bg-white shadow-sm">
               <MoreVertical className="w-4.5 h-4.5 text-slate-400" />
            </button>
         </div>
      </div>

      {/* Advanced Table */}
      <div className="px-8 pt-6">
         <div className="border border-slate-100 rounded-[24px] overflow-hidden shadow-sm bg-white">
            <table className="w-full text-left border-collapse">
               <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                     <th className="px-6 py-4 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Number</th>
                     <th className="px-6 py-4 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Client</th>
                     <th className="px-6 py-4 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Contact</th>
                     <th className="px-6 py-4 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Invoice Date</th>
                     <th className="px-6 py-4 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                       <div className="flex items-center justify-between gap-2">
                         <span>Amount</span>
                         <select
                           value={amountFilter}
                           onChange={(e) => setAmountFilter(e.target.value as typeof amountFilter)}
                           className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[10px] font-semibold text-slate-500"
                         >
                           <option value="all">All</option>
                           <option value="paid">Paid</option>
                           <option value="outstanding">Outstanding</option>
                           <option value="discount">Discount</option>
                           <option value="advance">Advance</option>
                         </select>
                       </div>
                     </th>
                     <th className="px-6 py-4 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Status</th>
                      <th className="px-6 py-4 text-right pr-10 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Actions</th>
                   </tr>
                </thead>
               <tbody className="divide-y divide-slate-50">
                  {loading ? (
                     <tr>
                        <td colSpan={7} className="py-24">
                           <LoadingSpinner label="Retrieving Terminal Archive" />
                        </td>
                     </tr>
                  ) : filteredInvoices.map((inv) => {
                     const status = getInvoicePaymentStatus(inv);
                     const paidAmount = getInvoicePaidAmount(inv);
                     const outstandingAmount = getInvoiceOutstanding(inv);
                     const discountAmount = getInvoiceDiscount(inv);
                     const advanceAmount = invoiceAdvances[inv.invoice_number] || 0;
                     const clientColorIndex = inv.vehicles?.owner_name.length % 5;
                     const colors = [
                        "bg-purple-50 text-purple-600 border-purple-100",
                        "bg-emerald-50 text-emerald-600 border-emerald-100",
                        "bg-indigo-50 text-indigo-600 border-indigo-100",
                        "bg-rose-50 text-rose-600 border-rose-100",
                        "bg-cyan-50 text-cyan-600 border-cyan-100"
                     ];
                     
                     return (
                        <tr 
                           key={inv.id} 
                           onClick={() => {
                             router.push(getInvoiceOpenRoute(inv));
                           }}
                           className="group hover:bg-slate-50/50 transition-colors cursor-pointer"
                         >
                           <td className="px-6 py-4">
                              <span className="font-bold text-[12px] text-slate-700 tracking-tight">{inv.invoice_number}</span>
                           </td>
                           <td className="px-6 py-4">
                              <p className="font-bold text-sm text-slate-900 leading-tight">{inv.vehicles?.owner_name}</p>
                           </td>
                           <td className="px-6 py-4">
                              <div className="space-y-0.5">
                                 <p className="font-medium text-slate-500 text-[11px] truncate max-w-[140px]">{inv.vehicles?.phone_number || "no-contact@sgv.in"}</p>
                                  <button 
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      navigator.clipboard.writeText(inv.vehicles?.phone_number || "");
                                      toast.success("Copied to clipboard");
                                    }}
                                    className="flex items-center gap-1 text-[10px] text-blue-500 font-bold hover:underline   transition-opacity"
                                  >
                                     <Copy className="w-3 h-3" /> Copy
                                  </button>
                              </div>
                           </td>
                           <td className="px-6 py-4">
                              <p className="text-[11px] font-bold text-slate-600">
                                 {format(new Date(inv.created_at), "dd MMM, yyyy")}
                              </p>
                           </td>
                           <td className="px-6 py-4">
                              <p className="text-sm font-black text-slate-900 tracking-tight">{formatCurrency(inv.grand_total)}</p>
                              {amountFilter === "all" || amountFilter === "paid" ? (
                                <p className="mt-1 text-[11px] font-medium text-emerald-600">Paid {formatCurrency(paidAmount)}</p>
                              ) : null}
                              {amountFilter === "all" || amountFilter === "outstanding" ? (
                                <p className="text-[11px] font-medium text-rose-600">Outstanding {formatCurrency(outstandingAmount)}</p>
                              ) : null}
                              {amountFilter === "all" || amountFilter === "discount" ? (
                                discountAmount > 0 ? (
                                  <p className="text-[11px] font-medium text-amber-600">Discount {formatCurrency(discountAmount)}</p>
                                ) : null
                              ) : null}
                              {amountFilter === "all" || amountFilter === "advance" ? (
                                advanceAmount > 0 ? (
                                  <p className="text-[11px] font-medium text-sky-600">Advance {formatCurrency(advanceAmount)}</p>
                                ) : null
                              ) : null}
                           </td>
                           <td className="px-6 py-4">
                              <span className={cn(
                                 "px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border",
                                 status === 'Paid' ? "bg-emerald-50 text-emerald-600 border-emerald-100" :
                                 status === 'Partial' ? "bg-indigo-50 text-indigo-700 border-indigo-100" :
                                 status === 'Draft' ? "bg-blue-50 text-blue-600 border-blue-100" :
                                 "bg-amber-50 text-amber-700 border-amber-100"
                              )}>
                                 {status}
                              </span>
                              <p className="mt-1 text-[10px] font-semibold text-slate-500">
                                {inv.payment_date ? `Paid on ${format(new Date(inv.payment_date), "dd MMM yyyy")}` : "Payment pending"}
                              </p>
                           </td>
                            <td className="px-6 py-4 text-right pr-10">
                              <div className="flex items-center justify-end gap-2">
                                 <button
                                   onClick={(e) => {
                                      e.stopPropagation();
                                      router.push(getInvoiceOpenRoute(inv));
                                   }}
                                   className="p-1.5 hover:bg-indigo-50 rounded-lg text-slate-300 hover:text-[#4f46e5] transition-all  "
                                   title={inv.status === "draft" ? "Continue Billing" : "View Invoice"}
                                 >
                                    <Eye className="w-4 h-4" />
                                 </button>
                                 <button 
                                   onClick={(e) => {
                                      e.stopPropagation();
                                      generateInvoicePDF({
                                         invoice_number: inv.invoice_number,
                                         vehicle: inv.vehicles,
                                         items: inv.items || [],
                                         labour: inv.labour || [],
                                         grand_total: inv.grand_total,
                                         payment_mode: inv.payment_mode,
                                         note: inv.note,
                                         date: inv.created_at
                                      });
                                      toast.success(`Downloading ${inv.invoice_number}`);
                                   }}
                                   className="p-1.5 hover:bg-blue-50 rounded-lg text-slate-300 hover:text-blue-600 transition-all  "
                                   title="Download PDF"
                                 >
                                    <Download className="w-4 h-4" />
                                 </button>
                                 <button 
                                   onClick={(e) => {
                                      e.stopPropagation();
                                      openPaymentDialog(inv);
                                   }}
                                   className="p-1.5 hover:bg-emerald-50 rounded-lg text-slate-300 hover:text-emerald-600 transition-all  "
                                   title="Update Payment"
                                 >
                                    <CheckCircle2 className="w-4 h-4" />
                                 </button>
                                 <button 
                                   onClick={(e) => {
                                      e.stopPropagation();
                                      router.push(`/billing/${inv.invoice_number}`);
                                   }}
                                   className={cn(
                                     "p-1.5 rounded-lg transition-all  ",
                                     "text-slate-300 hover:text-[#4f46e5] hover:bg-indigo-50"
                                   )}
                                   title="Edit Invoice"
                                 >
                                    <ArrowUpRight className="w-4 h-4" />
                                 </button>
                                 <button
                                   onClick={(e) => {
                                      e.stopPropagation();
                                      openDeleteWithOtp(inv);
                                   }}
                                   className="p-1.5 hover:bg-rose-50 rounded-lg text-slate-300 hover:text-rose-600 transition-all  "
                                   title="Delete Invoice"
                                 >
                                    <Trash2 className="w-4 h-4" />
                                 </button>
                              </div>
                           </td>
                        </tr>
                     );
                  })}
               </tbody>
            </table>
            
            {!loading && filteredInvoices.length === 0 && (
               <div className="py-20 text-center bg-white">
                  <div className="inline-flex w-16 h-16 bg-slate-50 rounded-full items-center justify-center mb-4">
                     <FileText className="w-8 h-8 text-slate-200" />
                  </div>
                  <p className="font-bold text-slate-800">No records found for "{activeTab}"</p>
                  <button onClick={() => setActiveTab("All Invoice")} className="mt-2 text-blue-500 font-bold text-sm tracking-tight hover:underline">Clear all filters</button>
               </div>
            )}
         </div>

         {/* Pagination Footer - Only show if list is large enough to need it */}
         {filteredInvoices.length > 10 && (
            <div className="mt-6 flex flex-col md:flex-row items-center justify-between gap-4 pb-10">
               <div className="flex items-center gap-3">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Items Per Page</span>
                  <div className="relative">
                     <select className="appearance-none bg-slate-50 border border-slate-100 rounded-lg pl-4 pr-10 py-1.5 text-xs font-bold focus:ring-4 ring-indigo-500/5 outline-none cursor-pointer shadow-sm">
                        <option>10</option>
                        <option>20</option>
                        <option>50</option>
                     </select>
                     <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400" />
                  </div>
               </div>
               
               <div className="flex items-center gap-3">
                  <button className="flex items-center gap-2 px-4 py-2 border border-slate-100 rounded-lg text-xs font-bold text-slate-500 hover:bg-slate-50 transition-all bg-white shadow-sm opacity-50 cursor-not-allowed">
                     <ChevronLeft className="w-4 h-4" /> Previous
                  </button>
                  <button className="flex items-center gap-2 px-4 py-2 border border-slate-100 rounded-lg text-xs font-bold text-slate-500 hover:bg-slate-50 transition-all bg-white shadow-sm">
                     Next <ChevronRight className="w-4 h-4" />
                  </button>
               </div>
            </div>
         )}
      </div>
      </div>
      {invoiceToDelete ? (
        <ConfirmDeleteModal
          title="Delete Invoice?"
          description={`Delete ${invoiceToDelete.invoice_number}. This action cannot be undone.`}
          confirmLabel="Delete Invoice"
          onConfirm={() => void handleDeleteInvoice(invoiceToDelete)}
          onCancel={() => setInvoiceToDelete(null)}
        />
      ) : null}
      {otpModalOpen ? (
        <div className="fixed inset-0 z-[160] flex items-center justify-center p-6 animate-in fade-in duration-200">
          <div
            className="absolute inset-0 bg-slate-950/45 backdrop-blur-sm"
            onClick={() => {
              setOtpModalOpen(false);
              setPendingInvoice(null);
            }}
          />
          <div className="relative z-10 w-full max-w-[420px] rounded-[24px] border border-slate-200 bg-white p-6 shadow-[0_24px_60px_rgba(15,23,42,0.28)]">
            <button
              type="button"
              onClick={() => {
                setOtpModalOpen(false);
                setPendingInvoice(null);
              }}
              className="absolute right-4 top-4 inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
            >
              <X className="w-4 h-4" />
            </button>
            <h3 className="text-lg font-semibold text-[#111827]">Owner OTP verification</h3>
            <p className="mt-1 text-[13px] text-slate-500">
              Enter the 9-character OTP sent to {ownerEmail || "your owner email"} to delete the invoice.
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
      {paymentInvoice ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4">
          <div className="w-full max-w-md rounded-[28px] bg-white p-6 shadow-2xl">
            <div className="text-lg font-bold text-slate-900">Update Payment</div>
            <div className="mt-1 text-sm text-slate-500">{paymentInvoice.invoice_number}</div>
            <div className="mt-4 grid gap-4">
              <div>
                <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500">Next Payment Amount</label>
                <input
                  type="number"
                  min={0}
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-indigo-300"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500">Already Paid</label>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700">
                  {formatCurrency(getInvoicePaidAmount(paymentInvoice))}
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500">Payment Date</label>
                <input
                  type="date"
                  value={paymentDate}
                  onChange={(e) => setPaymentDate(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-indigo-300"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500">Outstanding</label>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700">
                  {(() => {
                    const grandTotal = Number(paymentInvoice.grand_total || 0);
                    const previousPaid = getInvoicePaidAmount(paymentInvoice);
                    const outstandingBefore = Math.max(grandTotal - previousPaid, 0);
                    const paymentInput = Math.max(Number(paymentAmount || 0), 0);
                    const paymentToInvoice = Math.min(paymentInput, outstandingBefore);
                    const nextOutstanding = Math.max(outstandingBefore - paymentToInvoice, 0);
                    return formatCurrency(nextOutstanding);
                  })()}
                </div>
              </div>
              {(() => {
                const grandTotal = Number(paymentInvoice.grand_total || 0);
                const previousPaid = getInvoicePaidAmount(paymentInvoice);
                const outstandingBefore = Math.max(grandTotal - previousPaid, 0);
                const paymentInput = Math.max(Number(paymentAmount || 0), 0);
                const extraPayment = Math.max(paymentInput - outstandingBefore, 0);
                if (extraPayment <= 0) return null;
                return (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-semibold text-amber-700">
                    <div>Extra received: {formatCurrency(extraPayment)}</div>
                    <label className="mt-2 flex items-center gap-2 text-[11px] font-semibold text-amber-700">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-amber-300 text-amber-600"
                        checked={applyAdvance}
                        onChange={(event) => setApplyAdvance(event.target.checked)}
                      />
                      Add extra as advance for this vehicle
                    </label>
                    {!applyAdvance ? (
                      <div className="mt-1 text-[10px] text-amber-600">
                        Extra amount will not be recorded unless marked as advance.
                      </div>
                    ) : null}
                  </div>
                );
              })()}
              <div>
                <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500">Payment Mode</label>
                <div className="flex gap-2">
                  {(["cash", "upi"] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setPaymentMode(mode)}
                      className={cn(
                        "rounded-xl border px-4 py-2 text-sm font-semibold",
                        paymentMode === mode
                          ? mode === "cash"
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                            : "border-indigo-200 bg-indigo-50 text-indigo-700"
                          : "border-slate-200 bg-white text-slate-600",
                      )}
                    >
                      {mode.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setPaymentInvoice(null)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleUpdatePayment()}
                className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-100"
              >
                Save Partial Payment
              </button>
              <button
                type="button"
                onClick={() => void handleCloseOutstanding()}
                className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
              >
                Save Payment and Close Outstanding
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
