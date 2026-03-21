"use client";

import React, { useEffect, useState, useRef } from "react";
import {
  AlertCircle,
  ArrowLeft,
  Check,
  CheckCircle2,
  Download,
  Loader2,
  Plus,
  Save,
  Search,
  Trash2,
  X,
} from "lucide-react";
import toast from "react-hot-toast";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { createInvoiceNumber, cn } from "@/lib/utils";
import { generateInvoicePDF } from "@/lib/pdf-service";
import { logActivity } from "@/lib/activity-log";
import styles from "./InvoiceCreator.module.css";

type PaymentMode = "cash" | "eft";

interface VehicleRecord {
  id: string;
  car_id: string;
  owner_name: string;
  phone_number: string;
  vehicle_reg: string;
  make_model?: string | null;
}

interface PartRecord {
  id: string;
  name: string;
  cat?: string | null;
  cost: number;
  sell: number;
  stock: number;
}

interface AddedPartRow {
  id: string;
  partId: string;
  name: string;
  qty: number;
  unitPrice: number;
  discount: number;
  tax: number;
  totalWithTax: number;
  stock: number | null;
  isCustom: boolean;
}

interface LabourRow {
  id: number;
  desc: string;
  amount: string;
  discount: string;
  tax: string;
  totalWithTax: string;
}

interface SavedInvoiceData {
  id?: string;
  invoice_number: string;
  date: string;
  vehicle: VehicleRecord;
  items: Array<{
    name: string;
    quantity: number;
    unit_price: number;
    total: number;
    discount: number;
    tax: number;
    total_with_tax: number;
    part_id: string;
  }>;
  labour: Array<{
    description: string;
    amount: number;
    discount: number;
    tax: number;
    total_with_tax: number;
  }>;
  total_spare: number;
  total_labour: number;
  subtotal_before_tax: number;
  total_tax: number;
  grand_total: number;
  payment_mode: PaymentMode;
  note: string;
}

interface QuotationPrefillRecord {
  id: string;
  note?: string | null;
  items: Array<{
    name: string;
    quantity?: number;
    unit_price?: number;
    total?: number;
    discount?: number;
    tax?: number;
    total_with_tax?: number;
    part_id?: string;
  }>;
  labour: Array<{
    description?: string;
    amount: number;
    discount?: number;
    tax?: number;
    total_with_tax?: number;
  }>;
  vehicles: VehicleRecord | VehicleRecord[] | null;
}

const TAX_RATE = 0.18;
const MODE_HINTS: Record<PaymentMode, string> = {
  cash: "Cash \u2192 updates Petty Cash balance",
  eft: "EFT \u2192 updates Bank balance",
};

function todayValue() {
  return new Date().toISOString().split("T")[0];
}

function formatMoney(value: number) {
  return `₹${Number(value || 0).toLocaleString("en-IN")}`;
}

function formatInvoiceDate(value: string) {
  if (!value) {
    return "—";
  }

  return new Date(value).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function clampNumber(value: number, min: number, max: number) {
  if (Number.isNaN(value)) {
    return min;
  }

  return Math.max(min, Math.min(max, value));
}

function roundValue(value: number) {
  return Math.round(Number(value) || 0);
}

function syncPartRow(
  row: AddedPartRow,
  options: { useTotalWithTax?: boolean } = {},
) {
  const qty = clampNumber(Number(row.qty) || 1, 1, Math.max(1, row.stock || 9999));
  let unitPrice = Math.max(0, Number(row.unitPrice) || 0);
  let baseTotal = roundValue(qty * unitPrice);
  const discount = clampNumber(Number(row.discount) || 0, 0, baseTotal);
  let taxableBase = Math.max(baseTotal - discount, 0);

  let tax = roundValue(taxableBase * TAX_RATE);
  let totalWithTax = taxableBase + tax;

  if (options.useTotalWithTax) {
    totalWithTax = Math.max(roundValue(Number(row.totalWithTax) || 0), 0);
    taxableBase = roundValue(totalWithTax / (1 + TAX_RATE));
    tax = Math.max(totalWithTax - taxableBase, 0);
    baseTotal = taxableBase + discount;
    unitPrice = qty > 0 ? Number((baseTotal / qty).toFixed(2)) : 0;
  }

  return {
    ...row,
    qty,
    unitPrice,
    discount,
    tax,
    totalWithTax,
  };
}

function syncLabourRow(
  row: LabourRow,
  options: { useTotalWithTax?: boolean } = {},
) {
  let amount = Math.max(0, Number(row.amount) || 0);
  const discount = clampNumber(Number(row.discount) || 0, 0, amount);
  let taxableBase = Math.max(amount - discount, 0);

  let tax = roundValue(taxableBase * TAX_RATE);
  let totalWithTax = taxableBase + tax;

  if (options.useTotalWithTax) {
    totalWithTax = Math.max(roundValue(Number(row.totalWithTax) || 0), 0);
    taxableBase = roundValue(totalWithTax / (1 + TAX_RATE));
    tax = Math.max(totalWithTax - taxableBase, 0);
    amount = taxableBase + discount;
  }

  return {
    ...row,
    amount: String(amount),
    discount: String(discount),
    tax: String(tax),
    totalWithTax: String(totalWithTax),
  };
}

export function InvoiceCreator({
  initialInvoiceNumber,
}: {
  initialInvoiceNumber?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [invoiceNumber, setInvoiceNumber] = useState(
    initialInvoiceNumber && initialInvoiceNumber !== "new"
      ? initialInvoiceNumber
      : createInvoiceNumber(),
  );
  const [invoiceDate, setInvoiceDate] = useState(todayValue());

  const [vehicleQuery, setVehicleQuery] = useState("");
  const [vehicleResults, setVehicleResults] = useState<VehicleRecord[]>([]);
  const [vehicleOpen, setVehicleOpen] = useState(false);
  const [vehicleLoading, setVehicleLoading] = useState(false);
  const [selectedVehicle, setSelectedVehicle] = useState<VehicleRecord | null>(
    null,
  );

  const [partQuery, setPartQuery] = useState("");
  const [partResults, setPartResults] = useState<PartRecord[]>([]);
  const [partOpen, setPartOpen] = useState(false);
  const [partLoading, setPartLoading] = useState(false);
  const [activeVehicleIndex, setActiveVehicleIndex] = useState(0);
  const [activePartIndex, setActivePartIndex] = useState(0);

  const [addedParts, setAddedParts] = useState<AddedPartRow[]>([]);
  const [customPartCounter, setCustomPartCounter] = useState(1);
  const [labourRows, setLabourRows] = useState<LabourRow[]>([
    syncLabourRow({ id: 0, desc: "", amount: "", discount: "0", tax: "0", totalWithTax: "0" }),
  ]);
  const [labourIdCounter, setLabourIdCounter] = useState(1);
  const [spareDiscountMode, setSpareDiscountMode] = useState<"amount" | "percent">("amount");
  const [labourDiscountMode, setLabourDiscountMode] = useState<"amount" | "percent">("amount");
  const [paymentMode, setPaymentMode] = useState<PaymentMode>("eft");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [successOpen, setSuccessOpen] = useState(false);
  const [lastSavedInvoice, setLastSavedInvoice] = useState<SavedInvoiceData | null>(null);

  // Auto-save & Completion state
  const [savedInvoiceId, setSavedInvoiceId] = useState<string | null>(null);
  const [isCompleted, setIsCompleted] = useState(false);
  const [autoSaving, setAutoSaving] = useState(false);
  const [lastSavedHash, setLastSavedHash] = useState("");

  const prevPartsLength = useRef(addedParts.length);
  useEffect(() => {
    if (addedParts.length > prevPartsLength.current && addedParts.length > 0) {
      const lastIdx = addedParts.length - 1;
      setTimeout(() => {
        const input = document.querySelector(`input[data-row="${lastIdx}"][data-field="qty"][data-type="part"]`) as HTMLInputElement;
        if (input) {
          input.focus();
          input.select();
        }
      }, 80);
    }
    prevPartsLength.current = addedParts.length;
  }, [addedParts.length]);

  const rawPartsSubtotal = addedParts.reduce(
    (sum, row) => sum + row.qty * row.unitPrice,
    0,
  );
  const rawLabourSubtotal = labourRows.reduce(
    (sum, row) => sum + (Number(row.amount) || 0),
    0,
  );
  const partsDiscountTotal = addedParts.reduce(
    (sum, row) => sum + Math.min(row.discount, row.qty * row.unitPrice),
    0,
  );
  const labourDiscountTotal = labourRows.reduce(
    (sum, row) => sum + Math.min(Number(row.discount) || 0, Number(row.amount) || 0),
    0,
  );
  const discountValue = partsDiscountTotal + labourDiscountTotal;
  const subtotalBeforeTax = rawPartsSubtotal + rawLabourSubtotal;
  const taxableSubtotal = Math.max(subtotalBeforeTax - discountValue, 0);
  const totalTax =
    addedParts.reduce((sum, row) => sum + row.tax, 0) +
    labourRows.reduce((sum, row) => sum + (Number(row.tax) || 0), 0);
  const grandTotal =
    addedParts.reduce((sum, row) => sum + row.totalWithTax, 0) +
    labourRows.reduce((sum, row) => sum + (Number(row.totalWithTax) || 0), 0);

  async function fetchNextInvoiceNumber() {
    const now = new Date();
    const month = now.toLocaleString("en", { month: "short" }).toUpperCase();
    const year = now.getFullYear();
    const prefix = `SRV/${month}/${year}/`;

    const { count, error } = await supabase
      .from("invoices")
      .select("*", { count: "exact", head: true })
      .ilike("invoice_number", `${prefix}%`);

    if (error) {
      throw error;
    }

    return createInvoiceNumber((count || 0) + 1, now);
  }

  useEffect(() => {
    if (initialInvoiceNumber && initialInvoiceNumber !== "new") {
      return;
    }

    const assignInvoiceNumber = async () => {
      try {
        const nextInvoiceNumber = await fetchNextInvoiceNumber();
        setInvoiceNumber(nextInvoiceNumber);
        const quotationId = searchParams.get("quotation_id");
        router.replace(
          quotationId
            ? `/billing/${nextInvoiceNumber}?quotation_id=${quotationId}`
            : `/billing/${nextInvoiceNumber}`,
        );
      } catch (error) {
        console.error(error);
      }
    };

    void assignInvoiceNumber();
  }, [initialInvoiceNumber, router, searchParams]);

  useEffect(() => {
    const prefilledCarId = searchParams.get("car_id");
    if (!prefilledCarId) {
      return;
    }

    const loadVehicle = async () => {
      const { data, error } = await supabase
        .from("vehicles")
        .select("id, car_id, owner_name, phone_number, vehicle_reg, make_model")
        .eq("car_id", prefilledCarId)
        .maybeSingle();

      if (!error && data) {
        setSelectedVehicle(data);
      }
    };

    void loadVehicle();
  }, [searchParams]);

  useEffect(() => {
    if (!initialInvoiceNumber || initialInvoiceNumber === "new") {
      return;
    }

    const loadDraft = async () => {
      try {
        const { data: inv, error } = await supabase
          .from("invoices")
          .select("*, vehicles(*)")
          .eq("invoice_number", initialInvoiceNumber)
          .maybeSingle();

        if (error) throw error;
        if (!inv) return;

        setSavedInvoiceId(inv.id);
        setInvoiceNumber(inv.invoice_number);
        setSelectedVehicle(inv.vehicles);
        setNote(inv.note || "");
        setPaymentMode(inv.payment_mode === "cash" ? "cash" : "eft");
        setIsCompleted(inv.status === "completed");
        
        if (inv.items && inv.items.length > 0) {
          setAddedParts(inv.items.map((it: any) => ({
            ...syncPartRow({
              id: it.id || it.partId || Math.random().toString(),
              partId: it.partId || "",
              name: it.name,
              qty: it.qty,
              unitPrice: it.unitPrice,
              discount: it.discount,
              tax: it.tax,
              totalWithTax: it.totalWithTax,
              stock: it.stock,
              isCustom: !it.partId
            })
          })));
        }

        if (inv.labour && inv.labour.length > 0) {
          const loadedLabour = inv.labour.map((lb: any, idx: number) => ({
            ...syncLabourRow({
              id: lb.id ?? idx,
              desc: lb.description || lb.desc || "",
              amount: String(lb.amount),
              discount: String(lb.discount),
              tax: String(lb.tax),
              totalWithTax: String(lb.total_with_tax || lb.totalWithTax)
            })
          }));
          setLabourRows(loadedLabour);
          setLabourIdCounter(Math.max(...loadedLabour.map((l: any) => l.id as number), 0) + 1);
        }
      } catch (err) {
        console.error("Failed to load draft:", err);
      }
    };

    void loadDraft();
  }, [initialInvoiceNumber]);

  useEffect(() => {
    const quotationId = searchParams.get("quotation_id");
    if (!quotationId) {
      return;
    }

    const loadQuotationPrefill = async () => {
      const { data, error } = await supabase
        .from("quotations")
        .select(`
          id,
          note,
          items,
          labour,
          vehicles (
            id,
            car_id,
            owner_name,
            phone_number,
            vehicle_reg,
            make_model
          )
        `)
        .eq("id", quotationId)
        .maybeSingle();

      if (error || !data?.vehicles) {
        return;
      }

      const quotation = data as QuotationPrefillRecord;
      const quotationVehicle = Array.isArray(quotation.vehicles)
        ? quotation.vehicles[0] || null
        : quotation.vehicles;

      if (!quotationVehicle) {
        return;
      }

      const quotationPartIds = (quotation.items || [])
        .map((item) => item.part_id)
        .filter((value): value is string => Boolean(value));
      const partRecordMap = new Map<string, PartRecord>();

      if (quotationPartIds.length > 0) {
        const { data: partRecords } = await supabase
          .from("spare_parts")
          .select("id, name, cat, cost, sell, stock")
          .in("id", quotationPartIds);

        for (const part of partRecords || []) {
          partRecordMap.set(part.id, part as PartRecord);
        }
      }

      setSelectedVehicle(quotationVehicle);
      setVehicleQuery("");
      setVehicleResults([]);
      setVehicleOpen(false);
      setSaveError("");
      setAddedParts(
        (quotation.items || []).map((item, index) => ({
          ...syncPartRow({
            id: item.part_id || `quotation-part-${index}`,
            partId: partRecordMap.has(item.part_id || "") ? item.part_id || "" : "",
            name: item.name,
            qty: Math.max(1, Number(item.quantity || 1)),
            unitPrice: Math.max(0, Number(item.unit_price || 0)),
            discount: Math.max(0, Number(item.discount || 0)),
            tax: Math.max(0, Number(item.tax || 0)),
            totalWithTax: Math.max(0, Number(item.total_with_tax || 0)),
            stock: partRecordMap.get(item.part_id || "")?.stock ?? null,
            isCustom: !partRecordMap.has(item.part_id || ""),
          }),
        })),
      );
      const nextLabourRows =
        (quotation.labour || []).map((row, index) => ({
          ...syncLabourRow({
            id: index,
            desc: row.description || "",
            amount: String(Number(row.amount || 0)),
            discount: String(Number(row.discount || 0)),
            tax: String(Number(row.tax || 0)),
            totalWithTax: String(Number(row.total_with_tax || 0)),
          }),
        })) || [];
      setLabourRows(
        nextLabourRows.length
          ? nextLabourRows
          : [
              syncLabourRow({
                id: 0,
                desc: "",
                amount: "",
                discount: "0",
                tax: "0",
                totalWithTax: "0",
              }),
            ],
      );
      setLabourIdCounter(Math.max(nextLabourRows.length, 1));
      setNote(quotation.note || "");
      toast.success("Quotation loaded into invoice draft");
    };

    void loadQuotationPrefill();
  }, [searchParams]);

  useEffect(() => {
    if (selectedVehicle || vehicleQuery.trim().length < 1) {
      setVehicleResults([]);
      setVehicleLoading(false);
      return;
    }

    const query = vehicleQuery.trim();
    const timer = window.setTimeout(async () => {
      setVehicleLoading(true);
      const { data, error } = await supabase
        .from("vehicles")
        .select("id, car_id, owner_name, phone_number, vehicle_reg, make_model")
        .or(
          `car_id.ilike.%${query}%,owner_name.ilike.%${query}%,phone_number.ilike.%${query}%,vehicle_reg.ilike.%${query}%`,
        )
        .limit(8);

      if (error) {
        setVehicleResults([]);
      } else {
        setVehicleResults(data || []);
        setVehicleOpen(true);
      }
      setVehicleLoading(false);
    }, 180);

    return () => window.clearTimeout(timer);
  }, [vehicleQuery, selectedVehicle]);

  useEffect(() => {
    if (partQuery.trim().length < 1) {
      setPartResults([]);
      setPartLoading(false);
      return;
    }

    const query = partQuery.trim();
    const timer = window.setTimeout(async () => {
      setPartLoading(true);
      const { data, error } = await supabase
        .from("spare_parts")
        .select("id, name, cat, cost, sell, stock")
        .or(`name.ilike.%${query}%,id.ilike.%${query}%,cat.ilike.%${query}%`)
        .limit(8);

      if (error) {
        setPartResults([]);
      } else {
        const usedIds = new Set(
          addedParts.filter((row) => row.partId).map((row) => row.partId),
        );
        setPartResults((data || []).filter((part) => !usedIds.has(part.id)));
        setPartOpen(true);
      }
      setPartLoading(false);
    }, 180);

    return () => window.clearTimeout(timer);
  }, [partQuery, addedParts]);

  function selectVehicle(vehicle: VehicleRecord) {
    setSelectedVehicle(vehicle);
    setVehicleQuery("");
    setVehicleResults([]);
    setVehicleOpen(false);
    setSaveError("");
  }

  function clearVehicle() {
    setSelectedVehicle(null);
    setVehicleQuery("");
    setVehicleResults([]);
    setVehicleOpen(false);
  }

  function addPart(part: PartRecord) {
    setAddedParts((current) => [
      ...current,
      syncPartRow({
        id: part.id,
        partId: part.id,
        name: part.name,
        qty: 1,
        unitPrice: part.sell,
        discount: 0,
        tax: roundValue(part.sell * TAX_RATE),
        totalWithTax: roundValue(part.sell * (1 + TAX_RATE)),
        stock: part.stock,
        isCustom: false,
      }),
    ]);
    setPartQuery("");
    setPartResults([]);
    setPartOpen(false);
    setSaveError("");
  }

  function addCustomPart() {
    const customId = `custom-part-${customPartCounter}`;
    setCustomPartCounter((current) => current + 1);
    setAddedParts((current) => [
      ...current,
      syncPartRow({
        id: customId,
        partId: "",
        name: "",
        qty: 1,
        unitPrice: 0,
        discount: 0,
        tax: 0,
        totalWithTax: 0,
        stock: null,
        isCustom: true,
      }),
    ]);
  }

  function updatePartRow(
    index: number,
    field: "name" | "qty" | "unitPrice" | "discount" | "totalWithTax",
    value: string,
  ) {
    setAddedParts((current) =>
      current.map((row, rowIndex) => {
        if (rowIndex !== index) {
          return row;
        }

        if (field === "name") {
          return { ...row, name: value };
        }

        const numericValue = Math.max(0, Number(value) || 0);
        let nextRow = { ...row, [field]: numericValue } as AddedPartRow;

        if (field === "discount" && spareDiscountMode === "percent") {
          const baseTotal = Math.max(row.qty * row.unitPrice, 0);
          nextRow = {
            ...row,
            discount: roundValue((baseTotal * numericValue) / 100),
          };
        }

        if (field === "totalWithTax") {
          return syncPartRow(nextRow, { useTotalWithTax: true });
        }

        return syncPartRow(nextRow);
      }),
    );
  }

  function removePart(index: number) {
    setAddedParts((current) => current.filter((_, rowIndex) => rowIndex !== index));
  }

  function addLabour() {
    setLabourRows((current) => [
      ...current,
      syncLabourRow({
        id: labourIdCounter,
        desc: "",
        amount: "",
        discount: "0",
        tax: "0",
        totalWithTax: "0",
      }),
    ]);
    setLabourIdCounter((current) => current + 1);
  }

  function updateLabour(
    index: number,
    field: "desc" | "amount" | "discount" | "totalWithTax",
    value: string,
  ) {
    setLabourRows((current) =>
      current.map((row, rowIndex) => {
        if (rowIndex !== index) {
          return row;
        }

        if (field === "desc") {
          return { ...row, desc: value };
        }

        const nextRow = {
          ...row,
          [field]: value,
        } as LabourRow;

        if (field === "discount" && labourDiscountMode === "percent") {
          const baseAmount = Math.max(Number(row.amount) || 0, 0);
          return syncLabourRow({
            ...row,
            discount: String(roundValue((baseAmount * (Number(value) || 0)) / 100)),
          });
        }

        if (field === "totalWithTax") {
          return syncLabourRow(nextRow, { useTotalWithTax: true });
        }

        return syncLabourRow(nextRow);
      }),
    );
  }

  function getPartDiscountDisplay(row: AddedPartRow) {
    if (spareDiscountMode === "amount") {
      return row.discount;
    }

    const baseTotal = row.qty * row.unitPrice;
    if (baseTotal <= 0) {
      return 0;
    }

    return roundValue((row.discount / baseTotal) * 100);
  }

  function getLabourDiscountDisplay(row: LabourRow) {
    if (labourDiscountMode === "amount") {
      return Number(row.discount) || 0;
    }

    const baseAmount = Number(row.amount) || 0;
    if (baseAmount <= 0) {
      return 0;
    }

    return roundValue(((Number(row.discount) || 0) / baseAmount) * 100);
  }

  function removeLabour(index: number) {
    setLabourRows((current) => {
      const nextRows = current.filter((_, rowIndex) => rowIndex !== index);
      return nextRows.length > 0
        ? nextRows
        : [
            syncLabourRow({
              id: 0,
              desc: "",
              amount: "",
              discount: "0",
              tax: "0",
              totalWithTax: "0",
            }),
          ];
    });
  }



  function buildInvoiceData(status: "draft" | "completed" = "draft"): SavedInvoiceData | null {
    if (!selectedVehicle) {
      return null;
    }

    const invoiceItems = addedParts
      .filter((row) => row.name.trim() && row.qty > 0)
      .map((row) => ({
        name: row.name.trim(),
        quantity: row.qty,
        unit_price: row.unitPrice,
        total: row.qty * row.unitPrice,
        discount: Math.min(row.discount, row.qty * row.unitPrice),
        tax: row.tax,
        total_with_tax: row.totalWithTax,
        part_id: row.partId || row.id,
      }));

    const invoiceLabour = labourRows
      .filter((row) => row.desc.trim() && Number(row.amount) > 0)
      .map((row) => {
        return {
          description: row.desc.trim(),
          amount: Number(row.amount),
          discount: Math.min(Number(row.discount) || 0, Number(row.amount) || 0),
          tax: Number(row.tax) || 0,
          total_with_tax: Number(row.totalWithTax) || 0,
        };
      });

    return {
      invoice_number: invoiceNumber,
      date: invoiceDate,
      vehicle: selectedVehicle,
      items: invoiceItems,
      labour: invoiceLabour,
      total_spare: rawPartsSubtotal,
      total_labour: rawLabourSubtotal,
      subtotal_before_tax: subtotalBeforeTax,
      total_tax: totalTax,
      grand_total: grandTotal,
      payment_mode: paymentMode,
      note: note.trim(),
      status, // Added status
    } as any;
  }

  const handleVehicleKeyDown = (e: React.KeyboardEvent) => {
    if (!vehicleOpen || vehicleResults.length === 0) {
      if (e.key === "ArrowDown" || (e.key === "Enter" && !vehicleOpen)) {
        e.preventDefault();
        (document.querySelector('input[data-field="date-input"]') as HTMLInputElement)?.focus();
      }
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveVehicleIndex((prev) => (prev + 1) % vehicleResults.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveVehicleIndex((prev) => (prev - 1 + vehicleResults.length) % vehicleResults.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      selectVehicle(vehicleResults[activeVehicleIndex]);
      setTimeout(() => {
        (document.querySelector('input[data-field="date-input"]') as HTMLInputElement)?.focus();
      }, 50);
    } else if (e.key === "Escape") {
      setVehicleOpen(false);
    }
  };

  const handlePartKeyDown = (e: React.KeyboardEvent) => {
    if (!partOpen || partResults.length === 0) {
      if (e.key === "ArrowDown" || (e.key === "Enter" && !partOpen)) {
        e.preventDefault();
        const firstRow = document.querySelector('input[data-row="0"][data-field="name"][data-type="part"]') as HTMLInputElement;
        if (firstRow) {
          firstRow.focus();
          firstRow.select();
        } else {
          const firstLabour = document.querySelector('input[data-row="0"][data-field="desc"][data-type="labour"]') as HTMLInputElement;
          if (firstLabour) {
            firstLabour.focus();
            firstLabour.select();
          } else {
            (document.querySelector('input[data-field="note-input"]') as HTMLInputElement)?.focus();
          }
        }
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        (document.querySelector('input[data-field="date-input"]') as HTMLInputElement)?.focus();
      }
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActivePartIndex((prev) => (prev + 1) % partResults.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActivePartIndex((prev) => (prev - 1 + partResults.length) % partResults.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      addPart(partResults[activePartIndex]);
    } else if (e.key === "Escape") {
      setPartOpen(false);
    }
  };


  const handleSave = async (isDraft = false) => {
    setSaveError("");

    if (isCompleted) {
      toast.error("Completed invoices cannot be modified.");
      return;
    }

    if (!isDraft) {
      if (!selectedVehicle) {
        toast.error("Please select a vehicle first.");
        return;
      }
      if (grandTotal <= 0) {
        toast.error("Please add at least one part or labour charge.");
        return;
      }
      setSaving(true);
    } else {
      if (!selectedVehicle) return; 
      setAutoSaving(true);
    }

    try {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;

      const userId = authData.user?.id;
      const invoiceData = buildInvoiceData(isDraft ? "draft" : "completed");
      if (!invoiceData) throw new Error("Missing data");

      const storedPaymentMode = invoiceData.payment_mode === "cash" ? "cash" : "upi";

      let result;
      if (savedInvoiceId) {
        result = await supabase
          .from("invoices")
          .update({
            items: invoiceData.items,
            labour: invoiceData.labour,
            total_spare: rawPartsSubtotal,
            total_labour: rawLabourSubtotal,
            grand_total: grandTotal,
            payment_mode: storedPaymentMode,
            note: (invoiceData as any).note,
            status: (invoiceData as any).status,
          })
          .eq("id", savedInvoiceId)
          .select("id")
          .single();
      } else {
        result = await supabase
          .from("invoices")
          .insert([
            {
              invoice_number: invoiceData.invoice_number,
              vehicle_id: selectedVehicle.id,
              items: invoiceData.items,
              labour: invoiceData.labour,
              total_spare: rawPartsSubtotal,
              total_labour: rawLabourSubtotal,
              grand_total: grandTotal,
              payment_mode: storedPaymentMode,
              created_by: userId,
              note: (invoiceData as any).note,
              status: (invoiceData as any).status,
            },
          ])
          .select("id")
          .single();
      }

      if (result.error) throw result.error;
      const finalId = result.data.id;
      setSavedInvoiceId(finalId);

      if (!isDraft) {
        const selectedPartIds = addedParts
          .filter((row) => row.partId)
          .map((row) => row.partId);

        if (selectedPartIds.length > 0) {
          const { data: stockRows, error: stockError } = await supabase
            .from("spare_parts")
            .select("id, name, stock")
            .in("id", selectedPartIds);

          if (!stockError && stockRows) {
            for (const row of addedParts.filter((item) => item.partId)) {
              const stockRow = stockRows.find(s => s.id === row.partId);
              if (stockRow) {
                await supabase
                  .from("spare_parts")
                  .update({ stock: stockRow.stock - row.qty })
                  .eq("id", row.partId);
              }
            }
          }
        }

        await supabase.from("transactions").insert([{
          description: `Invoice ${invoiceNumber} - ${selectedVehicle.vehicle_reg}`,
          amount: grandTotal,
          type: "credit",
          payment_mode: storedPaymentMode,
          date: invoiceDate,
          created_by: userId,
          note: `Auto-generated from Invoice ${invoiceNumber}`
        }]);

        await logActivity({
          action: "create",
          entityType: "invoice",
          entityId: finalId,
          entityLabel: invoiceNumber,
          description: `Completed invoice for ${selectedVehicle.vehicle_reg}`,
          metadata: { grand_total: grandTotal },
        });

        setLastSavedInvoice({
          ...invoiceData,
          id: finalId,
        } as any);
        setIsCompleted(true);
        setSuccessOpen(true);
        toast.success("Invoice finalized successfully!");
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to save invoice");
      setSaveError(err.message);
    } finally {
      if (!isDraft) setSaving(false);
      setAutoSaving(false);
    }
  };

  useEffect(() => {
    if (!selectedVehicle || isCompleted) return;
    const currentHash = JSON.stringify({ addedParts, labourRows, grandTotal, note, paymentMode, selectedVehicleId: selectedVehicle.id });
    if (currentHash === lastSavedHash) return;
    const timer = setTimeout(() => {
      void handleSave(true);
      setLastSavedHash(currentHash);
    }, 2000);
    return () => clearTimeout(timer);
  }, [addedParts, labourRows, note, paymentMode, selectedVehicle, isCompleted, lastSavedHash]);

  const handleKeyDown = (e: React.KeyboardEvent, rowIndex: number, field: string, type: "part" | "labour") => {
    const target = e.target as HTMLInputElement;
    const isAtStart = target.selectionStart === 0 && target.selectionEnd === 0;
    const isAtEnd = target.selectionStart === target.value.length;

    if (e.key === "ArrowDown" || e.key === "ArrowUp" || (e.key === "Enter" && !e.shiftKey) || e.key === "ArrowLeft" || e.key === "ArrowRight") {
      const partFields = ["name", "qty", "unitPrice", "discount", "totalWithTax"];
      const labourFields = ["desc", "amount", "discount", "totalWithTax"];
      const fields = type === "part" ? partFields : labourFields;
      const currentIdx = fields.indexOf(field);

      if ((e.key === "ArrowLeft" && isAtStart) || (e.key === "ArrowRight" && isAtEnd) || e.key === "Enter") {
        e.preventDefault();
        const horizontalDir = (e.key === "ArrowRight" || e.key === "Enter") ? 1 : -1;
        const nextIdx = currentIdx + horizontalDir;

        if (nextIdx >= 0 && nextIdx < fields.length) {
          const nextInput = document.querySelector(`input[data-row="${rowIndex}"][data-field="${fields[nextIdx]}"][data-type="${type}"]`) as HTMLInputElement;
          if (nextInput) { nextInput.focus(); nextInput.select(); return; }
        } else if (e.key === "Enter" || e.key === "ArrowRight") {
          const nextRow = rowIndex + 1;
          const maxRows = type === "part" ? addedParts.length : labourRows.length;
          if (nextRow < maxRows) {
            const nextInput = document.querySelector(`input[data-row="${nextRow}"][data-field="${fields[0]}"][data-type="${type}"]`) as HTMLInputElement;
            if (nextInput) { nextInput.focus(); nextInput.select(); return; }
          }
        } else if (e.key === "ArrowLeft" && nextIdx < 0) {
           const prevRow = rowIndex - 1;
           if (prevRow >= 0) {
             const prevInput = document.querySelector(`input[data-row="${prevRow}"][data-field="${fields[fields.length - 1]}"][data-type="${type}"]`) as HTMLInputElement;
             if (prevInput) { prevInput.focus(); prevInput.select(); return; }
           }
        }
      }

      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const verticalDir = e.key === "ArrowDown" ? 1 : -1;
        const nextRow = rowIndex + verticalDir;
        const maxRows = type === "part" ? addedParts.length : labourRows.length;

        if (nextRow >= 0 && nextRow < maxRows) {
          const nextInput = document.querySelector(`input[data-row="${nextRow}"][data-field="${field}"][data-type="${type}"]`) as HTMLInputElement;
          if (nextInput) { nextInput.focus(); nextInput.select(); }
        } else if (nextRow < 0) {
          if (type === "part") { (document.querySelector('input[data-field="part-search"]') as HTMLInputElement)?.focus(); }
          else {
            const lastPartIdx = addedParts.length - 1;
            const lastPart = document.querySelector(`input[data-row="${lastPartIdx}"][data-field="${field}"][data-type="part"]`) as HTMLInputElement ||
                             document.querySelector(`input[data-row="${lastPartIdx}"][data-field="name"][data-type="part"]`) as HTMLInputElement;
            lastPart?.focus(); lastPart?.select();
          }
        } else if (nextRow >= maxRows) {
          if (type === "part") {
            const firstLabour = document.querySelector(`input[data-row="0"][data-field="${field}"][data-type="labour"]`) as HTMLInputElement ||
                                document.querySelector('input[data-row="0"][data-field="desc"][data-type="labour"]') as HTMLInputElement;
            firstLabour?.focus(); firstLabour?.select();
          } else { (document.querySelector('input[data-field="note-input"]') as HTMLInputElement)?.focus(); }
        }
      }
    }
  };

  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") { e.preventDefault(); void handleSave(); }
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); void handleSave(); }
    };
    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, [addedParts, labourRows, note, paymentMode, selectedVehicle, isCompleted]);


  function downloadAgain() {
    if (!lastSavedInvoice) {
      return;
    }

    generateInvoicePDF(lastSavedInvoice);
  }

  function viewLastInvoice() {
    if (!lastSavedInvoice?.id) {
      router.push("/billing");
      return;
    }

    router.push(`/billing/view/${lastSavedInvoice.id}`);
  }

  async function resetForm() {
    try {
      const nextInvoiceNumber = await fetchNextInvoiceNumber();
      setInvoiceNumber(nextInvoiceNumber);
      setInvoiceDate(todayValue());
      setVehicleQuery("");
      setVehicleResults([]);
      setVehicleOpen(false);
      setSelectedVehicle(null);
      setPartQuery("");
      setPartResults([]);
      setPartOpen(false);
      setAddedParts([]);
      setCustomPartCounter(1);
      setLabourRows([
        syncLabourRow({
          id: 0,
          desc: "",
          amount: "",
          discount: "0",
          tax: "0",
          totalWithTax: "0",
        }),
      ]);
      setLabourIdCounter(1);
      setSpareDiscountMode("amount");
      setLabourDiscountMode("amount");
      setPaymentMode("eft");
      setNote("");
      setSaveError("");
      setSuccessOpen(false);
      setLastSavedInvoice(null);
      setSavedInvoiceId(null);
      setIsCompleted(false);
      setAutoSaving(false);
      setLastSavedHash("");
      router.replace(`/billing/${nextInvoiceNumber}`);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to prepare invoice";
      setSaveError(message);
      toast.error(message);
    }
  }

  const previewItems = [
    ...addedParts
      .filter((row) => row.name.trim() && row.totalWithTax > 0)
      .map((row) => ({
      key: row.id,
      name: row.name.trim(),
      total: row.totalWithTax,
      })),
    ...labourRows
      .filter((row) => row.desc.trim() && Number(row.totalWithTax) > 0)
      .map((row) => ({
        key: `${row.id}-${row.desc}`,
        name: row.desc.trim(),
        total: Number(row.totalWithTax),
      })),
  ];

  return (
    <div className={styles.screen}>
      <style jsx global>{`
        @import url("https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap");

        :root {
          --font-sans: "Outfit";
          --font-mono: "JetBrains Mono";
        }
      `}</style>

      <div className={styles.layout}>
        <div className={styles.left}>
          <div className={styles.pageTop}>
            <div className="flex items-center justify-between w-full">
              <div className="flex flex-col">
                <span className="text-[12px] font-bold text-slate-800 tracking-tight">
                  Invoice #{invoiceNumber}
                </span>
                <div className="flex items-center gap-2">
                   <div className={cn("w-1.5 h-1.5 rounded-full", isCompleted ? "bg-emerald-500" : "bg-amber-500 animate-pulse")} />
                   <span className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">
                     {isCompleted ? "Finalized" : autoSaving ? "Saving draft..." : "Draft Mode"}
                   </span>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => router.push("/billing")}
                  className="px-4 h-[38px] text-[12px] font-bold text-slate-500 hover:bg-slate-50 transition-all border border-slate-100 rounded-xl"
                >
                  Discard
                </button>
                <button
                  type="button"
                  disabled={autoSaving || !selectedVehicle || isCompleted}
                  onClick={() => void handleSave(true)}
                  className="px-4 h-[38px] text-[12px] font-bold text-indigo-600 hover:bg-indigo-50 border border-indigo-100 transition-all rounded-xl disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  {autoSaving ? "Saving..." : "Save as Draft"}
                </button>
                <button
                  type="button"
                  disabled={saving || !selectedVehicle || isCompleted}
                  onClick={() => void handleSave(false)}
                  className="flex items-center gap-2 px-6 h-[38px] bg-[#4f46e5] text-white rounded-xl text-[12px] font-bold shadow-lg shadow-indigo-200 hover:bg-indigo-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saving ? (
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-white" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4" />
                  )}
                  {isCompleted ? "Invoice Finalized" : "Finalize & Complete"}
                </button>
              </div>
            </div>
          </div>

          {saveError ? (
            <div className={styles.errorBox}>
              <AlertCircle size={16} />
              <span>{saveError}</span>
            </div>
          ) : null}

          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <div className={styles.sectionNum}>1</div>
              <div>
                <div className={styles.sectionTitle}>Vehicle</div>
                <div className={styles.sectionSub}>
                  Search by Car ID or owner name
                </div>
              </div>
            </div>

            {selectedVehicle ? (
              <div className={styles.vehicleChip}>
                <div className={styles.vehicleChipLeft}>
                  <div className={styles.vehicleChipIcon}>
                    <Search size={16} />
                  </div>
                  <div>
                    <div className={styles.chipId}>{selectedVehicle.car_id}</div>
                    <div className={styles.chipName}>
                      {selectedVehicle.owner_name}
                    </div>
                    <div className={styles.chipMeta}>
                      {selectedVehicle.phone_number} · {selectedVehicle.vehicle_reg}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  className={styles.changeBtn}
                  onClick={clearVehicle}
                  disabled={isCompleted}
                >
                  Change
                </button>
              </div>
            ) : (
              <div className={styles.searchWrap}>
                <div
                  className={`${styles.searchField} ${
                    vehicleOpen ? styles.searchFocused : ""
                  }`}
                >
                  <Search className={styles.searchIcon} size={15} />
                    <input
                      type="text"
                      value={vehicleQuery}
                      placeholder="Search Car ID or owner…"
                      data-field="vehicle-search"
                      disabled={isCompleted}
                      onChange={(event) => {
                        setVehicleQuery(event.target.value);
                        setVehicleOpen(true);
                      }}
                      onFocus={() => {
                        setVehicleOpen(true);
                        setActiveVehicleIndex(0);
                      }}
                      onBlur={() => {
                        window.setTimeout(() => setVehicleOpen(false), 150);
                      }}
                      onKeyDown={handleVehicleKeyDown}
                    />
                </div>

                {vehicleOpen ? (
                  <div className={styles.dropdown}>
                    {vehicleLoading ? (
                      <div className={styles.dropEmpty}>Searching vehicles…</div>
                    ) : vehicleResults.length > 0 ? (
                      vehicleResults.map((vehicle, index) => (
                        <button
                          key={vehicle.id}
                          type="button"
                          className={`${styles.dropItem} ${index === activeVehicleIndex ? styles.dropItemActive : ""}`}
                          onMouseDown={() => selectVehicle(vehicle)}
                        >
                          <div className={styles.dropItemLeft}>
                            <div className={styles.dropItemIcon}>
                              <Search size={16} />
                            </div>
                            <div>
                              <div className={styles.chipId}>{vehicle.car_id}</div>
                              <div className={styles.dropName}>
                                {vehicle.owner_name}
                              </div>
                              <div className={styles.dropSub}>
                                {vehicle.phone_number} · {vehicle.vehicle_reg}
                              </div>
                            </div>
                          </div>
                        </button>
                      ))
                    ) : vehicleQuery.trim() ? (
                      <div className={styles.dropEmpty}>No vehicles found</div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            )}

            <div className={styles.field} style={{ marginTop: 20 }}>
              <label className={styles.label}>Invoice date</label>
               <input
                 className={styles.underDate}
                 type="date"
                 value={invoiceDate}
                 data-field="date-input-bottom"
                 disabled={isCompleted}
                 onChange={(event) => setInvoiceDate(event.target.value)}
               />
            </div>
          </div>

          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <div className={styles.sectionNum}>2</div>
              <div>
                <div className={styles.sectionTitle}>Spare parts</div>
                <div className={styles.sectionSub}>
                  Add stock items or custom billed parts
                </div>
              </div>
            </div>

            {addedParts.length > 0 ? (
              <div className={styles.partsTableWrap}>
                <table className={styles.partsTable}>
                  <thead>
                    <tr>
                      <th>Part</th>
                      <th>ID</th>
                      <th style={{ textAlign: "right" }}>Qty</th>
                      <th style={{ textAlign: "right" }}>Price (₹)</th>
                      <th
                        style={{ textAlign: "right", cursor: "pointer", userSelect: "none" }}
                        onClick={() => setSpareDiscountMode(prev => prev === "amount" ? "percent" : "amount")}
                        title="Click to switch discount between rupees and percentage"
                      >
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 6,
                            color: spareDiscountMode === "amount" ? "#15803d" : "#7c3aed",
                          }}
                        >
                          <span>Discount</span>
                          <span
                            style={{
                              padding: "2px 8px",
                              borderRadius: 999,
                              fontSize: 10,
                              fontWeight: 700,
                              letterSpacing: "0.04em",
                              background:
                                spareDiscountMode === "amount"
                                  ? "rgba(22,163,74,0.12)"
                                  : "rgba(124,58,237,0.12)",
                              border:
                                spareDiscountMode === "amount"
                                  ? "1px solid rgba(22,163,74,0.22)"
                                  : "1px solid rgba(124,58,237,0.22)",
                            }}
                          >
                            {spareDiscountMode === "amount" ? "₹ MODE" : "% MODE"}
                          </span>
                        </span>
                      </th>
                      <th style={{ textAlign: "right", color: "var(--tax)" }}>Tax 18%</th>
                      <th style={{ textAlign: "right", color: "#4ade80" }}>After Tax</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {addedParts.map((row, index) => {
                      return (
                        <tr key={row.id}>
                          <td className={styles.partNameCell}>
                            {row.isCustom ? (
                              <input
                                className={styles.inlineInput}
                                type="text"
                                value={row.name}
                                placeholder="Custom spare name"
                                disabled={isCompleted}
                                onChange={(event) =>
                                  updatePartRow(index, "name", event.target.value)
                                }
                                onKeyDown={(e) => handleKeyDown(e, index, "name", "part")}
                                data-row={index}
                                data-field="name"
                                data-type="part"
                              />
                            ) : (
                              row.name
                            )}
                          </td>
                          <td>
                            <span className={styles.partIdCell}>
                              {row.partId || "CUSTOM"}
                            </span>
                          </td>
                          <td style={{ textAlign: "right" }}>
                            <input
                              className={styles.numericInput}
                              type="number"
                              min={1}
                              max={Math.max(1, row.stock || 9999)}
                              value={row.qty}
                              disabled={isCompleted}
                              onChange={(event) =>
                                updatePartRow(index, "qty", event.target.value)
                              }
                              onKeyDown={(e) => handleKeyDown(e, index, "qty", "part")}
                              data-row={index}
                              data-field="qty"
                              data-type="part"
                            />
                          </td>
                          <td style={{ textAlign: "right" }}>
                            <input
                              className={styles.priceInput}
                              type="number"
                              min={0}
                              value={row.unitPrice}
                              disabled={isCompleted}
                              onChange={(event) =>
                                updatePartRow(
                                  index,
                                  "unitPrice",
                                  event.target.value,
                                )
                              }
                              onKeyDown={(e) => handleKeyDown(e, index, "unitPrice", "part")}
                              data-row={index}
                              data-field="unitPrice"
                              data-type="part"
                            />
                          </td>
                          <td style={{ textAlign: "right" }}>
                            <input
                              className={styles.priceInput}
                              type="number"
                              min={0}
                              value={getPartDiscountDisplay(row)}
                              disabled={isCompleted}
                              onChange={(event) =>
                                updatePartRow(index, "discount", event.target.value)
                              }
                              onKeyDown={(e) => handleKeyDown(e, index, "discount", "part")}
                              data-row={index}
                              data-field="discount"
                              data-type="part"
                            />
                          </td>
                          <td className={styles.taxCell}>{formatMoney(row.tax)}</td>
                          <td style={{ textAlign: "right" }}>
                            <input
                              className={styles.priceInput}
                              type="number"
                              min={0}
                              value={row.totalWithTax}
                              disabled={isCompleted}
                              onChange={(event) =>
                                updatePartRow(index, "totalWithTax", event.target.value)
                              }
                              onKeyDown={(e) => handleKeyDown(e, index, "totalWithTax", "part")}
                              data-row={index}
                              data-field="totalWithTax"
                              data-type="part"
                            />
                          </td>
                          <td>
                            <button
                              type="button"
                              className={styles.deleteBtn}
                              onClick={() => removePart(index)}
                              disabled={isCompleted}
                            >
                              <Trash2 size={12} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : null}

            <div className={styles.searchWrap}>
              <div
                className={`${styles.searchField} ${
                  partOpen ? styles.searchFocused : ""
                }`}
              >
                <Plus className={styles.searchIcon} size={14} />
                <input
                  type="text"
                  value={partQuery}
                  placeholder={isCompleted ? "Invoice finalized" : "Search and add a part…"}
                  data-field="part-search"
                  disabled={isCompleted}
                  onChange={(event) => {
                    setPartQuery(event.target.value);
                    setPartOpen(true);
                  }}
                   onFocus={() => {
                     setPartOpen(true);
                     setActivePartIndex(0);
                   }}
                   onBlur={() => {
                     window.setTimeout(() => setPartOpen(false), 150);
                   }}
                   onKeyDown={handlePartKeyDown}
                 />
              </div>

              {partOpen && partQuery.trim() ? (
                <div className={styles.dropdown}>
                  {partLoading ? (
                    <div className={styles.dropEmpty}>Searching parts…</div>
                  ) : partResults.length > 0 ? (
                     partResults.map((part, index) => (
                       <button
                         key={part.id}
                         type="button"
                         className={`${styles.dropItem} ${index === activePartIndex ? styles.dropItemActive : ""}`}
                         onMouseDown={() => addPart(part)}
                       >
                        <div className={styles.dropItemLeft}>
                          <div>
                            <span className={styles.partIdCell}>{part.id}</span>
                            <span
                              className={styles.dropName}
                              style={{ marginLeft: 8 }}
                            >
                              {part.name}
                            </span>
                            <span
                              className={styles.dropSub}
                              style={{
                                marginLeft: 8,
                                display: "inline",
                                color:
                                  part.stock <= 2 ? "var(--red)" : "var(--text3)",
                              }}
                            >
                              {part.stock} in stock
                            </span>
                          </div>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <div className={styles.dropPrice}>
                            {formatMoney(part.sell)}
                          </div>
                          <div className={styles.dropCost}>
                            cost {formatMoney(part.cost)}
                          </div>
                        </div>
                      </button>
                    ))
                  ) : (
                    <div className={styles.dropEmpty}>No parts found</div>
                  )}
                </div>
              ) : null}
            </div>

            <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
              <button type="button" className={styles.changeBtn} onClick={addCustomPart} disabled={isCompleted}>
                <Plus size={13} />
                Add custom spare
              </button>
            </div>

            {grandTotal > 0 ? (
              <div className={styles.subtotalHint}>
                <span style={{ color: "var(--text2)" }}>
                  Subtotal:{" "}
                  <strong style={{ color: "var(--text)" }}>
                    {formatMoney(subtotalBeforeTax)}
                  </strong>
                </span>{" "}
                -{" "}
                <span style={{ color: "#15803d" }}>
                  Discount: <strong>{formatMoney(discountValue)}</strong>
                </span>{" "}
                ={" "}
                <span style={{ color: "var(--text2)" }}>
                  Taxable: <strong style={{ color: "var(--text)" }}>{formatMoney(taxableSubtotal)}</strong>
                </span>{" "}
                +{" "}
                <span style={{ color: "var(--tax)" }}>
                  GST 18%: <strong>{formatMoney(totalTax)}</strong>
                </span>{" "}
                ={" "}
                <span style={{ color: "#4ade80" }}>
                  Total (incl. GST): <strong>{formatMoney(grandTotal)}</strong>
                </span>
              </div>
            ) : null}
          </div>

          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <div className={styles.sectionNum}>3</div>
              <div>
                <div className={styles.sectionTitle}>Labour charges</div>
                <div className={styles.sectionSub}>Manual labour with editable discount and fixed 18% GST</div>
              </div>
            </div>

            <div className={styles.partsTableWrap}>
              <table className={styles.partsTable}>
                <thead>
                  <tr>
                    <th>Description</th>
                    <th style={{ textAlign: "right" }}>Amount (₹)</th>
                    <th
                      style={{ textAlign: "right", cursor: "pointer", userSelect: "none" }}
                      onClick={() => setLabourDiscountMode(prev => prev === "amount" ? "percent" : "amount")}
                      title="Click to switch discount between rupees and percentage"
                    >
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 6,
                          color: labourDiscountMode === "amount" ? "#15803d" : "#7c3aed",
                        }}
                      >
                        <span>Discount</span>
                        <span
                          style={{
                            padding: "2px 8px",
                            borderRadius: 999,
                            fontSize: 10,
                            fontWeight: 700,
                            letterSpacing: "0.04em",
                            background:
                              labourDiscountMode === "amount"
                                ? "rgba(22,163,74,0.12)"
                                : "rgba(124,58,237,0.12)",
                            border:
                              labourDiscountMode === "amount"
                                ? "1px solid rgba(22,163,74,0.22)"
                                : "1px solid rgba(124,58,237,0.22)",
                          }}
                        >
                          {labourDiscountMode === "amount" ? "₹ MODE" : "% MODE"}
                        </span>
                      </span>
                    </th>
                    <th style={{ textAlign: "right", color: "var(--tax)" }}>Tax 18%</th>
                    <th style={{ textAlign: "right", color: "#4ade80" }}>After Tax</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {labourRows.map((row, index) => (
                    <tr key={row.id}>
                      <td>
                        <input
                          className={styles.inlineInput}
                          type="text"
                          value={row.desc}
                          placeholder="e.g. Oil change labour"
                          disabled={isCompleted}
                          onChange={(event) =>
                            updateLabour(index, "desc", event.target.value)
                          }
                          onKeyDown={(e) => handleKeyDown(e, index, "desc", "labour")}
                          data-row={index}
                          data-field="desc"
                          data-type="labour"
                        />
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <input
                          className={styles.priceInput}
                          type="number"
                          min={0}
                          value={row.amount}
                          disabled={isCompleted}
                          onChange={(event) =>
                            updateLabour(index, "amount", event.target.value)
                          }
                          onKeyDown={(e) => handleKeyDown(e, index, "amount", "labour")}
                          data-row={index}
                          data-field="amount"
                          data-type="labour"
                        />
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <input
                          className={styles.priceInput}
                          type="number"
                          min={0}
                          value={getLabourDiscountDisplay(row)}
                          disabled={isCompleted}
                          onChange={(event) =>
                            updateLabour(index, "discount", event.target.value)
                          }
                          onKeyDown={(e) => handleKeyDown(e, index, "discount", "labour")}
                          data-row={index}
                          data-field="discount"
                          data-type="labour"
                        />
                      </td>
                      <td className={styles.taxCell}>{formatMoney(Number(row.tax) || 0)}</td>
                      <td style={{ textAlign: "right" }}>
                        <input
                          className={styles.priceInput}
                          type="number"
                          min={0}
                          value={row.totalWithTax}
                          disabled={isCompleted}
                          onChange={(event) =>
                            updateLabour(index, "totalWithTax", event.target.value)
                          }
                          onKeyDown={(e) => handleKeyDown(e, index, "totalWithTax", "labour")}
                          data-row={index}
                          data-field="totalWithTax"
                          data-type="labour"
                        />
                      </td>
                      <td>
                        <button
                          type="button"
                          className={styles.deleteBtn}
                          onClick={() => removeLabour(index)}
                          disabled={isCompleted}
                        >
                          <Trash2 size={12} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <button type="button" className={styles.changeBtn} onClick={addLabour} disabled={isCompleted}>
              <Plus size={13} />
              Add labour
            </button>
          </div>

          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <div className={styles.sectionNum}>4</div>
              <div>
                <div className={styles.sectionTitle}>Payment mode</div>
                <div className={styles.sectionSub}>How the customer pays</div>
              </div>
            </div>

            <div className={styles.modeGrid}>
              {(["cash", "eft"] as PaymentMode[]).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  className={`${styles.modeBtn} ${
                    paymentMode === mode
                      ? mode === "cash"
                        ? styles.modeSelectedCash
                        : styles.modeSelectedUpi
                      : ""
                  }`}
                  onClick={() => setPaymentMode(mode)}
                  disabled={isCompleted}
                >
                  {mode === "eft" ? "EFT" : "CASH"}
                </button>
              ))}
            </div>

            <div className={styles.modeHint}>{MODE_HINTS[paymentMode]}</div>
          </div>

          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <div className={styles.sectionNum}>5</div>
              <div>
                <div className={styles.sectionTitle}>Note</div>
                <div className={styles.sectionSub}>
                  Optional — internal note
                </div>
              </div>
            </div>

             <input
               className={styles.noteInput}
               type="text"
               value={note}
               placeholder="Any notes about this invoice…"
               data-field="note-input"
               disabled={isCompleted}
               onChange={(event) => setNote(event.target.value)}
               onKeyDown={(e) => {
                 if (e.key === "ArrowUp") {
                    e.preventDefault();
                    const lastLabourIdx = labourRows.length - 1;
                    const lastLabour = document.querySelector(`input[data-row="${lastLabourIdx}"][data-field="desc"][data-type="labour"]`) as HTMLInputElement;
                    if (lastLabour) {
                      lastLabour.focus();
                      lastLabour.select();
                    } else {
                      const lastPartIdx = addedParts.length - 1;
                      const lastPart = document.querySelector(`input[data-row="${lastPartIdx}"][data-field="name"][data-type="part"]`) as HTMLInputElement;
                      if (lastPart) { lastPart.focus(); lastPart.select(); }
                    }
                 } else if (e.key === "Enter") {
                    e.preventDefault();
                    void handleSave(false);
                 }
               }}
             />
           </div>

          <div className="flex flex-col gap-2">
            <button
              type="button"
              className={styles.saveBtn}
              onClick={() => void handleSave(false)}
              disabled={saving || !selectedVehicle || isCompleted}
            >
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              <span>{isCompleted ? "Invoice Finalized" : saving ? "Finalizing…" : "Complete & Save Invoice"}</span>
            </button>
            <button
               type="button"
               disabled={autoSaving || !selectedVehicle || isCompleted}
               onClick={() => void handleSave(true)}
               className="w-full flex items-center justify-center gap-2 py-3 border border-indigo-100 text-indigo-600 bg-white rounded-xl text-sm font-bold hover:bg-indigo-50 transition-all opacity-80 disabled:opacity-30 disabled:cursor-not-allowed"
            >
               {autoSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
               {isCompleted ? "Locked" : autoSaving ? "Saving Draft..." : "Save Draft"}
            </button>
          </div>

          <div className={styles.cancelLink} onClick={() => router.push("/billing")}>
            Cancel
          </div>

          <div className={styles.saveNote}>
            <CheckCircle2 size={11} />
            Stock &amp; day book update automatically on save
          </div>
        </div>

        <div className={styles.right}>
          <div className={styles.previewLabel}>Live Preview</div>

          <div className={styles.totalBlock}>
            <div className={styles.totalRow}>
              <span className={styles.totalLabel}>Parts subtotal</span>
              <span className={styles.totalValue}>{formatMoney(rawPartsSubtotal)}</span>
            </div>
            <div className={styles.totalRow}>
              <span className={styles.totalLabel}>Labour subtotal</span>
              <span className={styles.totalValue}>{formatMoney(rawLabourSubtotal)}</span>
            </div>
            <div className={styles.totalRow}>
              <span className={styles.totalLabel}>Discount</span>
              <span className={styles.totalValue}>
                {formatMoney(discountValue)}
              </span>
            </div>
            <div className={styles.totalRow}>
              <span className={styles.totalLabel}>Taxable subtotal</span>
              <span className={styles.totalValue}>
                {formatMoney(taxableSubtotal)}
              </span>
            </div>
            <div className={styles.totalRow}>
              <span className={styles.totalLabel} style={{ color: "var(--tax)" }}>
                GST 18% (Parts + Labour)
              </span>
              <span className={styles.totalValue} style={{ color: "var(--tax)" }}>
                {formatMoney(totalTax)}
              </span>
            </div>
            <div className={`${styles.totalRow} ${styles.totalGrand}`}>
              <span className={styles.grandLabel}>Grand Total (incl. GST)</span>
              <span className={`${styles.totalValue} ${styles.grandValue}`}>
                {formatMoney(grandTotal)}
              </span>
            </div>
          </div>

          <div className={styles.invoicePreviewCard}>
            <div className={styles.previewHead}>
              <div>
                <div className={styles.previewTitle}>SIRIGIRVEL WORKSHOP</div>
                <div className={styles.inlineInfo}>Workshop Invoice</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div className={styles.previewNumber}>{invoiceNumber}</div>
                <div className={styles.inlineInfo}>{formatInvoiceDate(invoiceDate)}</div>
              </div>
            </div>

            <div className={styles.previewCustomer}>
              <div className={styles.previewSectionLabel}>Bill to</div>
              {selectedVehicle ? (
                <>
                  <div className={styles.previewCustomerName}>
                    {selectedVehicle.owner_name}
                  </div>
                  <div className={styles.previewCustomerMeta}>
                    {selectedVehicle.car_id} · {selectedVehicle.vehicle_reg}
                  </div>
                </>
              ) : (
                <div className={styles.previewCustomerMeta}>— Select a vehicle —</div>
              )}
            </div>

            <div className={styles.previewItems}>
              <div className={styles.previewSectionLabel}>Items</div>
              {previewItems.length > 0 ? (
                previewItems.map((item) => (
                  <div key={item.key} className={styles.previewRow}>
                    <span className={styles.previewRowName}>{item.name}</span>
                    <span className={styles.previewRowValue}>
                      {formatMoney(item.total)}
                    </span>
                  </div>
                ))
              ) : (
                <div className={styles.previewEmpty}>
                  No parts or charges added yet
                </div>
              )}
            </div>

            {grandTotal > 0 ? (
              <div className={styles.previewTotal}>
                <span className={styles.previewTotalLabel}>Total Amount</span>
                <span className={styles.previewTotalValue}>
                  {formatMoney(grandTotal)}
                </span>
              </div>
            ) : null}

            <div className={styles.previewMode}>
              Payment: {paymentMode.toUpperCase()}
            </div>
          </div>
        </div>
      </div>

      {successOpen && lastSavedInvoice ? (
        <div className={styles.overlay}>
          <div className={styles.overlayCard}>
            <button
              type="button"
              className={styles.overlayClose}
              onClick={() => router.push("/billing")}
              aria-label="Close success dialog"
            >
              <X size={16} />
            </button>
            <div className={styles.overlayIcon}>
              <Check size={30} />
            </div>
            <div className={styles.overlayTitle}>Invoice Saved!</div>
            <div className={styles.overlaySub}>
              {lastSavedInvoice.invoice_number} created for{" "}
              {lastSavedInvoice.vehicle.owner_name}.
            </div>
            
            <div className="flex flex-col gap-3 mt-6 w-full">
              <button
                className="flex items-center justify-center gap-2 w-full py-3 bg-[#4f46e5] text-white rounded-xl font-bold shadow-lg shadow-indigo-100 hover:scale-[1.02] transition-all"
                onClick={() => generateInvoicePDF(lastSavedInvoice)}
              >
                <Download size={18} />
                Download Invoice
              </button>
              
              <button
                className="flex items-center justify-center gap-2 w-full py-3 bg-white border border-slate-200 text-slate-700 rounded-xl font-bold hover:bg-slate-50 transition-all"
                onClick={() => router.push(`/billing/view/${lastSavedInvoice.id}`)}
              >
                <Search size={18} />
                Preview & Edit
              </button>

              <button
                className="w-full py-2 text-slate-400 text-[13px] font-medium hover:text-slate-600 transition-all"
                onClick={resetForm}
              >
                Create New Invoice
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
