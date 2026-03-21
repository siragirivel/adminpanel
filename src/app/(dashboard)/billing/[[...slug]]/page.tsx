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
  Trash2
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { format } from "date-fns";
import { createInvoiceNumber, formatCurrency, cn } from "@/lib/utils";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { generateInvoicePDF } from "@/lib/pdf-service";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { ConfirmDeleteModal } from "@/components/ConfirmDeleteModal";
import { logActivity } from "@/lib/activity-log";

type TabStatus = "All Invoice" | "Draft" | "Open" | "Past Due" | "Paid";

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

  useEffect(() => {
    if (!isCreating) {
      fetchInvoices();
    }
  }, [isCreating]);

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
            make_model
          ),
          profiles (
            username
          )
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setInvoices(data || []);
    } catch (err) {
      toast.error("Failed to load invoices");
    } finally {
      setLoading(false);
    }
  }

  const handleDeleteInvoice = async (invoice: any) => {
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

  const handleCreateNew = async () => {
    const now = new Date();
    const month = now.toLocaleString("en", { month: "short" }).toUpperCase();
    const year = now.getFullYear();
    const prefix = `SRV/${month}/${year}/`;

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

  // Mocking status logic as current schema doesn't have it (defaulting to Paid/Open/Draft)
  const getStatus = (inv: any) => {
    if (inv.status === 'draft') return 'Draft';
    if (inv.payment_mode === 'cash' || inv.payment_mode === 'upi' || inv.payment_mode === 'card' || inv.payment_mode === 'cheque') return 'Paid';
    return inv.status || 'Paid';
  };

  const filteredInvoices = invoices.filter(inv => {
    const status = getStatus(inv);
    if (activeTab !== "All Invoice" && status !== activeTab) return false;
    
    return (
      inv.invoice_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      inv.vehicles?.owner_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      inv.vehicles?.vehicle_reg.toLowerCase().includes(searchTerm.toLowerCase())
    );
  });

  const getTabCount = (status: TabStatus) => {
    if (status === "All Invoice") return invoices.length;
    return invoices.filter(inv => getStatus(inv) === status).length;
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
               {(["All Invoice", "Draft", "Paid"] as TabStatus[]).map(tab => (
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
                     <th className="px-6 py-4 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Amount</th>
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
                     const status = getStatus(inv);
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
                             if (status === 'Paid') {
                               router.push(`/billing/view/${inv.id}`);
                             } else {
                               router.push(`/billing/${inv.invoice_number}`);
                             }
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
                                    className="flex items-center gap-1 text-[10px] text-blue-500 font-bold hover:underline opacity-0 group-hover:opacity-100 transition-opacity"
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
                           </td>
                           <td className="px-6 py-4">
                              <span className={cn(
                                 "px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border",
                                 status === 'Paid' ? "bg-emerald-50 text-emerald-600 border-emerald-100" :
                                 status === 'Draft' ? "bg-blue-50 text-blue-600 border-blue-100" :
                                 status === 'Past Due' ? "bg-rose-50 text-rose-600 border-rose-100" :
                                 "bg-purple-50 text-purple-600 border-purple-100"
                              )}>
                                 {status}
                              </span>
                           </td>
                            <td className="px-6 py-4 text-right pr-10">
                              <div className="flex items-center justify-end gap-2">
                                 <button
                                   onClick={(e) => {
                                      e.stopPropagation();
                                      router.push(`/billing/view/${inv.id}`);
                                   }}
                                   className="p-1.5 hover:bg-indigo-50 rounded-lg text-slate-300 hover:text-[#4f46e5] transition-all opacity-0 group-hover:opacity-100"
                                   title="View Invoice"
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
                                         payment_mode: inv.payment_mode
                                      });
                                      toast.success(`Downloading ${inv.invoice_number}`);
                                   }}
                                   className="p-1.5 hover:bg-blue-50 rounded-lg text-slate-300 hover:text-blue-600 transition-all opacity-0 group-hover:opacity-100"
                                   title="Download PDF"
                                 >
                                    <Download className="w-4 h-4" />
                                 </button>
                                 <button 
                                   onClick={(e) => {
                                      e.stopPropagation();
                                      if (status === 'Paid') {
                                        toast.error("Paid invoices cannot be edited");
                                        return;
                                      }
                                      router.push(`/billing/${inv.invoice_number}`);
                                   }}
                                   className={cn(
                                     "p-1.5 rounded-lg transition-all opacity-0 group-hover:opacity-100",
                                     status === 'Paid' 
                                      ? "text-slate-200 cursor-not-allowed hover:bg-transparent" 
                                      : "text-slate-300 hover:text-[#4f46e5] hover:bg-indigo-50"
                                   )}
                                   title={status === 'Paid' ? "Cannot edit paid invoice" : "Edit Invoice"}
                                 >
                                    <ArrowUpRight className="w-4 h-4" />
                                 </button>
                                 <button
                                   onClick={(e) => {
                                      e.stopPropagation();
                                      setInvoiceToDelete(inv);
                                   }}
                                   className="p-1.5 hover:bg-rose-50 rounded-lg text-slate-300 hover:text-rose-600 transition-all opacity-0 group-hover:opacity-100"
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
    </div>
  );
}
