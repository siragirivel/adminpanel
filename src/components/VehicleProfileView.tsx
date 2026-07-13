"use client";

import React, { useState } from "react";
import {
  AlertTriangle,
  Calendar,
  Camera,
  Download,
  Edit2,
  FileSignature,
  FileText,
  Image as ImageIcon,
  MessageCircle,
  Phone,
  Plus,
  User,
  X,
} from "lucide-react";
import { addMonths, differenceInCalendarDays, format, formatDistanceToNowStrict } from "date-fns";
import { formatCurrency } from "@/lib/utils";
import { DetailMetricRow, DetailPageScaffold, PreviewPanel, RecordBadge } from "@/components/DetailPageScaffold";

export interface VehicleProfileRecord {
  id: string;
  car_id: string;
  owner_name: string;
  phone_number: string;
  vehicle_reg: string;
  entry_date: string;
  make_model?: string;
  status: string;
  work_description?: string;
  chassis_number?: string;
  front_image_url?: string;
  back_image_url?: string;
  chassis_image_url?: string;
}

export interface VehicleInvoiceRecord {
  id: string;
  invoice_number: string;
  created_at: string;
  payment_mode: string;
  grand_total: number;
  paid_amount?: number;
  outstanding_amount?: number;
  note?: string | null;
  labour?: Array<{ description?: string; amount?: number }>;
  items?: Array<{ name?: string }>;
}

interface VehicleProfileViewProps {
  vehicle: VehicleProfileRecord;
  invoices: VehicleInvoiceRecord[];
  advanceTotal?: number;
  invoiceAdvances?: Record<string, number>;
  noteDraft: string;
  savingNote: boolean;
  onNoteDraftChange: (value: string) => void;
  onAddNote: () => void;
  onBack: () => void;
  onEdit: () => void;
  onCreateInvoice: () => void;
  onCreateQuotation: () => void;
  onOpenInvoice: (invoiceId: string) => void;
  onDownloadInvoice: (invoiceId: string) => void;
  onViewAllInvoices: () => void;
}

function splitMakeModel(makeModel?: string) {
  const value = (makeModel || "").trim();
  if (!value) return { make: "—", model: "—" };
  const [make, ...rest] = value.split(" ");
  return {
    make: make || "—",
    model: rest.join(" ") || make || "—",
  };
}

function parseWorkDescription(workDescription?: string) {
  const rawSegments = (workDescription || "")
    .split("|")
    .map((segment) => segment.trim())
    .filter(Boolean);

  const data: Record<string, string> = {};
  const notes: string[] = [];

  rawSegments.forEach((segment) => {
    const [key, ...rest] = segment.split(":");
    const normalizedKey = key?.trim().toLowerCase();
    const value = rest.join(":").trim();

    if (!normalizedKey || !value) {
      return;
    }

    if (normalizedKey === "entry note" || normalizedKey === "note") {
      notes.push(value);
      return;
    }

    data[normalizedKey] = value;
  });

  return {
    type: data.type || "—",
    year: data.year || "—",
    color: data.colour || "—",
    address: data.address || "—",
    notes,
  };
}

function paymentPillClass(paymentMode: string) {
  const mode = paymentMode.toLowerCase();
  if (mode === "cash") return "bg-emerald-50 text-emerald-700";
  return "bg-indigo-50 text-indigo-700";
}

function paymentModeLabel(paymentMode: string) {
  return paymentMode.toLowerCase() === "cash" ? "CASH" : "EFT";
}

function getInvoiceDiscount(invoice: VehicleInvoiceRecord) {
  const paidRaw = Number(invoice.paid_amount);
  const outstandingRaw = Number(invoice.outstanding_amount);
  const hasPaid = Number.isFinite(paidRaw);
  const hasOutstanding = Number.isFinite(outstandingRaw);
  if (!hasPaid && !hasOutstanding) return 0;
  const grandTotal = Math.max(Number(invoice.grand_total || 0), 0);
  const paidAmount = hasPaid ? Math.max(paidRaw, 0) : 0;
  const outstandingAmount = hasOutstanding ? Math.max(outstandingRaw, 0) : 0;
  return Math.max(grandTotal - paidAmount - outstandingAmount, 0);
}

function imageSlot(
  src: string | undefined,
  label: string,
  emptyText: string,
  onOpen: (image: { src: string; label: string }) => void,
) {
  if (src) {
    return (
      <button
        type="button"
        onClick={() => onOpen({ src, label })}
        className="group relative aspect-[4/3] overflow-hidden bg-slate-100 text-left"
      >
        <img src={src} alt={label} className="h-full w-full object-cover transition duration-200 group-hover:scale-[1.03]" />
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-950/70 to-transparent px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-white">
          {label}
        </div>
      </button>
    );
  }

  return (
    <div className="aspect-[4/3] bg-[#f8fafc] flex flex-col items-center justify-center gap-2 text-slate-400">
      <ImageIcon className="h-6 w-6 opacity-50" />
      <div className="text-[10px] font-semibold uppercase tracking-[0.08em]">{emptyText}</div>
    </div>
  );
}

function buildServiceSummary(invoice: VehicleInvoiceRecord) {
  const labourNames = (invoice.labour || [])
    .map((row) => row.description?.trim())
    .filter(Boolean) as string[];
  if (labourNames.length > 0) {
    return labourNames.slice(0, 2).join(", ");
  }

  const itemNames = (invoice.items || [])
    .map((row) => row.name?.trim())
    .filter(Boolean) as string[];
  if (itemNames.length > 0) {
    return itemNames.slice(0, 2).join(", ");
  }

  return "General service";
}

function extractOdoReading(source?: string | null) {
  if (!source) return null;
  const match = source.match(/odometer:\s*([\d,]+)(?:\s*km)?/i);
  if (!match?.[1]) return null;
  const parsed = Number(match[1].replace(/,/g, ""));
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

export function VehicleProfileView({
  vehicle,
  invoices,
  advanceTotal = 0,
  invoiceAdvances,
  noteDraft,
  savingNote,
  onNoteDraftChange,
  onAddNote,
  onBack,
  onEdit,
  onCreateInvoice,
  onCreateQuotation,
  onOpenInvoice,
  onDownloadInvoice,
  onViewAllInvoices,
}: VehicleProfileViewProps) {
  const [previewImage, setPreviewImage] = useState<{ src: string; label: string } | null>(null);
  const { make, model } = splitMakeModel(vehicle.make_model);
  const meta = parseWorkDescription(vehicle.work_description);
  const totalSpent = invoices.reduce((sum, invoice) => sum + Number(invoice.grand_total || 0), 0);
  const lastInvoice = invoices[0];
  const heroDetails = [vehicle.make_model || null, meta.year !== "—" ? meta.year : null, meta.color !== "—" ? meta.color : null].filter(Boolean);
  const phoneLink = vehicle.phone_number.replace(/[^\d+]/g, "");
  const whatsappLink = vehicle.phone_number.replace(/[^\d]/g, "");
  const odoFromEntry = extractOdoReading(vehicle.work_description || "");
  const invoiceOdoHistory = invoices
    .map((invoice) => ({
      date: invoice.created_at,
      invoiceNumber: invoice.invoice_number,
      reading: extractOdoReading(invoice.note || ""),
    }))
    .filter((row): row is { date: string; invoiceNumber: string; reading: number } => row.reading !== null)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const odoHistory = [
    ...(odoFromEntry
      ? [
          {
            date: vehicle.entry_date,
            invoiceNumber: "Entry",
            reading: odoFromEntry,
          },
        ]
      : []),
    ...invoiceOdoHistory,
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const latestOdo = odoHistory[0];
  const nextServiceKm = latestOdo ? latestOdo.reading + 5000 : null;
  const nextServiceDate = latestOdo ? addMonths(new Date(latestOdo.date), 6) : null;
  const nextServiceDaysLeft = nextServiceDate
    ? differenceInCalendarDays(nextServiceDate, new Date())
    : null;
  const nextServiceStatus =
    nextServiceDaysLeft === null
      ? "unknown"
      : nextServiceDaysLeft < 0
        ? "overdue"
        : nextServiceDaysLeft <= 7
          ? "due_soon"
          : "upcoming";

  const buildImageFilename = (label: string, ext = "png") => {
    const base = `${vehicle.car_id}-${label}`.trim();
    const safe = base
      .replace(/[^a-zA-Z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "");
    return `${safe || "vehicle-image"}.${ext}`;
  };

  const handleDownloadImage = async () => {
    if (!previewImage) return;

    try {
      const response = await fetch(previewImage.src, { mode: "cors" });
      if (!response.ok) throw new Error("Failed to fetch image");
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);

      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth || img.width;
        canvas.height = img.naturalHeight || img.height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          window.URL.revokeObjectURL(blobUrl);
          throw new Error("Canvas not supported");
        }
        ctx.drawImage(img, 0, 0);
        canvas.toBlob((pngBlob) => {
          window.URL.revokeObjectURL(blobUrl);
          if (!pngBlob) {
            const fallbackUrl = window.URL.createObjectURL(blob);
            const fallbackLink = document.createElement("a");
            fallbackLink.href = fallbackUrl;
            fallbackLink.download = buildImageFilename(previewImage.label, "png");
            document.body.appendChild(fallbackLink);
            fallbackLink.click();
            document.body.removeChild(fallbackLink);
            window.URL.revokeObjectURL(fallbackUrl);
            return;
          }
          const url = window.URL.createObjectURL(pngBlob);
          const link = document.createElement("a");
          link.href = url;
          link.download = buildImageFilename(previewImage.label, "png");
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          window.URL.revokeObjectURL(url);
        }, "image/png");
      };
      img.onerror = () => {
        window.URL.revokeObjectURL(blobUrl);
        throw new Error("Failed to load image for PNG conversion");
      };
      img.src = blobUrl;
    } catch (error) {
      const link = document.createElement("a");
      link.href = previewImage.src;
      link.download = buildImageFilename(previewImage.label, "png");
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const timeline = [
    ...invoices.slice(0, 4).map((invoice) => ({
      key: invoice.id,
      type: "invoice" as const,
      title: buildServiceSummary(invoice),
      date: invoice.created_at,
      amount: invoice.grand_total,
    })),
    ...(meta.notes.length > 0
      ? [
          {
            key: "entry-note",
            type: "note" as const,
            title: meta.notes[0],
            date: vehicle.entry_date,
          },
        ]
      : []),
    {
      key: "registered",
      type: "registered" as const,
      title: "Vehicle registered",
      date: vehicle.entry_date,
    },
  ]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 5);

  return (
    <div className="min-h-screen bg-[#f4f6fb] p-5 text-slate-900">
      <div className="min-h-[calc(100vh-40px)] rounded-[28px] border border-slate-200 bg-white shadow-[0_24px_60px_rgba(15,23,42,0.07)] overflow-hidden">
        <div className="mx-auto max-w-[1120px]">
          <DetailPageScaffold
            breadcrumbRootLabel="Vehicles"
            breadcrumbCurrentLabel={vehicle.car_id}
            onBack={onBack}
            recordBadge={<RecordBadge dotClassName="bg-emerald-400" value={vehicle.car_id} />}
            title={vehicle.owner_name}
            subtitle={
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <span>{vehicle.vehicle_reg}</span>
                {heroDetails.length > 0 ? <span className="text-slate-300">•</span> : null}
                {heroDetails.length > 0 ? <span>{heroDetails.join(" · ")}</span> : null}
              </div>
            }
            actions={
              <>
                <button
                  type="button"
                  onClick={onCreateInvoice}
                  className="inline-flex h-10 items-center gap-2 rounded-xl bg-indigo-600 px-4 text-sm font-semibold text-white transition hover:bg-indigo-700"
                >
                  <FileText className="h-4 w-4" />
                  New Invoice
                </button>
                <button
                  type="button"
                  onClick={onEdit}
                  className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 px-4 text-sm font-medium text-slate-600 transition hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700"
                >
                  <Edit2 className="h-4 w-4" />
                  Edit
                </button>
                <button
                  type="button"
                  onClick={onCreateQuotation}
                  className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 px-4 text-sm font-medium text-slate-600 transition hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700"
                >
                  <FileSignature className="h-4 w-4" />
                  Quote
                </button>
              </>
            }
            metricStrip={
              <DetailMetricRow>
                <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4">
                  <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400">Total invoices</div>
                  <div className="mt-1 text-[24px] font-bold text-slate-950">{invoices.length}</div>
                  <div className="mt-1 text-xs text-slate-400">Since registration</div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4">
                  <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400">Total spent</div>
                  <div className="mt-1 text-[24px] font-bold text-emerald-600">{formatCurrency(totalSpent)}</div>
                  <div className="mt-1 text-xs text-slate-400">All invoices combined</div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4">
                  <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400">Advance balance</div>
                  <div className="mt-1 text-[20px] font-bold text-sky-600">{formatCurrency(advanceTotal)}</div>
                  <div className="mt-1 text-xs text-slate-400">Extra payments recorded</div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4">
                  <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400">Last service</div>
                  <div className="mt-1 text-[16px] font-semibold text-indigo-600">
                    {lastInvoice ? format(new Date(lastInvoice.created_at), "dd MMM yyyy") : "—"}
                  </div>
                  <div className="mt-1 text-xs text-slate-400">
                    {lastInvoice ? `${formatDistanceToNowStrict(new Date(lastInvoice.created_at))} ago` : "No invoice yet"}
                  </div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4">
                  <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400">Entry date</div>
                  <div className="mt-1 text-[16px] font-semibold text-slate-900">{format(new Date(vehicle.entry_date), "dd MMM yyyy")}</div>
                  <div className="mt-1 text-xs text-slate-400">Customer record created</div>
                </div>
              </DetailMetricRow>
            }
            main={
              <>
              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
                  <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                    <Camera className="h-4 w-4 text-indigo-600" />
                    Vehicle Photos
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-px bg-slate-200 md:grid-cols-3">
                  {imageSlot(vehicle.front_image_url, "Front view", "Front", setPreviewImage)}
                  {imageSlot(vehicle.back_image_url, "Rear view", "Rear", setPreviewImage)}
                  {imageSlot(vehicle.chassis_image_url, "Chassis no.", "Chassis", setPreviewImage)}
                </div>
              </div>

              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
                  <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                    <Calendar className="h-4 w-4 text-indigo-600" />
                    Vehicle Information
                  </div>
                  <button type="button" onClick={onEdit} className="text-xs font-medium text-indigo-600 transition hover:text-indigo-700">
                    Edit
                  </button>
                </div>
                <div className="grid md:grid-cols-2">
                  {[
                    ["Car ID", vehicle.car_id, true, true],
                    ["Reg. Number", vehicle.vehicle_reg, true, false],
                    ["Make", make, false, false],
                    ["Model", model, false, false],
                    ["Year", meta.year, false, false],
                    ["Colour", meta.color, false, false],
                    ["Vehicle Type", meta.type, false, false],
                    ["Chassis No.", vehicle.chassis_number || "—", true, false],
                  ].map(([label, value, mono, accent], index) => (
                    <div
                      key={`${label}-${index}`}
                      className="border-b border-slate-200 px-5 py-4 md:[&:nth-child(odd)]:border-r last:border-b-0 md:[&:nth-last-child(-n+2)]:border-b-0"
                    >
                      <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400">{label}</div>
                      <div
                        className={[
                          "mt-1 text-sm font-medium text-slate-900",
                          mono ? "font-mono" : "",
                          accent ? "text-indigo-600" : "",
                        ].join(" ")}
                      >
                        {value}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
                  <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                    <AlertTriangle className="h-4 w-4 text-indigo-600" />
                    ODO & Next Service
                  </div>
                  {nextServiceDate ? (
                    <span
                      className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase ${
                        nextServiceStatus === "overdue"
                          ? "bg-rose-50 text-rose-700"
                          : nextServiceStatus === "due_soon"
                            ? "bg-amber-50 text-amber-700"
                            : "bg-emerald-50 text-emerald-700"
                      }`}
                    >
                      {nextServiceStatus === "overdue"
                        ? "Overdue"
                        : nextServiceStatus === "due_soon"
                          ? "Due Soon"
                          : "On Track"}
                    </span>
                  ) : null}
                </div>
                <div className="grid border-b border-slate-200 bg-slate-50/50 px-5 py-4 sm:grid-cols-3">
                  <div>
                    <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400">Latest ODO</div>
                    <div className="mt-1 text-[16px] font-semibold text-slate-900">
                      {latestOdo ? `${latestOdo.reading.toLocaleString("en-IN")} km` : "—"}
                    </div>
                  </div>
                  <div>
                    <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400">Next Service ODO</div>
                    <div className="mt-1 text-[16px] font-semibold text-indigo-600">
                      {nextServiceKm ? `${nextServiceKm.toLocaleString("en-IN")} km` : "—"}
                    </div>
                  </div>
                  <div>
                    <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400">Next Service Date</div>
                    <div className="mt-1 text-[16px] font-semibold text-slate-900">
                      {nextServiceDate ? format(nextServiceDate, "dd MMM yyyy") : "—"}
                    </div>
                    {nextServiceDaysLeft !== null ? (
                      <div className="mt-1 text-[11px] text-slate-500">
                        {nextServiceDaysLeft < 0
                          ? `${Math.abs(nextServiceDaysLeft)} day(s) overdue`
                          : `${nextServiceDaysLeft} day(s) left`}
                      </div>
                    ) : null}
                  </div>
                </div>
                <div className="max-h-[220px] overflow-auto">
                  {odoHistory.length > 0 ? (
                    <table className="w-full border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50">
                          <th className="px-5 py-3 text-left font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400">Date</th>
                          <th className="px-5 py-3 text-left font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400">Ref</th>
                          <th className="px-5 py-3 text-right font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400">ODO</th>
                        </tr>
                      </thead>
                      <tbody>
                        {odoHistory.map((row) => (
                          <tr key={`${row.invoiceNumber}-${row.date}`} className="border-b border-slate-100 last:border-b-0">
                            <td className="px-5 py-3 text-xs font-mono text-slate-500">{format(new Date(row.date), "dd MMM yyyy")}</td>
                            <td className="px-5 py-3 text-sm text-slate-700">{row.invoiceNumber}</td>
                            <td className="px-5 py-3 text-right text-sm font-semibold text-slate-900">
                              {row.reading.toLocaleString("en-IN")} km
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <div className="px-5 py-8 text-sm text-slate-400">No ODO history recorded yet.</div>
                  )}
                </div>
              </div>

              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
                  <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                    <FileText className="h-4 w-4 text-indigo-600" />
                    Invoice History
                  </div>
                  <button type="button" onClick={onViewAllInvoices} className="text-xs font-medium text-indigo-600 transition hover:text-indigo-700">
                    View all
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50">
                        <th className="px-5 py-3 text-left font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400">Invoice No.</th>
                        <th className="px-5 py-3 text-left font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400">Date</th>
                        <th className="px-5 py-3 text-left font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400">Services</th>
                        <th className="px-5 py-3 text-left font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400">Mode</th>
                        <th className="px-5 py-3 text-right font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {invoices.length > 0 ? (
                        invoices.map((invoice) => {
                          const discount = getInvoiceDiscount(invoice);
                          const advance = invoiceAdvances?.[invoice.invoice_number] || 0;
                          return (
                            <tr
                              key={invoice.id}
                              onClick={() => onOpenInvoice(invoice.id)}
                              className="cursor-pointer border-b border-slate-100 transition hover:bg-indigo-50/40 last:border-b-0"
                            >
                              <td className="px-5 py-3">
                                <span className="font-mono text-[12px] font-semibold text-indigo-600">{invoice.invoice_number}</span>
                              </td>
                              <td className="px-5 py-3 font-mono text-xs text-slate-500">{format(new Date(invoice.created_at), "dd MMM yyyy")}</td>
                              <td className="px-5 py-3 text-sm text-slate-500">
                                <div>{buildServiceSummary(invoice)}</div>
                                {invoice.note?.trim() ? (
                                  <div className="mt-1 text-[11px] text-slate-400 truncate">
                                    Note: {invoice.note.trim()}
                                  </div>
                                ) : null}
                              </td>
                              <td className="px-5 py-3">
                                <div className="flex items-center gap-2">
                                  <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase ${paymentPillClass(invoice.payment_mode)}`}>
                                    {paymentModeLabel(invoice.payment_mode)}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      onDownloadInvoice(invoice.id);
                                    }}
                                    className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-slate-300 transition hover:bg-indigo-50 hover:text-indigo-600"
                                    title="Download invoice"
                                  >
                                    <Download className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              </td>
                              <td className="px-5 py-3 text-right font-mono text-sm font-semibold text-slate-900">
                                {formatCurrency(Number(invoice.grand_total || 0))}
                                {discount > 0 ? (
                                  <div className="mt-1 text-[10px] font-semibold text-amber-600">
                                    Discount {formatCurrency(discount)}
                                  </div>
                                ) : null}
                                {advance > 0 ? (
                                  <div className="mt-1 text-[10px] font-semibold text-sky-600">
                                    Advance {formatCurrency(advance)}
                                  </div>
                                ) : null}
                              </td>
                            </tr>
                          );
                        })
                      ) : (
                        <tr>
                          <td colSpan={5} className="px-5 py-10 text-center text-sm text-slate-400">
                            No invoices found for this vehicle.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
              </>
            }
            side={
              <>
              <PreviewPanel
                eyebrow="Vehicle Preview"
                title={vehicle.owner_name}
                badge={vehicle.car_id}
                icon={<User className="h-5 w-5 text-white/90" />}
                rows={[
                  ["Reg. Number", vehicle.vehicle_reg || "Not entered"],
                  ["Phone", vehicle.phone_number || "Not entered"],
                  ["Make / Model", vehicle.make_model || "Not entered"],
                  ["Status", vehicle.status || "Not entered"],
                ]}
              />
              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                <div className="border-b border-slate-200 px-5 py-4">
                  <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                    <User className="h-4 w-4 text-indigo-600" />
                    Owner
                  </div>
                </div>
                <div className="px-5 py-5">
                  <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-indigo-50 text-lg font-bold text-indigo-600">
                    {vehicle.owner_name.charAt(0).toUpperCase()}
                  </div>
                  <div className="text-base font-semibold text-slate-950">{vehicle.owner_name}</div>
                  <div className="mt-1 font-mono text-sm text-slate-500">{vehicle.phone_number}</div>
                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <a href={`tel:${phoneLink}`} className="inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-slate-200 text-xs font-medium text-slate-600 transition hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700">
                      <Phone className="h-3.5 w-3.5" />
                      Call
                    </a>
                    <a href={`https://wa.me/${whatsappLink}`} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-slate-200 text-xs font-medium text-slate-600 transition hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700">
                      <MessageCircle className="h-3.5 w-3.5" />
                      Message
                    </a>
                  </div>
                </div>
              </div>

              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                <div className="border-b border-slate-200 px-5 py-4">
                  <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                    <Plus className="h-4 w-4 text-indigo-600" />
                    Quick Actions
                  </div>
                </div>
                <div className="space-y-2 p-4">
                  {[
                    {
                      label: "Create Invoice",
                      sub: "Bill this vehicle",
                      icon: FileText,
                      onClick: onCreateInvoice,
                    },
                    {
                      label: "Create Quotation",
                      sub: "Send estimate",
                      icon: FileSignature,
                      onClick: onCreateQuotation,
                    },
                    {
                      label: "Edit Vehicle",
                      sub: "Update details",
                      icon: Edit2,
                      onClick: onEdit,
                    },
                  ].map((action) => (
                    <button
                      key={action.label}
                      type="button"
                      onClick={action.onClick}
                      className="flex w-full items-center gap-3 rounded-xl border border-slate-200 px-3 py-3 text-left transition hover:border-indigo-200 hover:bg-indigo-50/60"
                    >
                      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
                        <action.icon className="h-4 w-4" />
                      </div>
                      <div>
                        <div className="text-sm font-medium text-slate-900">{action.label}</div>
                        <div className="text-[11px] text-slate-400">{action.sub}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                <div className="border-b border-slate-200 px-5 py-4">
                  <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                    <Calendar className="h-4 w-4 text-indigo-600" />
                    Service Timeline
                  </div>
                </div>
                <div className="space-y-0 p-5">
                  {timeline.map((item, index) => (
                    <div key={item.key} className={`relative flex gap-3 ${index !== timeline.length - 1 ? "pb-5" : ""}`}>
                      {index !== timeline.length - 1 ? <div className="absolute left-[9px] top-5 h-[calc(100%-8px)] w-px bg-slate-200" /> : null}
                      <div
                        className={`relative z-10 mt-0.5 flex h-5 w-5 items-center justify-center rounded-full ${
                          item.type === "invoice"
                            ? "bg-blue-50 text-blue-700"
                            : item.type === "note"
                              ? "bg-amber-50 text-amber-700"
                              : "bg-emerald-50 text-emerald-700"
                        }`}
                      >
                        <span className="h-2 w-2 rounded-full bg-current" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-slate-900">{item.title}</div>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
                          <span className="font-mono">{format(new Date(item.date), "dd MMM yyyy")}</span>
                          {item.type === "invoice" ? <span>•</span> : null}
                          {item.type === "invoice" && "amount" in item ? (
                            <span className="font-mono font-semibold text-emerald-600">{formatCurrency(Number(item.amount || 0))}</span>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                <div className="border-b border-slate-200 px-5 py-4">
                  <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                    <FileText className="h-4 w-4 text-indigo-600" />
                    Notes
                  </div>
                </div>
                <div className="px-5 py-4">
                  {meta.notes.length > 0 ? (
                    <div className="space-y-3">
                      {meta.notes.map((note, index) => (
                        <div key={`${note}-${index}`} className="flex gap-2 border-b border-slate-100 pb-3 last:border-b-0 last:pb-0">
                          <div className="mt-1 h-2 w-2 rounded-full bg-amber-500" />
                          <div className="min-w-0">
                            <div className="text-sm leading-6 text-slate-600">{note}</div>
                            <div className="mt-1 font-mono text-[10px] text-slate-400">
                              {format(new Date(vehicle.entry_date), "dd MMM yyyy")}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-sm text-slate-400">No notes added yet.</div>
                  )}
                </div>
                <div className="flex gap-2 border-t border-slate-200 px-5 py-4">
                  <input
                    type="text"
                    value={noteDraft}
                    onChange={(event) => onNoteDraftChange(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        onAddNote();
                      }
                    }}
                    placeholder="Add a note…"
                    className="flex-1 border-0 border-b border-slate-200 bg-transparent px-0 py-2 text-sm text-slate-900 outline-none transition focus:border-indigo-500"
                  />
                  <button
                    type="button"
                    onClick={onAddNote}
                    disabled={savingNote}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600 text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
              </div>
              </>
            }
          />
        </div>
      </div>

      {previewImage ? (
        <div
          className="fixed inset-0 z-[160] flex items-center justify-center bg-slate-950/75 p-6 backdrop-blur-sm"
          onClick={() => setPreviewImage(null)}
        >
          <div
            className="relative w-full max-w-5xl overflow-hidden rounded-[28px] border border-white/10 bg-slate-950 shadow-[0_24px_80px_rgba(15,23,42,0.45)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
              <div>
                <div className="text-sm font-semibold text-white">{previewImage.label}</div>
                <div className="mt-1 text-xs text-slate-400">{vehicle.car_id}</div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleDownloadImage}
                  className="inline-flex h-10 items-center gap-2 rounded-xl bg-white px-4 text-sm font-semibold text-slate-900 transition hover:bg-slate-100"
                >
                  <Download className="h-4 w-4" />
                  Download
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewImage(null)}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 text-slate-300 transition hover:bg-white/10 hover:text-white"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="bg-slate-950 p-4">
              <img
                src={previewImage.src}
                alt={previewImage.label}
                className="max-h-[75vh] w-full rounded-[20px] object-contain"
              />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
