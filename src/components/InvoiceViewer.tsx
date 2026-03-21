"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Download, Loader2, File } from "lucide-react";
import { format } from "date-fns";
import { supabase } from "@/lib/supabase";
import { generateInvoicePDF } from "@/lib/pdf-service";

interface InvoiceVehicle {
  id: string;
  owner_name: string;
  phone_number: string;
  car_id: string;
  vehicle_reg: string;
  make_model?: string | null;
}

interface InvoiceItem {
  name: string;
  quantity?: number;
  unit_price?: number;
  total?: number;
  part_id?: string;
}

interface InvoiceLabour {
  description?: string;
  amount: number;
}

interface InvoiceRecord {
  id: string;
  invoice_number: string;
  items: InvoiceItem[];
  labour: InvoiceLabour[];
  total_spare: number;
  total_labour: number;
  grand_total: number;
  payment_mode: string;
  created_at: string;
  vehicles: InvoiceVehicle | null;
  profiles?: {
    username?: string;
  } | null;
}

interface InvoiceRecordQueryResult
  extends Omit<InvoiceRecord, "vehicles" | "profiles"> {
  vehicles: InvoiceVehicle | InvoiceVehicle[] | null;
  profiles?: { username?: string } | Array<{ username?: string }> | null;
}

function formatAmount(value: number) {
  return `₹${Number(value || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function InvoiceViewer({ invoiceId }: { invoiceId: string }) {
  const [invoice, setInvoice] = useState<InvoiceRecord | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadInvoice = async () => {
      setLoading(true);
      const { data } = await supabase
        .from("invoices")
        .select(`
          id,
          invoice_number,
          items,
          labour,
          total_spare,
          total_labour,
          grand_total,
          payment_mode,
          created_at,
          profiles (
            username
          ),
          vehicles (
            id,
            owner_name,
            phone_number,
            car_id,
            vehicle_reg,
            make_model
          )
        `)
        .eq("id", invoiceId)
        .maybeSingle();

      if (data) {
        const rawInvoice = data as InvoiceRecordQueryResult;
        const normalizedInvoice: InvoiceRecord = {
          ...rawInvoice,
          vehicles: Array.isArray(rawInvoice.vehicles)
            ? rawInvoice.vehicles[0] || null
            : rawInvoice.vehicles,
          profiles: Array.isArray(rawInvoice.profiles)
            ? rawInvoice.profiles[0] || null
            : rawInvoice.profiles || null,
        };

        setInvoice(normalizedInvoice);
      }

      setLoading(false);
    };

    void loadInvoice();
  }, [invoiceId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f4f6fb] p-5">
        <div className="min-h-[calc(100vh-40px)] rounded-[28px] border border-slate-200 bg-white shadow-[0_24px_60px_rgba(15,23,42,0.07)] flex items-center justify-center">
          <div className="flex items-center gap-3 text-slate-500">
            <Loader2 className="h-5 w-5 animate-spin" />
            Loading invoice...
          </div>
        </div>
      </div>
    );
  }

  if (!invoice || !invoice.vehicles) {
    return (
      <div className="min-h-screen bg-[#f4f6fb] p-5">
        <div className="min-h-[calc(100vh-40px)] rounded-[28px] border border-slate-200 bg-white shadow-[0_24px_60px_rgba(15,23,42,0.07)] flex flex-col items-center justify-center gap-4">
          <div className="text-slate-900 text-lg font-semibold">Invoice not found</div>
          <Link href="/billing" className="text-sm font-medium text-indigo-600 hover:underline">
            Back to invoices
          </Link>
        </div>
      </div>
    );
  }

  const subtotalBeforeTax = Number(invoice.total_spare || 0) + Number(invoice.total_labour || 0);
  const totalTax = Math.round(invoice.grand_total - subtotalBeforeTax);
  const invoiceVehicle = invoice.vehicles || {};

  return (
    <div className="min-h-screen bg-[#f4f6fb] p-5 font-['DM_Sans']">
      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=DM+Mono:wght@400;500;600&display=swap');
      `}</style>

      <div className="rounded-[28px] border border-slate-200 bg-white shadow-[0_24px_60px_rgba(15,23,42,0.07)] overflow-hidden">
        <div className="flex items-center justify-between gap-4 border-b border-slate-200 px-8 py-5">
          <div className="flex items-center gap-4">
            <Link
              href="/billing"
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-500 transition hover:bg-slate-50 hover:text-slate-900"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div>
              <div className="text-lg font-semibold text-slate-900">Invoice View</div>
              <div className="text-sm text-slate-500">Matches the printable invoice layout</div>
            </div>
          </div>

          <button
            type="button"
            onClick={() =>
              generateInvoicePDF({
                invoice_number: invoice.invoice_number,
                vehicle: invoiceVehicle,
                items: invoice.items || [],
                labour: invoice.labour || [],
                total_spare: invoice.total_spare,
                total_labour: invoice.total_labour,
                subtotal_before_tax: subtotalBeforeTax,
                total_tax: totalTax,
                grand_total: invoice.grand_total,
                payment_mode: invoice.payment_mode,
                date: invoice.created_at,
              })
            }
            className="inline-flex items-center gap-2 rounded-xl bg-[#4f46e5] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700"
          >
            <Download className="h-4 w-4" />
            Download PDF
          </button>
        </div>

        <div className="bg-white px-8 py-8">
          <div className="mx-auto max-w-[820px] rounded-[24px] border border-slate-200 bg-white p-10 shadow-sm">
            <div className="flex items-start justify-between gap-6">
              <div>
                <img src="/Siragiri.png" alt="Sirigirvel Logo" className="h-10 mb-4" />
                <div className="text-[24px] font-bold tracking-tight text-slate-900">
                  myTVS Erode - Siragiri Vel Automobiles
                </div>
                <div className="mt-3 space-y-1 text-sm leading-6 text-slate-500">
                  <div>SF No.: 330/1, Erode to Perundurai Main Road,</div>
                  <div>Post, Vallipurathanpalayam, Erode,</div>
                  <div>Tamil Nadu - 638 112</div>
                  <div>Ph: +91 98765 00001 | siragirivelautomobiles@mytvs.in</div>
                  <div>GSTIN: 33AABCS1429B1ZB</div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-[28px] font-bold tracking-tight text-slate-900">INVOICE</div>
              </div>
            </div>

            <div className="mt-8 border-t border-slate-200 pt-6">
              <div className="flex items-center justify-between gap-6">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">Invoice No.</div>
                  <div className="mt-1 text-base font-medium text-slate-900">{invoice.invoice_number}</div>
                </div>
                <div className="text-right">
                <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">Date</div>
                  <div className="mt-1 text-base font-medium text-slate-900">
                    {format(new Date(invoice.created_at), "dd-MMM-yyyy")}
                  </div>
                </div>
              </div>
              <div className="mt-4 text-sm text-slate-500">
                Created by <span className="font-medium text-slate-900">{invoice.profiles?.username || "Admin"}</span>
              </div>
            </div>

            <div className="mt-8 grid grid-cols-2 gap-8">
              <div>
                <div className="text-[12px] font-semibold text-slate-500">Customer INFO</div>
                <div className="mt-3 space-y-2 text-sm text-slate-700">
                  <div className="font-semibold text-slate-900">{invoice.vehicles.owner_name}</div>
                  <div>{invoice.vehicles.phone_number}</div>
                  <div>{invoice.vehicles.vehicle_reg}</div>
                </div>
              </div>
              <div>
                <div className="text-[12px] font-semibold text-slate-500">Vehicle INFO</div>
                <div className="mt-3 space-y-2 text-sm text-slate-700">
                  <div>Model: {invoice.vehicles.make_model || "General Service"}</div>
                  <div>Car No.: {invoice.vehicles.vehicle_reg}</div>
                  <div>Payment: {invoice.payment_mode.toUpperCase()}</div>
                </div>
              </div>
            </div>

            <div className="mt-10">
              <div className="rounded-t-xl bg-slate-50 px-4 py-3 text-[12px] font-semibold uppercase tracking-[0.06em] text-slate-600">
                Services Performed
              </div>
              <div className="border border-t-0 border-slate-200 rounded-b-xl">
                {(invoice.labour || []).length > 0 ? (
                  <>
                    {(invoice.labour || []).map((row, index) => (
                      <div key={`${row.description}-${index}`} className="flex items-center justify-between gap-4 border-b border-slate-100 px-4 py-3 last:border-b-0">
                        <span className="text-sm text-slate-800">{row.description || "Labour charge"}</span>
                        <span className="font-mono text-sm font-medium text-slate-900">{formatAmount(Number(row.amount || 0))}</span>
                      </div>
                    ))}
                    <div className="flex items-center justify-between gap-4 border-t border-slate-200 px-4 py-3">
                      <span className="text-sm font-semibold uppercase tracking-[0.06em] text-slate-500">Subtotal</span>
                      <span className="font-mono text-sm font-semibold text-slate-900">{formatAmount(Number(invoice.total_labour || 0))}</span>
                    </div>
                  </>
                ) : (
                  <div className="px-4 py-4 text-sm text-slate-400">No labour charges added.</div>
                )}
              </div>
            </div>

            <div className="mt-8">
              <div className="rounded-t-xl bg-slate-50 px-4 py-3 text-[12px] font-semibold uppercase tracking-[0.06em] text-slate-600 grid grid-cols-[1.8fr_1fr_0.6fr_1fr_1fr] gap-4">
                <span>Part Name</span>
                <span>Part ID</span>
                <span className="text-right">Qty</span>
                <span className="text-right">Unit Price</span>
                <span className="text-right">Amount</span>
              </div>
              <div className="border border-t-0 border-slate-200 rounded-b-xl">
                {(invoice.items || []).length > 0 ? (
                  <>
                    {(invoice.items || []).map((row, index) => (
                      <div
                        key={`${row.name}-${index}`}
                        className="grid grid-cols-[1.8fr_1fr_0.6fr_1fr_1fr] gap-4 border-b border-slate-100 px-4 py-3 text-sm text-slate-800 last:border-b-0"
                      >
                        <span>{row.name}</span>
                        <span>{row.part_id || "—"}</span>
                        <span className="text-right">{row.quantity || 1}</span>
                        <span className="text-right font-mono">{formatAmount(Number(row.unit_price || 0))}</span>
                        <span className="text-right font-mono">{formatAmount(Number(row.total || 0))}</span>
                      </div>
                    ))}
                    <div className="flex items-center justify-between gap-4 border-t border-slate-200 px-4 py-3">
                      <span className="text-sm font-semibold uppercase tracking-[0.06em] text-slate-500">Subtotal</span>
                      <span className="font-mono text-sm font-semibold text-slate-900">{formatAmount(Number(invoice.total_spare || 0))}</span>
                    </div>
                  </>
                ) : (
                  <div className="px-4 py-4 text-sm text-slate-400">No spare parts added.</div>
                )}
              </div>
            </div>

            <div className="mt-10 grid grid-cols-[1fr_280px] gap-8">
              <div>
                <div className="text-[12px] font-semibold uppercase tracking-[0.08em] text-slate-400">Other Comments</div>
                <div className="mt-3 space-y-1 text-sm text-slate-500">
                  <div>1. Total payment due on receipt.</div>
                  <div>2. Please include the invoice number on your payment.</div>
                  <div>3. For queries contact: +91 98765 00001</div>
                </div>
              </div>

              <div className="space-y-3">
                {[
                  ["TOTAL SERVICES", Number(invoice.total_labour || 0)],
                  ["TOTAL PARTS", Number(invoice.total_spare || 0)],
                  ["Subtotal (excl. GST)", subtotalBeforeTax],
                  ["GST 18% (Services + Parts)", totalTax],
                ].map(([label, value]) => (
                  <div key={String(label)} className="flex items-center justify-between gap-4 text-sm">
                    <span className="text-slate-500">{label}</span>
                    <span className="font-mono font-medium text-slate-900">{formatAmount(Number(value))}</span>
                  </div>
                ))}
                <div className="flex items-center justify-between gap-4 rounded-xl bg-slate-50 px-4 py-3">
                  <span className="text-sm font-semibold text-slate-900">TOTAL (incl. GST)</span>
                  <span className="font-mono text-base font-bold text-slate-900">{formatAmount(Number(invoice.grand_total || 0))}</span>
                </div>
              </div>
            </div>

            {/* Terms & Conditions Section */}
            <div className="mt-10 border-t border-slate-200 pt-8">
              <div className="text-[14px] font-bold text-slate-900 mb-4 uppercase tracking-wider">Terms & Conditions</div>
              <div className="space-y-3">
                {[
                  "1. Estimate for jobs to be done is only approximate. Bill will be made out for actual, Work turned out, depending on the time involved.",
                  "2. Our quotation for parts to be supplied is based on the prices of materials current at the time of giving quotation. Any fluctuation of prices on the date of fitment will be billed to you.",
                  "3. Our quotation are subject to availability of parts and we accept no responsibility for any delay caused due to non availability of parts.",
                  "4. Handling charges, sales tax, surcharge and incidental charges etc, will be extra.",
                  "5. Unless otherwise stated our terms of payment are cash on delivery of the vehicle of goods and therefore our bill amount will have to be paid for in full at the time of taking delivery of the vehicle of goods.",
                  "6. Customer has to pay 50% of estimated value as advance for Non Tie Up Insurance Policy Body Shop Jobs at the time of Job approval.",
                  "7. It should be distinctly understood that all our charges are net and are not subject to any rebate or discount.",
                  "8. It should be definitely agreed and understood that we assume no responsibility for loss or damages by theft or fire or whatever means to the vehicle/parts placed with us for storage, sale or repair.",
                  "9. Any Parts found at the time of dismantling will be submitted on supplementary & Fuel for testing/trial will be extra.",
                  "10. Garage rent will be charged ( Rs.250 Per Day ) if the vehicles, spares are not taken delivery Customer, for the entire period from the date of acknowledgement of the estimate.",
                  "11. Also if the vehicle or spare is not taken delivery within a period of 3 days from the date of information to you after repairs, garage rent will be charged as per norms.",
                  "12. 5 % of estimation will be charged, if vehicle is taking back without job under any circumstances.",
                  "13. Estimate is valid for only for two weeks.",
                  "14. Taxes are applicable as per Govt norms, which has to paid during the time of delivery."
                ].map((term, index) => (
                  <p key={index} className="text-[10px] leading-relaxed text-slate-500 italic font-medium">
                    {term}
                  </p>
                ))}
              </div>
            </div>

            {/* Signature Section */}
            <div className="mt-12 grid grid-cols-2 gap-20">
              <div className="text-center pt-8">
                <div className="text-slate-400 mb-2">_______________________</div>
                <div className="text-sm font-bold text-slate-900 mb-1">Customer Signature</div>
              </div>
              <div className="text-center pt-8">
                <div className="text-slate-400 mb-2">_______________________</div>
                <div className="text-sm font-bold text-slate-900 mb-1">Authorized Signature</div>
                <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">For SIRAGIRI VEL AUTOMOBILES</div>
              </div>
            </div>

            <div className="mt-10 flex items-center justify-between border-t border-slate-200 pt-6 text-xs text-slate-400">
              <div className="flex items-center gap-2">
                <File className="h-4 w-4 text-slate-300" />
                Computer generated invoice. No signature required for digital copy.
              </div>
              <div>
                {invoice.invoice_number} · {format(new Date(invoice.created_at), "dd-MMM-yyyy")} · myTVS Erode
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
