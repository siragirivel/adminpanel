"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Download, FileText, Loader2, Repeat } from "lucide-react";
import { format } from "date-fns";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { generateQuotationPDF } from "@/lib/pdf-service";

interface QuotationVehicle {
  id: string;
  owner_name: string;
  phone_number: string;
  car_id: string;
  vehicle_reg: string;
  make_model?: string | null;
}

interface QuotationItem {
  name: string;
  quantity?: number;
  unit_price?: number;
  total?: number;
  part_id?: string;
}

interface QuotationLabour {
  description?: string;
  amount: number;
}

interface QuotationRecord {
  id: string;
  quotation_number: string;
  items: QuotationItem[];
  labour: QuotationLabour[];
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
  vehicles: QuotationVehicle | null;
  profiles?: {
    username?: string;
  } | null;
}

interface QuotationRecordQueryResult
  extends Omit<QuotationRecord, "vehicles" | "profiles"> {
  vehicles: QuotationVehicle | QuotationVehicle[] | null;
  profiles?: { username?: string } | Array<{ username?: string }> | null;
}

function formatAmount(value: number) {
  return `₹${Number(value || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function QuotationViewer({ quotationId }: { quotationId: string }) {
  const router = useRouter();
  const [quotation, setQuotation] = useState<QuotationRecord | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadQuotation = async () => {
      setLoading(true);
      const { data } = await supabase
        .from("quotations")
        .select(`
          id,
          quotation_number,
          items,
          labour,
          start_date,
          end_date,
          discount,
          total_spare,
          total_labour,
          subtotal_before_tax,
          total_tax,
          grand_total,
          note,
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
        .eq("id", quotationId)
        .maybeSingle();

      if (data) {
        const rawQuotation = data as QuotationRecordQueryResult;
        const normalizedQuotation: QuotationRecord = {
          ...rawQuotation,
          vehicles: Array.isArray(rawQuotation.vehicles)
            ? rawQuotation.vehicles[0] || null
            : rawQuotation.vehicles,
          profiles: Array.isArray(rawQuotation.profiles)
            ? rawQuotation.profiles[0] || null
            : rawQuotation.profiles || null,
        };

        setQuotation(normalizedQuotation);
      }

      setLoading(false);
    };

    void loadQuotation();
  }, [quotationId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f4f6fb] p-5">
        <div className="min-h-[calc(100vh-40px)] rounded-[28px] border border-slate-200 bg-white shadow-[0_24px_60px_rgba(15,23,42,0.07)] flex items-center justify-center">
          <div className="flex items-center gap-3 text-slate-500">
            <Loader2 className="h-5 w-5 animate-spin" />
            Loading quotation...
          </div>
        </div>
      </div>
    );
  }

  if (!quotation || !quotation.vehicles) {
    return (
      <div className="min-h-screen bg-[#f4f6fb] p-5">
        <div className="min-h-[calc(100vh-40px)] rounded-[28px] border border-slate-200 bg-white shadow-[0_24px_60px_rgba(15,23,42,0.07)] flex flex-col items-center justify-center gap-4">
          <div className="text-slate-900 text-lg font-semibold">Quotation not found</div>
          <Link href="/quotations" className="text-sm font-medium text-indigo-600 hover:underline">
            Back to quotations
          </Link>
        </div>
      </div>
    );
  }

  const discountedSubtotal = Math.max(
    Number(quotation.subtotal_before_tax || 0) - Number(quotation.discount || 0),
    0,
  );
  const quotationVehicle = quotation.vehicles || {};

  return (
    <div className="min-h-screen bg-[#f4f6fb] p-5 font-['DM_Sans']">
      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=DM+Mono:wght@400;500;600&display=swap');
      `}</style>

      <div className="rounded-[28px] border border-slate-200 bg-white shadow-[0_24px_60px_rgba(15,23,42,0.07)] overflow-hidden">
        <div className="flex items-center justify-between gap-4 border-b border-slate-200 px-8 py-5">
          <div className="flex items-center gap-4">
            <Link
              href="/quotations"
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-500 transition hover:bg-slate-50 hover:text-slate-900"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div>
              <div className="text-lg font-semibold text-slate-900">Quotation View</div>
              <div className="text-sm text-slate-500">Matches the printable quotation layout</div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => router.push(`/quotations/edit/${quotation.id}`)}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              <FileText className="h-4 w-4" />
              Edit Quotation
            </button>
            <button
              type="button"
              onClick={() => router.push(`/billing/new?quotation_id=${quotation.id}`)}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              <Repeat className="h-4 w-4" />
              Convert to Invoice
            </button>
            <button
              type="button"
              onClick={() =>
                generateQuotationPDF({
                  quotation_number: quotation.quotation_number,
                  vehicle: quotationVehicle,
                  items: quotation.items || [],
                  labour: quotation.labour || [],
                  start_date: quotation.start_date,
                  end_date: quotation.end_date,
                  discount: quotation.discount,
                  total_spare: quotation.total_spare,
                  total_labour: quotation.total_labour,
                  subtotal_before_tax: quotation.subtotal_before_tax,
                  total_tax: quotation.total_tax,
                  grand_total: quotation.grand_total,
                  note: quotation.note || "",
                  date: quotation.created_at,
                })
              }
              className="inline-flex items-center gap-2 rounded-xl bg-[#4f46e5] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700"
            >
              <Download className="h-4 w-4" />
              Download PDF
            </button>
          </div>
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
                <div className="text-[28px] font-bold tracking-tight text-slate-900">QUOTATION</div>
                <div className="text-[10px] font-bold text-rose-500 uppercase tracking-wider mt-1">This Copy is Draft & not Original</div>
              </div>
            </div>

            <div className="mt-8 border-t border-slate-200 pt-6">
              <div className="flex items-center justify-between gap-6">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">Quotation No.</div>
                  <div className="mt-1 text-base font-medium text-slate-900">{quotation.quotation_number}</div>
                </div>
                <div className="text-right">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">Created On</div>
                  <div className="mt-1 text-base font-medium text-slate-900">
                    {format(new Date(quotation.created_at), "dd-MMM-yyyy")}
                  </div>
                </div>
              </div>
              <div className="mt-4 flex items-center justify-between gap-6 text-sm text-slate-500">
                <div>
                  Created by <span className="font-medium text-slate-900">{quotation.profiles?.username || "Admin"}</span>
                </div>
                <div>
                  Valid {format(new Date(quotation.start_date), "dd MMM yyyy")} to {format(new Date(quotation.end_date), "dd MMM yyyy")}
                </div>
              </div>
            </div>

            <div className="mt-8 grid grid-cols-2 gap-8">
              <div>
                <div className="text-[12px] font-semibold text-slate-500">Customer INFO</div>
                <div className="mt-3 space-y-2 text-sm text-slate-700">
                  <div className="font-semibold text-slate-900">{quotation.vehicles.owner_name}</div>
                  <div>{quotation.vehicles.phone_number}</div>
                  <div>{quotation.vehicles.vehicle_reg}</div>
                </div>
              </div>
              <div>
                <div className="text-[12px] font-semibold text-slate-500">Vehicle INFO</div>
                <div className="mt-3 space-y-2 text-sm text-slate-700">
                  <div>Model: {quotation.vehicles.make_model || "General Service"}</div>
                  <div>Car No.: {quotation.vehicles.vehicle_reg}</div>
                  <div>Car ID: {quotation.vehicles.car_id}</div>
                </div>
              </div>
            </div>

            <div className="mt-10">
              <div className="rounded-t-xl bg-slate-50 px-4 py-3 text-[12px] font-semibold uppercase tracking-[0.06em] text-slate-600">
                Services Quoted
              </div>
              <div className="border border-t-0 border-slate-200 rounded-b-xl">
                {(quotation.labour || []).length > 0 ? (
                  <>
                    {(quotation.labour || []).map((row, index) => (
                      <div key={`${row.description}-${index}`} className="flex items-center justify-between gap-4 border-b border-slate-100 px-4 py-3 last:border-b-0">
                        <span className="text-sm text-slate-800">{row.description || "Labour charge"}</span>
                        <span className="font-mono text-sm font-medium text-slate-900">{formatAmount(Number(row.amount || 0))}</span>
                      </div>
                    ))}
                    <div className="flex items-center justify-between gap-4 border-t border-slate-200 px-4 py-3">
                      <span className="text-sm font-semibold uppercase tracking-[0.06em] text-slate-500">Subtotal</span>
                      <span className="font-mono text-sm font-semibold text-slate-900">{formatAmount(Number(quotation.total_labour || 0))}</span>
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
                {(quotation.items || []).length > 0 ? (
                  <>
                    {(quotation.items || []).map((item, index) => (
                      <div
                        key={`${item.name}-${index}`}
                        className="grid grid-cols-[1.8fr_1fr_0.6fr_1fr_1fr] gap-4 border-b border-slate-100 px-4 py-3 text-sm text-slate-800 last:border-b-0"
                      >
                        <span>{item.name}</span>
                        <span className="text-slate-500">{item.part_id || "—"}</span>
                        <span className="text-right">{Number(item.quantity || 1)}</span>
                        <span className="text-right font-mono">{formatAmount(Number(item.unit_price || 0))}</span>
                        <span className="text-right font-mono font-medium text-slate-900">{formatAmount(Number(item.total || 0))}</span>
                      </div>
                    ))}
                    <div className="flex items-center justify-between gap-4 border-t border-slate-200 px-4 py-3">
                      <span className="text-sm font-semibold uppercase tracking-[0.06em] text-slate-500">Subtotal</span>
                      <span className="font-mono text-sm font-semibold text-slate-900">{formatAmount(Number(quotation.total_spare || 0))}</span>
                    </div>
                  </>
                ) : (
                  <div className="px-4 py-4 text-sm text-slate-400">No spare parts added.</div>
                )}
              </div>
            </div>

            <div className="mt-8 grid grid-cols-[1.3fr_0.9fr] gap-8">
              <div className="rounded-xl border border-slate-200 p-4">
                <div className="text-[12px] font-semibold uppercase tracking-[0.06em] text-slate-500">Other Comments</div>
                <div className="mt-3 text-sm leading-6 text-slate-600">
                  {quotation.note?.trim() || "Pricing is subject to approval and part availability within the quotation validity period."}
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 overflow-hidden">
                <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 text-sm">
                  <span className="text-slate-500">Total Services</span>
                  <span className="font-mono font-medium text-slate-900">{formatAmount(Number(quotation.total_labour || 0))}</span>
                </div>
                <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 text-sm">
                  <span className="text-slate-500">Total Parts</span>
                  <span className="font-mono font-medium text-slate-900">{formatAmount(Number(quotation.total_spare || 0))}</span>
                </div>
                <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 text-sm">
                  <span className="text-slate-500">Subtotal (before discount)</span>
                  <span className="font-mono font-medium text-slate-900">{formatAmount(Number(quotation.subtotal_before_tax || 0))}</span>
                </div>
                <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 text-sm">
                  <span className="text-slate-500">Discount</span>
                  <span className="font-mono font-medium text-rose-600">- {formatAmount(Number(quotation.discount || 0))}</span>
                </div>
                <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 text-sm">
                  <span className="text-slate-500">Taxable subtotal</span>
                  <span className="font-mono font-medium text-slate-900">{formatAmount(discountedSubtotal)}</span>
                </div>
                <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 text-sm">
                  <span className="text-slate-500">GST 18%</span>
                  <span className="font-mono font-medium text-slate-900">{formatAmount(Number(quotation.total_tax || 0))}</span>
                </div>
                <div className="flex items-center justify-between bg-slate-50 px-4 py-4">
                  <span className="text-sm font-semibold uppercase tracking-[0.06em] text-slate-700">Total</span>
                  <span className="font-mono text-base font-semibold text-slate-900">{formatAmount(Number(quotation.grand_total || 0))}</span>
                </div>
              </div>
            </div>

            {/* Terms & Conditions Section */}
            <div className="mt-10 border-t border-slate-200 pt-8">
              <div className="text-[14px] font-bold text-slate-900 mb-4 uppercase tracking-wider">Terms & Conditions</div>
              <div className="space-y-3">
                {[
                  "1. This workshop is owned and operated by SIRAGIRI VEL AUTOMOBILES (“Workshop”). The Workshop is open for 7 days a week, except for day/s that are pre-disclosed as weekly off or special holiday, by this Workshop.",
                  "2. The Workshop is an authorised franchisee of TVS Automobile Solutions PVT. LTD. (“KMS”). You (“Customer”/ “you”) hereby agree and authorize the Workshop and KMS and all of its divisions, affiliates, subsidiaries, related parties and other group companies (collectively the “KMS Entities”; Workshop and KMS Entities are collectively called “we”/ “us” / “our”) to access your basic data / contact details provided herewith, i.e. your name, address, telephone number, e-mail address, birth date and / or anniversary date. You hereby consent to, agree and acknowledge that we may call/ email/ SMS/Whatsapp/Telegram you on any of the basic contact details shared by you, in order to assist you with the services availed by you or keep you informed regarding our service or product details, or send you any marketing and our other product or service related communication and our other offers.",
                  "3. This Workshop shall take reasonable care of your vehicle while it is at the Workshop. However, this Workshop shall not be responsible for any loss or damage caused to the vehicle in case such loss is caused due to reason of fire, theft, accident or any other cause beyond the control of the Workshop.",
                  "4. The Customer is advised to collect his/her personal articles before handing over the vehicle to the Workshop. We shall not be responsible for any missing item, which has not been registered in the job card.",
                  "5. For a vehicle in an accident, if towing services are availed from the Workshop, the Customer will be liable to pay the cost for such towing, at actuals.",
                  "6. Workshop will release the vehicle only upon receiving complete payment from the Customer or upon receipt of delivery order from the insurance company.",
                  "7. This Workshop may conduct test drive on the vehicle for purpose of inspecting the damages and testing the repairs done. In case of damage due to any accident, repairs will be carried out under the insurance of the vehicle.",
                  "8. While best efforts will be made by the Workshop to identify full extent of damages, the repaired vehicle may not be restored to its original condition or cannot be made like new vehicles.",
                  "9. THE CUSTOMER SHALL INSPECT THE VEHICLE TO ITS SATISFACTION BEFORE TAKING IT BACK FORM THE WORKSHOP.",
                  "10. Customer is requested to collect the old spare part (in case of replacement) after the job is completed.",
                  "11. In case the delivery of the vehicle has not been taken within 3 days from the day the service is completed, Rs. 100 per day per vehicle as parking charges would be levied.",
                  "12. If required by the Workshop, Customer undertakes to make deposit of 50% of the estimated amount of repair charges in advance.",
                  "13. Every effort is made to adhere to the commitments made by this Workshop to the Customer. However, the estimated date/time of delivery could change.",
                  "14. Vehicle can be delivered only on production of customer copy of the Repair Order Form.",
                  "15. Workshop will levy an estimation charge of Rs. 500/- or 10% of the total labour charges, whichever is higher if the job is not entrusted to the Workshop.",
                  "16. Further, an interest of 24% p.a will be levied on the invoice value in case the Customer does not pay within 2 days.",
                  "17. Amounts referred under these “Terms and Conditions” are exclusive of taxes.",
                  "18. These Terms and Conditions shall be governed by and construed in accordance with the laws of India."
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

            <div className="mt-10 flex items-center justify-between border-t border-slate-200 pt-6 text-sm text-slate-500">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-slate-400" />
                This is a computer generated quotation.
              </div>
              <div>{quotation.quotation_number}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
