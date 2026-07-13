"use client";

import React, { useEffect, useState, useRef } from "react";
import {
  AlertCircle,
  ArrowLeft,
  Check,
  CheckCircle2,
  Download,
  FileText,
  Plus,
  ScanLine,
  Search,
  Trash2,
  X,
} from "lucide-react";
import toast from "react-hot-toast";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { createQuotationNumber, createVehicleId } from "@/lib/utils";
import { generateQuotationPDF } from "@/lib/pdf-service";
import { logActivity } from "@/lib/activity-log";
import styles from "./InvoiceCreator.module.css";

interface VehicleRecord {
  id: string;
  car_id: string;
  owner_name: string;
  phone_number: string;
  vehicle_reg: string;
  make_model?: string | null;
  odometer_km?: string | null;
}

interface PartRecord {
  id: string;
  barcode?: string | null;
  name: string;
  cat?: string | null;
  cost: number;
  sell: number;
  stock: number;
}

type BarcodeDetectorLike = {
  detect: (source: ImageBitmapSource) => Promise<Array<{ rawValue?: string }>>;
};

type BarcodeDetectorCtor = {
  new (options?: { formats?: string[] }): BarcodeDetectorLike;
  getSupportedFormats?: () => Promise<string[]>;
};

const PREFERRED_BARCODE_FORMATS = [
  "code_128",
  "code_39",
  "ean_13",
  "ean_8",
  "upc_a",
  "upc_e",
  "qr_code",
];

interface AddedPartRow {
  id: string;
  partId: string;
  name: string;
  qty: number;
  unitPrice: number;
  discount: number;
  taxRate: number;
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
  taxRate: string;
  tax: string;
  totalWithTax: string;
}

interface SavedQuotationData {
  id?: string;
  quotation_number: string;
  start_date: string;
  end_date: string;
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
  discount: number;
  total_spare: number;
  total_labour: number;
  subtotal_before_tax: number;
  total_tax: number;
  grand_total: number;
  odometer_km?: string | null;
  note: string;
}

const TAX_RATE = 0.18;

function todayValue() {
  return new Date().toISOString().split("T")[0];
}

function formatMoney(value: number) {
  return `₹${Number(value || 0).toLocaleString("en-IN")}`;
}

function formatDate(value: string) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function extractOdometerFromNote(note?: string | null) {
  if (!note) return "";
  const match = note.match(/(?:^|\n)Odometer:\s*([^\n\r]+?)(?:\s*km)?(?:\n|$)/i);
  return match ? match[1].trim() : "";
}

function stripOdometerFromNote(note?: string | null) {
  if (!note) return "";
  return note
    .split(/\r?\n/)
    .filter((line) => !/^Odometer:\s*/i.test(line.trim()))
    .join("\n")
    .trim();
}

function clampNumber(value: number, min: number, max: number) {
  if (Number.isNaN(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function roundValue(value: number) {
  return Math.round(Number(value) || 0);
}

function createCustomPartId(name: string, suffix: number) {
  const cleanName = String(name || "").replace(/[^a-zA-Z0-9]/g, "");
  const pre = ((cleanName || "CUS") + "XXX").substring(0, 3).toUpperCase();
  return `Sgv${pre}/${suffix}`;
}

function generatePartSuffix() {
  return Math.floor(1000 + Math.random() * 9000);
}

function resolvePartIdSuffix(existingPartId: string, fallback: number) {
  const match = String(existingPartId || "").match(/\/(\d{4,})$/);
  const parsed = Number(match?.[1] || "");
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  return fallback;
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

  const taxRate = Math.max(0, Number(row.taxRate) || 0);
  const taxMultiplier = 1 + taxRate / 100;
  let tax = roundValue(taxableBase * (taxRate / 100));
  let totalWithTax = taxableBase + tax;

  if (options.useTotalWithTax) {
    totalWithTax = Math.max(roundValue(row.totalWithTax), 0);
    taxableBase = roundValue(totalWithTax / taxMultiplier);
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

  const taxRate = Math.max(0, Number(row.taxRate) || 0);
  const taxMultiplier = 1 + taxRate / 100;
  let tax = roundValue(taxableBase * (taxRate / 100));
  let totalWithTax = taxableBase + tax;

  if (options.useTotalWithTax) {
    totalWithTax = Math.max(roundValue(Number(row.totalWithTax) || 0), 0);
    taxableBase = roundValue(totalWithTax / taxMultiplier);
    tax = Math.max(totalWithTax - taxableBase, 0);
    amount = taxableBase + discount;
  }

  return {
    ...row,
    amount: String(amount),
    discount: String(discount),
    taxRate: String(taxRate),
    tax: String(tax),
    totalWithTax: String(totalWithTax),
  };
}

export function QuotationCreator({
  initialQuotationNumber,
  quotationId,
}: {
  initialQuotationNumber?: string;
  quotationId?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [quotationNumber, setQuotationNumber] = useState(
    initialQuotationNumber && initialQuotationNumber !== "new"
      ? initialQuotationNumber
      : createQuotationNumber(),
  );
  const [quotationDate, setQuotationDate] = useState(todayValue());
  const [odometerReading, setOdometerReading] = useState("");



  const [vehicleQuery, setVehicleQuery] = useState("");
  const [vehicleResults, setVehicleResults] = useState<VehicleRecord[]>([]);
  const [vehicleOpen, setVehicleOpen] = useState(false);
  const [vehicleLoading, setVehicleLoading] = useState(false);
  const [selectedVehicle, setSelectedVehicle] = useState<VehicleRecord | null>(
    null,
  );
  const [quickVehicleOpen, setQuickVehicleOpen] = useState(false);
  const [quickVehicleSaving, setQuickVehicleSaving] = useState(false);
  const [quickVehicleForm, setQuickVehicleForm] = useState({
    owner_name: "",
    phone_number: "",
    vehicle_reg: "",
    make_model: "",
    odometer_km: "",
  });

  const [partQuery, setPartQuery] = useState("");
  const [partResults, setPartResults] = useState<PartRecord[]>([]);
  const [partOpen, setPartOpen] = useState(false);
  const [partLoading, setPartLoading] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannerStarting, setScannerStarting] = useState(false);
  const [activeVehicleIndex, setActiveVehicleIndex] = useState(0);
  const [activePartIndex, setActivePartIndex] = useState(0);

  const [addedParts, setAddedParts] = useState<AddedPartRow[]>([]);
  const [customPartCounter, setCustomPartCounter] = useState(1);
  const [labourRows, setLabourRows] = useState<LabourRow[]>([
    syncLabourRow({
      id: 0,
      desc: "",
      amount: "",
      discount: "0",
      tax: "0",
      taxRate: String(TAX_RATE * 100),
      totalWithTax: "0",
    }),
  ]);
  const [labourIdCounter, setLabourIdCounter] = useState(1);
  const [spareDiscountMode, setSpareDiscountMode] = useState<"amount" | "percent">("amount");
  const [labourDiscountMode, setLabourDiscountMode] = useState<"amount" | "percent">("amount");
  const [note, setNote] = useState("");
  const [advanceBalance, setAdvanceBalance] = useState(0);
  const [advanceLoading, setAdvanceLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewQuotation, setPreviewQuotation] =
    useState<SavedQuotationData | null>(null);
  const [successOpen, setSuccessOpen] = useState(false);
  const [lastSavedQuotation, setLastSavedQuotation] =
    useState<SavedQuotationData | null>(null);
  const scannerVideoRef = useRef<HTMLVideoElement | null>(null);
  const scannerStreamRef = useRef<MediaStream | null>(null);
  const scannerTickRef = useRef<number | null>(null);
  const scannerDetectorRef = useRef<BarcodeDetectorLike | null>(null);
  const scannerLockedRef = useRef(false);

  const getBarcodeDetectorCtor = () =>
    (window as Window & { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector || null;

  const createBarcodeDetector = async () => {
    const BarcodeDetectorClass = getBarcodeDetectorCtor();
    if (!BarcodeDetectorClass) return null;

    const getSupportedFormats = BarcodeDetectorClass.getSupportedFormats;
    if (typeof getSupportedFormats !== "function") {
      return new BarcodeDetectorClass({ formats: PREFERRED_BARCODE_FORMATS });
    }

    try {
      const supported = await getSupportedFormats.call(BarcodeDetectorClass);
      const formats = PREFERRED_BARCODE_FORMATS.filter((format) => supported.includes(format));
      return formats.length
        ? new BarcodeDetectorClass({ formats })
        : new BarcodeDetectorClass();
    } catch {
      return new BarcodeDetectorClass({ formats: PREFERRED_BARCODE_FORMATS });
    }
  };

  const openRearCameraStream = async () => {
    const attempts: MediaStreamConstraints[] = [
      {
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      },
      {
        video: { facingMode: "environment" },
        audio: false,
      },
    ];

    const isMobile = /android|iphone|ipad|ipod/i.test(navigator.userAgent || "");
    if (isMobile && navigator.mediaDevices?.enumerateDevices) {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const rearCamera = devices.find(
          (device) => device.kind === "videoinput" && /(back|rear|environment)/i.test(device.label),
        );
        if (rearCamera?.deviceId) {
          attempts.push({
            video: {
              deviceId: { exact: rearCamera.deviceId },
              width: { ideal: 1280 },
              height: { ideal: 720 },
            },
            audio: false,
          });
        }
      } catch {
        // ignore device enumeration issues and continue with default attempts
      }
    }

    attempts.push({ video: true, audio: false });

    let lastError: unknown = null;
    for (const constraints of attempts) {
      try {
        return await navigator.mediaDevices.getUserMedia(constraints);
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError instanceof Error ? lastError : new Error("Unable to access camera scanner");
  };

  const getCameraAccessErrorMessage = (error: unknown) => {
    if (error instanceof DOMException) {
      if (error.name === "NotAllowedError" || error.name === "SecurityError") {
        return "Camera permission denied. Allow camera access in browser settings, then try again.";
      }
      if (error.name === "NotFoundError" || error.name === "DevicesNotFoundError") {
        return "No camera detected on this device. Enter barcode / spare ID manually.";
      }
      if (error.name === "NotReadableError" || error.name === "TrackStartError") {
        return "Camera is busy or blocked by another app. Close other camera apps and retry.";
      }
    }

    return "Unable to access camera scanner. Enter barcode / spare ID manually.";
  };

  const ensureCameraAccess = async () => {
    if (!navigator?.mediaDevices?.getUserMedia) {
      return {
        granted: false,
        message: "Camera access is unavailable on this device. Enter barcode / spare ID.",
      };
    }

    if (navigator.permissions?.query) {
      try {
        const permissionStatus = await navigator.permissions.query({
          name: "camera" as PermissionName,
        });
        if (permissionStatus.state === "denied") {
          return {
            granted: false,
            message: "Camera permission is blocked. Allow camera access in browser settings, then try again.",
          };
        }
      } catch {
        // ignore unsupported permissions API implementations
      }
    }

    // Avoid opening camera twice on iOS/WebKit. Open camera only in scanner start.
    return { granted: true, message: "" };
  };

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

  function stopScannerCamera() {
    if (scannerTickRef.current !== null) {
      window.cancelAnimationFrame(scannerTickRef.current);
      scannerTickRef.current = null;
    }
    if (scannerStreamRef.current) {
      scannerStreamRef.current.getTracks().forEach((track) => track.stop());
      scannerStreamRef.current = null;
    }
    if (scannerVideoRef.current) {
      scannerVideoRef.current.srcObject = null;
    }
    scannerLockedRef.current = false;
  }

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
  const discountedPartsSubtotal = Math.max(rawPartsSubtotal - partsDiscountTotal, 0);
  const discountedLabourSubtotal = Math.max(
    rawLabourSubtotal - labourDiscountTotal,
    0,
  );
  const subtotalBeforeTax = rawPartsSubtotal + rawLabourSubtotal;
  const taxableSubtotal = discountedPartsSubtotal + discountedLabourSubtotal;
  const totalTax =
    addedParts.reduce((sum, row) => sum + row.tax, 0) +
    labourRows.reduce((sum, row) => sum + (Number(row.tax) || 0), 0);
  const grandTotal =
    addedParts.reduce((sum, row) => sum + row.totalWithTax, 0) +
    labourRows.reduce((sum, row) => sum + (Number(row.totalWithTax) || 0), 0);

  async function fetchNextQuotationNumber() {
    const now = new Date();
    const month = now.toLocaleString("en", { month: "short" }).toUpperCase();
    const year = now.getFullYear();
    const prefix = `QTN/${month}/${year}/`;

    const { count, error } = await supabase
      .from("quotations")
      .select("*", { count: "exact", head: true })
      .ilike("quotation_number", `${prefix}%`);

    if (error) throw error;
    return createQuotationNumber((count || 0) + 1, now);
  }

  useEffect(() => {
    if (initialQuotationNumber && initialQuotationNumber !== "new") return;

    const assign = async () => {
      try {
        const next = await fetchNextQuotationNumber();
        setQuotationNumber(next);
        router.replace(`/quotations/${next}`);
      } catch (error) {
        console.error(error);
      }
    };

    void assign();
  }, [initialQuotationNumber, router]);

  useEffect(() => {
    const prefilledCarId = searchParams.get("car_id");
    if (!prefilledCarId) return;

    const loadVehicle = async () => {
      const { data } = await supabase
        .from("vehicles")
        .select("id, car_id, owner_name, phone_number, vehicle_reg, make_model, odometer_km")
        .eq("car_id", prefilledCarId)
        .maybeSingle();

      if (data) {
        setSelectedVehicle(data);
        setOdometerReading(data.odometer_km || "");
      }
    };

    void loadVehicle();
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
        .select("id, car_id, owner_name, phone_number, vehicle_reg, make_model, odometer_km")
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
    if (!selectedVehicle) {
      setAdvanceBalance(0);
      setAdvanceLoading(false);
      return;
    }

    let active = true;
    const loadAdvanceBalance = async () => {
      setAdvanceLoading(true);
      const filters = [`note.ilike.%vehicle_id:${selectedVehicle.id}%`];
      if (selectedVehicle.car_id) {
        filters.push(`note.ilike.%car_id:${selectedVehicle.car_id}%`);
      }

      const { data } = await supabase
        .from("transactions")
        .select("amount, note")
        .ilike("note", "%invoice_advance_%")
        .or(filters.join(","))
        .order("created_at", { ascending: false })
        .limit(200);

      if (!active) return;
      let balance = 0;
      (data || []).forEach((row) => {
        const note = String(row.note || "");
        const amount = Number(row.amount || 0);
        if (note.includes("invoice_advance_use:")) {
          balance -= amount;
        } else if (note.includes("invoice_advance_for:")) {
          balance += amount;
        }
      });
      setAdvanceBalance(Math.max(balance, 0));
      setAdvanceLoading(false);
    };

    void loadAdvanceBalance();
    return () => {
      active = false;
    };
  }, [selectedVehicle?.id, selectedVehicle?.car_id]);

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
        .select("id, name, cat, cost, sell, stock, barcode")
        .or(`name.ilike.%${query}%,id.ilike.%${query}%,barcode.ilike.%${query}%,cat.ilike.%${query}%`)
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
    setOdometerReading(vehicle.odometer_km || "");
    setVehicleQuery("");
    setVehicleResults([]);
    setVehicleOpen(false);
    setSaveError("");
  }

  async function fetchNextCarIdForQuickCreate() {
    const year = new Date().getFullYear();
    const prefix = `SGV-${year}-`;
    const { count, error } = await supabase
      .from("vehicles")
      .select("*", { count: "exact", head: true })
      .ilike("car_id", `${prefix}%`);
    if (error) throw error;
    return createVehicleId((count || 0) + 1, new Date());
  }

  async function handleQuickVehicleCreate() {
    const cleanedPhone = quickVehicleForm.phone_number.replace(/\D/g, "").slice(0, 10);
    if (
      !quickVehicleForm.owner_name.trim() ||
      !cleanedPhone ||
      !quickVehicleForm.vehicle_reg.trim()
    ) {
      toast.error("Owner name, phone number, and vehicle number are required.");
      return;
    }
    if (!/^[6-9]\d{9}$/.test(cleanedPhone)) {
      toast.error("Phone number must be a valid 10-digit Indian mobile number.");
      return;
    }

    try {
      setQuickVehicleSaving(true);
      const cleanReg = quickVehicleForm.vehicle_reg.replace(/\s+/g, "").toUpperCase();
      const { data: existing } = await supabase
        .from("vehicles")
        .select("id, car_id")
        .eq("vehicle_reg", cleanReg)
        .maybeSingle();
      if (existing) {
        toast.error(`Vehicle already exists as ${existing.car_id}`);
        return;
      }

      const { data: { user } } = await supabase.auth.getUser();
      const carId = await fetchNextCarIdForQuickCreate();
      const odometerNote = quickVehicleForm.odometer_km.trim()
        ? `Odometer: ${quickVehicleForm.odometer_km.trim()} km`
        : "";
      const quickHistory = [odometerNote, "Added from quotation quick create"]
        .filter(Boolean)
        .join(" | ");

      const { data: inserted, error } = await supabase
        .from("vehicles")
        .insert([{
          car_id: carId,
          owner_name: quickVehicleForm.owner_name.trim(),
          phone_number: cleanedPhone,
          alternate_phone: null,
          vehicle_reg: cleanReg,
          entry_date: todayValue(),
          make_model: quickVehicleForm.make_model.trim() || null,
          odometer_km: quickVehicleForm.odometer_km.trim() || null,
          status: "In Service",
          work_description: quickHistory || null,
          created_by: user?.id,
        }])
        .select("id, car_id, owner_name, phone_number, vehicle_reg, make_model, odometer_km")
        .single();

      if (error || !inserted) throw error || new Error("Failed to create vehicle.");

      await logActivity({
        action: "create",
        entityType: "vehicle",
        entityId: inserted.id,
        entityLabel: inserted.owner_name,
        description: "Created vehicle from quotation quick create",
        metadata: {
          car_id: inserted.car_id,
          vehicle_reg: inserted.vehicle_reg,
          odometer_km: quickVehicleForm.odometer_km.trim() || null,
          source: "quotation_quick_create",
        },
      });

      selectVehicle(inserted as VehicleRecord);
      setQuickVehicleOpen(false);
      setQuickVehicleForm({
        owner_name: "",
        phone_number: "",
        vehicle_reg: "",
        make_model: "",
        odometer_km: "",
      });
      toast.success(`Vehicle created: ${inserted.car_id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create vehicle.");
    } finally {
      setQuickVehicleSaving(false);
    }
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
        taxRate: TAX_RATE * 100,
        tax: roundValue(part.sell * TAX_RATE),
        totalWithTax: roundValue(part.sell * (1 + TAX_RATE)),
        stock: part.stock,
        isCustom: false,
      }),
    ]);
    setPartQuery("");
    setPartResults([]);
    setPartOpen(false);
  }

  async function addPartByScannedQuery(query: string) {
    if (!query) return;

    const usedIds = new Set(addedParts.filter((row) => row.partId).map((row) => row.partId));
    setPartLoading(true);
    try {
      let selectedPart: PartRecord | null = null;

      const exactById = await supabase
        .from("spare_parts")
        .select("id, name, cat, cost, sell, stock, barcode")
        .or(`id.eq.${query},barcode.eq.${query}`)
        .limit(1);
      if (exactById.error) throw exactById.error;
      if (exactById.data?.[0]) {
        selectedPart = exactById.data[0] as PartRecord;
      } else {
        const byName = await supabase
          .from("spare_parts")
          .select("id, name, cat, cost, sell, stock, barcode")
          .ilike("name", `%${query}%`)
          .limit(1);
        if (byName.error) throw byName.error;
        if (byName.data?.[0]) {
          selectedPart = byName.data[0] as PartRecord;
        } else {
          const byIdContains = await supabase
            .from("spare_parts")
            .select("id, name, cat, cost, sell, stock, barcode")
            .or(`id.ilike.%${query}%,barcode.ilike.%${query}%`)
            .limit(1);
          if (byIdContains.error) throw byIdContains.error;
          selectedPart = (byIdContains.data?.[0] as PartRecord) || null;
        }
      }

      if (!selectedPart) {
        toast.error("No spare part found for scanned value.");
        setPartQuery(query);
        setPartOpen(true);
        return;
      }

      if (usedIds.has(selectedPart.id)) {
        toast.error("This spare part is already added.");
        return;
      }

      addPart(selectedPart);
      toast.success(`Added ${selectedPart.name}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to scan and add part.");
    } finally {
      setPartLoading(false);
    }
  }

  function openManualSpareEntryFallback(message: string) {
    toast.error(message);
    setPartOpen(true);
    window.setTimeout(() => {
      const input = document.querySelector('input[data-field="part-search"]') as HTMLInputElement | null;
      input?.focus();
      input?.select();
    }, 0);
  }

  async function openBarcodeScanner() {
    const BarcodeDetectorClass = getBarcodeDetectorCtor();

    if (!BarcodeDetectorClass) {
      openManualSpareEntryFallback("Barcode scan is unavailable in this browser. Enter barcode / spare ID.");
      return;
    }

    const access = await ensureCameraAccess();
    if (!access.granted) {
      openManualSpareEntryFallback(access.message);
      return;
    }

    setScannerOpen(true);
  }

  useEffect(() => {
    if (!scannerOpen) {
      stopScannerCamera();
      return;
    }

    let cancelled = false;

    const startScanner = async () => {
      try {
        setScannerStarting(true);
        const stream = await openRearCameraStream();
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        const video = scannerVideoRef.current;
        if (!video) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        scannerStreamRef.current = stream;
        video.srcObject = stream;
        video.setAttribute("playsinline", "true");
        await video.play();

        const detector = await createBarcodeDetector();
        if (!detector) {
          throw new Error("Barcode detector not supported in this browser");
        }
        scannerDetectorRef.current = detector;

        const scanTick = async () => {
          if (cancelled || !scannerOpen || scannerLockedRef.current) return;
          const detector = scannerDetectorRef.current;
          const activeVideo = scannerVideoRef.current;
          if (!detector || !activeVideo || activeVideo.readyState < 2) return;

          try {
            const detected = await detector.detect(activeVideo);
            const raw = String(detected?.[0]?.rawValue || "").trim();
            if (!raw) return;
            scannerLockedRef.current = true;
            await addPartByScannedQuery(raw);
            if (!cancelled) {
              setScannerOpen(false);
            }
          } catch {
            // ignore frame scan errors and continue scanning
          }
        };

        const loop = () => {
          scannerTickRef.current = window.requestAnimationFrame(() => {
            void scanTick();
            if (!cancelled && scannerOpen) {
              loop();
            }
          });
        };
        loop();
      } catch (error) {
        const message = getCameraAccessErrorMessage(error);
        toast.error(message);
        if (!cancelled) {
          setScannerOpen(false);
        }
      } finally {
        if (!cancelled) {
          setScannerStarting(false);
        }
      }
    };

    void startScanner();

    return () => {
      cancelled = true;
      stopScannerCamera();
    };
  }, [scannerOpen]);

  function addCustomPart() {
    const customId = `custom-part-${customPartCounter}`;
    const suffix = generatePartSuffix();
    const customPartId = createCustomPartId("", suffix);
    setCustomPartCounter((current) => current + 1);
    setAddedParts((current) => [
      ...current,
      syncPartRow({
        id: customId,
        partId: customPartId,
        name: "",
        qty: 1,
        unitPrice: 0,
        discount: 0,
        taxRate: TAX_RATE * 100,
        tax: 0,
        totalWithTax: 0,
        stock: null,
        isCustom: true,
      }),
    ]);
  }

  function updatePartRow(
    index: number,
    field:
      | "name"
      | "qty"
      | "unitPrice"
      | "discount"
      | "taxRate"
      | "tax"
      | "totalWithTax",
    value: string,
  ) {
    setAddedParts((current) =>
      current.map((row, rowIndex) => {
        if (rowIndex !== index) return row;

        if (field === "name") {
          if (!row.isCustom) {
            return { ...row, name: value };
          }
          const suffix = resolvePartIdSuffix(row.partId, generatePartSuffix());
          return {
            ...row,
            name: value,
            partId: createCustomPartId(value, suffix),
          };
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
        taxRate: String(TAX_RATE * 100),
        tax: "0",
        totalWithTax: "0",
      }),
    ]);
    setLabourIdCounter((current) => current + 1);
  }

  function updateLabour(
    index: number,
    field: "desc" | "amount" | "discount" | "taxRate" | "tax" | "totalWithTax",
    value: string,
  ) {
    setLabourRows((current) =>
      current.map((row, rowIndex) => {
        if (rowIndex !== index) return row;

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
      const next = current.filter((_, rowIndex) => rowIndex !== index);
      return next.length
        ? next
        : [
            syncLabourRow({
              id: 0,
              desc: "",
              amount: "",
              discount: "0",
              taxRate: String(TAX_RATE * 100),
              tax: "0",
              totalWithTax: "0",
            }),
          ];
    });
  }



  function buildQuotationData(): SavedQuotationData | null {
    if (!selectedVehicle) return null;

    const items = addedParts
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

    const labour = labourRows
      .filter((row) => row.desc.trim() && Number(row.amount) > 0)
      .map((row) => ({
        description: row.desc.trim(),
        amount: Number(row.amount),
        discount: Math.min(Number(row.discount) || 0, Number(row.amount) || 0),
        tax: Number(row.tax) || 0,
        total_with_tax: Number(row.totalWithTax) || 0,
      }));

    return {
      quotation_number: quotationNumber,
      start_date: quotationDate,
      end_date: quotationDate,
      vehicle: selectedVehicle,
      items,
      labour,
      discount: discountValue,
      total_spare: rawPartsSubtotal,
      total_labour: rawLabourSubtotal,
      subtotal_before_tax: subtotalBeforeTax,
      total_tax: totalTax,
      grand_total: grandTotal,
      odometer_km: odometerReading.trim() || null,
      note: stripOdometerFromNote(note),
    };
  }

  const handleVehicleKeyDown = (e: React.KeyboardEvent) => {
    if (!vehicleOpen || vehicleResults.length === 0) {
      if (e.key === "ArrowDown" || (e.key === "Enter" && !vehicleOpen)) {
        e.preventDefault();
        (document.querySelector('input[data-field="odo-input"]') as HTMLInputElement)?.focus();
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        (document.querySelector('input[data-field="date-input"]') as HTMLInputElement)?.focus();
        return;
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
        (document.querySelector('input[data-field="odo-input"]') as HTMLInputElement)?.focus();
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
        const firstLabourRow = document.querySelector('input[data-row="0"][data-field="desc"][data-type="labour"]') as HTMLInputElement;
        if (firstLabourRow) {
          firstLabourRow.focus();
          firstLabourRow.select();
        } else {
          (document.querySelector('input[data-field="note-input"]') as HTMLInputElement)?.focus();
        }
      }
      return;
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      (document.querySelector('input[data-field="vehicle-search"]') as HTMLInputElement)?.focus();
      return;
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


  async function handleSave(opts: { showPreview?: boolean; silent?: boolean } = {}) {
    setSaveError("");

    if (!selectedVehicle) {
      toast.error("Please select a vehicle first.");
      return;
    }

    setSaving(true);
    try {
      const quotation = buildQuotationData();
      if (!quotation) throw new Error("Vehicle selection is required.");

      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;

      const saveData = {
        quotation_number: quotation.quotation_number,
        vehicle_id: quotation.vehicle.id,
        items: quotation.items,
        labour: quotation.labour,
        start_date: quotation.start_date,
        end_date: quotation.end_date,
        discount: quotation.discount,
        total_spare: quotation.total_spare,
        total_labour: quotation.total_labour,
        subtotal_before_tax: quotation.subtotal_before_tax,
        total_tax: quotation.total_tax,
        grand_total: quotation.grand_total,
        odometer_km: quotation.odometer_km || null,
        note: quotation.note,
        created_by: authData.user?.id,
      };

      let finalId = "";
      if (quotationId) {
        const { error: updateError } = await supabase
          .from("quotations")
          .update(saveData)
          .eq("id", quotationId);
        if (updateError) throw updateError;
        finalId = quotationId;
      } else {
        const { data: inserted, error: insertError } = await supabase
          .from("quotations")
          .insert([saveData])
          .select("id")
          .single();
        if (insertError) throw insertError;
        finalId = inserted?.id || "";
      }

      await logActivity({
        action: quotationId ? "edit" : "create",
        entityType: "quotation",
        entityId: finalId,
        entityLabel: quotation.quotation_number,
        description: quotationId 
          ? `Updated quotation for ${quotation.vehicle.owner_name}` 
          : `Created quotation for ${quotation.vehicle.owner_name}`,
        metadata: {
          vehicle_id: quotation.vehicle.id,
          grand_total: quotation.grand_total,
          quotation_date: quotation.start_date,
        },
      });

      const updatedQuote = { ...quotation, id: finalId };
      setLastSavedQuotation(updatedQuote);
      setPreviewQuotation(updatedQuote);
      
      if (opts.showPreview) {
        setPreviewOpen(true);
        setSuccessOpen(false);
      } else if (!opts.silent) {
        setPreviewOpen(false);
        setSuccessOpen(true);
      } else {
        setPreviewOpen(false);
      }
      
      toast.success(quotationId ? "Quotation saved successfully" : "Quotation created successfully");
      return updatedQuote;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to save";
      setSaveError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }

  async function openPreview() {
    const saved = await handleSave({ silent: true });
    if (saved?.id) {
      router.push(`/quotations/view/${saved.id}`);
    }
  }



  useEffect(() => {
    if (quotationId) {
      const loadQuotation = async () => {
        const { data, error } = await supabase
          .from("quotations")
          .select("*, vehicles(*)")
          .eq("id", quotationId)
          .single();

        if (error) {
          toast.error("Failed to load quotation");
          return;
        }

        if (data) {
          setQuotationNumber(data.quotation_number);
          setQuotationDate(data.start_date || data.created_at.split("T")[0]);
          setSelectedVehicle(data.vehicles);
          setOdometerReading(data.odometer_km || extractOdometerFromNote(data.note || ""));
          setNote(stripOdometerFromNote(data.note || ""));
          setAddedParts(data.items.map((it: any, idx: number) => ({
            id: `part-${idx}-${Date.now()}`,
            partId: it.part_id,
            name: it.name,
            qty: it.quantity,
            unitPrice: it.unit_price,
            discount: it.discount || 0,
            taxRate: TAX_RATE * 100,
            tax: it.tax || 0,
            totalWithTax: it.total_with_tax || it.total,
            stock: null,
            isCustom: !it.part_id
          })));
          setLabourRows(data.labour.map((lb: any, idx: number) => ({
            id: idx + 1,
            desc: lb.description,
            amount: String(lb.amount),
            discount: String(lb.discount || 0),
            taxRate: String(TAX_RATE * 100),
            tax: String(lb.tax || 0),
            totalWithTax: String(lb.total_with_tax || lb.amount)
          })));
          setSpareDiscountMode("amount");
          setLabourDiscountMode("amount");
        }
      };
      void loadQuotation();
    }
  }, [quotationId]);

  const handleKeyDown = (e: React.KeyboardEvent, rowIndex: number, field: string, type: "part" | "labour") => {
    const target = e.target as HTMLInputElement;
    const isAtStart = target.selectionStart === 0 && target.selectionEnd === 0;
    const isAtEnd = target.selectionStart === target.value.length;

    if (e.key === "ArrowDown" || e.key === "ArrowUp" || (e.key === "Enter" && !e.shiftKey) || e.key === "ArrowLeft" || e.key === "ArrowRight") {
      const partFields = ["name", "qty", "unitPrice", "discount"];
      const labourFields = ["desc", "amount", "discount", "totalWithTax"];
      const fields = type === "part" ? partFields : labourFields;
      const currentIdx = fields.indexOf(field);

      // Horizontal navigation
      if ((e.key === "ArrowLeft" && isAtStart) || (e.key === "ArrowRight" && isAtEnd) || e.key === "Enter") {
        e.preventDefault();
        const horizontalDir = (e.key === "ArrowRight" || e.key === "Enter") ? 1 : -1;
        const nextIdx = currentIdx + horizontalDir;

        if (nextIdx >= 0 && nextIdx < fields.length) {
          const nextInput = document.querySelector(
            `input[data-row="${rowIndex}"][data-field="${fields[nextIdx]}"][data-type="${type}"]`
          ) as HTMLInputElement;
          if (nextInput) {
            nextInput.focus();
            nextInput.select();
            return;
          }
        } else if (e.key === "Enter" || e.key === "ArrowRight") {
          // Wrap to next row
          const nextRow = rowIndex + 1;
          const maxRows = type === "part" ? addedParts.length : labourRows.length;
          if (nextRow < maxRows) {
            const nextInput = document.querySelector(
              `input[data-row="${nextRow}"][data-field="${fields[0]}"][data-type="${type}"]`
            ) as HTMLInputElement;
            if (nextInput) {
              nextInput.focus();
              nextInput.select();
              return;
            }
          } else if (type === "part" && e.key === "Enter") {
            const searchInput = document.querySelector('input[data-field="part-search"]') as HTMLInputElement;
            if (searchInput) {
              searchInput.focus();
              searchInput.select();
            }
            return;
          }
        } else if (e.key === "ArrowLeft" && nextIdx < 0) {
           // Maybe wrap to previous row end?
           const prevRow = rowIndex - 1;
           if (prevRow >= 0) {
             const prevInput = document.querySelector(
               `input[data-row="${prevRow}"][data-field="${fields[fields.length - 1]}"][data-type="${type}"]`
             ) as HTMLInputElement;
             if (prevInput) {
               prevInput.focus();
               prevInput.select();
               return;
             }
           }
        }
      }

      // Vertical navigation
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const verticalDir = e.key === "ArrowDown" ? 1 : -1;
        const nextRow = rowIndex + verticalDir;
        const maxRows = type === "part" ? addedParts.length : labourRows.length;

        if (nextRow >= 0 && nextRow < maxRows) {
          const nextInput = document.querySelector(
            `input[data-row="${nextRow}"][data-field="${field}"][data-type="${type}"]`
          ) as HTMLInputElement;
          if (nextInput) {
            nextInput.focus();
            nextInput.select();
          }
        } else if (nextRow < 0) {
          if (type === "part") {
            (document.querySelector('input[data-field="part-search"]') as HTMLInputElement)?.focus();
          } else {
            const lastPartIdx = addedParts.length - 1;
            const lastPartInput = document.querySelector(`input[data-row="${lastPartIdx}"][data-field="${field}"][data-type="part"]`) as HTMLInputElement ||
                                  document.querySelector(`input[data-row="${lastPartIdx}"][data-field="name"][data-type="part"]`) as HTMLInputElement;
            lastPartInput?.focus();
            lastPartInput?.select();
          }
        } else if (nextRow >= maxRows) {
          if (type === "part") {
            const firstLabourInput = document.querySelector(`input[data-row="0"][data-field="${field}"][data-type="labour"]`) as HTMLInputElement ||
                                     document.querySelector('input[data-row="0"][data-field="desc"][data-type="labour"]') as HTMLInputElement;
            firstLabourInput?.focus();
            firstLabourInput?.select();
          } else {
            (document.querySelector('input[data-field="note-input"]') as HTMLInputElement)?.focus();
          }
        }
      }
    }
  };


  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        openPreview();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        if (previewOpen) {
          void handleSave();
        } else {
          openPreview();
        }
      }
    };
    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, [previewOpen, handleSave]);

  function downloadAgain() {
    if (lastSavedQuotation) generateQuotationPDF(lastSavedQuotation);
  }

  function viewSavedQuotation() {
    if (!lastSavedQuotation?.id) {
      router.push("/quotations");
      return;
    }

    router.push(`/quotations/view/${lastSavedQuotation.id}`);
  }

  async function resetForm() {
    try {
      const next = await fetchNextQuotationNumber();
      setQuotationNumber(next);
      setQuotationDate(todayValue());
      setOdometerReading("");
      setSelectedVehicle(null);
      setVehicleQuery("");
      setVehicleResults([]);
      setPartQuery("");
      setPartResults([]);
      setAddedParts([]);
      setCustomPartCounter(1);
      setLabourRows([
        syncLabourRow({
          id: 0,
          desc: "",
          amount: "",
          discount: "0",
          taxRate: String(TAX_RATE * 100),
          tax: "0",
          totalWithTax: "0",
        }),
      ]);
      setLabourIdCounter(1);
      setNote("");
      setSaveError("");
      setPreviewOpen(false);
      setPreviewQuotation(null);
      setSuccessOpen(false);
      setLastSavedQuotation(null);
      router.replace(`/quotations/${next}`);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to prepare quotation";
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
            <div>
              <button
                type="button"
                className={styles.backButton}
                onClick={() => router.push("/quotations")}
              >
                <ArrowLeft size={14} />
                Back
              </button>
              <div className={styles.pageTitle}>Create Quotation</div>
              <div className={styles.pageSub}>
                Prepare the quote with fixed 18% GST, row discounts, and preview before saving
              </div>
            </div>
            <div className={styles.invoiceMeta}>
              <div className={styles.invoiceBadge}>
                <span className={styles.invoiceBadgeDot} />
                NEW QUOTATION
              </div>
              <div className={styles.invoiceMetaNumber}>{quotationNumber}</div>
              <input
                className={styles.underDate}
                style={{ border: "none", padding: 0, background: "transparent", color: "inherit", fontSize: "inherit", cursor: "pointer" }}
                type="date"
                value={quotationDate}
                data-field="date-input"
                onChange={(e) => setQuotationDate(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown" || e.key === "Enter") {
                    e.preventDefault();
                    (document.querySelector('input[data-field="vehicle-search"]') as HTMLInputElement)?.focus();
                  }
                }}
              />
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
                <div className={styles.sectionSub}>Search by Car ID or owner name</div>
              </div>
              {!selectedVehicle ? (
                <button
                  type="button"
                  className={styles.changeBtn}
                  onClick={() => setQuickVehicleOpen(true)}
                >
                  New Vehicle
                </button>
              ) : null}
            </div>

            {selectedVehicle ? (
              <>
                <div className={styles.vehicleChip}>
                  <div className={styles.vehicleChipLeft}>
                    <div className={styles.vehicleChipIcon}>
                      <Search size={16} />
                    </div>
                    <div>
                      <div className={styles.chipId}>{selectedVehicle.car_id}</div>
                      <div className={styles.chipName}>{selectedVehicle.owner_name}</div>
                      <div className={styles.chipMeta}>
                        {selectedVehicle.phone_number} · {selectedVehicle.vehicle_reg}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    className={styles.changeBtn}
                    onClick={() => {
                      setSelectedVehicle(null);
                      setOdometerReading("");
                    }}
                  >
                    Change
                  </button>
                </div>
                {advanceLoading ? (
                  <div className={styles.advanceBanner}>Checking advance balance…</div>
                ) : advanceBalance > 0 ? (
                  <div className={styles.advanceBanner}>
                    <span>Advance balance:</span>
                    <span className={styles.advanceAmount}>{formatMoney(advanceBalance)} available</span>
                  </div>
                ) : null}
              </>
            ) : (
              <div className={styles.searchWrap}>
                <div className={`${styles.searchField} ${vehicleOpen ? styles.searchFocused : ""}`}>
                  <Search className={styles.searchIcon} size={15} />
                  <input
                    type="text"
                    value={vehicleQuery}
                    placeholder="Search Car ID or owner…"
                    data-field="vehicle-search"
                    onChange={(event) => {
                      setVehicleQuery(event.target.value);
                      setVehicleOpen(true);
                    }}
                    onFocus={() => {
                      setVehicleOpen(true);
                      setActiveVehicleIndex(0);
                    }}
                    onBlur={() => window.setTimeout(() => setVehicleOpen(false), 150)}
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
                              <div className={styles.dropName}>{vehicle.owner_name}</div>
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
              <label className={styles.label}>ODO reading (km)</label>
              <input
                className={styles.underDate}
                type="text"
                inputMode="numeric"
                value={odometerReading}
                data-field="odo-input"
                placeholder="Enter odometer reading"
                onChange={(event) => setOdometerReading(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "ArrowDown" || event.key === "Enter") {
                    event.preventDefault();
                    (document.querySelector('input[data-field="date-input"]') as HTMLInputElement)?.focus();
                  } else if (event.key === "ArrowUp") {
                    event.preventDefault();
                    (document.querySelector('input[data-field="vehicle-search"]') as HTMLInputElement)?.focus();
                  }
                }}
              />
            </div>
          </div>

          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <div className={styles.sectionNum}>2</div>
              <div>
                <div className={styles.sectionTitle}>Quotation date</div>
                <div className={styles.sectionSub}>Today&apos;s date by default, but still editable</div>
              </div>
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Date</label>
              <input
                className={styles.underDate}
                type="date"
                value={quotationDate}
                onChange={(event) => setQuotationDate(event.target.value)}
              />
            </div>
          </div>

          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <div className={styles.sectionNum}>3</div>
              <div>
                <div className={styles.sectionTitle}>Spare parts</div>
                <div className={styles.sectionSub}>Add stock items or custom quoted parts</div>
              </div>
              <button
                type="button"
                className={styles.sectionActionBtn}
                disabled={partLoading || scannerStarting}
                onClick={() => void openBarcodeScanner()}
              >
                <ScanLine size={13} />
                Scan Barcode
              </button>
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
                      <th style={{ textAlign: "right", color: "var(--tax)" }}>Incl Tax (%)</th>
                      <th style={{ textAlign: "right", color: "#4ade80" }}>After Tax</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {addedParts.map((row, index) => (
                      <tr key={row.id}>
                        <td className={styles.partNameCell}>
                          {row.isCustom ? (
                            <input
                              className={styles.inlineInput}
                              type="text"
                              value={row.name}
                              placeholder="Custom spare name"
                              onChange={(event) => updatePartRow(index, "name", event.target.value)}
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
                            onChange={(event) => updatePartRow(index, "qty", event.target.value)}
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
                            readOnly={!row.isCustom}
                            onChange={(event) =>
                              row.isCustom
                                ? updatePartRow(index, "unitPrice", event.target.value)
                                : undefined
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
                            onChange={(event) =>
                              updatePartRow(index, "discount", event.target.value)
                            }
                            onKeyDown={(e) => handleKeyDown(e, index, "discount", "part")}
                            data-row={index}
                            data-field="discount"
                            data-type="part"
                          />
                        </td>
                        <td style={{ textAlign: "right" }}>
                          <input
                            className={styles.priceInput}
                            type="number"
                            min={0}
                            step="0.01"
                            value={row.taxRate}
                            onChange={(event) =>
                              updatePartRow(index, "taxRate", event.target.value)
                            }
                            onKeyDown={(e) => handleKeyDown(e, index, "taxRate", "part")}
                            data-row={index}
                            data-field="taxRate"
                            data-type="part"
                          />
                        </td>
                        <td style={{ textAlign: "right" }}>
                          <input
                            className={styles.priceInput}
                            type="number"
                            min={0}
                            value={row.totalWithTax}
                            readOnly
                            disabled
                            title="Auto-calculated after tax"
                          />
                        </td>
                        <td>
                          <button
                            type="button"
                            className={styles.deleteBtn}
                            onClick={() => removePart(index)}
                          >
                            <Trash2 size={12} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}

            <div className={styles.searchWrap}>
              <div className={`${styles.searchField} ${partOpen ? styles.searchFocused : ""}`}>
                <Plus className={styles.searchIcon} size={14} />
                <input
                  type="text"
                  value={partQuery}
                  placeholder="Search by name, ID or barcode…"
                  data-field="part-search"
                  onChange={(event) => {
                    setPartQuery(event.target.value);
                    setPartOpen(true);
                  }}
                  onFocus={() => {
                    setPartOpen(true);
                    setActivePartIndex(0);
                  }}
                  onBlur={() => window.setTimeout(() => setPartOpen(false), 150)}
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
                            <span className={styles.dropName} style={{ marginLeft: 8 }}>
                              {part.name}
                            </span>
                          </div>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <div className={styles.dropPrice}>{formatMoney(part.sell)}</div>
                          <div className={styles.dropCost}>cost {formatMoney(part.cost)}</div>
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
              <button type="button" className={styles.changeBtn} onClick={addCustomPart}>
                <Plus size={13} />
                Add custom spare
              </button>
            </div>
          </div>

          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <div className={styles.sectionNum}>4</div>
              <div>
                <div className={styles.sectionTitle}>Labour charges</div>
                <div className={styles.sectionSub}>Manual quoted labour with editable discount and fixed 18% GST</div>
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
                    <th style={{ textAlign: "right", color: "var(--tax)" }}>Incl Tax (%)</th>
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
                          placeholder="e.g. Brake service labour"
                          onChange={(event) => updateLabour(index, "desc", event.target.value)}
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
                          onChange={(event) => updateLabour(index, "amount", event.target.value)}
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
                          onChange={(event) =>
                            updateLabour(index, "discount", event.target.value)
                          }
                          onKeyDown={(e) => handleKeyDown(e, index, "discount", "labour")}
                          data-row={index}
                          data-field="discount"
                          data-type="labour"
                        />
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <input
                          className={styles.priceInput}
                          type="number"
                          min={0}
                          step="0.01"
                          value={row.taxRate}
                          onChange={(event) =>
                            updateLabour(index, "taxRate", event.target.value)
                          }
                          onKeyDown={(e) => handleKeyDown(e, index, "taxRate", "labour")}
                          data-row={index}
                          data-field="taxRate"
                          data-type="labour"
                        />
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <input
                          className={styles.priceInput}
                          type="number"
                          min={0}
                          value={row.totalWithTax}
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
                        >
                          <Trash2 size={12} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <button type="button" className={styles.changeBtn} onClick={addLabour}>
              <Plus size={13} />
              Add labour
            </button>
          </div>

          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <div className={styles.sectionNum}>5</div>
              <div>
                <div className={styles.sectionTitle}>Note</div>
                <div className={styles.sectionSub}>Optional quote note</div>
              </div>
            </div>
            <input
              className={styles.noteInput}
              type="text"
              value={note}
              placeholder="Any notes about this quotation…"
              data-field="note-input"
              onChange={(event) => setNote(event.target.value)}
              onKeyDown={(e) => {
                if (e.key === "ArrowUp") {
                  e.preventDefault();
                  // Go back to last section (Labour or Part)
                  const lastLabourIdx = labourRows.length - 1;
                  const lastInput = document.querySelector(`input[data-row="${lastLabourIdx}"][data-field="desc"][data-type="labour"]`) as HTMLInputElement;
                  if (lastInput) {
                    lastInput.focus();
                    lastInput.select();
                  } else {
                    const lastPartIdx = addedParts.length - 1;
                    const lastPartInput = document.querySelector(`input[data-row="${lastPartIdx}"][data-field="name"][data-type="part"]`) as HTMLInputElement;
                    if (lastPartInput) {
                      lastPartInput.focus();
                      lastPartInput.select();
                    }
                  }
                } else if (e.key === "Enter") {
                  e.preventDefault();
                  openPreview();
                }
              }}
            />
          </div>

          <button type="button" className={styles.saveBtn} onClick={openPreview}>
            <FileText size={16} />
            <span>Preview</span>
          </button>

          <div className={styles.cancelLink} onClick={() => router.push("/quotations")}>
            Cancel
          </div>
          <div className={styles.saveNote}>
            <CheckCircle2 size={11} />
            Quotation date, row discounts, and tax values will be saved with the record
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
              <span className={styles.totalValue}>- {formatMoney(discountValue)}</span>
            </div>
            <div className={styles.totalRow}>
              <span className={styles.totalLabel}>Taxable subtotal</span>
              <span className={styles.totalValue}>{formatMoney(taxableSubtotal)}</span>
            </div>
            <div className={styles.totalRow}>
              <span className={styles.totalLabel} style={{ color: "var(--tax)" }}>
                GST
              </span>
              <span className={styles.totalValue} style={{ color: "var(--tax)" }}>
                {formatMoney(totalTax)}
              </span>
            </div>
            <div className={`${styles.totalRow} ${styles.totalGrand}`}>
              <span className={styles.grandLabel}>Grand Total</span>
              <span className={`${styles.totalValue} ${styles.grandValue}`}>
                {formatMoney(grandTotal)}
              </span>
            </div>
          </div>

          <div className={styles.invoicePreviewCard}>
            <div className={styles.previewHead}>
              <div>
                <div className={styles.previewTitle}>SIRIGIRVEL WORKSHOP</div>
                <div className={styles.inlineInfo}>Quotation</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div className={styles.previewNumber}>{quotationNumber}</div>
                <div className={styles.inlineInfo}>{formatDate(quotationDate)}</div>
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
                    <span className={styles.previewRowValue}>{formatMoney(item.total)}</span>
                  </div>
                ))
              ) : (
                <div className={styles.previewEmpty}>No parts or charges added yet</div>
              )}
            </div>

            <div className={styles.previewTotal}>
              <span className={styles.previewTotalLabel}>Discount</span>
              <span className={styles.previewTotalValue}>- {formatMoney(discountValue)}</span>
            </div>
            <div className={styles.previewMode}>Date: {formatDate(quotationDate)}</div>
          </div>
        </div>
      </div>

      {scannerOpen ? (
        <div className={styles.overlay}>
          <div className={`${styles.overlayCard} ${styles.scannerCard}`}>
            <button
              type="button"
              className={styles.overlayClose}
              onClick={() => setScannerOpen(false)}
              aria-label="Close scanner"
            >
              <X size={16} />
            </button>
            <div className={styles.overlayTitle}>Scan Spare Barcode</div>
            <div className={styles.overlaySub}>
              Point the camera at the spare barcode. It will auto-add once detected.
            </div>
            <div className={styles.scannerViewport}>
              <video ref={scannerVideoRef} className={styles.scannerVideo} playsInline muted autoPlay />
            </div>
            <div className={styles.scannerHint}>
              {scannerStarting ? "Starting camera..." : "Scanning for barcode..."}
            </div>
            <div className={styles.overlayActions} style={{ marginTop: 14 }}>
              <button
                type="button"
                className={styles.overlaySecondary}
                onClick={() => setScannerOpen(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {quickVehicleOpen ? (
        <div className={styles.overlay}>
          <div className={styles.overlayCard}>
            <button
              type="button"
              className={styles.overlayClose}
              onClick={() => setQuickVehicleOpen(false)}
              aria-label="Close new vehicle dialog"
            >
              <X size={16} />
            </button>
            <div className={styles.overlayTitle}>Quick Add Vehicle</div>
            <div className={styles.overlaySub}>
              Add vehicle with odometer and continue quotation instantly.
            </div>
            <div className="mt-4 grid gap-3 text-left">
              <input
                className={styles.underDate}
                placeholder="Owner name *"
                value={quickVehicleForm.owner_name}
                onChange={(e) =>
                  setQuickVehicleForm((current) => ({ ...current, owner_name: e.target.value }))
                }
              />
              <div className={styles.phoneField}>
                <span className={styles.phonePrefix}>+91</span>
                <input
                  className={`${styles.underDate} ${styles.phoneInput}`}
                  placeholder="Phone number *"
                  value={quickVehicleForm.phone_number}
                  onChange={(e) =>
                    setQuickVehicleForm((current) => ({
                      ...current,
                      phone_number: e.target.value.replace(/\D/g, "").slice(0, 10),
                    }))
                  }
                />
              </div>
              <input
                className={styles.underDate}
                placeholder="Vehicle number *"
                value={quickVehicleForm.vehicle_reg}
                onChange={(e) =>
                  setQuickVehicleForm((current) => ({
                    ...current,
                    vehicle_reg: e.target.value.toUpperCase(),
                  }))
                }
              />
              <input
                className={styles.underDate}
                placeholder="Make / Model"
                value={quickVehicleForm.make_model}
                onChange={(e) =>
                  setQuickVehicleForm((current) => ({ ...current, make_model: e.target.value }))
                }
              />
              <input
                className={styles.underDate}
                placeholder="Odometer reading (km)"
                value={quickVehicleForm.odometer_km}
                onChange={(e) =>
                  setQuickVehicleForm((current) => ({ ...current, odometer_km: e.target.value }))
                }
              />
            </div>
            <div className={styles.overlayActions}>
              <button
                type="button"
                className={styles.overlayPrimary}
                onClick={() => void handleQuickVehicleCreate()}
                disabled={quickVehicleSaving}
              >
                {quickVehicleSaving ? "Creating..." : "Create & Use Vehicle"}
              </button>
              <button
                type="button"
                className={styles.overlaySecondary}
                onClick={() => setQuickVehicleOpen(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {previewOpen && previewQuotation ? (
        <div className={styles.overlay}>
          <div className={styles.overlayCard}>
            <button
              type="button"
              className={styles.overlayClose}
              onClick={() => setPreviewOpen(false)}
              aria-label="Close preview dialog"
            >
              <X size={16} />
            </button>
            <div className={styles.overlayIcon}>
              <FileText size={30} />
            </div>
            <div className={styles.overlayTitle}>Quotation Preview</div>
            <div className={styles.overlaySub}>
              Review the quotation for {previewQuotation.vehicle.owner_name} before saving or downloading the PDF.
            </div>
            <div className={styles.chipRow}>
              <span className={`${styles.chip} ${styles.chipGreen}`}>
                <Check size={11} />
                Date ready
              </span>
              <span className={`${styles.chip} ${styles.chipPurple}`}>
                <Check size={11} />
                GST 18%
              </span>
              <span className={`${styles.chip} ${styles.chipAmber}`}>
                <Check size={11} />
                Discounts applied
              </span>
            </div>
            <div className={styles.overlayActions}>
              <button
                type="button"
                className={styles.overlayPrimary}
                onClick={() => generateQuotationPDF(previewQuotation)}
              >
                <Download size={15} />
                Download PDF
              </button>
              <button
                type="button"
                className={styles.overlaySecondary}
                onClick={() => handleSave()}
                disabled={saving}
              >
                {saving ? "Saving…" : "Save quotation"}
              </button>
              <button
                type="button"
                className={styles.overlaySecondary}
                onClick={() => setPreviewOpen(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {successOpen && lastSavedQuotation ? (
        <div className={styles.overlay}>
          <div className={styles.overlayCard}>
            <button
              type="button"
              className={styles.overlayClose}
              onClick={() => router.push("/quotations")}
              aria-label="Close success dialog"
            >
              <X size={16} />
            </button>
            <div className={styles.overlayIcon}>
              <Check size={30} />
            </div>
            <div className={styles.overlayTitle}>Quotation Saved!</div>
            <div className={styles.overlaySub}>
              {lastSavedQuotation.quotation_number} created for {lastSavedQuotation.vehicle.owner_name}.
            </div>
            <div className={styles.chipRow}>
              <span className={`${styles.chip} ${styles.chipGreen}`}>
                <Check size={11} />
                Quotation saved
              </span>
              <span className={`${styles.chip} ${styles.chipPurple}`}>
                <Check size={11} />
                Date locked
              </span>
              <span className={`${styles.chip} ${styles.chipAmber}`}>
                <Check size={11} />
                Row discounts saved
              </span>
            </div>
            <div className={styles.overlayActions}>
              <button type="button" className={styles.overlayPrimary} onClick={downloadAgain}>
                <Download size={15} />
                Download PDF
              </button>
              <button type="button" className={styles.overlaySecondary} onClick={resetForm}>
                Create new quotation
              </button>
              <button type="button" className={styles.overlaySecondary} onClick={viewSavedQuotation}>
                View quotation
              </button>
              <button
                type="button"
                className={styles.overlaySecondary}
                onClick={() => router.push("/quotations")}
              >
                View quotations
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
