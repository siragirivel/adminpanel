"use client";

import React, { useState, useEffect, useMemo, useRef, useCallback, Suspense } from "react";
import { createPortal } from "react-dom";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Edit2, Eye, Package, Plus, Search, Trash2 } from "lucide-react";
import Barcode from "react-barcode";
import JsBarcode from "jsbarcode";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { ConfirmDeleteModal } from "@/components/ConfirmDeleteModal";
import { logActivity } from "@/lib/activity-log";
import { createInvoiceNumber, createInvoicePrefix, createVehicleId } from "@/lib/utils";
import { uploadToCloudinary } from "@/lib/cloudinary";
import { computeCreditPendingRows, normalizeVendorKey } from "@/lib/vendor-credit";
import { loadVendorRegistry, syncVendorRecord, type VendorRecord } from "@/lib/vendor-registry";
import "../../spare-styles.css";

function InventoryContent() {
  const OLD_STOCK_SELLER = "Old Stock";
  const PARTS_CATEGORY_OPTIONS = ["OEM", "OES", "others"] as const;
  const BARCODE_RENDER_OPTIONS = {
    format: "CODE128" as const,
    width: 1.7,
    height: 54,
    displayValue: true,
    fontSize: 12,
    margin: 0,
    background: "#ffffff",
    lineColor: "#0f172a",
  };
  const PRINT_BARCODE_RENDER_OPTIONS = {
    ...BARCODE_RENDER_OPTIONS,
    width: 2,
    height: 46,
    fontSize: 13,
    fontOptions: "bold",
    lineColor: "#000000",
  };

  type PartDraft = {
    localId: number;
    suffix: number;
    partId: string;
    barcode: string;
    name: string;
    seller: string;
    cat: string;
    partsCategory: string;
    modelName: string;
    carName: string;
    cost: number;
    taxRate: number;
    sell: number;
    stock: number;
    threshold: number;
  };

  type PurchaseTransactionRow = {
    id: string;
    description: string;
    amount: number;
    type: "credit" | "debit";
    payment_mode: "cash" | "upi" | "card" | "cheque";
    date: string;
    created_at: string;
    note?: string | null;
  };

  type VehicleRecord = {
    id: string;
    car_id: string;
    owner_name: string;
    phone_number: string;
    vehicle_reg: string;
    make_model?: string | null;
  };

  type PurchaseDueRow = {
    id: string;
    description: string;
    seller: string;
    date: string;
    mode: "cash_carry" | "credit";
    partNames: string[];
    originalAmount: number;
    paidAmount: number;
    pendingAmount: number;
    status: "Paid" | "Pending";
    billUrls: string[];
    invoiceNo: string;
    receivedDate: string;
  };

  type PartPurchaseSummary = {
    purchaseId: string;
    status: "Paid" | "Pending";
    billCount: number;
    dueAmount: number;
    billUrls: string[];
    invoiceNo: string;
    receivedDate: string;
  };

  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const prefillQuery = searchParams?.toString();
  const slug = params?.slug as string[]; // catch-all slug

  const [activeTab, setActiveTab] = useState<"parts" | "add">("parts");
  const [parts, setParts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [partToDelete, setPartToDelete] = useState<any | null>(null);
  const [selectedInventoryPartIds, setSelectedInventoryPartIds] = useState<string[]>([]);

  // Search and Filter states
  const [searchQuery, setSearchQuery] = useState("");
  const [catFilter, setCatFilter] = useState("");
  const [brandFilter, setBrandFilter] = useState("");
  const [stockFilter, setStockFilter] = useState("");
  const [purchasePopupOpen, setPurchasePopupOpen] = useState(false);
  const [purchaseRows, setPurchaseRows] = useState<PurchaseDueRow[]>([]);
  const [purchaseLoading, setPurchaseLoading] = useState(false);
  const [purchaseActionId, setPurchaseActionId] = useState<string | null>(null);
  const [billUploadTargetId, setBillUploadTargetId] = useState<string | null>(null);
  const [partPurchaseSummary, setPartPurchaseSummary] = useState<Record<string, PartPurchaseSummary>>({});
  const [selectedPurchaseSeller, setSelectedPurchaseSeller] = useState<string>("");
  const [purchaseSellerQuery, setPurchaseSellerQuery] = useState("");
  const [purchaseSellerSort, setPurchaseSellerSort] = useState<"due_desc" | "name_asc">("due_desc");
  const [purchaseDetailPage, setPurchaseDetailPage] = useState(1);
  const [vendorOptions, setVendorOptions] = useState<string[]>([]);
  const [vendorDirectory, setVendorDirectory] = useState<Record<string, VendorRecord>>({});
  const [stockEntryMode, setStockEntryMode] = useState<"purchase" | "old_stock" | "add_bill">("purchase");
  const [savedSellerBeforeOldStock, setSavedSellerBeforeOldStock] = useState("");
  const [vehicles, setVehicles] = useState<VehicleRecord[]>([]);
  const [activeVehicleRow, setActiveVehicleRow] = useState<number | null>(null);
  const [activeVehicleIndex, setActiveVehicleIndex] = useState(0);
  const [formVehicle, setFormVehicle] = useState<VehicleRecord | null>(null);
  const [draftVehicleMap, setDraftVehicleMap] = useState<Record<number, VehicleRecord | null>>({});
  const [vehicleFormOpen, setVehicleFormOpen] = useState(false);
  const [vehicleFormPopup, setVehicleFormPopup] = useState<{ top: number; left: number; width: number } | null>(null);
  const [formVehicleIndex, setFormVehicleIndex] = useState(0);
  const [vehicleDraftPopup, setVehicleDraftPopup] = useState<{ rowId: number; top: number; left: number; width: number } | null>(null);
  const vehicleFormInputRef = useRef<HTMLInputElement | null>(null);
  const vehicleDraftInputRefs = useRef(new Map<number, HTMLInputElement | null>());

  // Form states
  const [editId, setEditId] = useState<string | null>(null);
  const [isHardEditing, setIsHardEditing] = useState(false);
  const [draftSuffix, setDraftSuffix] = useState<number>(0);
  const [draftCounter, setDraftCounter] = useState(1);
  const [form, setForm] = useState({
    partId: "", barcode: "", name: "", seller: "", cat: "", partsCategory: "", modelName: "", carName: "", cost: 0, taxRate: 18, sell: 0, stock: 1, threshold: 1
  });
  const [batchSeller, setBatchSeller] = useState("");
  const [purchaseMode, setPurchaseMode] = useState<"cash_carry" | "credit">("cash_carry");
  const [cashCarryPaymentMode, setCashCarryPaymentMode] = useState<"cash" | "upi">("cash");
  const [showCashCarryModePicker, setShowCashCarryModePicker] = useState(false);
  const [billImages, setBillImages] = useState<File[]>([]);
  const [uploadingBills, setUploadingBills] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const savingRef = useRef(false);
  const [purchaseInvoiceNo, setPurchaseInvoiceNo] = useState("");
  const [purchaseReceivedDate, setPurchaseReceivedDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [purchaseTotalValue, setPurchaseTotalValue] = useState<number>(0);
  const [oldStockInvoiceNo, setOldStockInvoiceNo] = useState("");
  const [oldStockReceivedDate, setOldStockReceivedDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [oldStockTotalValue, setOldStockTotalValue] = useState<number>(0);
  const [drafts, setDrafts] = useState<PartDraft[]>([]);

  const createDraft = (localId: number, carName = ""): PartDraft => ({
    localId,
    suffix: Math.floor(1000 + Math.random() * 9000),
    partId: "",
    barcode: "",
    name: "",
    seller: "",
    cat: "",
    partsCategory: "",
    modelName: "",
    carName,
    cost: 0,
    taxRate: 18,
    sell: 0,
    stock: 1,
    threshold: 1,
  });

  useEffect(() => {
    setDraftSuffix(Math.floor(1000 + Math.random() * 9000));
  }, []);

  useEffect(() => {
    if (drafts.length === 0) return;
    const usedBarcodes = new Set(
      parts
        .map((part) => normalizeBarcode(part.barcode))
        .filter((value) => isValidBarcode(value)),
    );
    let changed = false;
    const nextDrafts = drafts.map((draft) => {
      const current = normalizeBarcode(draft.barcode);
      if (isValidBarcode(current) && !usedBarcodes.has(current)) {
        usedBarcodes.add(current);
        return draft;
      }
      const nextBarcode = getNextAvailableBarcode(usedBarcodes);
      usedBarcodes.add(nextBarcode);
      changed = true;
      return { ...draft, barcode: nextBarcode };
    });
    if (changed) {
      setDrafts(nextDrafts);
    }
  }, [drafts, parts]);

  // Handle URL-based state
  useEffect(() => {
    const query = new URLSearchParams(prefillQuery || "");
    if (!slug || slug.length === 0) {
      setActiveTab("parts");
      setEditId(null);
    } else if (slug[0] === "new") {
      // Mode switch from within the form — don't reset, URL already reflects state
      if (modeSwitchRef.current) {
        modeSwitchRef.current = false;
        return;
      }
      // Redirect /inventory/new → /inventory/new/purchase
      if (!slug[1]) {
        router.replace("/inventory/new/purchase");
        return;
      }
      const modeMap: Record<string, "purchase" | "old_stock" | "add_bill"> = {
        "purchase": "purchase",
        "old-stock": "old_stock",
        "whole-bill": "add_bill",
      };
      const newMode = modeMap[slug[1]] ?? "purchase";
      const prefillFlag = query.get("prefill") === "1";
      const prefillPart = (query.get("part") || "").trim();
      const prefillSupplier = (query.get("supplier") || "").trim();
      const prefillVehicle = (query.get("vehicle") || "").trim();
      const prefillQty = Math.max(1, Number(query.get("qty") || 1) || 1);
      const prefillTotal = Math.max(0, Number(query.get("total") || 0) || 0);
      const prefillUnitCost = Number((prefillTotal / prefillQty).toFixed(2));

      setActiveTab("add");
      setEditId(null);
      setIsHardEditing(false);
      setForm({ partId: "", barcode: "", name: "", seller: "", cat: "", partsCategory: "", modelName: "", carName: "", cost: 0, taxRate: 18, sell: 0, stock: 1, threshold: 1 });
      setFormVehicle(null);

      // Restore auto-saved draft if no prefill
      if (!prefillFlag) {
        try {
          const saved = localStorage.getItem("sgv_inv_draft");
          if (saved) {
            const d = JSON.parse(saved) as Record<string, unknown>;
            setStockEntryMode((d.stockEntryMode as "purchase" | "old_stock" | "add_bill") || newMode);
            setBatchSeller((d.batchSeller as string) || "");
            setSavedSellerBeforeOldStock((d.savedSeller as string) || "");
            setPurchaseMode((d.purchaseMode as "cash_carry" | "credit") || "cash_carry");
            setCashCarryPaymentMode((d.cashCarryPaymentMode as "cash" | "upi") || "cash");
            setShowCashCarryModePicker(false);
            setBillImages([]);
            setPurchaseInvoiceNo((d.purchaseInvoiceNo as string) || "");
            setPurchaseReceivedDate((d.purchaseReceivedDate as string) || new Date().toISOString().split("T")[0]);
            setPurchaseTotalValue(Number(d.purchaseTotalValue) || 0);
            setOldStockInvoiceNo((d.oldStockInvoiceNo as string) || "");
            setOldStockReceivedDate((d.oldStockReceivedDate as string) || new Date().toISOString().split("T")[0]);
            setOldStockTotalValue(Number(d.oldStockTotalValue) || 0);
            if (Array.isArray(d.drafts) && d.drafts.length > 0) {
              setDrafts(d.drafts as PartDraft[]);
              setDraftCounter((d.drafts as PartDraft[]).length + 1);
            } else {
              setDrafts([createDraft(1)]);
              setDraftCounter(2);
            }
            setDraftVehicleMap({});
            return;
          }
        } catch {
          localStorage.removeItem("sgv_inv_draft");
        }
      }

      // Fresh start
      setBatchSeller(prefillFlag ? prefillSupplier : "");
      setStockEntryMode(newMode);
      setSavedSellerBeforeOldStock("");
      setPurchaseMode("cash_carry");
      setCashCarryPaymentMode("cash");
      setShowCashCarryModePicker(false);
      setBillImages([]);
      setPurchaseInvoiceNo("");
      setPurchaseReceivedDate(new Date().toISOString().split("T")[0]);
      setPurchaseTotalValue(0);
      setOldStockInvoiceNo("");
      setOldStockReceivedDate(new Date().toISOString().split("T")[0]);
      setOldStockTotalValue(0);
      setDrafts(
        prefillFlag && prefillPart
          ? [{
              ...createDraft(1, prefillVehicle),
              partId: "",
              name: prefillPart,
              cat: "",
              partsCategory: "",
              carName: prefillVehicle || "",
              cost: prefillUnitCost > 0 ? prefillUnitCost : 0,
              sell: prefillUnitCost > 0 ? prefillUnitCost : 0,
              stock: prefillQty,
            }]
          : [createDraft(1)],
      );
      setDraftVehicleMap({});
      setDraftCounter(2);
    } else if (slug[0] === "add-new") {
      // Legacy redirect
      const qs = prefillQuery ? `?${prefillQuery}` : "";
      router.replace(`/inventory/new/purchase${qs}`);
    } else {
      // It's an ID (could be multiple segments due to slash)
      const id = slug.join("/");
      setEditId(id);
      setActiveTab("add");
      setIsHardEditing(true);
    }
  }, [prefillQuery, slug]);

  const handleStockEntryModeChange = (mode: "purchase" | "old_stock" | "add_bill") => {
    if (mode === stockEntryMode) return;
    if (mode === "old_stock") {
      setSavedSellerBeforeOldStock(batchSeller);
      setBatchSeller(OLD_STOCK_SELLER);
      setPurchaseMode("cash_carry");
      setCashCarryPaymentMode("cash");
      setShowCashCarryModePicker(false);
      setBillImages([]);
    } else if (mode === "add_bill") {
      setBatchSeller(savedSellerBeforeOldStock || "");
      setPurchaseMode("cash_carry");
      setCashCarryPaymentMode("cash");
      setShowCashCarryModePicker(false);
      setBillImages([]);
    } else {
      setBatchSeller(savedSellerBeforeOldStock);
    }
    modeSwitchRef.current = true;
    const modeSlug = mode === "purchase" ? "purchase" : mode === "old_stock" ? "old-stock" : "whole-bill";
    router.replace(`/inventory/new/${modeSlug}`);
    setStockEntryMode(mode);
  };

  // Auto-save draft to localStorage whenever form state changes (new entries only)
  useEffect(() => {
    if (activeTab !== "add" || editId) return;
    window.dispatchEvent(new CustomEvent("sgv:autosave", { detail: { status: "saving" } }));
    try {
      localStorage.setItem("sgv_inv_draft", JSON.stringify({
        stockEntryMode,
        batchSeller,
        savedSeller: savedSellerBeforeOldStock,
        purchaseMode,
        cashCarryPaymentMode,
        purchaseInvoiceNo,
        purchaseReceivedDate,
        purchaseTotalValue,
        oldStockInvoiceNo,
        oldStockReceivedDate,
        oldStockTotalValue,
        drafts,
      }));
      window.dispatchEvent(new CustomEvent("sgv:autosave", { detail: { status: "saved" } }));
    } catch {
      window.dispatchEvent(new CustomEvent("sgv:autosave", { detail: { status: "idle" } }));
    }
  }, [activeTab, editId, stockEntryMode, batchSeller, savedSellerBeforeOldStock, purchaseMode, cashCarryPaymentMode, purchaseInvoiceNo, purchaseReceivedDate, purchaseTotalValue, oldStockInvoiceNo, oldStockReceivedDate, oldStockTotalValue, drafts]);

  const getDynamicId = (name: string, suffix = draftSuffix) => {
    if (!name || !name.trim()) return "Auto-generated";
    const cleanName = name.replace(/[^a-zA-Z0-9]/g, "");
    const pre = (cleanName + "XXX").substring(0, 3).toUpperCase();
    return `Sgv${pre}/${suffix}`;
  };

  const normalizeBarcode = (value?: string | null) => String(value || "").trim();
  const isValidBarcode = (value: string) => /^[0-9]{12}$/.test(value);
  const getNextAvailableBarcode = (used: Set<string>) => {
    let candidate = "";
    for (let i = 0; i < 30; i += 1) {
      candidate = String(Math.floor(100000000000 + Math.random() * 900000000000));
      if (!used.has(candidate)) {
        return candidate;
      }
    }
    candidate = String(Date.now()).slice(-12).padStart(12, "0");
    while (used.has(candidate)) {
      candidate = String(Math.floor(100000000000 + Math.random() * 900000000000));
    }
    return candidate;
  };

  const modeSwitchRef = useRef(false);
  const barcodeSupportRef = useRef(true);
  const barcodeWarningRef = useRef(false);
  const modelSupportRef = useRef(true);
  const modelWarningRef = useRef(false);
  const partsCategorySupportRef = useRef(true);
  const partsCategoryWarningRef = useRef(false);

  const isBarcodeColumnMissing = (error?: { message?: string; details?: string; code?: string }) => {
    const code = String(error?.code || "");
    const message = String(error?.message || "");
    const details = String(error?.details || "");
    const text = `${message} ${details}`.toLowerCase();
    const mentions = text.includes("barcode");
    return (
      mentions &&
      (code === "PGRST204" ||
        code === "42703" ||
        text.includes("schema cache") ||
        text.includes("does not exist"))
    );
  };

  const isModelColumnMissing = (error?: { message?: string; details?: string; code?: string }) => {
    const code = String(error?.code || "");
    const message = String(error?.message || "");
    const details = String(error?.details || "");
    const text = `${message} ${details}`.toLowerCase();
    const mentions = text.includes("model_name");
    return (
      mentions &&
      (code === "PGRST204" ||
        code === "42703" ||
        text.includes("schema cache") ||
        text.includes("does not exist"))
    );
  };

  const isPartsCategoryColumnMissing = (error?: { message?: string; details?: string; code?: string }) => {
    const code = String(error?.code || "");
    const message = String(error?.message || "");
    const details = String(error?.details || "");
    const text = `${message} ${details}`.toLowerCase();
    const mentions = text.includes("parts_category");
    return (
      mentions &&
      (code === "PGRST204" ||
        code === "42703" ||
        text.includes("schema cache") ||
        text.includes("does not exist"))
    );
  };

  const disableBarcodeSupport = (error?: { message?: string; details?: string; code?: string }) => {
    if (!barcodeSupportRef.current) return;
    barcodeSupportRef.current = false;
    if (!barcodeWarningRef.current) {
      barcodeWarningRef.current = true;
      console.warn(
        "Barcode column missing in spare_parts. Barcode persistence disabled. Run: alter table public.spare_parts add column if not exists barcode text;",
        error?.message || error,
      );
    }
  };

  const disableModelSupport = (error?: { message?: string; details?: string; code?: string }) => {
    if (!modelSupportRef.current) return;
    modelSupportRef.current = false;
    if (!modelWarningRef.current) {
      modelWarningRef.current = true;
      console.warn(
        "Model column missing in spare_parts. Model persistence disabled. Run: alter table public.spare_parts add column if not exists model_name text;",
        error?.message || error,
      );
    }
  };

  const disablePartsCategorySupport = (error?: { message?: string; details?: string; code?: string }) => {
    if (!partsCategorySupportRef.current) return;
    partsCategorySupportRef.current = false;
    if (!partsCategoryWarningRef.current) {
      partsCategoryWarningRef.current = true;
      console.warn(
        "Parts category column missing in spare_parts. Parts category persistence disabled. Run: alter table public.spare_parts add column if not exists parts_category text;",
        error?.message || error,
      );
    }
  };

  function omitField<T extends Record<string, unknown>, K extends keyof T>(payload: T, key: K): Omit<T, K> {
    const next = { ...payload };
    delete next[key];
    return next;
  }

  function stripBarcodeField<T extends Record<string, unknown>>(payload: T) {
    return omitField(payload, "barcode");
  }

  function stripModelField<T extends Record<string, unknown>>(payload: T) {
    return omitField(payload, "model_name");
  }

  function stripPartsCategoryField<T extends Record<string, unknown>>(payload: T) {
    return omitField(payload, "parts_category");
  }

  const stripBarcodeFromRows = (rows: Array<Record<string, unknown>>) =>
    rows.map((row) => stripBarcodeField(row));

  const stripModelFromRows = (rows: Array<Record<string, unknown>>) =>
    rows.map((row) => stripModelField(row));

  const stripPartsCategoryFromRows = (rows: Array<Record<string, unknown>>) =>
    rows.map((row) => stripPartsCategoryField(row));

  const stripUnsupportedFields = (payload: Record<string, unknown>) => {
    let next = payload;
    if (!barcodeSupportRef.current) {
      next = stripBarcodeField(next);
    }
    if (!modelSupportRef.current) {
      next = stripModelField(next);
    }
    if (!partsCategorySupportRef.current) {
      next = stripPartsCategoryField(next);
    }
    return next;
  };

  const stripUnsupportedRows = (rows: Array<Record<string, unknown>>) => {
    let next = rows;
    if (!barcodeSupportRef.current) {
      next = stripBarcodeFromRows(next);
    }
    if (!modelSupportRef.current) {
      next = stripModelFromRows(next);
    }
    if (!partsCategorySupportRef.current) {
      next = stripPartsCategoryFromRows(next);
    }
    return next;
  };

  const ensureBarcodesForParts = async (rows: any[]) => {
    if (!barcodeSupportRef.current) return rows;
    const usedBarcodes = new Set<string>();
    rows.forEach((part) => {
      const current = normalizeBarcode(part.barcode);
      if (isValidBarcode(current)) usedBarcodes.add(current);
    });

    const updates: Array<{ id: string; barcode: string }> = [];
    const nextRows = rows.map((part) => {
      const current = normalizeBarcode(part.barcode);
      if (isValidBarcode(current)) {
        return part;
      }
      const nextBarcode = getNextAvailableBarcode(usedBarcodes);
      usedBarcodes.add(nextBarcode);
      updates.push({ id: part.id, barcode: nextBarcode });
      return { ...part, barcode: nextBarcode };
    });

    if (updates.length > 0) {
      const { error } = await supabase.from("spare_parts").upsert(updates, { onConflict: "id" });
      if (error) {
        if (isBarcodeColumnMissing(error)) {
          disableBarcodeSupport(error);
          return rows;
        }
        console.error("Failed to backfill spare part barcodes", error.message);
      }
    }

    return nextRows;
  };

  const resolvePartId = (partId: string, name: string, suffix = draftSuffix) => {
    const customId = String(partId || "").trim();
    return customId || getDynamicId(name, suffix);
  };

  const getNextAvailablePartId = (
    partId: string,
    name: string,
    suffix: number,
    usedIds: Set<string>,
  ) => {
    const customId = String(partId || "").trim();
    if (customId) {
      if (usedIds.has(customId)) {
        return { error: `Part ID "${customId}" already exists. Please enter a different ID.` };
      }
      return { id: customId, suffix };
    }

    let nextSuffix = suffix;
    let nextId = getDynamicId(name, nextSuffix);
    while (usedIds.has(nextId)) {
      nextSuffix += 1;
      nextId = getDynamicId(name, nextSuffix);
    }

    return { id: nextId, suffix: nextSuffix };
  };

  const getTaxBreakdown = (amount: number, taxRate = 18) => {
    const total = Number(amount || 0);
    if (total <= 0) {
      return { baseAmount: 0, taxAmount: 0 };
    }
    const multiplier = 1 + Number(taxRate || 0) / 100;
    const baseAmount = Number((total / multiplier).toFixed(2));
    const taxAmount = Number((total - baseAmount).toFixed(2));
    return { baseAmount, taxAmount };
  };

  const getTotalFromBaseAmount = (baseAmount: number, taxRate = 18) =>
    Number((Number(baseAmount || 0) * (1 + Number(taxRate || 0) / 100)).toFixed(2));

  const roundMoney = (value: number) => Number((Number(value) || 0).toFixed(2));
  const getPreTaxMargin = (cost: number, sell: number, taxRate = 18) => {
    const purchaseBase = getTaxBreakdown(cost, taxRate).baseAmount;
    const mrpBase = getTaxBreakdown(sell, taxRate).baseAmount;
    const marginAmount = roundMoney(mrpBase - purchaseBase);
    const marginPercent = purchaseBase > 0 ? roundMoney((marginAmount / purchaseBase) * 100) : 0;

    return { purchaseBase, mrpBase, marginAmount, marginPercent };
  };
  const getSellFromMarginPercent = (cost: number, marginPercent: number, taxRate = 18) => {
    const purchaseBase = getTaxBreakdown(cost, taxRate).baseAmount;
    const mrpBase = roundMoney(purchaseBase * (1 + Number(marginPercent || 0) / 100));
    return getTotalFromBaseAmount(mrpBase, taxRate);
  };
  const normalizeVehicleReg = (value: string) =>
    String(value || "").replace(/\s+/g, "").toUpperCase();
  const resolveCanonicalVehicleNumber = (value: string) => {
    const trimmed = String(value || "").trim();
    if (!trimmed) return "";
    const matchedVehicle = findVehicleByValue(trimmed);
    const matchedReg = String(matchedVehicle?.vehicle_reg || "").trim();
    if (matchedReg) {
      return matchedReg.toUpperCase();
    }
    return normalizeVehicleReg(trimmed);
  };

  type InvoiceItem = {
    name: string;
    quantity: number;
    unit_price: number;
    total: number;
    discount: number;
    tax: number;
    total_with_tax: number;
    part_id?: string;
  };

  type PrintableBarcodeRow = {
    id: string;
    barcode: string;
    name: string;
  };

  const normalizeInvoiceItem = (item: any): InvoiceItem => {
    const quantity = Math.max(1, Number(item.quantity ?? item.qty ?? 1));
    const unitPrice = Math.max(0, Number(item.unit_price ?? item.unitPrice ?? 0));
    const discount = Math.max(0, Number(item.discount ?? 0));
    const total = Math.max(0, Number(item.total ?? quantity * unitPrice));
    let tax = Number(item.tax ?? 0);
    let totalWithTax = Number(item.total_with_tax ?? item.totalWithTax ?? 0);
    if (!totalWithTax && total) {
      totalWithTax = roundMoney(Math.max(total - discount, 0) + tax);
    }
    if (!tax && totalWithTax) {
      tax = roundMoney(Math.max(totalWithTax - Math.max(total - discount, 0), 0));
    }
    const partId = String(item.part_id ?? item.partId ?? "").trim();

    return {
      name: String(item.name || "").trim(),
      quantity,
      unit_price: unitPrice,
      total,
      discount,
      tax,
      total_with_tax: totalWithTax,
      ...(partId ? { part_id: partId } : {}),
    };
  };

  const buildInvoiceItemFromDraft = (
    draft: PartDraft & { resolvedId: string },
  ): InvoiceItem | null => {
    if (!draft.name.trim()) return null;
    const quantity = Math.max(1, Number(draft.stock || 1));
    const unitPrice = Math.max(0, Number(draft.sell || 0));
    const discount = 0;
    const baseTotal = roundMoney(quantity * unitPrice);
    const taxRate = Math.max(0, Number(draft.taxRate || 0));
    const tax = roundMoney(Math.max(baseTotal - discount, 0) * (taxRate / 100));
    const totalWithTax = roundMoney(Math.max(baseTotal - discount, 0) + tax);
    const partId = String(draft.resolvedId || "").trim();

    return {
      name: draft.name.trim(),
      quantity,
      unit_price: unitPrice,
      total: baseTotal,
      discount,
      tax,
      total_with_tax: totalWithTax,
      ...(partId ? { part_id: partId } : {}),
    };
  };

  const mergeInvoiceItems = (existing: InvoiceItem[], incoming: InvoiceItem[]) => {
    const merged = [...existing];
    const normalizeItemName = (item: InvoiceItem) => String(item.name || "").trim().toLowerCase();

    const getTaxRate = (item: InvoiceItem, fallback = 0) => {
      const base = Math.max(Number(item.total || 0) - Number(item.discount || 0), 0);
      const tax = Number(item.tax || 0);
      if (base > 0 && tax > 0) {
        return (tax / base) * 100;
      }
      return fallback;
    };

    incoming.forEach((item) => {
      const partId = String(item.part_id || "").trim();
      const normalizedName = normalizeItemName(item);
      if (!partId && !normalizedName) {
        merged.push(item);
        return;
      }

      const idx = merged.findIndex(
        (current) => {
          const currentPartId = String(current.part_id || "").trim();
          if (partId && currentPartId && currentPartId === partId) {
            return true;
          }
          return normalizedName.length > 0 && normalizeItemName(current) === normalizedName;
        },
      );
      if (idx === -1) {
        merged.push(item);
        return;
      }

      const current = merged[idx];
      const currentQty = Math.max(1, Number(current.quantity || 1));
      const nextQty = currentQty + Math.max(1, Number(item.quantity || 1));
      const unitPrice = Math.max(0, Number(current.unit_price || item.unit_price || 0));
      const discount = Math.max(0, Number(current.discount || 0));
      const fallbackRate = getTaxRate(item, 0);
      const taxRate = getTaxRate(current, fallbackRate);
      const baseTotal = roundMoney(nextQty * unitPrice);
      const taxableBase = Math.max(baseTotal - discount, 0);
      const tax = roundMoney(taxableBase * (taxRate / 100));
      const totalWithTax = roundMoney(taxableBase + tax);

      merged[idx] = {
        ...current,
        name: current.name || item.name,
        quantity: nextQty,
        unit_price: unitPrice,
        total: baseTotal,
        discount,
        tax,
        total_with_tax: totalWithTax,
        ...(current.part_id || partId ? { part_id: current.part_id || partId } : {}),
      };
    });

    return merged;
  };

  const computeInvoiceTotals = (items: InvoiceItem[], labourRows: any[]) => {
    const totalSpare = roundMoney(items.reduce((sum, item) => sum + Number(item.total || 0), 0));
    const totalLabour = roundMoney(
      labourRows.reduce((sum, row) => sum + Number(row.amount ?? 0), 0),
    );
    const itemsTotal = items.reduce((sum, item) => sum + Number(item.total_with_tax || 0), 0);
    const labourTotal = labourRows.reduce(
      (sum, row) => sum + Number(row.total_with_tax ?? row.totalWithTax ?? 0),
      0,
    );
    const grandTotal = roundMoney(itemsTotal + labourTotal);

    return { totalSpare, totalLabour, grandTotal };
  };

  const fetchNextCarId = async () => {
    const year = new Date().getFullYear();
    const prefix = `SGV-${year}-`;
    const { count, error } = await supabase
      .from("vehicles")
      .select("*", { count: "exact", head: true })
      .ilike("car_id", `${prefix}%`);

    if (error) {
      throw error;
    }

    return createVehicleId((count || 0) + 1, new Date());
  };

  const fetchNextInvoiceNumber = async () => {
    const now = new Date();
    const prefix = createInvoicePrefix(now);
    const { count, error } = await supabase
      .from("invoices")
      .select("*", { count: "exact", head: true })
      .ilike("invoice_number", `${prefix}%`);

    if (error) {
      throw error;
    }

    return createInvoiceNumber((count || 0) + 1, now);
  };

  const ensureVehicleForDraft = async (
    draft: PartDraft & { resolvedId: string },
    createdBy: string | null,
  ) => {
    const rawValue = String(draft.carName || "").trim();
    if (!rawValue) return null;

    const localMatch = findVehicleByValue(rawValue);
    if (localMatch) return localMatch;

    const normalizedReg = normalizeVehicleReg(rawValue);
    const { data: existing, error } = await supabase
      .from("vehicles")
      .select("id, car_id, owner_name, phone_number, vehicle_reg, make_model")
      .or(`vehicle_reg.eq.${normalizedReg},car_id.eq.${normalizedReg}`)
      .maybeSingle();

    if (error) throw error;
    if (existing) {
      setVehicles((current) => {
        if (current.some((vehicle) => vehicle.id === existing.id)) return current;
        return [existing as VehicleRecord, ...current];
      });
      return existing as VehicleRecord;
    }

    const carId = await fetchNextCarId();
    const makeModel = [draft.cat, draft.modelName].filter(Boolean).join(" ").trim();
    const { data: inserted, error: insertError } = await supabase
      .from("vehicles")
      .insert([
        {
          car_id: carId,
          owner_name: "Auto Draft",
          phone_number: "0000000000",
          vehicle_reg: normalizedReg,
          make_model: makeModel || null,
          status: "In Service",
          work_description: "Auto-created from inventory draft",
          created_by: createdBy,
        },
      ])
      .select("id, car_id, owner_name, phone_number, vehicle_reg, make_model")
      .single();

    if (insertError || !inserted) throw insertError || new Error("Failed to create vehicle.");

    await logActivity({
      action: "create",
      entityType: "vehicle",
      entityId: inserted.id,
      entityLabel: inserted.owner_name,
      description: "Auto-created vehicle from inventory draft",
      metadata: {
        car_id: inserted.car_id,
        vehicle_reg: inserted.vehicle_reg,
        source: "inventory_draft",
      },
    });

    setVehicles((current) => [inserted as VehicleRecord, ...current]);
    return inserted as VehicleRecord;
  };

  const upsertInvoiceDraft = async (
    vehicle: VehicleRecord,
    incomingItems: InvoiceItem[],
    createdBy: string | null,
  ) => {
    const { data: draftInvoice, error } = await supabase
      .from("invoices")
      .select("id, invoice_number, items, labour, payment_mode, paid_amount, status, payment_date")
      .eq("vehicle_id", vehicle.id)
      .eq("status", "draft")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;

    const existingItems = Array.isArray(draftInvoice?.items)
      ? draftInvoice.items.map(normalizeInvoiceItem)
      : [];
    const mergedItems = mergeInvoiceItems(existingItems, incomingItems);
    const labourRows = Array.isArray(draftInvoice?.labour) ? draftInvoice.labour : [];
    const totals = computeInvoiceTotals(mergedItems, labourRows);
    const paidAmount = Math.max(0, Number(draftInvoice?.paid_amount ?? 0));
    const paymentStatus =
      paidAmount <= 0
        ? "unpaid"
        : paidAmount >= totals.grandTotal
          ? "paid"
          : "partial";
    const outstanding = Math.max(totals.grandTotal - paidAmount, 0);
    const paymentDate = paidAmount > 0 ? draftInvoice?.payment_date || null : null;

    if (draftInvoice?.id) {
      const { error: updateError } = await supabase
        .from("invoices")
        .update({
          items: mergedItems,
          total_spare: totals.totalSpare,
          total_labour: totals.totalLabour,
          grand_total: totals.grandTotal,
          payment_status: paymentStatus,
          paid_amount: paidAmount,
          outstanding_amount: outstanding,
          payment_date: paymentDate,
          status: "draft",
        })
        .eq("id", draftInvoice.id);

      if (updateError) throw updateError;
      return;
    }

    const invoiceNumber = await fetchNextInvoiceNumber();
    const { error: insertError } = await supabase.from("invoices").insert([
      {
        invoice_number: invoiceNumber,
        vehicle_id: vehicle.id,
        items: mergedItems,
        labour: [],
        total_spare: totals.totalSpare,
        total_labour: 0,
        grand_total: totals.grandTotal,
        payment_mode: "upi",
        payment_status: "unpaid",
        paid_amount: 0,
        outstanding_amount: totals.grandTotal,
        payment_date: null,
        created_by: createdBy,
        note: "Auto-draft from inventory",
        status: "draft",
      },
    ]);

    if (insertError) throw insertError;
  };

  const fetchParts = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("spare_parts")
      .select("*, profiles!spare_parts_created_by_fkey(username)")
      .order("created_at", { ascending: false });
    if (!error && data) {
      const ensuredData = await ensureBarcodesForParts(data);
      setParts(ensuredData);
      await loadPurchaseRows();

      // If we have an editId from URL, populate the form
      if (editId) {
        const p = ensuredData.find(x => x.id === editId);
        if (p) {
          setForm({
            partId: p.id || "", barcode: p.barcode || "", name: p.name, seller: p.seller, cat: p.cat, partsCategory: p.parts_category || "", modelName: sanitizeModelForBrand(p.cat, p.model_name || ""), carName: p.car_name || "",
            cost: p.cost, taxRate: 18, sell: p.sell, stock: p.stock, threshold: p.threshold
          });
        }
      }
    }
    const vendorRegistry = await loadVendorRegistry();
    const vendorDirectoryMap: Record<string, VendorRecord> = {};
    vendorRegistry.data.forEach((vendor) => {
      const key = normalizeVendorKey(vendor.name);
      if (key) {
        vendorDirectoryMap[key] = vendor;
      }
    });
    setVendorDirectory(vendorDirectoryMap);
    const vendorNames = vendorRegistry.data.map((vendor) => String(vendor.name || "").trim()).filter(Boolean);
    const partSellerNames = (data || []).map((part) => String(part.seller || "").trim()).filter(Boolean);
    setVendorOptions(Array.from(new Set([...vendorNames, ...partSellerNames])).sort((a, b) => a.localeCompare(b)));
    setLoading(false);
  };

  const fetchVehicles = async () => {
    const { data } = await supabase
      .from("vehicles")
      .select("id, car_id, owner_name, phone_number, vehicle_reg, make_model")
      .order("created_at", { ascending: false });
    setVehicles((data || []) as VehicleRecord[]);
  };

  useEffect(() => {
    fetchParts();
  }, [editId]);

  useEffect(() => {
    fetchVehicles();
  }, []);

  const parseModeFromNote = (note?: string | null): "cash_carry" | "credit" => {
    const text = String(note || "").toLowerCase();
    return text.includes("mode: credit") ? "credit" : "cash_carry";
  };

  const parseSellerFromNote = (note?: string | null) => {
    const match = String(note || "").match(/Seller:\s*([^|]+)/i);
    return match?.[1]?.trim() || "—";
  };

  const parseBillUrlsFromNote = (note?: string | null) => {
    const text = String(note || "");
    const direct = [...text.matchAll(/https?:\/\/[^\s,|]+/g)].map((m) => m[0]);
    return Array.from(new Set(direct));
  };

  const parseInvoiceNoFromNote = (note?: string | null) => {
    const match = String(note || "").match(/Invoice:\s*([^|]+)/i);
    return match?.[1]?.trim() || "";
  };

  const parsePartNamesFromNote = (note?: string | null) => {
    const match = String(note || "").match(/Parts:\s*([^|]+)/i);
    if (!match?.[1]) return [] as string[];
    return match[1]
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  };

  const getCurrentUsername = async () => {
    const { data: auth } = await supabase.auth.getUser();
    const userId = auth.user?.id;
    if (!userId) return "User";
    const fromMeta = String(auth.user?.user_metadata?.username || "").trim();
    if (fromMeta) return fromMeta;
    const { data } = await supabase.from("profiles").select("username").eq("id", userId).maybeSingle();
    return String(data?.username || "User");
  };

  const getValidCreatedBy = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user?.id) {
      return null;
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .eq("id", user.id)
      .maybeSingle();

    return profile?.id || null;
  };

  const parsePaymentSourceId = (note?: string | null) => {
    const match = String(note || "").match(/credit_payment_for:([a-z0-9-]+)/i);
    return match?.[1] || null;
  };

  const loadPurchaseRows = async () => {
    setPurchaseLoading(true);
    const { data, error } = await supabase
      .from("transactions")
      .select("id, description, amount, type, payment_mode, date, created_at, note")
      .order("date", { ascending: false })
      .order("created_at", { ascending: false });

    if (error || !data) {
      setPurchaseRows([]);
      setPurchaseLoading(false);
      return;
    }

    const txns = data as PurchaseTransactionRow[];
    const basePurchases = txns.filter((txn) => {
      const desc = txn.description.toLowerCase();
      return (
        txn.type === "debit" &&
        desc.includes("spare parts purchase") &&
        !desc.includes("credit payment -")
      );
    });
    const computedCreditRows = computeCreditPendingRows(
      basePurchases
        .filter((purchase) => parseModeFromNote(purchase.note) === "credit")
        .map((purchase) => ({
          id: purchase.id,
          description: purchase.description,
          seller: parseSellerFromNote(purchase.note),
          date: purchase.date || purchase.created_at.split("T")[0],
          partNames: parsePartNamesFromNote(purchase.note),
          originalAmount: Math.max(0, Number(purchase.amount || 0)),
          billUrls: parseBillUrlsFromNote(purchase.note),
          mode: "credit" as const,
        })),
      txns,
    );
    const computedCreditMap = new Map(computedCreditRows.map((row) => [row.id, row]));

    const rows: PurchaseDueRow[] = basePurchases.map((purchase) => {
      const mode = parseModeFromNote(purchase.note);
      const computed = computedCreditMap.get(purchase.id);
      const originalAmount = Math.max(0, Number(purchase.amount || 0));
      const paidAmount = mode === "credit" ? Math.max(0, Number(computed?.paidAmount || 0)) : 0;
      const pendingAmount = mode === "credit" ? Math.max(0, Number(computed?.pendingAmount || 0)) : 0;
      return {
        id: purchase.id,
        description: purchase.description,
        seller: parseSellerFromNote(purchase.note),
        date: purchase.date || purchase.created_at.split("T")[0],
        mode,
        partNames: parsePartNamesFromNote(purchase.note),
        originalAmount,
        paidAmount,
        pendingAmount,
        status: mode === "credit" && pendingAmount > 0 ? "Pending" : "Paid",
        billUrls: parseBillUrlsFromNote(purchase.note),
        invoiceNo: parseInvoiceNoFromNote(purchase.note),
        receivedDate: purchase.date || purchase.created_at.split("T")[0],
      };
    });

    // Also fetch old stock reference entries for invoice/received date tracking
    const oldStockRefs = txns.filter((txn) => {
      const desc = txn.description.toLowerCase();
      return txn.type === "debit" && desc.startsWith("old stock ref");
    });

    setPurchaseRows(rows);
    const summary: Record<string, PartPurchaseSummary> = {};

    const addToSummary = (partName: string, entry: PartPurchaseSummary) => {
      // Strip trailing vehicle number "(TN01)" so key matches spare_parts name lookup
      const nameOnly = partName.replace(/\s*\([^)]*\)\s*$/, "").trim();
      const key = (nameOnly || partName).trim().toLowerCase();
      if (!key || summary[key]) return;
      summary[key] = entry;
    };

    rows.forEach((row) => {
      row.partNames.forEach((partName) => {
        addToSummary(partName, {
          purchaseId: row.id,
          status: row.status,
          billCount: row.billUrls.length,
          dueAmount: row.pendingAmount,
          billUrls: row.billUrls,
          invoiceNo: row.invoiceNo,
          receivedDate: row.receivedDate,
        });
      });
    });

    oldStockRefs.forEach((ref) => {
      const partNames = parsePartNamesFromNote(ref.note);
      const invoiceNo = parseInvoiceNoFromNote(ref.note);
      const receivedDate = ref.date || ref.created_at.split("T")[0];
      partNames.forEach((partName) => {
        addToSummary(partName, {
          purchaseId: ref.id,
          status: "Paid",
          billCount: 0,
          dueAmount: 0,
          billUrls: [],
          invoiceNo,
          receivedDate,
        });
      });
    });

    setPartPurchaseSummary(summary);
    setPurchaseLoading(false);
  };

  const openPurchasePopup = async () => {
    setSelectedPurchaseSeller("");
    setPurchaseSellerQuery("");
    setPurchaseSellerSort("due_desc");
    setPurchaseDetailPage(1);
    setPurchasePopupOpen(true);
    await loadPurchaseRows();
  };

  const sellerSummaryRows = useMemo(() => {
    const summary = new Map<string, { seller: string; orderCount: number; totalAmount: number; dueAmount: number }>();
    purchaseRows.forEach((row) => {
      const seller = row.seller === "—" ? "Unknown seller" : row.seller;
      const current = summary.get(seller) || {
        seller,
        orderCount: 0,
        totalAmount: 0,
        dueAmount: 0,
      };
      current.orderCount += 1;
      current.totalAmount += Number(row.originalAmount || 0);
      current.dueAmount += Number(row.pendingAmount || 0);
      summary.set(seller, current);
    });
    return Array.from(summary.values());
  }, [purchaseRows]);

  const filteredSellerSummaryRows = useMemo(() => {
    const query = purchaseSellerQuery.trim().toLowerCase();
    const base = sellerSummaryRows.filter((row) =>
      !query ? true : row.seller.toLowerCase().includes(query),
    );
    if (purchaseSellerSort === "name_asc") {
      return [...base].sort((a, b) => a.seller.localeCompare(b.seller));
    }
    return [...base].sort((a, b) => {
      if (b.dueAmount !== a.dueAmount) return b.dueAmount - a.dueAmount;
      return b.totalAmount - a.totalAmount;
    });
  }, [purchaseSellerQuery, purchaseSellerSort, sellerSummaryRows]);

  const selectedSellerGroup = useMemo(
    () => {
      if (!selectedPurchaseSeller) return null;
      const rows = purchaseRows.filter((row) => {
        const seller = row.seller === "—" ? "Unknown seller" : row.seller;
        return seller === selectedPurchaseSeller;
      });
      if (rows.length === 0) return null;
      return {
        seller: selectedPurchaseSeller,
        rows,
        pendingTotal: rows.reduce((sum, row) => sum + Number(row.pendingAmount || 0), 0),
      };
    },
    [purchaseRows, selectedPurchaseSeller],
  );

  const PURCHASE_DETAIL_PAGE_SIZE = 20;
  const purchaseDetailTotalPages = selectedSellerGroup
    ? Math.max(1, Math.ceil(selectedSellerGroup.rows.length / PURCHASE_DETAIL_PAGE_SIZE))
    : 1;
  const pagedPurchaseRows = selectedSellerGroup
    ? selectedSellerGroup.rows.slice(
        (purchaseDetailPage - 1) * PURCHASE_DETAIL_PAGE_SIZE,
        purchaseDetailPage * PURCHASE_DETAIL_PAGE_SIZE,
      )
    : [];

  useEffect(() => {
    setPurchaseDetailPage(1);
  }, [selectedPurchaseSeller]);

  const markCreditAsPaid = async (row: PurchaseDueRow, paymentMode: "cash" | "upi") => {
    if (row.mode !== "credit" || row.pendingAmount <= 0) return;
    setPurchaseActionId(row.id);
    const username = await getCurrentUsername();
    const { data: auth } = await supabase.auth.getUser();
    const paymentDate = new Date().toISOString().split("T")[0];
    const partsLabel = row.partNames.length ? row.partNames.join(", ") : "—";
    const { error } = await supabase.from("transactions").insert([{
      description: `Credit Payment - ${row.description} | Seller: ${row.seller} | Parts: ${partsLabel}`,
      amount: row.pendingAmount,
      type: "debit",
      payment_mode: paymentMode,
      date: paymentDate,
      note: `Ref: Credit dues payment | credit_payment_for:${row.id}\nBy ${username} paid`,
      created_by: auth.user?.id,
    }]);
    if (error) {
      alert(error.message);
      setPurchaseActionId(null);
      return;
    }
    await logActivity({
      action: "create",
      entityType: "transaction",
      entityId: row.id,
      entityLabel: row.description,
      description: "Updated credit purchase payment status to paid",
      metadata: { payment_mode: paymentMode, amount: row.pendingAmount },
    });
    setPurchaseActionId(null);
    await loadPurchaseRows();
  };

  const handlePurchaseBillUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!billUploadTargetId) return;
    const file = event.target.files?.[0];
    if (!file) return;
    const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    if (!file.type.startsWith("image/") && !isPdf) {
      alert("Only image files or PDF files are allowed.");
      return;
    }
    setPurchaseActionId(billUploadTargetId);
    try {
      const uploadedUrl = await uploadToCloudinary(file, {
        kind: "bill",
        folder: "siragirvel/bills",
      });
      const target = purchaseRows.find((row) => row.id === billUploadTargetId);
      if (!target) return;
      const existing = target.billUrls;
      const nextUrls = Array.from(new Set([...existing, uploadedUrl]));
      const partsLabel = target.partNames.length ? target.partNames.join(", ") : "—";
      const { error } = await supabase
        .from("transactions")
        .update({
          note: `Seller: ${target.seller} | Parts: ${partsLabel} | Mode: ${target.mode === "cash_carry" ? "Cash & Carry" : "Credit"} | Bills: ${nextUrls.join(", ")}`,
        })
        .eq("id", billUploadTargetId);
      if (error) {
        alert(error.message);
      } else {
        await loadPurchaseRows();
      }
    } finally {
      setPurchaseActionId(null);
      setBillUploadTargetId(null);
      event.target.value = "";
    }
  };

  const handlePartNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;

    if (isHardEditing) {
      setForm(prev => ({ ...prev, name: val }));
      return;
    }

    const existing = parts.find(p => p.name.trim().toLowerCase() === val.trim().toLowerCase());
    if (existing) {
      router.push(`/inventory/${existing.id}`);
    } else {
      setEditId(null);
      setForm(prev => ({ ...prev, name: val }));
    }
  };

  const getVehiclePopupWidth = (rect: DOMRect) => {
    const minWidth = 420;
    const extraWidth = 180;
    const desired = Math.max(rect.width + extraWidth, minWidth);
    if (typeof window === "undefined") return desired;
    const available = window.innerWidth - rect.left - 16;
    return Math.max(240, Math.min(desired, available));
  };

  const updateVehicleFormPopupPosition = () => {
    const input = vehicleFormInputRef.current;
    if (!input) return;
    const rect = input.getBoundingClientRect();
    setVehicleFormPopup({ top: rect.bottom + 8, left: rect.left, width: getVehiclePopupWidth(rect) });
  };

  const openVehicleFormPopup = () => {
    setVehicleFormOpen(true);
    setFormVehicleIndex(0);
    updateVehicleFormPopupPosition();
  };

  const closeVehicleFormPopup = () => {
    setVehicleFormOpen(false);
    setVehicleFormPopup(null);
  };

  const updateVehicleDraftPopupPosition = (rowId: number) => {
    const input = vehicleDraftInputRefs.current.get(rowId);
    if (!input) return;
    const rect = input.getBoundingClientRect();
    setVehicleDraftPopup({
      rowId,
      top: rect.bottom + 6,
      left: rect.left,
      width: getVehiclePopupWidth(rect),
    });
  };

  const openVehicleDraftPopup = (rowId: number) => {
    setActiveVehicleRow(rowId);
    setActiveVehicleIndex(0);
    updateVehicleDraftPopupPosition(rowId);
  };

  const closeVehicleDraftPopup = (rowId: number) => {
    setActiveVehicleRow((current) => (current === rowId ? null : current));
    setVehicleDraftPopup((current) => (current?.rowId === rowId ? null : current));
  };

  const resolveVehicleName = useCallback(
    (vehicle: VehicleRecord) => String(vehicle.vehicle_reg || vehicle.car_id || vehicle.make_model || "").trim(),
    [],
  );

  const splitMakeModel = useCallback((makeModel?: string | null) => {
    const value = String(makeModel || "").trim();
    if (!value) return { brand: "", model: "" };
    const separators = [" / ", " - ", " | ", "/", "-", "|"];
    for (const sep of separators) {
      if (value.includes(sep)) {
        const parts = value.split(sep).map((part) => part.trim()).filter(Boolean);
        if (parts.length >= 2) {
          return { brand: parts[0], model: parts.slice(1).join(" ").trim() };
        }
      }
    }
    const tokens = value.split(/\s+/).filter(Boolean);
    if (tokens.length === 1) {
      return { brand: tokens[0], model: "" };
    }
    return { brand: tokens[0], model: tokens.slice(1).join(" ") };
  }, []);

  const isCommonBrand = useCallback((value?: string | null) => String(value || "").trim().toLowerCase() === "common", []);

  const sanitizeModelForBrand = useCallback(
    (brand?: string | null, model?: string | null) => (isCommonBrand(brand) ? "" : String(model || "")),
    [isCommonBrand],
  );

  const normalizeVehicleValue = useCallback((value?: string | null) => String(value || "").trim().toLowerCase(), []);

  const findVehicleByValue = useCallback(
    (value: string) => {
      const normalized = normalizeVehicleValue(value);
      if (!normalized) return null;
      return (
        vehicles.find((vehicle) => {
          const reg = normalizeVehicleValue(vehicle.vehicle_reg);
          const carId = normalizeVehicleValue(vehicle.car_id);
          const model = normalizeVehicleValue(vehicle.make_model);
          const resolved = normalizeVehicleValue(resolveVehicleName(vehicle));
          return normalized === reg || normalized === carId || normalized === model || normalized === resolved;
        }) || null
      );
    },
    [normalizeVehicleValue, resolveVehicleName, vehicles],
  );

  useEffect(() => {
    const trimmed = form.carName.trim();
    if (!trimmed) {
      if (formVehicle) setFormVehicle(null);
      return;
    }
    const match = findVehicleByValue(trimmed);
    if (match) {
      if (!formVehicle || formVehicle.id !== match.id) {
        setFormVehicle(match);
      }
      if (match.make_model) {
        const { brand, model } = splitMakeModel(match.make_model);
        if (brand || model) {
          setForm((prev) => ({
            ...prev,
            cat: brand || prev.cat,
            modelName: brand ? sanitizeModelForBrand(brand, model) : prev.modelName,
          }));
        }
      }
    } else if (formVehicle) {
      setFormVehicle(null);
    }
  }, [findVehicleByValue, form.carName, formVehicle, sanitizeModelForBrand, splitMakeModel]);

  const getVehicleMatches = (query: string) => {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) return [];
    return vehicles
      .filter((vehicle) => {
        return (
          vehicle.car_id.toLowerCase().includes(trimmed) ||
          vehicle.owner_name.toLowerCase().includes(trimmed) ||
          vehicle.phone_number.toLowerCase().includes(trimmed) ||
          vehicle.vehicle_reg.toLowerCase().includes(trimmed) ||
          String(vehicle.make_model || "").toLowerCase().includes(trimmed)
        );
      })
      .slice(0, 8);
  };

  const handleFormVehiclePick = (vehicle: VehicleRecord) => {
    const value = resolveVehicleName(vehicle);
    if (!value) return;
    const { brand, model } = splitMakeModel(vehicle.make_model);
    setForm((prev) => ({
      ...prev,
      carName: value,
      cat: brand || prev.cat,
      modelName: brand ? sanitizeModelForBrand(brand, model) : prev.modelName,
    }));
    setFormVehicle(vehicle);
    closeVehicleFormPopup();
  };

  const handleVehiclePick = (vehicle: VehicleRecord, localId: number) => {
    const value = resolveVehicleName(vehicle);
    if (!value) return;
    const { brand, model } = splitMakeModel(vehicle.make_model);
    setDrafts((current) =>
      current.map((draft) =>
        draft.localId === localId
          ? {
              ...draft,
              carName: value,
              cat: brand || draft.cat,
              modelName: brand ? sanitizeModelForBrand(brand, model) : draft.modelName,
            }
          : draft,
      ),
    );
    setDraftVehicleMap((current) => ({ ...current, [localId]: vehicle }));
    setActiveVehicleRow(null);
  };

  const handleFormVehicleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const matches = getVehicleMatches(form.carName);
    const hasDropdown = vehicleFormOpen && matches.length > 0 && form.carName.trim().length > 0;

    if (hasDropdown) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setFormVehicleIndex((prev) => (prev + 1) % matches.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setFormVehicleIndex((prev) => (prev - 1 + matches.length) % matches.length);
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        const target = matches[Math.min(formVehicleIndex, matches.length - 1)];
        handleFormVehiclePick(target);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        closeVehicleFormPopup();
        return;
      }
    }
  };

  const handleVehicleInputKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    rowIndex: number,
    localId: number,
    query: string,
  ) => {
    const matches = getVehicleMatches(query);
    const hasDropdown = activeVehicleRow === localId && matches.length > 0 && query.trim().length > 0;

    if (hasDropdown) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveVehicleIndex((prev) => (prev + 1) % matches.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveVehicleIndex((prev) => (prev - 1 + matches.length) % matches.length);
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        handleVehiclePick(matches[activeVehicleIndex], localId);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setActiveVehicleRow(null);
        return;
      }
    }

    handleDraftGridKeyDown(e, rowIndex, "carName");
  };

  useEffect(() => {
    if (!vehicleFormOpen) {
      setVehicleFormPopup(null);
      return;
    }
    updateVehicleFormPopupPosition();
  }, [vehicleFormOpen, form.carName]);

  useEffect(() => {
    if (!vehicleFormOpen) return;
    const handle = () => updateVehicleFormPopupPosition();
    window.addEventListener("scroll", handle, true);
    window.addEventListener("resize", handle);
    return () => {
      window.removeEventListener("scroll", handle, true);
      window.removeEventListener("resize", handle);
    };
  }, [vehicleFormOpen]);

  useEffect(() => {
    if (activeVehicleRow === null) {
      setVehicleDraftPopup(null);
      return;
    }
    updateVehicleDraftPopupPosition(activeVehicleRow);
  }, [activeVehicleRow, drafts]);

  useEffect(() => {
    if (activeVehicleRow === null) return;
    const handle = () => updateVehicleDraftPopupPosition(activeVehicleRow);
    window.addEventListener("scroll", handle, true);
    window.addEventListener("resize", handle);
    return () => {
      window.removeEventListener("scroll", handle, true);
      window.removeEventListener("resize", handle);
    };
  }, [activeVehicleRow]);

  const updateDraftField = (
    localId: number,
    field: keyof Omit<PartDraft, "localId" | "suffix">,
    value: string | number,
  ) => {
    setDrafts((current) =>
      current.map((draft) =>
        draft.localId === localId ? { ...draft, [field]: value } : draft,
      ),
    );
  };

  const updateFormBrand = (value: string) => {
    setForm((current) => ({
      ...current,
      cat: value,
      modelName: sanitizeModelForBrand(value, current.modelName),
    }));
  };

  const updateDraftBrand = (localId: number, value: string) => {
    setDrafts((current) =>
      current.map((draft) =>
        draft.localId === localId
          ? {
              ...draft,
              cat: value,
              modelName: sanitizeModelForBrand(value, draft.modelName),
            }
          : draft,
      ),
    );
  };

  const addAnotherDraft = () => {
    setDrafts((current) => {
      const previousDraft = current[current.length - 1];
      const inheritedVehicleNumber = resolveCanonicalVehicleNumber(
        previousDraft?.carName || form.carName,
      );
      return [...current, createDraft(draftCounter, inheritedVehicleNumber)];
    });
    setDraftCounter((current) => current + 1);
  };

  const removeDraft = (localId: number) => {
    setDrafts((current) => {
      const next = current.filter((draft) => draft.localId !== localId);
      return next.length > 0 ? next : [createDraft(draftCounter)];
    });
    setDraftVehicleMap((current) => {
      if (!(localId in current)) return current;
      const next = { ...current };
      delete next[localId];
      return next;
    });
    setDraftCounter((current) => current + 1);
  };

  const draftFields = ["partId", "name", "partsCategory", "cat", "modelName", "carName", "cost", "taxRate", "sell", "margin", "stock", "threshold"] as const;
  type DraftField = (typeof draftFields)[number];

  const focusDraftInput = (rowIndex: number, field: DraftField) => {
    const input = document.querySelector(
      `[data-type="draft-part"][data-row="${rowIndex}"][data-field="${field}"]`,
    ) as HTMLInputElement | HTMLSelectElement | null;
    input?.focus();
    if (input instanceof HTMLInputElement) {
      input.select();
    }
  };

  const getAdjacentDraftField = (rowIndex: number, field: DraftField, direction: "next" | "prev") => {
    const draft = drafts[rowIndex];
    const step = direction === "next" ? 1 : -1;
    let index = draftFields.indexOf(field) + step;
    while (index >= 0 && index < draftFields.length) {
      const candidate = draftFields[index];
      if (!(candidate === "modelName" && draft && isCommonBrand(draft.cat))) {
        return candidate;
      }
      index += step;
    }
    return null;
  };

  const handleDraftGridKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement | HTMLSelectElement>,
    rowIndex: number,
    field: DraftField,
  ) => {
    if (!draftFields.includes(field)) return;

    if (e.key === "ArrowRight") {
      e.preventDefault();
      const nextField = getAdjacentDraftField(rowIndex, field, "next");
      if (nextField) {
        focusDraftInput(rowIndex, nextField);
      }
      return;
    }

    if (e.key === "ArrowLeft") {
      e.preventDefault();
      const previousField = getAdjacentDraftField(rowIndex, field, "prev");
      if (previousField) {
        focusDraftInput(rowIndex, previousField);
      }
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (rowIndex < drafts.length - 1) {
        focusDraftInput(rowIndex + 1, field);
      }
      return;
    }

    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (rowIndex > 0) {
        focusDraftInput(rowIndex - 1, field);
      }
      return;
    }

    if (e.key === "Enter") {
      e.preventDefault();
      const nextField = getAdjacentDraftField(rowIndex, field, "next");
      if (nextField) {
        focusDraftInput(rowIndex, nextField);
        return;
      }

      if (rowIndex < drafts.length - 1) {
        focusDraftInput(rowIndex + 1, draftFields[0]);
        return;
      }

      addAnotherDraft();
      const nextRow = drafts.length;
      window.setTimeout(() => {
        focusDraftInput(nextRow, draftFields[0]);
      }, 0);
    }
  };

  const handleSavePart = async () => {
    if (savingRef.current || uploadingBills) return;
    savingRef.current = true;
    setIsSaving(true);
    try {
    if (editId) {
      if (!form.name || !form.cost || !form.sell || !form.seller || !form.cat || !form.partsCategory || !form.carName) {
        alert("Please fill all required fields.");
        return;
      }
      const usedBarcodes = new Set(
        parts
          .filter((part) => part.id !== editId)
          .map((part) => normalizeBarcode(part.barcode))
          .filter((value) => isValidBarcode(value)),
      );
      let resolvedBarcode = normalizeBarcode(form.barcode);
      if (!isValidBarcode(resolvedBarcode) || usedBarcodes.has(resolvedBarcode)) {
        resolvedBarcode = getNextAvailableBarcode(usedBarcodes);
      }

      const updatePayload = {
        name: form.name,
        seller: form.seller.trim(),
        cat: form.cat,
        parts_category: form.partsCategory,
        model_name: sanitizeModelForBrand(form.cat, form.modelName).trim() || null,
        car_name: form.carName.trim() || null,
        cost: form.cost, sell: form.sell, stock: form.stock, threshold: form.threshold,
        barcode: resolvedBarcode,
      };
      const { error: updateError } = await supabase
        .from("spare_parts")
        .update(stripUnsupportedFields(updatePayload))
        .eq("id", editId);
      let error = updateError;
      if (error && (isBarcodeColumnMissing(error) || isModelColumnMissing(error) || isPartsCategoryColumnMissing(error))) {
        if (isBarcodeColumnMissing(error)) {
          disableBarcodeSupport(error);
        }
        if (isModelColumnMissing(error)) {
          disableModelSupport(error);
        }
        if (isPartsCategoryColumnMissing(error)) {
          disablePartsCategorySupport(error);
        }
        const retry = await supabase
          .from("spare_parts")
          .update(stripUnsupportedFields(updatePayload))
          .eq("id", editId);
        error = retry.error;
      }
      if (error) alert(error.message);
      else {
        await syncVendorRecord(form.seller.trim());
        await logActivity({
          action: "edit",
          entityType: "spare_part",
          entityId: editId,
          entityLabel: form.name,
          description: "Edited spare part",
          metadata: {
            seller: form.seller,
            cat: form.cat,
            parts_category: form.partsCategory,
            model_name: sanitizeModelForBrand(form.cat, form.modelName),
            car_name: form.carName,
            stock: form.stock,
            barcode: resolvedBarcode,
          },
        });
      }
    } else {
      const validDrafts = drafts.filter(
        (draft) =>
          draft.name && draft.cost && draft.sell && draft.cat && draft.partsCategory && draft.carName,
      );

      if (validDrafts.length === 0 || validDrafts.length !== drafts.length) {
        alert("Please fill all required fields for every spare part.");
        return;
      }
      const isOldStock = stockEntryMode === "old_stock" || stockEntryMode === "add_bill";
      const resolvedSeller = stockEntryMode === "old_stock" ? OLD_STOCK_SELLER : batchSeller.trim();
      if (stockEntryMode !== "old_stock" && !batchSeller.trim()) {
        alert("Please select seller name once for all spare parts.");
        return;
      }
      if (!isOldStock && purchaseMode === "cash_carry" && !cashCarryPaymentMode) {
        alert("Please choose payment mode for cash and carry purchase.");
        return;
      }
      if (!isOldStock && billImages.length > 3) {
        alert("Maximum 3 bill files are allowed.");
        return;
      }

      const createdBy = await getValidCreatedBy();
      const billUrls: string[] = [];
      if (!isOldStock && billImages.length > 0) {
        try {
          setUploadingBills(true);
          for (const file of billImages) {
            const uploaded = await uploadToCloudinary(file, {
              kind: "bill",
              folder: "siragirvel/bills",
            });
            billUrls.push(uploaded);
          }
        } catch (error) {
          alert(error instanceof Error ? error.message : "Failed to upload bill image(s).");
          setUploadingBills(false);
          return;
        } finally {
          setUploadingBills(false);
        }
      }

      const usedIds = new Set(parts.map((part) => String(part.id)));
      const usedBarcodes = new Set(
        parts
          .map((part) => normalizeBarcode(part.barcode))
          .filter((value) => isValidBarcode(value)),
      );
      const resolvedDrafts: Array<PartDraft & { resolvedId: string; resolvedBarcode: string }> = [];

      for (const draft of validDrafts) {
        const resolved = getNextAvailablePartId(draft.partId, draft.name, draft.suffix, usedIds);
        if ("error" in resolved) {
          alert(resolved.error);
          return;
        }
        usedIds.add(resolved.id);
        const canonicalVehicleNumber = resolveCanonicalVehicleNumber(draft.carName);
        if (!canonicalVehicleNumber) {
          alert("Vehicle number is required for every spare part.");
          return;
        }
        let resolvedBarcode = normalizeBarcode(draft.barcode);
        if (!isValidBarcode(resolvedBarcode) || usedBarcodes.has(resolvedBarcode)) {
          resolvedBarcode = getNextAvailableBarcode(usedBarcodes);
        }
        usedBarcodes.add(resolvedBarcode);
        resolvedDrafts.push({
          ...draft,
          carName: canonicalVehicleNumber,
          suffix: resolved.suffix,
          resolvedId: resolved.id,
          resolvedBarcode,
        });
      }

      const rows = resolvedDrafts.map((draft) => ({
        id: draft.resolvedId,
        barcode: draft.resolvedBarcode,
        name: draft.name,
        seller: resolvedSeller,
        cat: draft.cat,
        parts_category: draft.partsCategory,
        model_name: sanitizeModelForBrand(draft.cat, draft.modelName).trim() || null,
        car_name: draft.carName.trim() || null,
        cost: draft.cost,
        sell: draft.sell,
        stock: draft.stock,
        threshold: draft.threshold,
        created_by: createdBy,
      }));
      const { error: insertError } = await supabase
        .from("spare_parts")
        .insert(stripUnsupportedRows(rows));
      let error = insertError;
      if (error && (isBarcodeColumnMissing(error) || isModelColumnMissing(error) || isPartsCategoryColumnMissing(error))) {
        if (isBarcodeColumnMissing(error)) {
          disableBarcodeSupport(error);
        }
        if (isModelColumnMissing(error)) {
          disableModelSupport(error);
        }
        if (isPartsCategoryColumnMissing(error)) {
          disablePartsCategorySupport(error);
        }
        const retry = await supabase.from("spare_parts").insert(stripUnsupportedRows(rows));
        error = retry.error;
      }
      if (error) alert(error.message);
      else {
        if (!isOldStock) {
          await syncVendorRecord(resolvedSeller);
        }
        setDrafts((current) =>
          current.map((draft) => {
            const resolved = resolvedDrafts.find((item) => item.localId === draft.localId);
            return resolved
              ? {
                  ...draft,
                  carName: resolved.carName,
                  suffix: resolved.suffix,
                  partId: draft.partId.trim() ? draft.partId : resolved.resolvedId,
                  barcode: resolved.resolvedBarcode,
                }
              : draft;
          }),
        );
        for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
          const row = rows[rowIndex];
          const sourceDraft = resolvedDrafts[rowIndex];
          await logActivity({
            action: "create",
            entityType: "spare_part",
            entityId: row.id,
            entityLabel: row.name,
            description: "Created spare part",
            metadata: {
              seller: row.seller,
              cat: row.cat,
              parts_category: row.parts_category,
              model_name: row.model_name,
              vehicle_name: sourceDraft?.carName?.trim() || null,
              stock: row.stock,
              barcode: row.barcode,
              purchase_mode: isOldStock ? "old_stock" : purchaseMode,
              bill_urls: billUrls,
            },
          });
        }

        if (!isOldStock) {
          const totalPurchaseAmount = validDrafts.reduce(
            (sum, draft) => sum + Number(draft.cost || 0) * Number(draft.stock || 0),
            0,
          );
          const storedPaymentMode = purchaseMode === "cash_carry" ? cashCarryPaymentMode : "upi";
          const purchaseModeLabel = purchaseMode === "cash_carry" ? "Cash & Carry" : "Credit";
          const paymentModeLabel = purchaseMode === "cash_carry"
            ? cashCarryPaymentMode === "cash"
              ? "Cash"
              : "EFT"
            : "Credit Due";
          const transactionDescription = `Spare parts purchase (${validDrafts.length} item${validDrafts.length > 1 ? "s" : ""})`;
          const partNames = resolvedDrafts
            .map((draft) => `${draft.name.trim()} (${draft.carName.trim() || "—"})`)
            .filter(Boolean)
            .join(", ");
          const { data: insertedTxn, error: txnError } = await supabase
            .from("transactions")
            .insert([{
              description: transactionDescription,
              amount: totalPurchaseAmount,
              type: "debit",
              payment_mode: storedPaymentMode,
              date: purchaseReceivedDate || new Date().toISOString().split("T")[0],
              note: `Seller: ${resolvedSeller} | Parts: ${partNames || "—"} | Mode: ${purchaseModeLabel} | Payment: ${paymentModeLabel}${purchaseInvoiceNo.trim() ? ` | Invoice: ${purchaseInvoiceNo.trim()}` : ""}${purchaseTotalValue > 0 ? ` | BillValue: ${purchaseTotalValue}` : ""}${billUrls.length ? ` | Bills: ${billUrls.join(", ")}` : ""}`,
              created_by: createdBy,
            }])
            .select("id")
            .single();

          if (!txnError) {
            await logActivity({
              action: "create",
              entityType: "transaction",
              entityId: insertedTxn?.id || transactionDescription,
              entityLabel: transactionDescription,
              description: "Created automatic day book entry from spare parts purchase",
              metadata: {
                amount: totalPurchaseAmount,
                payment_mode: storedPaymentMode,
                purchase_mode: purchaseMode,
                seller: resolvedSeller,
                vehicle_names: resolvedDrafts.map((draft) => draft.carName.trim()).filter(Boolean),
                bill_urls: billUrls,
              },
            });
          }
        }

        if (isOldStock && (oldStockInvoiceNo.trim() || oldStockReceivedDate || oldStockTotalValue > 0)) {
          const oldStockPartNames = resolvedDrafts
            .map((draft) => `${draft.name.trim()} (${draft.carName.trim() || "—"})`)
            .filter(Boolean)
            .join(", ");
          await supabase.from("transactions").insert([{
            description: `Old stock ref (${validDrafts.length} item${validDrafts.length > 1 ? "s" : ""})`,
            amount: oldStockTotalValue || 0,
            type: "debit",
            payment_mode: "cash",
            date: oldStockReceivedDate || new Date().toISOString().split("T")[0],
            note: `Seller: ${resolvedSeller} | Parts: ${oldStockPartNames || "—"}${oldStockInvoiceNo.trim() ? ` | Invoice: ${oldStockInvoiceNo.trim()}` : ""}`,
            created_by: createdBy,
          }]);
        }

        const invoiceDraftGroups = new Map<
          string,
          { vehicle: VehicleRecord; items: InvoiceItem[] }
        >();
        const vehicleCache = new Map<string, VehicleRecord | null>();

        for (const draft of resolvedDrafts) {
          const vehicleKey = normalizeVehicleReg(draft.carName);
          if (!vehicleKey) continue;
          let vehicle = vehicleCache.get(vehicleKey);
          if (vehicle === undefined) {
            vehicle = await ensureVehicleForDraft(draft, createdBy);
            vehicleCache.set(vehicleKey, vehicle ?? null);
          }
          if (!vehicle) continue;

          const item = buildInvoiceItemFromDraft(draft);
          if (!item) continue;

          const entry = invoiceDraftGroups.get(vehicle.id) || {
            vehicle,
            items: [],
          };
          entry.items.push(item);
          invoiceDraftGroups.set(vehicle.id, entry);
        }

        if (invoiceDraftGroups.size > 0) {
          for (const entry of invoiceDraftGroups.values()) {
            try {
              await upsertInvoiceDraft(entry.vehicle, entry.items, createdBy);
            } catch (err) {
              console.error("Failed to update invoice draft", err);
              alert(
                "Spare parts saved, but the invoice draft could not be updated. Please open billing to verify.",
              );
            }
          }
        }
      }
    }

    setDraftSuffix(Math.floor(1000 + Math.random() * 9000));
    setForm({ partId: "", barcode: "", name: "", seller: "", cat: "", partsCategory: "", modelName: "", carName: "", cost: 0, taxRate: 18, sell: 0, stock: 1, threshold: 1 });
    setFormVehicle(null);
    setBatchSeller("");
    setStockEntryMode("purchase");
    setSavedSellerBeforeOldStock("");
    setPurchaseMode("cash_carry");
    setCashCarryPaymentMode("cash");
    setShowCashCarryModePicker(false);
    setBillImages([]);
    setPurchaseInvoiceNo("");
    setPurchaseReceivedDate(new Date().toISOString().split("T")[0]);
    setPurchaseTotalValue(0);
    setOldStockInvoiceNo("");
    setOldStockReceivedDate(new Date().toISOString().split("T")[0]);
    setOldStockTotalValue(0);
    setDrafts([createDraft(draftCounter)]);
    setDraftVehicleMap({});
    setDraftCounter((current) => current + 1);
    setEditId(null);
    setIsHardEditing(false);
    try { localStorage.removeItem("sgv_inv_draft"); } catch { /* ignore */ }
    window.dispatchEvent(new CustomEvent("sgv:autosave", { detail: { status: "idle" } }));
    router.push("/inventory");
    fetchParts();
    } finally {
      setIsSaving(false);
      savingRef.current = false;
    }
  };

  const navigateToEdit = (p: any) => {
    router.push(`/inventory/${p.id}`);
  };

  const deletePart = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const part = parts.find((item) => item.id === id);
    if (part) setPartToDelete(part);
  };

  const confirmDeletePart = async () => {
    if (!partToDelete) return;
    const { error } = await supabase.from("spare_parts").delete().eq("id", partToDelete.id);
    if (error) {
      alert(error.message);
      return;
    }
    await logActivity({
      action: "delete",
      entityType: "spare_part",
      entityId: partToDelete.id,
      entityLabel: partToDelete.name,
      description: "Deleted spare part",
      metadata: { seller: partToDelete.seller, cat: partToDelete.cat },
    });
    setPartToDelete(null);
    fetchParts();
  };

  const filteredParts = parts.filter(p => {
    const q = searchQuery.toLowerCase();
    const matchQ = !q
      || p.name.toLowerCase().includes(q)
      || p.id.toLowerCase().includes(q)
      || String(p.barcode || "").toLowerCase().includes(q)
      || p.seller.toLowerCase().includes(q)
      || String(p.car_name || "").toLowerCase().includes(q)
      || String(p.cat || "").toLowerCase().includes(q)
      || String(p.parts_category || "").toLowerCase().includes(q);
    const resolvedPartsCategory = String(p.parts_category || "others");
    const matchCat = !catFilter || resolvedPartsCategory === catFilter;
    const matchBrand = !brandFilter || p.cat === brandFilter;
    const matchStk = !stockFilter || (stockFilter === 'low' && p.stock > 0 && p.stock <= p.threshold)
      || (stockFilter === 'ok' && p.stock > p.threshold)
      || (stockFilter === 'out' && p.stock === 0);
    return matchQ && matchCat && matchBrand && matchStk;
  });

  const filteredPartIds = filteredParts.map((part) => String(part.id));
  const allFilteredPartsSelected =
    filteredPartIds.length > 0 &&
    filteredPartIds.every((partId) => selectedInventoryPartIds.includes(partId));
  const selectedInventoryBarcodeRows: PrintableBarcodeRow[] = parts
    .filter((part) => selectedInventoryPartIds.includes(String(part.id)))
    .map((part) => ({
      id: String(part.id || "").trim(),
      barcode: normalizeBarcode(part.barcode),
      name: String(part.name || "").trim(),
    }))
    .filter((part) => part.id && part.name && part.barcode);

  const totalParts = parts.length;
  const inStock = parts.filter(p => p.stock > 0).length;
  const lowStock = parts.filter(p => p.stock > 0 && p.stock <= p.threshold).length;
  const inventoryValue = parts.reduce((acc, p) => acc + (p.cost * p.stock), 0);

  const formatMoney = (n: number) => "₹" + Number(n).toLocaleString("en-IN");
  const formatDate = (value: string) => {
    if (!value) return "—";
    return new Date(value).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };
  const draftBarcodeRows = drafts
    .filter((draft) => draft.name.trim())
    .map((draft) => ({
      id: resolvePartId(draft.partId, draft.name, draft.suffix),
      barcode: normalizeBarcode(draft.barcode),
      name: draft.name.trim(),
    }));

  useEffect(() => {
    setSelectedInventoryPartIds((current) =>
      current.filter((partId) => parts.some((part) => String(part.id) === partId)),
    );
  }, [parts]);
  const selectedVendorDetails = useMemo(() => {
    const key = normalizeVendorKey(form.seller);
    return key ? vendorDirectory[key] || null : null;
  }, [form.seller, vendorDirectory]);
  const batchVendorDetails = useMemo(() => {
    const key = normalizeVendorKey(batchSeller);
    return key ? vendorDirectory[key] || null : null;
  }, [batchSeller, vendorDirectory]);

  const handleBillImageChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    const allowedFiles = files.filter((file) => {
      const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
      return file.type.startsWith("image/") || isPdf;
    });
    if (allowedFiles.length !== files.length) {
      alert("Only image files or PDF files are allowed.");
    }
    if (allowedFiles.length > 3) {
      alert("You can upload maximum 3 bill files.");
      setBillImages(allowedFiles.slice(0, 3));
      return;
    }
    setBillImages(allowedFiles);
  };

  const removeBillImageAt = (index: number) => {
    setBillImages((current) => current.filter((_, fileIndex) => fileIndex !== index));
  };

  const downloadCanvas = (canvas: HTMLCanvasElement, filename: string) => {
    const link = document.createElement("a");
    link.href = canvas.toDataURL("image/png");
    link.download = filename;
    link.click();
  };

  const safeFile = (value: string) => value.replace(/[^a-zA-Z0-9-_]+/g, "_");
  const BARCODE_SHEET_WIDTH_MM = 105;
  const BARCODE_SHEET_LEFT_MM = 3;
  const BARCODE_SHEET_RIGHT_MM = 2;
  const BARCODE_SHEET_COLUMN_GAP_MM = 3;
  const BARCODE_SHEET_ROW_GAP_MM = 4;
  const BARCODE_LABEL_WIDTH_MM = 49;
  const BARCODE_LABEL_ALT_WIDTH_MM = 48;
  const BARCODE_LABEL_HEIGHT_MM = 30;
  const BARCODE_ROW_HEIGHT_MM = 34;
  const BARCODE_NAME_HEIGHT_MM = 2.6;
  const BARCODE_OBJECT_TOP_MM = 2.45;
  const BARCODE_OBJECT_LEFT_MM = 6;
  const BARCODE_OBJECT_WIDTH_MM = 34;
  const BARCODE_OBJECT_HEIGHT_MM = 22;

  const createBarcodeDataUrl = (barcode: string) => {
    const canvas = document.createElement("canvas");
    JsBarcode(canvas, barcode, {
      ...PRINT_BARCODE_RENDER_OPTIONS,
      margin: 0,
    });
    return canvas.toDataURL("image/png");
  };

  const escapeHtml = (value: string) =>
    String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");

  const buildBarcodeLabelMarkup = (row?: PrintableBarcodeRow | null) => {
    if (!row) {
      return `<div class="label empty"></div>`;
    }

    const imageUrl = createBarcodeDataUrl(row.barcode);
    return `
      <div class="label">
        <div class="label-name">${escapeHtml(row.name)}</div>
        <div class="barcode-block">
          <img src="${imageUrl}" alt="Barcode for ${safeFile(row.name || "spare-part")}" />
        </div>
      </div>
    `;
  };

  const printBarcodeSheet = (rows: PrintableBarcodeRow[], title: string) => {
    if (rows.length === 0) {
      alert("No barcodes available to print.");
      return;
    }

    const rowMarkup = Array.from({ length: Math.ceil(rows.length / 2) }, (_, index) => {
      const left = rows[index * 2] || null;
      const right = rows[index * 2 + 1] || null;

      return `
        <div class="row">
          ${buildBarcodeLabelMarkup(left)}
          ${buildBarcodeLabelMarkup(right)}
        </div>
      `;
    }).join("");

    const printWindow = window.open("", "_blank", "width=1200,height=900");
    if (!printWindow) {
      alert("Unable to open print window.");
      return;
    }

    printWindow.document.write(`
      <!doctype html>
      <html>
        <head>
          <title>${title}</title>
          <style>
            @page {
              size: landscape;
              margin: 0;
            }
            body {
              margin: 0;
              padding: 0;
              background: #ffffff;
              font-family: Arial, sans-serif;
              width: ${BARCODE_SHEET_WIDTH_MM}mm;
            }
            .sheet {
              width: ${BARCODE_SHEET_WIDTH_MM}mm;
              padding-top: 0;
              box-sizing: border-box;
            }
            .row {
              width: ${BARCODE_SHEET_WIDTH_MM}mm;
              height: ${BARCODE_ROW_HEIGHT_MM}mm;
              box-sizing: border-box;
              display: grid;
              grid-template-columns: ${BARCODE_LABEL_WIDTH_MM}mm ${BARCODE_LABEL_ALT_WIDTH_MM}mm;
              column-gap: ${BARCODE_SHEET_COLUMN_GAP_MM}mm;
              padding-left: ${BARCODE_SHEET_LEFT_MM}mm;
              padding-right: ${BARCODE_SHEET_RIGHT_MM}mm;
              align-items: start;
              margin-bottom: ${BARCODE_SHEET_ROW_GAP_MM}mm;
              page-break-inside: avoid;
              break-inside: avoid;
            }
            .row:last-child {
              margin-bottom: 0;
            }
            .label {
              width: 100%;
              height: ${BARCODE_LABEL_HEIGHT_MM}mm;
              min-width: 0;
              position: relative;
              overflow: hidden;
              box-sizing: border-box;
            }
            .label.empty {
              padding: 0;
            }
            .label-name {
              position: absolute;
              top: 0;
              left: 1mm;
              right: 1mm;
              height: ${BARCODE_NAME_HEIGHT_MM}mm;
              line-height: ${BARCODE_NAME_HEIGHT_MM}mm;
              font-size: 2.3mm;
              font-weight: 700;
              color: #000000;
              text-align: center;
              white-space: nowrap;
              overflow: hidden;
              text-overflow: ellipsis;
            }
            .barcode-block {
              position: absolute;
              top: ${BARCODE_OBJECT_TOP_MM}mm;
              left: ${BARCODE_OBJECT_LEFT_MM}mm;
              width: ${BARCODE_OBJECT_WIDTH_MM}mm;
              height: ${BARCODE_OBJECT_HEIGHT_MM}mm;
              overflow: hidden;
            }
            .barcode-block img {
              width: 100%;
              height: 100%;
              object-fit: contain;
              image-rendering: crisp-edges;
            }
            @media print {
              body { padding: 0; }
            }
          </style>
        </head>
        <body>
          <div class="sheet">${rowMarkup}</div>
          <script>
            window.onload = () => {
              window.print();
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const toggleInventoryPartSelection = (partId: string) => {
    setSelectedInventoryPartIds((current) =>
      current.includes(partId)
        ? current.filter((id) => id !== partId)
        : [...current, partId],
    );
  };

  const toggleSelectAllFilteredParts = () => {
    setSelectedInventoryPartIds((current) => {
      if (allFilteredPartsSelected) {
        return current.filter((partId) => !filteredPartIds.includes(partId));
      }
      const next = new Set(current);
      filteredPartIds.forEach((partId) => next.add(partId));
      return Array.from(next);
    });
  };

  const printSelectedInventoryBarcodes = () => {
    const printableRows = selectedInventoryBarcodeRows.filter((row) => row.barcode);
    if (printableRows.length === 0) {
      alert("Select inventory items with barcodes to print.");
      return;
    }
    printBarcodeSheet(printableRows, "Print Selected Barcodes");
  };

  const printSingleBarcode = (barcode: string, id: string, name: string) => {
    const rowMarkup = `
      <div class="row">
        ${buildBarcodeLabelMarkup({ id, barcode, name })}
        ${buildBarcodeLabelMarkup(null)}
      </div>
    `;
    const printWindow = window.open("", "_blank", "width=900,height=700");
    if (!printWindow) {
      alert("Unable to open print window.");
      return;
    }

    printWindow.document.write(`
      <!doctype html>
      <html>
        <head>
          <title>Print Barcode</title>
          <style>
            @page {
              size: landscape;
              margin: 0;
            }
            body {
              margin: 0;
              padding: 0;
              font-family: Arial, sans-serif;
              display: flex;
              align-items: flex-start;
              justify-content: flex-start;
              background: #fff;
              width: ${BARCODE_SHEET_WIDTH_MM}mm;
            }
            .row {
              width: ${BARCODE_SHEET_WIDTH_MM}mm;
              height: ${BARCODE_ROW_HEIGHT_MM}mm;
              box-sizing: border-box;
              display: grid;
              grid-template-columns: ${BARCODE_LABEL_WIDTH_MM}mm ${BARCODE_LABEL_ALT_WIDTH_MM}mm;
              column-gap: ${BARCODE_SHEET_COLUMN_GAP_MM}mm;
              padding-left: ${BARCODE_SHEET_LEFT_MM}mm;
              padding-right: ${BARCODE_SHEET_RIGHT_MM}mm;
              align-items: start;
            }
            .label {
              width: 100%;
              height: ${BARCODE_LABEL_HEIGHT_MM}mm;
              min-width: 0;
              position: relative;
              overflow: hidden;
              box-sizing: border-box;
            }
            .label.empty {
              padding: 0;
            }
            .label-name {
              position: absolute;
              top: 0;
              left: 1mm;
              right: 1mm;
              height: ${BARCODE_NAME_HEIGHT_MM}mm;
              line-height: ${BARCODE_NAME_HEIGHT_MM}mm;
              font-size: 2.3mm;
              font-weight: 700;
              color: #000000;
              text-align: center;
              white-space: nowrap;
              overflow: hidden;
              text-overflow: ellipsis;
            }
            .barcode-block {
              position: absolute;
              top: ${BARCODE_OBJECT_TOP_MM}mm;
              left: ${BARCODE_OBJECT_LEFT_MM}mm;
              width: ${BARCODE_OBJECT_WIDTH_MM}mm;
              height: ${BARCODE_OBJECT_HEIGHT_MM}mm;
              overflow: hidden;
            }
            .barcode-block img {
              width: 100%;
              height: 100%;
              object-fit: contain;
              image-rendering: crisp-edges;
            }
            @media print {
              body { padding: 0; }
            }
          </style>
        </head>
        <body>
          ${rowMarkup}
          <script>
            window.onload = () => {
              window.print();
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const printAllBarcodesOnePage = () => {
    printBarcodeSheet(draftBarcodeRows, "Print All Barcodes");
  };

  const formVehicleMatches = getVehicleMatches(form.carName);
  const formVehiclePopupNode =
    vehicleFormOpen &&
    vehicleFormPopup &&
    form.carName.trim().length > 0 &&
    typeof document !== "undefined"
      ? createPortal(
          <div
            className="fixed z-[9999] max-h-72 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-2xl"
            style={{
              top: vehicleFormPopup.top,
              left: vehicleFormPopup.left,
              width: vehicleFormPopup.width,
            }}
          >
            {formVehicleMatches.length > 0 ? (
              formVehicleMatches.map((vehicle, index) => (
                <button
                  key={vehicle.id}
                  type="button"
                  className={`flex w-full items-start justify-between border-b border-slate-100 px-3 py-2 text-left text-xs last:border-b-0 hover:bg-slate-50 ${
                    index === formVehicleIndex ? "bg-slate-50" : ""
                  }`}
                  onMouseDown={() => handleFormVehiclePick(vehicle)}
                  onMouseEnter={() => setFormVehicleIndex(index)}
                >
                  <div>
                    <div className="text-[11px] font-bold uppercase tracking-wider text-indigo-600">
                      {vehicle.car_id}
                    </div>
                    <div className="mt-0.5 text-xs font-semibold text-slate-900">
                      {vehicle.owner_name}
                    </div>
                    <div className="text-[11px] text-slate-500">
                      {vehicle.phone_number} · {vehicle.vehicle_reg}
                    </div>
                  </div>
                  <div className="text-[11px] text-slate-400">
                    {vehicle.make_model || "Vehicle"}
                  </div>
                </button>
              ))
            ) : (
              <div className="px-3 py-2 text-xs text-slate-500">No vehicles found</div>
            )}
          </div>,
          document.body,
        )
      : null;

  const activeDraft = activeVehicleRow === null
    ? null
    : drafts.find((draft) => draft.localId === activeVehicleRow) || null;
  const activeDraftMatches = activeDraft ? getVehicleMatches(activeDraft.carName) : [];
  const draftVehiclePopupNode =
    activeDraft &&
    vehicleDraftPopup &&
    activeDraft.carName.trim().length > 0 &&
    typeof document !== "undefined"
      ? createPortal(
          <div
            className="fixed z-[9999] max-h-72 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-2xl"
            style={{
              top: vehicleDraftPopup.top,
              left: vehicleDraftPopup.left,
              width: vehicleDraftPopup.width,
            }}
          >
            {activeDraftMatches.length > 0 ? (
              activeDraftMatches.map((vehicle, index) => (
                <button
                  key={vehicle.id}
                  type="button"
                  className={`flex w-full items-start justify-between border-b border-slate-100 px-3 py-2 text-left text-xs last:border-b-0 hover:bg-slate-50 ${
                    index === activeVehicleIndex ? "bg-slate-50" : ""
                  }`}
                  onMouseDown={() => handleVehiclePick(vehicle, activeDraft.localId)}
                  onMouseEnter={() => setActiveVehicleIndex(index)}
                >
                  <div>
                    <div className="text-[11px] font-bold uppercase tracking-wider text-indigo-600">
                      {vehicle.car_id}
                    </div>
                    <div className="mt-0.5 text-xs font-semibold text-slate-900">
                      {vehicle.owner_name}
                    </div>
                    <div className="text-[11px] text-slate-500">
                      {vehicle.phone_number} · {vehicle.vehicle_reg}
                    </div>
                  </div>
                  <div className="text-[11px] text-slate-400">
                    {vehicle.make_model || "Vehicle"}
                  </div>
                </button>
              ))
            ) : (
              <div className="px-3 py-2 text-xs text-slate-500">No vehicles found</div>
            )}
          </div>,
          document.body,
        )
      : null;

  return (
    <div
      className={activeTab === "parts" ? "" : "spare-scope page"}
      style={activeTab === "parts" ? undefined : { margin: "0 auto", padding: "40px" }}
    >

      {/* PARTS TAB */}
      {activeTab === "parts" ? (
      <div className="panel active">
        <div className="min-h-screen bg-[#f4f6fb] p-5 font-sans text-slate-900">
          <div className="min-h-[calc(100vh-40px)] rounded-[28px] border border-slate-200 bg-white shadow-[0_24px_60px_rgba(15,23,42,0.07)] overflow-hidden">
            <div className="px-8 py-6 flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold tracking-tight">Spare Parts Inventory</h1>
                <p className="mt-1 text-sm text-slate-500">Manage stock, pricing and low-stock alerts.</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  className="px-4 py-2.5 border border-amber-200 bg-amber-50 text-amber-700 rounded-lg text-sm font-semibold hover:bg-amber-100 transition-all"
                  onClick={() => void openPurchasePopup()}
                >
                  Payment Status
                </button>
                <button
                  className="px-5 py-2.5 bg-[#4f46e5] text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 transition-all flex items-center gap-2 shadow-sm"
                  onClick={() => router.push("/inventory/new/purchase")}
                >
                  <Plus className="w-4 h-4" />
                  Add New Part
                </button>
              </div>
            </div>

            <div className="grid overflow-hidden border-y border-slate-100 bg-slate-50/40 sm:grid-cols-2 xl:grid-cols-4">
              <div className="px-8 py-5 border-b border-slate-100 xl:border-b-0 xl:border-r">
                <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Total parts</div>
                <div className="mt-1 text-2xl font-black text-slate-900">{totalParts}</div>
              </div>
              <div className="px-8 py-5 border-b border-slate-100 sm:border-l xl:border-b-0 xl:border-l-0 xl:border-r">
                <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">In stock</div>
                <div className="mt-1 text-2xl font-black text-emerald-600">{inStock}</div>
              </div>
              <div className="px-8 py-5 border-b border-slate-100 xl:border-b-0 xl:border-r">
                <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Low stock</div>
                <div className="mt-1 text-2xl font-black text-amber-600">{lowStock}</div>
              </div>
              <div className="px-8 py-5 sm:border-l xl:border-l-0">
                <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Inventory value</div>
                <div className="mt-1 text-2xl font-black text-indigo-600">{formatMoney(inventoryValue)}</div>
              </div>
            </div>

            <div className="px-8 border-b border-slate-100 py-6 flex items-center justify-between bg-zinc-50/20">
              <div>
                <h2 className="text-sm font-black text-slate-800 uppercase tracking-widest italic">Inventory Records</h2>
                <p className="text-[10px] text-slate-400 font-bold mt-0.5">
                  Showing all spare parts in stock
                  {selectedInventoryPartIds.length > 0 ? ` · ${selectedInventoryPartIds.length} selected` : ""}
                </p>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  className="px-4 py-2 bg-slate-900 text-white rounded-lg text-sm font-semibold hover:bg-slate-800 transition-all shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
                  onClick={printSelectedInventoryBarcodes}
                  disabled={selectedInventoryBarcodeRows.length === 0}
                >
                  Print Selected Barcodes
                </button>
                <div className="relative group">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300 group-focus-within:text-[#4f46e5] transition-colors" />
                  <input
                    type="text"
                    placeholder="Search part, ID, barcode, seller or vehicle number..."
                    className="pl-9 pr-4 py-2 bg-white border border-slate-100 rounded-lg text-sm font-medium focus:ring-4 ring-indigo-500/5 focus:border-indigo-500 outline-none w-72 transition-all shadow-sm"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                  />
                </div>
                <select
                  className="px-4 py-2 bg-white border border-slate-100 rounded-lg text-sm font-medium text-slate-600 focus:ring-4 ring-indigo-500/5 focus:border-indigo-500 outline-none transition-all shadow-sm"
                  value={catFilter}
                  onChange={e => setCatFilter(e.target.value)}
                >
                  <option value="">All parts categories</option>
                  {PARTS_CATEGORY_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
                <select
                  className="px-4 py-2 bg-white border border-slate-100 rounded-lg text-sm font-medium text-slate-600 focus:ring-4 ring-indigo-500/5 focus:border-indigo-500 outline-none transition-all shadow-sm"
                  value={brandFilter}
                  onChange={e => setBrandFilter(e.target.value)}
                >
                  <option value="">All brands</option>
                  {Array.from(new Set(parts.map(p => p.cat))).filter(Boolean).map(c => <option key={c as string} value={c as string}>{c as string}</option>)}
                </select>
                <select
                  className="px-4 py-2 bg-white border border-slate-100 rounded-lg text-sm font-medium text-slate-600 focus:ring-4 ring-indigo-500/5 focus:border-indigo-500 outline-none transition-all shadow-sm"
                  value={stockFilter}
                  onChange={e => setStockFilter(e.target.value)}
                >
                  <option value="">All stock</option>
                  <option value="low">Low stock</option>
                  <option value="ok">In stock</option>
                  <option value="out">Out of stock</option>
                </select>
              </div>
            </div>

            <div className="px-8 pt-6">
              <div className="border border-slate-100 rounded-[24px] overflow-hidden shadow-sm bg-white">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100">
                      <th className="px-4 py-4 text-center">
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                          checked={allFilteredPartsSelected}
                          onChange={() => toggleSelectAllFilteredParts()}
                          aria-label="Select all filtered parts"
                        />
                      </th>
                      <th className="px-6 py-4 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Part ID</th>
                      <th className="px-6 py-4 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Part</th>
                      <th className="px-6 py-4 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Category</th>
                      <th className="px-6 py-4 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Cost</th>
                      <th className="px-6 py-4 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Selling</th>
                      <th className="px-6 py-4 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Margin</th>
                      <th className="px-6 py-4 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Stock</th>
                      <th className="px-6 py-4 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Status</th>
                      <th className="px-6 py-4 text-right pr-10 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {loading ? (
                      <tr>
                        <td colSpan={10} className="py-24">
                          <LoadingSpinner label="Retrieving inventory" />
                        </td>
                      </tr>
                    ) : filteredParts.map((p) => {
                      const badgeClass = p.stock === 0 ? "bg-rose-50 text-rose-600" : p.stock <= p.threshold ? "bg-amber-50 text-amber-600" : "bg-emerald-50 text-emerald-600";
                      const badgeTxt = p.stock === 0 ? "Out of stock" : p.stock <= p.threshold ? "Low stock" : "In stock";
                      const { marginAmount, marginPercent, mrpBase } = getPreTaxMargin(p.cost, p.sell, 18);
                      const purchaseInfo = partPurchaseSummary[String(p.name || "").trim().toLowerCase()];
                      const isSelected = selectedInventoryPartIds.includes(String(p.id));

                      return (
                        <tr key={p.id} onClick={() => navigateToEdit(p)} className="group hover:bg-slate-50/50 transition-colors cursor-pointer">
                          <td className="px-4 py-4 text-center" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                              checked={isSelected}
                              onChange={() => toggleInventoryPartSelection(String(p.id))}
                              aria-label={`Select ${p.name}`}
                            />
                          </td>
                          <td className="px-6 py-4">
                            <span className="font-bold text-[12px] text-indigo-600 tracking-tight">{p.id}</span>
                            {p.barcode ? (
                              <div className="mt-1 text-[10px] font-mono text-slate-500">{p.barcode}</div>
                            ) : null}
                          </td>
                          <td className="px-6 py-4">
                            <p className="font-bold text-sm text-slate-900 leading-tight">{p.name}</p>
                            <p className="text-[11px] text-slate-400 mt-1">
                              {p.seller} · By {p.profiles?.username || "Admin"}
                            </p>
                            {p.car_name ? (
                              <p className="text-[11px] text-sky-700 mt-1 font-semibold">
                                Vehicle No: {p.car_name}
                              </p>
                            ) : null}
                            {purchaseInfo ? (
                              <p className="mt-1 text-[10px] font-semibold text-slate-500">
                                {purchaseInfo.status === "Pending"
                                  ? `Payment Pending · Due ${formatMoney(purchaseInfo.dueAmount)}`
                                  : "Payment Paid"}{" "}
                                · {purchaseInfo.billCount > 0 ? `${purchaseInfo.billCount} Bill${purchaseInfo.billCount > 1 ? "s" : ""}` : "No Bill"}
                              </p>
                            ) : null}
                            {(purchaseInfo?.invoiceNo || purchaseInfo?.receivedDate) ? (
                              <p className="mt-0.5 text-[10px] text-indigo-500 font-semibold">
                                {purchaseInfo.invoiceNo ? `Invoice: ${purchaseInfo.invoiceNo}` : ""}
                                {purchaseInfo.invoiceNo && purchaseInfo.receivedDate ? " · " : ""}
                                {purchaseInfo.receivedDate ? `Received: ${formatDate(purchaseInfo.receivedDate)}` : ""}
                              </p>
                            ) : null}
                          </td>
                          <td className="px-6 py-4">
                            <p className="text-[11px] font-bold text-slate-500">{p.cat}</p>
                          </td>
                          <td className="px-6 py-4">
                            <p className="text-sm font-black text-slate-900 tracking-tight">{formatMoney(p.cost)}</p>
                          </td>
                          <td className="px-6 py-4">
                            <p className="text-sm font-black text-slate-900 tracking-tight">{formatMoney(p.sell)}</p>
                            <p className="mt-1 text-[10px] font-semibold text-slate-500">MRP ex tax {formatMoney(mrpBase)}</p>
                          </td>
                          <td className="px-6 py-4">
                            <p className={`text-sm font-black tracking-tight ${marginAmount >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                              {formatMoney(marginAmount)}
                            </p>
                            <p className={`mt-1 text-[10px] font-bold ${marginAmount >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                              {marginPercent >= 0 ? "+" : ""}{marginPercent}%
                            </p>
                          </td>
                          <td className="px-6 py-4">
                            <p className="text-sm font-black text-slate-900 tracking-tight">{p.stock}</p>
                          </td>
                          <td className="px-6 py-4">
                            <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${badgeClass}`}>
                              {badgeTxt}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right pr-10">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={(e) => { e.stopPropagation(); navigateToEdit(p); }}
                                className="p-1.5 hover:bg-indigo-50 rounded-lg text-slate-300 hover:text-indigo-600 transition-all  "
                                title="View part"
                              >
                                <Eye className="w-4 h-4" />
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); navigateToEdit(p); }}
                                className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-300 hover:text-slate-600 transition-all  "
                                title="Edit part"
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>
                              <button
                                onClick={(e) => deletePart(p.id, e)}
                                className="p-1.5 hover:bg-rose-50 rounded-lg text-slate-300 hover:text-rose-600 transition-all  "
                                title="Delete part"
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
                {filteredParts.length === 0 && !loading && (
                  <div className="py-20 text-center bg-white">
                    <div className="inline-flex w-16 h-16 bg-slate-50 rounded-full items-center justify-center mb-4">
                      <Package className="w-8 h-8 text-slate-200" />
                    </div>
                    <p className="font-bold text-slate-800">No parts found</p>
                    <button
                      onClick={() => {
                        setSearchQuery("");
                        setCatFilter("");
                        setStockFilter("");
                      }}
                      className="mt-2 text-blue-500 font-bold text-sm hover:underline"
                    >
                      Clear search and filters
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
      ) : null}
      {partToDelete ? (
        <ConfirmDeleteModal
          title="Delete Part?"
          description={`Delete ${partToDelete.name} (${partToDelete.id}). This action cannot be undone.`}
          confirmLabel="Delete Part"
          onConfirm={() => void confirmDeletePart()}
          onCancel={() => setPartToDelete(null)}
        />
      ) : null}

      {purchasePopupOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4">
          <div className="w-full max-w-4xl rounded-[24px] border border-slate-200 bg-white p-6 shadow-[0_24px_60px_rgba(15,23,42,0.18)]">
            <div className="mb-4 flex items-center justify-between gap-4">
              <div>
                <h3 className="text-xl font-bold tracking-tight text-slate-900">Purchase Payment Status</h3>
                <p className="mt-1 text-sm text-slate-500">Track supplier payment status and bills.</p>
              </div>
              <button
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
                onClick={() => {
                  setSelectedPurchaseSeller("");
                  setPurchasePopupOpen(false);
                }}
              >
                Close
              </button>
            </div>

            <input
              type="file"
              accept="image/*,application/pdf,.pdf"
              className="hidden"
              id="purchase-bill-upload-input"
              onChange={(event) => void handlePurchaseBillUpload(event)}
            />

            <div className="max-h-[62vh] overflow-hidden rounded-xl border border-slate-200">
              {purchaseLoading ? (
                <div className="p-8 text-center text-sm text-slate-500">Loading purchases...</div>
              ) : purchaseRows.length === 0 ? (
                <div className="p-8 text-center text-sm text-slate-500">No purchase records found.</div>
              ) : (
                <div className="flex h-[62vh] flex-col gap-3 p-3 md:flex-row">
                  <div className="md:w-[280px] md:shrink-0">
                    <div className="mb-2 space-y-2">
                      <input
                        type="text"
                        placeholder="Search seller..."
                        value={purchaseSellerQuery}
                        onChange={(event) => setPurchaseSellerQuery(event.target.value)}
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-[12px] outline-none focus:border-indigo-300"
                      />
                      <select
                        value={purchaseSellerSort}
                        onChange={(event) =>
                          setPurchaseSellerSort(event.target.value as "due_desc" | "name_asc")
                        }
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-[12px] outline-none focus:border-indigo-300"
                      >
                        <option value="due_desc">Sort: Highest Due</option>
                        <option value="name_asc">Sort: Seller Name</option>
                      </select>
                    </div>
                    <div className="mb-2 flex items-center justify-between">
                      <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                        Sellers
                      </div>
                      {selectedPurchaseSeller ? (
                        <button
                          type="button"
                          className="text-[11px] font-semibold text-indigo-600 hover:underline"
                          onClick={() => setSelectedPurchaseSeller("")}
                        >
                          Clear
                        </button>
                      ) : null}
                    </div>
                    <div className="h-full max-h-[52vh] space-y-2 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50/50 p-2">
                      {filteredSellerSummaryRows.map((sellerRow) => (
                        <button
                          key={sellerRow.seller}
                          type="button"
                          onClick={() => setSelectedPurchaseSeller(sellerRow.seller)}
                          className={`w-full rounded-lg border px-3 py-2 text-left transition-all ${
                            selectedPurchaseSeller === sellerRow.seller
                              ? "border-indigo-200 bg-indigo-50"
                              : "border-slate-200 bg-white hover:border-slate-300"
                          }`}
                        >
                          <div className="text-sm font-semibold text-slate-900">{sellerRow.seller}</div>
                          <div className="mt-1 text-[11px] font-semibold text-amber-700">
                            Total payment: {formatMoney(sellerRow.dueAmount)}
                          </div>
                        </button>
                      ))}
                      {filteredSellerSummaryRows.length === 0 ? (
                        <div className="px-2 py-1 text-[12px] text-slate-500">No sellers found.</div>
                      ) : null}
                    </div>
                  </div>

                  <div className="min-h-0 flex-1">
                    {!selectedSellerGroup ? (
                      <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/50 p-6 text-center text-sm text-slate-500">
                        Select a seller to open details.
                      </div>
                    ) : (
                      <div className="h-full rounded-xl border border-slate-200 bg-white p-3">
                        <div className="mb-3 flex items-center justify-between">
                          <div className="text-left text-sm font-bold text-slate-900">
                            {selectedSellerGroup.seller}
                          </div>
                          <div className="text-sm font-semibold text-amber-700">
                            Total payment: {formatMoney(selectedSellerGroup.pendingTotal)}
                          </div>
                        </div>
                        <div className="max-h-[43vh] space-y-2 overflow-y-auto pr-1">
                          {pagedPurchaseRows.map((row) => (
                            <div key={row.id} className="rounded-lg border border-slate-100 bg-slate-50/40 p-3">
                              <div className="text-sm font-semibold text-slate-900">{row.description}</div>
                              <div className="mt-1 text-[12px] text-slate-600">
                                {formatDate(row.date)} · Original {formatMoney(row.originalAmount)} · Paid {formatMoney(row.paidAmount)} · Due {formatMoney(row.pendingAmount)}
                              </div>
                              <div className="mt-1 text-[12px] text-slate-600">
                                Seller: {row.seller === "—" ? "Unknown seller" : row.seller} · Parts: {row.partNames.length ? row.partNames.join(", ") : "—"}
                              </div>
                              <div className="mt-2 flex flex-wrap gap-2">
                                {row.mode === "credit" && row.pendingAmount > 0 ? (
                                  <>
                                    <button
                                      className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-60"
                                      onClick={() => void markCreditAsPaid(row, "cash")}
                                      disabled={purchaseActionId === row.id}
                                    >
                                      Pay Cash
                                    </button>
                                    <button
                                      className="rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1.5 text-[11px] font-semibold text-indigo-700 hover:bg-indigo-100 disabled:opacity-60"
                                      onClick={() => void markCreditAsPaid(row, "upi")}
                                      disabled={purchaseActionId === row.id}
                                    >
                                      Pay EFT
                                    </button>
                                  </>
                                ) : null}
                                <button
                                  className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                                  onClick={() => {
                                    setBillUploadTargetId(row.id);
                                    const input = document.getElementById("purchase-bill-upload-input") as HTMLInputElement | null;
                                    input?.click();
                                  }}
                                  disabled={purchaseActionId === row.id}
                                >
                                  Upload Bill
                                </button>
                                {row.billUrls[0] ? (
                                  <button
                                    className="rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1.5 text-[11px] font-semibold text-indigo-700 hover:bg-indigo-100"
                                    onClick={() => window.open(row.billUrls[0], "_blank")}
                                  >
                                    View Bill
                                  </button>
                                ) : null}
                              </div>
                            </div>
                          ))}
                        </div>
                        {purchaseDetailTotalPages > 1 ? (
                          <div className="mt-2 flex items-center justify-between">
                            <div className="text-[11px] text-slate-500">
                              Page {purchaseDetailPage} of {purchaseDetailTotalPages}
                            </div>
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() =>
                                  setPurchaseDetailPage((current) => Math.max(1, current - 1))
                                }
                                disabled={purchaseDetailPage <= 1}
                                className="rounded border border-slate-200 px-2 py-1 text-[11px] text-slate-600 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                Prev
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  setPurchaseDetailPage((current) =>
                                    Math.min(purchaseDetailTotalPages, current + 1),
                                  )
                                }
                                disabled={purchaseDetailPage >= purchaseDetailTotalPages}
                                className="rounded border border-slate-200 px-2 py-1 text-[11px] text-slate-600 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                Next
                              </button>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {/* ADD PART TAB */}
      {activeTab === "add" ? (
      <div className="panel active">
        <div className="form-heading">
          <h2>{editId ? 'Edit spare part' : 'Add new spare part'}</h2>
          <p>{editId ? `Editing ${editId} — ${form.name}` : 'Fill in multiple spare parts below. Part IDs are auto-generated on save.'}</p>
        </div>
        {editId ? (
        <div className="form-grid">
          {(() => {
            const purchaseInfo = partPurchaseSummary[String(form.name || "").trim().toLowerCase()];
            const resolvedFormPartId = resolvePartId(form.partId, form.name);
            const resolvedFormBarcode = isValidBarcode(normalizeBarcode(form.barcode))
              ? normalizeBarcode(form.barcode)
              : "";
            const barcodeValue = resolvedFormBarcode || resolvedFormPartId;
            return (
              <>
                <input
                  type="file"
                  accept="image/*,application/pdf,.pdf"
                  className="hidden"
                  id="detail-bill-upload-input"
                  onChange={(event) => void handlePurchaseBillUpload(event)}
                />
          <div className="form-field">
            <label className="f-label">Part ID <span>* custom or auto-generated</span></label>
            <input className="f-input mono" type="text" placeholder="Leave blank for auto ID" value={form.partId} onChange={e => setForm({ ...form, partId: e.target.value })} />
            <div className="margin-hint" style={{ color: "#475569" }}>
              <svg fill="none" viewBox="0 0 14 14"><circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.2" /><path d="M7 4.5v3.5M7 9.5v.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" /></svg>
              <span>Resolved ID: {resolvedFormPartId}</span>
            </div>
          </div>
          <div className="form-field">
            <label className="f-label">Part name <span>*</span></label>
            <input className="f-input" list="part-names-list" autoComplete="off" type="text" placeholder="e.g. Brake Pad Set" value={form.name} onChange={handlePartNameChange} />
            <datalist id="part-names-list">
              {parts.map(p => <option key={p.id} value={p.name} />)}
            </datalist>
          </div>
          <div className="form-field">
            <label className="f-label">Parts category <span>*</span></label>
            <select
              className="f-input"
              value={form.partsCategory}
              onChange={e => setForm({ ...form, partsCategory: e.target.value })}
            >
              <option value="">Select category</option>
              {PARTS_CATEGORY_OPTIONS.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </div>
          <div className="form-field">
            <label className="f-label">Brand name <span>*</span></label>
            <input className="f-input" list="brand-list" type="text" placeholder="maruthisuzuki" value={form.cat} onChange={e => updateFormBrand(e.target.value)} />
            <datalist id="brand-list">
              <option value="Bosch" />
              <option value="Exide" />
              <option value="Amaron" />
              <option value="Minda" />
              <option value="TVS" />
              <option value="Valeo" />
              <option value="Gates" />
              <option value="common" />
              {Array.from(new Set(parts.map(p => p.cat))).filter(Boolean).map(c => <option key={c as string} value={c as string} />)}
            </datalist>
          </div>
          <div className="form-field">
            <label className="f-label">Model name <span>(auto)</span></label>
            <input
              className={`f-input ${isCommonBrand(form.cat) ? "cursor-not-allowed bg-slate-50 text-slate-400" : ""}`}
              type="text"
              placeholder={isCommonBrand(form.cat) ? "Disabled for common brand" : "Swift"}
              value={form.modelName}
              onChange={e => setForm({ ...form, modelName: e.target.value })}
              disabled={isCommonBrand(form.cat)}
            />
          </div>
          <div className="form-field">
            <label className="f-label">Vehicle number <span>*</span></label>
            <input
              className="f-input"
              type="text"
              placeholder="TN 01 AB 1234"
              autoComplete="off"
              value={form.carName}
              ref={vehicleFormInputRef}
              onChange={e => {
                const nextValue = e.target.value;
                setForm({ ...form, carName: nextValue });
                if (formVehicle) {
                  const currentValue = resolveVehicleName(formVehicle).toLowerCase();
                  if (currentValue !== nextValue.trim().toLowerCase()) {
                    setFormVehicle(null);
                  }
                }
                openVehicleFormPopup();
              }}
              onFocus={() => {
                openVehicleFormPopup();
              }}
              onBlur={() =>
                window.setTimeout(() => {
                  closeVehicleFormPopup();
                }, 150)
              }
              onKeyDown={handleFormVehicleKeyDown}
            />
          </div>
          <div className="form-field">
            <label className="f-label">Seller / Supplier name <span>*</span></label>
            <input className="f-input" list="supplier-names-list" type="text" placeholder="e.g. Murugan Suppliers" value={form.seller} onChange={e => setForm({ ...form, seller: e.target.value })} />
            <datalist id="supplier-names-list">
              {vendorOptions.map(s => <option key={s} value={s} />)}
            </datalist>
            {form.seller ? (
              <div className="text-[11px] text-slate-500">
                {selectedVendorDetails ? (
                  <>
                    Vendor ID: <span className="font-mono">{selectedVendorDetails.vendor_id || "—"}</span>
                    {" · "}Phone: <span className="font-mono">{selectedVendorDetails.phone || "—"}</span>
                    {" · "}GSTIN: <span className="font-mono">{selectedVendorDetails.gstin || "—"}</span>
                  </>
                ) : (
                  "No vendor details saved for this supplier."
                )}
              </div>
            ) : null}
          </div>
          <div className="form-field">
            <label className="f-label">Barcode <span>(scannable)</span></label>
            <div className="inline-block rounded-lg border border-slate-200 bg-white p-3">
              <Barcode
                value={barcodeValue}
                {...BARCODE_RENDER_OPTIONS}
              />
            </div>
            <div className="mt-2 flex items-center gap-2">
              <button
                type="button"
                className="rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1.5 text-[11px] font-semibold text-indigo-700 hover:bg-indigo-100"
                onClick={() => printSingleBarcode(barcodeValue, resolvedFormPartId, form.name || "part")}
              >
                Print Barcode
              </button>
            </div>
          </div>
          <div className="form-field">
            <label className="f-label">Payment Status <span>(purchase)</span></label>
            {purchaseInfo ? (
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                <p className="text-[12px] font-semibold text-slate-800">
                  {purchaseInfo.status === "Pending" ? `Pending · Due ${formatMoney(purchaseInfo.dueAmount)}` : "Paid"}
                </p>
                <p className="mt-1 text-[11px] text-slate-500">
                  Bills: {purchaseInfo.billCount}
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <button
                    type="button"
                    className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                    onClick={() => {
                      setBillUploadTargetId(purchaseInfo.purchaseId);
                      const input = document.getElementById("detail-bill-upload-input") as HTMLInputElement | null;
                      input?.click();
                    }}
                  >
                    Upload Bill
                  </button>
                  {purchaseInfo.billUrls[0] ? (
                    <button
                      type="button"
                      className="rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1.5 text-[11px] font-semibold text-indigo-700 hover:bg-indigo-100"
                      onClick={() => window.open(purchaseInfo.billUrls[0], "_blank")}
                    >
                      View Bill
                    </button>
                  ) : null}
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-500">
                No purchase payment info found for this part.
              </div>
            )}
          </div>
              </>
            );
          })()}
          <div className="form-divider"></div>
          <div className="form-field">
            <label className="f-label">Before tax (₹) <span>* base purchase price</span></label>
            <div className="rupee-wrap">
              <span className="rupee-sym">₹</span>
              <input
                className="rupee-input"
                type="number"
                min="0"
                step="0.01"
                placeholder="0"
                value={getTaxBreakdown(form.cost, form.taxRate).baseAmount || ''}
                onChange={e => setForm({ ...form, cost: getTotalFromBaseAmount(Number(e.target.value), form.taxRate) })}
              />
            </div>
          </div>
          <div className="form-field">
            <label className="f-label">Incl tax (%) <span>* editable tax rate</span></label>
            <div className="relative">
              <input
                className="f-input mono pr-8"
                type="number"
                min="0"
                step="0.01"
                placeholder="18"
                value={form.taxRate || ''}
                onChange={e => setForm({ ...form, taxRate: Number(e.target.value) })}
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[12px] font-semibold text-slate-500">%</span>
            </div>
            <div className="margin-hint" style={{ color: "#475569" }}>
              <svg fill="none" viewBox="0 0 14 14"><circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.2" /><path d="M7 4.5v3.5M7 9.5v.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" /></svg>
              <span>Tax amount: ₹{getTaxBreakdown(form.cost, form.taxRate).taxAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
          </div>
          <div className="form-field">
            <label className="f-label">Cost price (₹) <span>* after tax</span></label>
            <div className="rupee-wrap">
              <span className="rupee-sym">₹</span>
              <input
                className="rupee-input"
                type="number"
                min="0"
                step="0.01"
                placeholder="0"
                value={form.cost || ''}
                onChange={e => setForm({ ...form, cost: Number(e.target.value) })}
              />
            </div>
          </div>
          <div className="form-field">
            <label className="f-label">MRP (₹) <span>* selling price incl tax</span></label>
            <div className="rupee-wrap">
              <span className="rupee-sym">₹</span>
              <input className="rupee-input" type="number" min="0" placeholder="0" value={form.sell || ''} onChange={e => setForm({ ...form, sell: Number(e.target.value) })} />
            </div>
            {form.cost > 0 && form.sell > 0 && (
              <div className="margin-hint" style={{ color: getPreTaxMargin(form.cost, form.sell, form.taxRate).marginAmount >= 0 ? '#16a34a' : '#dc2626' }}>
                <svg fill="none" viewBox="0 0 14 14"><circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.2" /><path d="M4.5 7l2 2 3-3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                <span>
                  Margin: ₹{getPreTaxMargin(form.cost, form.sell, form.taxRate).marginAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ({getPreTaxMargin(form.cost, form.sell, form.taxRate).marginPercent >= 0 ? "+" : ""}{getPreTaxMargin(form.cost, form.sell, form.taxRate).marginPercent}%)
                  {" "}· MRP before tax ₹{getPreTaxMargin(form.cost, form.sell, form.taxRate).mrpBase.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            )}
          </div>
          <div className="form-field">
            <label className="f-label">Margin (%) <span>* editable margin</span></label>
            <div className="relative">
              <input
                className="f-input mono pr-8"
                type="number"
                step="0.01"
                placeholder="0"
                value={form.cost > 0 || form.sell > 0 ? getPreTaxMargin(form.cost, form.sell, form.taxRate).marginPercent : ''}
                onChange={e => setForm({ ...form, sell: getSellFromMarginPercent(form.cost, Number(e.target.value), form.taxRate) })}
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[12px] font-semibold text-slate-500">%</span>
            </div>
            <div className="margin-hint" style={{ color: "#475569" }}>
              <svg fill="none" viewBox="0 0 14 14"><circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.2" /><path d="M7 4.5v3.5M7 9.5v.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" /></svg>
              <span>Updating margin changes the MRP automatically.</span>
            </div>
          </div>
          <div className="form-divider"></div>
          <div className="form-field">
            <label className="f-label">Opening stock <span>* units</span></label>
            <input className="f-input mono" type="number" min="0" placeholder="1" value={form.stock || ''} onChange={e => setForm({ ...form, stock: Number(e.target.value) })} />
          </div>
          <div className="form-field">
            <label className="f-label">Alert stock limit <span>* set warning level</span></label>
            <input className="f-input mono" type="number" min="0" placeholder="1" value={form.threshold || ''} onChange={e => setForm({ ...form, threshold: Number(e.target.value) })} />
            <div className="margin-hint" style={{ color: "#d97706" }}>
              <svg fill="none" viewBox="0 0 14 14"><circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.2" /><path d="M7 4.5v3.5M7 9.5v.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" /></svg>
              <span>Low stock alert appears when stock falls below this limit.</span>
            </div>
          </div>
        </div>
        ) : (
        <div className="space-y-6">
          <div className="rounded-[22px] border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="text-base font-bold text-slate-900">Stock Entry Type</h3>
            <p className="mt-1 text-xs text-slate-500">Choose if this is a fresh purchase or existing old stock.</p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => handleStockEntryModeChange("purchase")}
                className={`rounded-lg border px-4 py-2 text-xs font-semibold transition-all ${
                  stockEntryMode === "purchase"
                    ? "border-indigo-300 bg-indigo-50 text-indigo-700"
                    : "border-slate-200 text-slate-600 hover:bg-slate-50"
                }`}
              >
                New Purchase
              </button>
              <button
                type="button"
                onClick={() => handleStockEntryModeChange("old_stock")}
                className={`rounded-lg border px-4 py-2 text-xs font-semibold transition-all ${
                  stockEntryMode === "old_stock"
                    ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                    : "border-slate-200 text-slate-600 hover:bg-slate-50"
                }`}
              >
                Add Old Stock
              </button>
              <button
                type="button"
                onClick={() => handleStockEntryModeChange("add_bill")}
                className={`rounded-lg border px-4 py-2 text-xs font-semibold transition-all ${
                  stockEntryMode === "add_bill"
                    ? "border-amber-300 bg-amber-50 text-amber-700"
                    : "border-slate-200 text-slate-600 hover:bg-slate-50"
                }`}
              >
                Whole Bill
              </button>
            </div>
            {stockEntryMode === "old_stock" ? (
              <div className="mt-3 inline-flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">
                <span>No seller, purchase details, or account/credit entry will be created.</span>
              </div>
            ) : null}
            {stockEntryMode === "add_bill" ? (
              <div className="mt-4 border-t border-slate-100 pt-4">
                <h4 className="text-sm font-bold text-slate-900">Bill Details</h4>
                <p className="mt-0.5 text-xs text-slate-500">Record the bill reference for this old stock entry.</p>
                <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div>
                    <label className="f-label">Invoice Number</label>
                    <input
                      className="f-input"
                      type="text"
                      placeholder="e.g. INV-2024-001"
                      value={oldStockInvoiceNo}
                      onChange={e => setOldStockInvoiceNo(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="f-label">Invoice Date</label>
                    <input
                      className="f-input"
                      type="date"
                      value={oldStockReceivedDate}
                      onChange={e => setOldStockReceivedDate(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="f-label">Total Bill Value (₹)</label>
                    <div className="rupee-wrap">
                      <span className="rupee-sym">₹</span>
                      <input
                        className="rupee-input"
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="0"
                        value={oldStockTotalValue || ""}
                        onChange={e => setOldStockTotalValue(Number(e.target.value))}
                      />
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          <div className="rounded-[22px] border border-slate-200 bg-white p-6 shadow-sm">
            <div className="form-grid">
              <div className="form-field">
                <label className="f-label">
                  Seller / Supplier name <span>* applies to all parts below</span>
                  {stockEntryMode === "old_stock" ? (
                    <span className="ml-2 text-[11px] font-semibold text-emerald-600">(Disabled for old stock)</span>
                  ) : null}
                </label>
                <input
                  className={`f-input ${stockEntryMode === "old_stock" ? "cursor-not-allowed opacity-60" : ""}`}
                  list="bulk-supplier-list"
                  type="text"
                  placeholder="e.g. Murugan Suppliers"
                  value={batchSeller}
                  onChange={e => setBatchSeller(e.target.value)}
                  disabled={stockEntryMode === "old_stock"}
                />
                <datalist id="bulk-supplier-list">
                  {vendorOptions.map(s => <option key={s} value={s} />)}
                </datalist>
                {stockEntryMode !== "old_stock" && batchSeller.trim() ? (
                  <div className="mt-2 text-[11px] text-slate-500">
                    {batchVendorDetails ? (
                      <>
                        Vendor ID: <span className="font-mono">{batchVendorDetails.vendor_id || "—"}</span>
                        {" · "}Phone: <span className="font-mono">{batchVendorDetails.phone || "—"}</span>
                        {" · "}GSTIN: <span className="font-mono">{batchVendorDetails.gstin || "—"}</span>
                      </>
                    ) : (
                      "No vendor details saved for this supplier."
                    )}
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          {stockEntryMode !== "add_bill" && <div className="rounded-[22px] border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-4">
              <h3 className="text-base font-bold text-slate-900">Spare Parts</h3>
              <p className="mt-1 text-xs text-slate-500">Add each spare part as a row, similar to invoice part entry.</p>
            </div>

            <div className="overflow-x-auto overflow-y-visible">
              <table className="w-full min-w-[1400px] border-collapse">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="px-2 py-2 text-left text-[11px] font-bold uppercase tracking-wider text-slate-400">Part ID</th>
                    <th className="px-2 py-2 text-left text-[11px] font-bold uppercase tracking-wider text-slate-400">Part Name</th>
                    <th className="px-2 py-2 text-left text-[11px] font-bold uppercase tracking-wider text-slate-400">Parts Category</th>
                    <th className="px-2 py-2 text-left text-[11px] font-bold uppercase tracking-wider text-slate-400">Brand Name</th>
                    <th className="px-2 py-2 text-left text-[11px] font-bold uppercase tracking-wider text-slate-400">Model Name</th>
                    <th className="px-2 py-2 text-left text-[11px] font-bold uppercase tracking-wider text-slate-400">Vehicle No</th>
                    <th className="px-2 py-2 text-center text-[11px] font-bold uppercase tracking-wider text-slate-400">Before Tax</th>
                    <th className="px-2 py-2 text-center text-[11px] font-bold uppercase tracking-wider text-slate-400">Incl Tax (%)</th>
                    <th className="px-2 py-2 text-left text-[11px] font-bold uppercase tracking-wider text-slate-400">Cost (₹)</th>
                    <th className="px-2 py-2 text-left text-[11px] font-bold uppercase tracking-wider text-slate-400">MRP (₹)</th>
                    <th className="px-2 py-2 text-left text-[11px] font-bold uppercase tracking-wider text-slate-400">Margin (%)</th>
                    <th className="px-2 py-2 text-left text-[11px] font-bold uppercase tracking-wider text-slate-400">Stock</th>
                    <th className="px-2 py-2 text-left text-[11px] font-bold uppercase tracking-wider text-slate-400">Alert</th>
                    <th className="px-2 py-2 text-right text-[11px] font-bold uppercase tracking-wider text-slate-400">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {drafts.map((draft, index) => (
                    <tr key={draft.localId} className="align-top">
                      <td className="px-2 py-2">
                        <input
                          className="f-input mono"
                          type="text"
                          placeholder={getDynamicId(draft.name, draft.suffix)}
                          value={draft.partId}
                          onChange={e => updateDraftField(draft.localId, "partId", e.target.value)}
                          data-type="draft-part"
                          data-row={index}
                          data-field="partId"
                          onKeyDown={(e) => handleDraftGridKeyDown(e, index, "partId")}
                        />
                      </td>
                      <td className="px-2 py-2">
                        <input
                          className="f-input"
                          type="text"
                          placeholder="Brake Pad Set"
                          value={draft.name}
                          onChange={e => updateDraftField(draft.localId, "name", e.target.value)}
                          data-type="draft-part"
                          data-row={index}
                          data-field="name"
                          onKeyDown={(e) => handleDraftGridKeyDown(e, index, "name")}
                        />
                      </td>
                      <td className="px-2 py-2">
                        <select
                          className="f-input"
                          value={draft.partsCategory}
                          onChange={e => updateDraftField(draft.localId, "partsCategory", e.target.value)}
                          data-type="draft-part"
                          data-row={index}
                          data-field="partsCategory"
                          onKeyDown={(e) => handleDraftGridKeyDown(e, index, "partsCategory")}
                        >
                          <option value="">Select</option>
                          {PARTS_CATEGORY_OPTIONS.map((option) => (
                            <option key={option} value={option}>{option}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-2 py-2">
                        <input
                          className="f-input"
                          list={`brand-list-${draft.localId}`}
                          type="text"
                          placeholder="maruthisuzuki"
                          value={draft.cat}
                          onChange={e => updateDraftBrand(draft.localId, e.target.value)}
                          data-type="draft-part"
                          data-row={index}
                          data-field="cat"
                          onKeyDown={(e) => handleDraftGridKeyDown(e, index, "cat")}
                        />
                        <datalist id={`brand-list-${draft.localId}`}>
                          <option value="Bosch" />
                          <option value="Exide" />
                          <option value="Amaron" />
                          <option value="Minda" />
                          <option value="TVS" />
                          <option value="Valeo" />
                          <option value="Gates" />
                          <option value="common" />
                          {Array.from(new Set(parts.map(p => p.cat))).filter(Boolean).map(c => <option key={c as string} value={c as string} />)}
                        </datalist>
                      </td>
                      <td className="px-2 py-2">
                        <input
                          className={`f-input ${isCommonBrand(draft.cat) ? "cursor-not-allowed bg-slate-50 text-slate-400" : ""}`}
                          type="text"
                          placeholder={isCommonBrand(draft.cat) ? "Disabled for common brand" : "Swift"}
                          value={draft.modelName}
                          onChange={e => updateDraftField(draft.localId, "modelName", e.target.value)}
                          disabled={isCommonBrand(draft.cat)}
                          data-type="draft-part"
                          data-row={index}
                          data-field="modelName"
                          onKeyDown={(e) => handleDraftGridKeyDown(e, index, "modelName")}
                        />
                      </td>
                      <td className="px-2 py-2">
                        <div className="relative">
                          <input
                            className="f-input"
                            type="text"
                            placeholder="TN 01 AB 1234"
                            value={draft.carName}
                            onChange={e => {
                              const nextValue = e.target.value;
                              updateDraftField(draft.localId, "carName", nextValue);
                              const selectedVehicle = draftVehicleMap[draft.localId];
                              if (selectedVehicle) {
                                const currentValue = resolveVehicleName(selectedVehicle).toLowerCase();
                                if (currentValue !== nextValue.trim().toLowerCase()) {
                                  setDraftVehicleMap((current) => {
                                    const next = { ...current };
                                    next[draft.localId] = null;
                                    return next;
                                  });
                                }
                              }
                              openVehicleDraftPopup(draft.localId);
                            }}
                            onFocus={() => {
                              openVehicleDraftPopup(draft.localId);
                            }}
                            onBlur={() =>
                              window.setTimeout(() => {
                                closeVehicleDraftPopup(draft.localId);
                              }, 150)
                            }
                            ref={(node) => {
                              if (node) {
                                vehicleDraftInputRefs.current.set(draft.localId, node);
                              } else {
                                vehicleDraftInputRefs.current.delete(draft.localId);
                              }
                            }}
                            data-type="draft-part"
                            data-row={index}
                            data-field="carName"
                            onKeyDown={(e) =>
                              handleVehicleInputKeyDown(e, index, draft.localId, draft.carName)
                            }
                          />
                        </div>
                      </td>
                      <td className="px-2 py-2 text-center">
                        {(() => {
                          const { baseAmount } = getTaxBreakdown(draft.cost, draft.taxRate);
                          return (
                            <input
                              className="f-input mono text-center"
                              type="number"
                              min="0"
                              step="0.01"
                              placeholder="0"
                              value={baseAmount || ""}
                              onChange={e =>
                                updateDraftField(
                                  draft.localId,
                                  "cost",
                                  getTotalFromBaseAmount(Number(e.target.value), draft.taxRate),
                                )
                              }
                              data-type="draft-part"
                              data-row={index}
                              data-field="cost"
                              onKeyDown={(e) => handleDraftGridKeyDown(e, index, "cost")}
                            />
                          );
                        })()}
                      </td>
                      <td className="px-2 py-2 text-center">
                        {(() => {
                          return (
                            <div className="relative">
                              <input
                                className="f-input mono pr-7 text-center"
                                type="number"
                                min="0"
                                step="0.01"
                                placeholder="18"
                                value={draft.taxRate || ""}
                                onChange={e =>
                                  updateDraftField(
                                    draft.localId,
                                    "taxRate",
                                    Number(e.target.value),
                                  )
                                }
                                data-type="draft-part"
                                data-row={index}
                                data-field="taxRate"
                                onKeyDown={(e) => handleDraftGridKeyDown(e, index, "taxRate")}
                              />
                              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[12px] font-semibold text-slate-500">
                                %
                              </span>
                            </div>
                          );
                        })()}
                      </td>
                      <td className="px-2 py-2">
                        <input
                          className="f-input mono"
                          type="number"
                          min="0"
                          step="0.01"
                          placeholder="0"
                          value={draft.cost || ""}
                          onChange={e =>
                            updateDraftField(draft.localId, "cost", Number(e.target.value))
                          }
                          data-type="draft-part"
                          data-row={index}
                          data-field="cost"
                          onKeyDown={(e) => handleDraftGridKeyDown(e, index, "cost")}
                        />
                      </td>
                      <td className="px-2 py-2">
                        <input
                          className="f-input mono"
                          type="number"
                          min="0"
                          placeholder="0"
                          value={draft.sell || ""}
                          onChange={e => updateDraftField(draft.localId, "sell", Number(e.target.value))}
                          data-type="draft-part"
                          data-row={index}
                          data-field="sell"
                          onKeyDown={(e) => handleDraftGridKeyDown(e, index, "sell")}
                        />
                      </td>
                      <td className="px-2 py-2">
                        {(() => {
                          const margin = getPreTaxMargin(draft.cost, draft.sell, draft.taxRate);
                          return (
                            <div className="space-y-1">
                              <div className="relative">
                                <input
                                  className="f-input mono pr-7"
                                  type="number"
                                  step="0.01"
                                  placeholder="0"
                                  value={draft.cost > 0 || draft.sell > 0 ? margin.marginPercent : ""}
                                  onChange={e =>
                                    updateDraftField(
                                      draft.localId,
                                      "sell",
                                      getSellFromMarginPercent(draft.cost, Number(e.target.value), draft.taxRate),
                                    )
                                  }
                                  data-type="draft-part"
                                  data-row={index}
                                  data-field="margin"
                                  onKeyDown={(e) => handleDraftGridKeyDown(e, index, "margin")}
                                />
                                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[12px] font-semibold text-slate-500">
                                  %
                                </span>
                              </div>
                              <div className={`text-[10px] font-bold ${margin.marginAmount >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                                ₹{margin.marginAmount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} · MRP ex tax ₹{margin.mrpBase.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </div>
                            </div>
                          );
                        })()}
                      </td>
                      <td className="px-2 py-2">
                        <input
                          className="f-input mono"
                          type="number"
                          min="0"
                          placeholder="0"
                          value={draft.stock || ""}
                          onChange={e => updateDraftField(draft.localId, "stock", Number(e.target.value))}
                          data-type="draft-part"
                          data-row={index}
                          data-field="stock"
                          onKeyDown={(e) => handleDraftGridKeyDown(e, index, "stock")}
                        />
                      </td>
                      <td className="px-2 py-2">
                        <input
                          className="f-input mono"
                          type="number"
                          min="0"
                          placeholder="1"
                          value={draft.threshold || ""}
                          onChange={e => updateDraftField(draft.localId, "threshold", Number(e.target.value))}
                          data-type="draft-part"
                          data-row={index}
                          data-field="threshold"
                          onKeyDown={(e) => handleDraftGridKeyDown(e, index, "threshold")}
                        />
                      </td>
                      <td className="px-2 py-2 text-right">
                        <button
                          type="button"
                          onClick={() => removeDraft(draft.localId)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 px-2.5 py-1.5 text-[11px] font-semibold text-rose-600 transition-all hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-40"
                          disabled={drafts.length === 1}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>}

          {stockEntryMode !== "add_bill" && <button
            type="button"
            onClick={addAnotherDraft}
            className="inline-flex items-center gap-2 rounded-xl border border-indigo-200 px-4 py-3 text-sm font-semibold text-indigo-600 transition-all hover:bg-indigo-50"
          >
            <Plus className="w-4 h-4" />
            Add another spare part
          </button>}

          <div className="rounded-[22px] border border-slate-200 bg-white p-6 shadow-sm">
            {stockEntryMode === "purchase" ? (
              <>
                <h3 className="text-base font-bold text-slate-900">Purchase Details</h3>
                <p className="mt-1 text-xs text-slate-500">Choose purchase mode and attach up to 3 bill images.</p>
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setShowCashCarryModePicker(true)}
                    className={`rounded-lg border px-4 py-2 text-xs font-semibold transition-all ${
                      purchaseMode === "cash_carry"
                        ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                        : "border-slate-200 text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    Cash & Carry
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPurchaseMode("credit");
                      setShowCashCarryModePicker(false);
                    }}
                    className={`rounded-lg border px-4 py-2 text-xs font-semibold transition-all ${
                      purchaseMode === "credit"
                        ? "border-amber-300 bg-amber-50 text-amber-700"
                        : "border-slate-200 text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    Credit
                  </button>
                </div>
                {purchaseMode === "cash_carry" ? (
                  <div className="mt-3 inline-flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">
                    <span>Payment Mode:</span>
                    <span>{cashCarryPaymentMode === "cash" ? "Cash" : "EFT"}</span>
                  </div>
                ) : (
                  <div className="mt-3 inline-flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700">
                    <span>Credit due only.</span>
                    <span>No cash or bank entry until payment is made.</span>
                  </div>
                )}

                <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div>
                    <label className="f-label">Invoice Number <span>(from supplier bill)</span></label>
                    <input
                      className="f-input"
                      type="text"
                      placeholder="e.g. INV-2024-001"
                      value={purchaseInvoiceNo}
                      onChange={e => setPurchaseInvoiceNo(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="f-label">Invoice Date</label>
                    <input
                      className="f-input"
                      type="date"
                      value={purchaseReceivedDate}
                      onChange={e => setPurchaseReceivedDate(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="f-label">Total Bill Value (₹)</label>
                    <div className="rupee-wrap">
                      <span className="rupee-sym">₹</span>
                      <input
                        className="rupee-input"
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="0"
                        value={purchaseTotalValue || ""}
                        onChange={e => setPurchaseTotalValue(Number(e.target.value))}
                      />
                    </div>
                  </div>
                </div>

                <div className="mt-5">
                  <label className="f-label">Bill Files <span>(max 3)</span></label>
                  <div className="mt-2 flex items-center gap-3">
                    <label className="inline-flex cursor-pointer items-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:bg-indigo-700">
                      Upload Bills
                      <input
                        type="file"
                        accept="image/*,application/pdf,.pdf"
                        multiple
                        onChange={handleBillImageChange}
                        className="hidden"
                      />
                    </label>
                    <span className="text-xs text-slate-500">Image or PDF, up to 3 files</span>
                  </div>
                  {billImages.length > 0 ? (
                    <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
                      {billImages.map((file, index) => (
                        <div key={`${file.name}-${index}`} className="rounded-lg border border-indigo-200 bg-indigo-50 p-2">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="truncate text-[11px] font-medium text-slate-700">{file.name}</p>
                              <p className="mt-1 text-[10px] text-slate-500">{Math.round(file.size / 1024)} KB</p>
                            </div>
                            <button
                              type="button"
                              onClick={() => removeBillImageAt(index)}
                              className="rounded border border-rose-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-rose-600 hover:bg-rose-50"
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-2 text-[11px] text-slate-400">No bill files selected.</p>
                  )}
                </div>
              </>
            ) : null}
          </div>

          {showCashCarryModePicker ? (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 px-4">
              <div className="w-full max-w-sm rounded-[24px] border border-slate-200 bg-white p-6 shadow-2xl">
                <h3 className="text-lg font-bold text-slate-900">Choose Payment Mode</h3>
                <p className="mt-1 text-sm text-slate-500">Select how this cash and carry purchase was paid.</p>
                <div className="mt-5 grid gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setPurchaseMode("cash_carry");
                      setCashCarryPaymentMode("cash");
                      setShowCashCarryModePicker(false);
                    }}
                    className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-left text-sm font-semibold text-emerald-700 transition-all hover:bg-emerald-100"
                  >
                    Cash
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPurchaseMode("cash_carry");
                      setCashCarryPaymentMode("upi");
                      setShowCashCarryModePicker(false);
                    }}
                    className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-left text-sm font-semibold text-sky-700 transition-all hover:bg-sky-100"
                  >
                    EFT
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => setShowCashCarryModePicker(false)}
                  className="mt-4 w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 transition-all hover:bg-slate-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : null}

          {stockEntryMode !== "add_bill" && <div className="rounded-[22px] border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="text-base font-bold text-slate-900">Generated Barcodes</h3>
            <p className="mt-1 text-xs text-slate-500">Barcodes are generated from spare part IDs before save.</p>
            {draftBarcodeRows.length > 0 ? (
              <div className="mt-3">
                <button
                  type="button"
                  onClick={printAllBarcodesOnePage}
                  className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 transition-all hover:bg-indigo-100"
                >
                  Print All (One Page)
                </button>
              </div>
            ) : null}
            {draftBarcodeRows.length > 0 ? (
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {draftBarcodeRows.map((row) => (
                  <div key={row.id} className="rounded-lg border border-slate-200 bg-white p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-xs font-semibold text-slate-700">{row.name}</p>
                        <p className="mt-0.5 text-[11px] font-mono text-indigo-600">{row.id}</p>
                        <p className="mt-0.5 text-[11px] font-mono text-slate-500">{row.barcode}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => printSingleBarcode(row.barcode, row.id, row.name)}
                        className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-semibold text-slate-700 hover:bg-slate-100"
                      >
                        Print
                      </button>
                    </div>
                    <div className="mt-2 rounded border border-slate-200 bg-white p-2">
                      <Barcode
                        value={row.barcode}
                        {...BARCODE_RENDER_OPTIONS}
                      />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-[11px] text-slate-400">Add part names to preview generated barcodes.</p>
            )}
          </div>}
        </div>
        )}
        <div className="form-actions">
          <button className="btn-save" onClick={handleSavePart} disabled={uploadingBills || isSaving}>
            <svg fill="none" viewBox="0 0 16 16"><path d="M13 2H3a1 1 0 00-1 1v10a1 1 0 001 1h10a1 1 0 001-1V5l-3-3z" stroke="currentColor" strokeWidth="1.3" /><path d="M9 2v3H5V2M5 9h6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /></svg>
            {uploadingBills ? "Uploading bills..." : isSaving ? "Saving..." : editId ? "Save part" : `Save ${drafts.length} part${drafts.length > 1 ? "s" : ""}`}
          </button>
          <button className="btn-cancel-form" onClick={() => router.push("/inventory")}>Cancel</button>
        </div>
      </div>
      ) : null}
      {formVehiclePopupNode}
      {draftVehiclePopupNode}
    </div>
  );
}

export default function InventoryPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <InventoryContent />
    </Suspense>
  );
}
