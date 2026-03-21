"use client";

import React, { useEffect, useState } from "react";
import { CalendarDays, Copy, Download, FileText, Repeat, Search, Trash2 } from "lucide-react";
import toast from "react-hot-toast";
import { useRouter } from "next/navigation";
import { createQuotationNumber, formatCurrency } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { QuotationCreator } from "@/components/QuotationCreator";
import { QuotationViewer } from "@/components/QuotationViewer";
import { generateQuotationPDF } from "@/lib/pdf-service";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { ConfirmDeleteModal } from "@/components/ConfirmDeleteModal";
import { logActivity } from "@/lib/activity-log";
import { format } from "date-fns";

interface QuotationRecord {
  id: string;
  quotation_number: string;
  items: Array<{ name: string; quantity?: number; unit_price?: number; total?: number; part_id?: string }>;
  labour: Array<{ description?: string; amount: number }>;
  start_date: string;
  end_date: string;
  discount: number;
  total_spare: number;
  total_labour: number;
  subtotal_before_tax: number;
  total_tax: number;
  grand_total: number;
  note?: string | null;
  created_at: string;
  vehicles?: {
    owner_name: string;
    phone_number: string;
    vehicle_reg: string;
    car_id: string;
    make_model?: string | null;
  } | null;
  profiles?: {
    username?: string;
  } | null;
}

export default function QuotationsPage({ params }: { params: Promise<{ slug?: string[] }> }) {
  const router = useRouter();
  const unwrappedParams = React.use(params);
  const slug = unwrappedParams.slug;
  const isViewing = !!slug && slug[0] === "view" && !!slug[1];
  const isEditing = !!slug && slug[0] === "edit" && !!slug[1];
  const isCreating = !!slug && slug.length > 0 && !isViewing && !isEditing;
  const currentQuotationId = isCreating ? slug.join("/") : null;
  const viewQuotationId = isViewing ? slug[1] : null;
  const editQuotationId = isEditing ? slug[1] : null;

  const [quotations, setQuotations] = useState<QuotationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [quotationToDelete, setQuotationToDelete] = useState<QuotationRecord | null>(null);

  useEffect(() => {
    if (!isCreating && !isViewing) {
      void fetchQuotations();
    }
  }, [isCreating, isViewing]);

  async function fetchQuotations() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("quotations")
        .select(`
          *,
          vehicles (
            owner_name,
            phone_number,
            vehicle_reg,
            car_id,
            make_model
          ),
          profiles (
            username
          )
        `)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setQuotations((data || []) as QuotationRecord[]);
    } catch {
      toast.error("Failed to load quotations");
    } finally {
      setLoading(false);
    }
  }

  const handleCreateNew = async () => {
    const now = new Date();
    const month = now.toLocaleString("en", { month: "short" }).toUpperCase();
    const year = now.getFullYear();
    const prefix = `QTN/${month}/${year}/`;

    const { count, error } = await supabase
      .from("quotations")
      .select("*", { count: "exact", head: true })
      .ilike("quotation_number", `${prefix}%`);

    if (error) {
      toast.error("Failed to prepare quotation number");
      return;
    }

    const nextId = createQuotationNumber((count || 0) + 1, now);
    router.push(`/quotations/${nextId}`);
  };

  const handleDeleteQuotation = async (quotation: QuotationRecord) => {
    try {
      const { error } = await supabase.from("quotations").delete().eq("id", quotation.id);
      if (error) throw error;

      await logActivity({
        action: "delete",
        entityType: "quotation",
        entityId: quotation.id,
        entityLabel: quotation.quotation_number,
        description: "Deleted quotation",
        metadata: { grand_total: quotation.grand_total },
      });

      setQuotations((current) => current.filter((item) => item.id !== quotation.id));
      setQuotationToDelete(null);
      toast.success(`${quotation.quotation_number} deleted`);
    } catch {
      toast.error("Failed to delete quotation");
    }
  };

  if (isViewing && viewQuotationId) {
    return <QuotationViewer quotationId={viewQuotationId} />;
  }

  if (isCreating || isEditing) {
    return (
      <QuotationCreator 
        initialQuotationNumber={currentQuotationId || ""} 
        quotationId={editQuotationId || undefined}
      />
    );
  }

  const filtered = quotations.filter((quotation) => {
    const query = searchTerm.toLowerCase();
    return (
      quotation.quotation_number.toLowerCase().includes(query) ||
      quotation.vehicles?.owner_name?.toLowerCase().includes(query) ||
      quotation.vehicles?.vehicle_reg?.toLowerCase().includes(query)
    );
  });

  return (
    <div className="min-h-screen bg-[#f4f6fb] p-5 font-sans text-slate-900">
      <div className="min-h-[calc(100vh-40px)] rounded-[28px] border border-slate-200 bg-white shadow-[0_24px_60px_rgba(15,23,42,0.07)] overflow-hidden">
        <div className="px-8 py-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Quotations</h1>
            <p className="mt-1 text-sm text-slate-500">Create and manage customer quotations.</p>
          </div>
          <button
            onClick={handleCreateNew}
            className="px-5 py-2.5 bg-[#4f46e5] text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 transition-all shadow-sm"
          >
            New Quotation
          </button>
        </div>

        <div className="px-8 border-b border-slate-100 py-6 flex items-center justify-between bg-zinc-50/20">
          <div>
            <h2 className="text-sm font-black text-slate-800 uppercase tracking-widest italic">Quotation Records</h2>
            <p className="text-[10px] text-slate-400 font-bold mt-0.5">Showing all saved quotations</p>
          </div>

          <div className="relative group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300 group-focus-within:text-[#4f46e5] transition-colors" />
            <input
              type="text"
              placeholder="Search number, name or reg..."
              className="pl-9 pr-4 py-2 bg-white border border-slate-100 rounded-lg text-sm font-medium focus:ring-4 ring-indigo-500/5 focus:border-indigo-500 outline-none w-72 transition-all shadow-sm"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
            />
          </div>
        </div>

        <div className="px-8 pt-6">
          <div className="border border-slate-100 rounded-[24px] overflow-hidden shadow-sm bg-white">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  <th className="px-6 py-4 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Number</th>
                  <th className="px-6 py-4 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Client</th>
                  <th className="px-6 py-4 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Validity</th>
                  <th className="px-6 py-4 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Discount</th>
                  <th className="px-6 py-4 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Amount</th>
                  <th className="px-6 py-4 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Created By</th>
                  <th className="px-6 py-4 text-right pr-10 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {loading ? (
                  <tr>
                    <td colSpan={7} className="py-24">
                      <LoadingSpinner label="Retrieving quotations" />
                    </td>
                  </tr>
                ) : filtered.map((quotation) => (
                  <tr 
                    key={quotation.id} 
                    onClick={() => router.push(`/quotations/view/${quotation.id}`)}
                    className="group hover:bg-slate-50/50 transition-colors cursor-pointer"
                  >
                    <td className="px-6 py-4">
                      <span className="font-bold text-[12px] text-slate-700 tracking-tight">
                        {quotation.quotation_number}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <p className="font-bold text-sm text-slate-900 leading-tight">
                        {quotation.vehicles?.owner_name || "—"}
                      </p>
                      <p className="text-[11px] text-slate-400 mt-1">
                        {quotation.vehicles?.vehicle_reg || "—"}
                      </p>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2 text-[11px] font-bold text-slate-600">
                        <CalendarDays className="w-3.5 h-3.5 text-slate-400" />
                        {format(new Date(quotation.start_date), "dd MMM")} - {format(new Date(quotation.end_date), "dd MMM, yyyy")}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-sm font-black text-slate-900 tracking-tight">
                        {formatCurrency(Number(quotation.discount || 0))}
                      </p>
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-sm font-black text-slate-900 tracking-tight">
                        {formatCurrency(Number(quotation.grand_total || 0))}
                      </p>
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-[11px] font-bold text-slate-500">
                        {quotation.profiles?.username || "Admin"}
                      </p>
                    </td>
                    <td className="px-6 py-4 text-right pr-10">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={(event) => {
                            event.stopPropagation();
                            router.push(`/quotations/view/${quotation.id}`);
                          }}
                          className="p-1.5 hover:bg-indigo-50 rounded-lg text-slate-300 hover:text-indigo-600 transition-all opacity-0 group-hover:opacity-100"
                          title="View quotation"
                        >
                          <FileText className="w-4 h-4" />
                        </button>
                        <button
                          onClick={(event) => {
                            event.stopPropagation();
                            router.push(`/billing/new?quotation_id=${quotation.id}`);
                          }}
                          className="p-1.5 hover:bg-indigo-50 rounded-lg text-slate-300 hover:text-indigo-600 transition-all opacity-0 group-hover:opacity-100"
                          title="Convert to invoice"
                        >
                          <Repeat className="w-4 h-4" />
                        </button>
                        <button
                          onClick={(event) => {
                            event.stopPropagation();
                            navigator.clipboard.writeText(quotation.quotation_number);
                            toast.success("Quotation number copied");
                          }}
                          className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-300 hover:text-slate-600 transition-all opacity-0 group-hover:opacity-100"
                          title="Copy number"
                        >
                          <Copy className="w-4 h-4" />
                        </button>
                        <button
                          onClick={(event) => {
                            event.stopPropagation();
                            generateQuotationPDF({
                              quotation_number: quotation.quotation_number,
                              vehicle: quotation.vehicles || {},
                              items: quotation.items || [],
                              labour: quotation.labour || [],
                              start_date: quotation.start_date,
                              end_date: quotation.end_date,
                              discount: Number(quotation.discount || 0),
                              total_spare: Number(quotation.total_spare || 0),
                              total_labour: Number(quotation.total_labour || 0),
                              subtotal_before_tax: Number(quotation.subtotal_before_tax || 0),
                              total_tax: Number(quotation.total_tax || 0),
                              grand_total: Number(quotation.grand_total || 0),
                              note: quotation.note || "",
                              date: quotation.created_at,
                            });
                            toast.success(`Downloading ${quotation.quotation_number}`);
                          }}
                          className="p-1.5 hover:bg-blue-50 rounded-lg text-slate-300 hover:text-blue-600 transition-all opacity-0 group-hover:opacity-100"
                          title="Download PDF"
                        >
                          <Download className="w-4 h-4" />
                        </button>
                        <button
                          onClick={(event) => {
                            event.stopPropagation();
                            setQuotationToDelete(quotation);
                          }}
                          className="p-1.5 hover:bg-rose-50 rounded-lg text-slate-300 hover:text-rose-600 transition-all opacity-0 group-hover:opacity-100"
                          title="Delete quotation"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {!loading && filtered.length === 0 ? (
              <div className="py-20 text-center bg-white">
                <div className="inline-flex w-16 h-16 bg-slate-50 rounded-full items-center justify-center mb-4">
                  <FileText className="w-8 h-8 text-slate-200" />
                </div>
                <p className="font-bold text-slate-800">No quotations found</p>
                <button onClick={handleCreateNew} className="mt-2 text-blue-500 font-bold text-sm hover:underline">
                  Create your first quotation
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>
      {quotationToDelete ? (
        <ConfirmDeleteModal
          title="Delete Quotation?"
          description={`Delete ${quotationToDelete.quotation_number}. This action cannot be undone.`}
          confirmLabel="Delete Quotation"
          onConfirm={() => void handleDeleteQuotation(quotationToDelete)}
          onCancel={() => setQuotationToDelete(null)}
        />
      ) : null}
    </div>
  );
}
