"use client";

import React, { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import toast from "react-hot-toast";
import {
  ArrowLeft,
  CarFront,
  ChevronRight,
  Download,
  Edit2,
  Eye,
  FileText,
  Loader2,
  Plus,
  Search,
  Trash2,
  Upload,
  Warehouse,
  X,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { uploadToCloudinary } from "@/lib/cloudinary";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { ConfirmDeleteModal } from "@/components/ConfirmDeleteModal";
import { logActivity } from "@/lib/activity-log";

type OrderStatus = "pending" | "completed" | "rejected";

const INHOUSE_VEHICLE: VehicleRecord = {
  id: "inhouse-inventory",
  car_id: "INHOUSE",
  owner_name: "Inhouse Inventory",
  phone_number: "—",
  vehicle_reg: "Internal",
  make_model: "Purpose",
};

interface VehicleRecord {
  id: string;
  car_id: string;
  owner_name: string;
  phone_number: string;
  vehicle_reg: string;
  make_model?: string | null;
}

interface SparePartRecord {
  id: string;
  name: string;
  cost: number;
  stock: number;
  cat?: string | null;
  barcode?: string | null;
}

interface OrderRecord {
  id: string;
  supplier: string;
  part: string;
  qty: number;
  total: number;
  mode: string;
  bill: boolean;
  bill_url: string | null;
  date: string;
  status: OrderStatus;
  created_at?: string;
  profiles?: {
    username?: string;
  } | null;
}

interface OrderPartRow {
  id: string;
  partId: string;
  name: string;
  qty: number;
  unitPrice: number;
  tax: number;
  totalWithTax: number;
  stock: number | null;
  isCustom: boolean;
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

function clampNumber(value: number, min: number, max: number) {
  if (Number.isNaN(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function roundValue(value: number) {
  return Math.round(Number(value) || 0);
}

function isBarcodeColumnMissing(error?: { message?: string; details?: string; code?: string }) {
  const code = String(error?.code || "");
  const message = String(error?.message || "");
  const details = String(error?.details || "");
  const text = `${message} ${details}`.toLowerCase();
  return (
    code === "PGRST204" ||
    code === "42703" ||
    (text.includes("barcode") && (text.includes("schema cache") || text.includes("does not exist")))
  );
}

function createCustomPartId(name: string, suffix: number) {
  const cleanName = String(name || "").replace(/[^a-zA-Z0-9]/g, "");
  const pre = ((cleanName || "CUS") + "XXX").substring(0, 3).toUpperCase();
  return `Sgv${pre}/${suffix}`;
}

function generatePartSuffix() {
  return Math.floor(1000 + Math.random() * 9000);
}

async function getNextPurchaseOrderIds(count: number) {
  const { data, error } = await supabase
    .from("spare_orders")
    .select("id")
    .ilike("id", "PO-%")
    .order("id", { ascending: false })
    .limit(1);

  if (error) {
    throw error;
  }

  const latest = data?.[0]?.id || "";
  const match = latest.match(/PO-(\d+)/i);
  const base = Number(match?.[1] || 0);
  const start = Number.isFinite(base) && base > 0 ? base + 1 : 1;

  return Array.from({ length: count }, (_, index) => `PO-${String(start + index).padStart(6, "0")}`);
}

function resolvePartIdSuffix(existingPartId: string, fallback: number) {
  const match = String(existingPartId || "").match(/\/(\d{4,})$/);
  const parsed = Number(match?.[1] || "");
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  return fallback;
}

function syncOrderPartRow(
  row: OrderPartRow,
  options: { useTotalWithTax?: boolean } = {},
) {
  const qty = clampNumber(Number(row.qty) || 1, 1, Math.max(1, row.stock || 9999));
  let unitPrice = Math.max(0, Number(row.unitPrice) || 0);
  let baseTotal = roundValue(qty * unitPrice);
  let tax = roundValue(baseTotal * TAX_RATE);
  let totalWithTax = baseTotal + tax;

  if (options.useTotalWithTax) {
    totalWithTax = Math.max(roundValue(Number(row.totalWithTax) || 0), 0);
    baseTotal = roundValue(totalWithTax / (1 + TAX_RATE));
    tax = Math.max(totalWithTax - baseTotal, 0);
    unitPrice = qty > 0 ? Number((baseTotal / qty).toFixed(2)) : 0;
  }

  return {
    ...row,
    qty,
    unitPrice,
    tax,
    totalWithTax,
  };
}

function emptyPartRow(id = "row-0", partId = ""): OrderPartRow {
  return syncOrderPartRow({
    id,
    partId,
    name: "",
    qty: 1,
    unitPrice: 0,
    tax: 0,
    totalWithTax: 0,
    stock: null,
    isCustom: true,
  });
}

function OrdersContent() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const slug = params?.slug as string[] | undefined;
  const prefillQuery = searchParams?.toString() || "";
  const prefillAppliedRef = useRef<string>("");

  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [vehicles, setVehicles] = useState<VehicleRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [viewOrder, setViewOrder] = useState<OrderRecord | null>(null);
  const [orderToDelete, setOrderToDelete] = useState<OrderRecord | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"" | OrderStatus>("");
  const [saving, setSaving] = useState(false);
  const [uploadingBill, setUploadingBill] = useState(false);

  const [supplier, setSupplier] = useState("");
  const [orderDate, setOrderDate] = useState(todayValue());
  const [orderStatus, setOrderStatus] = useState<OrderStatus>("pending");
  const [billIncluded, setBillIncluded] = useState(false);
  const [billUrl, setBillUrl] = useState("");
  const [vehicleNote, setVehicleNote] = useState("");

  const [vehicleQuery, setVehicleQuery] = useState("");
  const [vehicleResults, setVehicleResults] = useState<VehicleRecord[]>([]);
  const [vehicleOpen, setVehicleOpen] = useState(false);
  const [vehicleLoading, setVehicleLoading] = useState(false);
  const [selectedVehicle, setSelectedVehicle] = useState<VehicleRecord | null>(null);
  const [activeVehicleIndex, setActiveVehicleIndex] = useState(0);

  const [partQuery, setPartQuery] = useState("");
  const [partResults, setPartResults] = useState<SparePartRecord[]>([]);
  const [partOpen, setPartOpen] = useState(false);
  const [partLoading, setPartLoading] = useState(false);
  const [partRows, setPartRows] = useState<OrderPartRow[]>([emptyPartRow()]);
  const [customPartCounter, setCustomPartCounter] = useState(1);
  const vehicleSearchRef = useRef<HTMLDivElement | null>(null);

  const vehicleMap = useMemo(
    () => new Map(vehicles.map((vehicle) => [vehicle.car_id, vehicle])),
    [vehicles],
  );

  function saveDraft() {
    if (!isAdding || editId) return;
    window.dispatchEvent(new CustomEvent("sgv:autosave", { detail: { status: "saving" } }));
    try {
      localStorage.setItem("sgv_ord_draft", JSON.stringify({
        supplier,
        orderDate,
        orderStatus,
        vehicleNote,
        partRows,
        selectedVehicleId: selectedVehicle?.id || null,
      }));
      window.dispatchEvent(new CustomEvent("sgv:autosave", { detail: { status: "saved" } }));
    } catch {
      window.dispatchEvent(new CustomEvent("sgv:autosave", { detail: { status: "idle" } }));
    }
  }

  function resetDraft() {
    setSupplier("");
    setOrderDate(todayValue());
    setOrderStatus("pending");
    setBillIncluded(false);
    setBillUrl("");
    setVehicleNote("");
    setVehicleQuery("");
    setVehicleResults([]);
    setVehicleOpen(false);
    setSelectedVehicle(null);
    setPartQuery("");
    setPartResults([]);
    setPartOpen(false);
    setPartRows([emptyPartRow()]);
    setCustomPartCounter(1);
    try { localStorage.removeItem("sgv_ord_draft"); } catch { /* ignore */ }
    window.dispatchEvent(new CustomEvent("sgv:autosave", { detail: { status: "idle" } }));
  }

  function applyRouteState(rows: OrderRecord[]) {
    if (slug && slug.length > 0) {
      if (slug[0] === "new" || slug[0] === "add-new") {
        setIsAdding(true);
        setViewOrder(null);
        if (!editId) {
          resetDraft();
        }
        return;
      }

      const id = slug.join("/");
      const order = rows.find((item) => item.id === id) || null;
      if (order) {
        setViewOrder(order);
        setIsAdding(false);
        setEditId(null);
        return;
      }
    }

    if (!editId) {
      setIsAdding(false);
      setViewOrder(null);
    }
  }

  async function fetchOrders() {
    setLoading(true);

    const [{ data: orderData, error: orderError }, { data: vehicleData }] = await Promise.all([
      supabase
        .from("spare_orders")
        .select("*, profiles(username)")
        .order("date", { ascending: false }),
      supabase
        .from("vehicles")
        .select("id, car_id, owner_name, phone_number, vehicle_reg, make_model")
        .order("created_at", { ascending: false }),
    ]);

    const rows = !orderError && orderData ? (orderData as OrderRecord[]) : [];
    setOrders(rows);
    const vehicleList = (vehicleData || []) as VehicleRecord[];
    const alreadyHasInhouse = vehicleList.some(v => v.car_id === INHOUSE_VEHICLE.car_id);
    setVehicles(alreadyHasInhouse ? vehicleList : [INHOUSE_VEHICLE, ...vehicleList]);
    applyRouteState(rows);
    setLoading(false);
  }

  useEffect(() => {
    void fetchOrders();
  }, [slug]);

  useEffect(() => {
    saveDraft();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdding, editId, supplier, orderDate, orderStatus, vehicleNote, partRows, selectedVehicle]);

  useEffect(() => {
    if (!slug || (slug[0] !== "new" && slug[0] !== "add-new")) {
      prefillAppliedRef.current = "";
      return;
    }
    const query = new URLSearchParams(prefillQuery);
    if (query.get("prefill") !== "1") {
      prefillAppliedRef.current = "";
      return;
    }
    if (prefillAppliedRef.current === prefillQuery) return;
    prefillAppliedRef.current = prefillQuery;

    const prefillSupplier = (query.get("supplier") || "").trim();
    const prefillPartId = (query.get("part_id") || "").trim();
    const prefillPartName = (query.get("part") || "").trim();
    const prefillQty = Math.max(1, Number(query.get("qty") || 1) || 1);
    const prefillTotal = Math.max(0, Number(query.get("total") || 0) || 0);
    const prefillUnitCost = prefillQty > 0 ? Number((prefillTotal / prefillQty).toFixed(2)) : 0;

    setIsAdding(true);
    setViewOrder(null);
    setEditId(null);
    resetDraft();
    setSupplier(prefillSupplier);
    setSelectedVehicle(INHOUSE_VEHICLE);
    setVehicleQuery("");
    setVehicleResults([]);
    setVehicleOpen(false);
    setActiveVehicleIndex(0);

    let active = true;
    const applyPrefill = async () => {
      if (prefillPartId) {
        const { data } = await supabase
          .from("spare_parts")
          .select("id, name, cat, cost, stock")
          .eq("id", prefillPartId)
          .maybeSingle();

        if (!active) return;
        if (data) {
          const row = syncOrderPartRow({
            id: data.id,
            partId: data.id,
            name: data.name,
            qty: prefillQty,
            unitPrice: Number(data.cost || 0),
            tax: roundValue(Number(data.cost || 0) * TAX_RATE),
            totalWithTax: roundValue(Number(data.cost || 0) * (1 + TAX_RATE)),
            stock: data.stock ?? null,
            isCustom: false,
          });
          setPartRows([row]);
          return;
        }
      }

      if (prefillPartName) {
        const suffix = generatePartSuffix();
        const row = syncOrderPartRow({
          id: `row-${suffix}`,
          partId: createCustomPartId(prefillPartName, suffix),
          name: prefillPartName,
          qty: prefillQty,
          unitPrice: prefillUnitCost > 0 ? prefillUnitCost : 0,
          tax: roundValue((prefillUnitCost > 0 ? prefillUnitCost : 0) * TAX_RATE),
          totalWithTax: roundValue((prefillUnitCost > 0 ? prefillUnitCost : 0) * (1 + TAX_RATE)),
          stock: null,
          isCustom: true,
        });
        setPartRows([row]);
      }
    };

    void applyPrefill();
    return () => {
      active = false;
    };
  }, [prefillQuery, slug]);

  useEffect(() => {
    const query = vehicleQuery.trim().toLowerCase();
    if (!query) {
      setVehicleResults([]);
      setVehicleLoading(false);
      setVehicleOpen(false);
      return;
    }

    const timer = window.setTimeout(() => {
      setVehicleLoading(true);
      const results = vehicles
        .filter((vehicle) => {
          return (
            vehicle.car_id.toLowerCase().includes(query) ||
            vehicle.owner_name.toLowerCase().includes(query) ||
            vehicle.phone_number.toLowerCase().includes(query) ||
            vehicle.vehicle_reg.toLowerCase().includes(query)
          );
        })
        .slice(0, 8);

      setVehicleResults(results);
      setVehicleOpen(true);
      setVehicleLoading(false);
    }, 180);

    return () => window.clearTimeout(timer);
  }, [vehicleQuery, selectedVehicle, vehicles]);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!vehicleSearchRef.current?.contains(event.target as Node)) {
        setVehicleOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  useEffect(() => {
    if (partQuery.trim().length < 1) {
      setPartResults([]);
      setPartLoading(false);
      return;
    }

    const query = partQuery.trim();
    const timer = window.setTimeout(async () => {
      setPartLoading(true);
      let data: SparePartRecord[] | null = null;
      let error: any = null;
      {
        const response = await supabase
          .from("spare_parts")
          .select("id, name, cat, cost, stock, barcode")
          .or(`name.ilike.%${query}%,id.ilike.%${query}%,barcode.ilike.%${query}%,cat.ilike.%${query}%`)
          .limit(8);
        data = response.data as SparePartRecord[] | null;
        error = response.error;
      }

      if (error && isBarcodeColumnMissing(error)) {
        const response = await supabase
          .from("spare_parts")
          .select("id, name, cat, cost, stock")
          .or(`name.ilike.%${query}%,id.ilike.%${query}%,cat.ilike.%${query}%`)
          .limit(8);
        data = response.data as SparePartRecord[] | null;
        error = response.error;
      }

      if (error) {
        setPartResults([]);
      } else {
        const usedIds = new Set(
          partRows.filter((row) => row.partId).map((row) => row.partId),
        );
        setPartResults(
          ((data || []) as SparePartRecord[]).filter((part) => !usedIds.has(part.id)),
        );
        setPartOpen(true);
      }
      setPartLoading(false);
    }, 180);

    return () => window.clearTimeout(timer);
  }, [partQuery, partRows]);

  async function handleBillUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploadingBill(true);
    try {
      const url = await uploadToCloudinary(file, {
        kind: "bill",
        folder: "siragirvel/bills",
      });
      setBillIncluded(true);
      setBillUrl(url);
      toast.success("Bill uploaded");
    } catch {
      toast.error("Failed to upload bill");
      setBillIncluded(false);
      setBillUrl("");
    } finally {
      setUploadingBill(false);
    }
  }

  function selectVehicle(vehicle: VehicleRecord) {
    setSelectedVehicle(vehicle);
    setVehicleQuery("");
    setVehicleResults([]);
    setVehicleOpen(false);
    setActiveVehicleIndex(0);
    setVehicleNote("");
  }

  function clearVehicle() {
    setSelectedVehicle(null);
    setVehicleQuery("");
    setVehicleResults([]);
    setVehicleOpen(false);
    setActiveVehicleIndex(0);
    setVehicleNote("");
  }

  const handleVehicleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      setVehicleOpen(false);
      return;
    }

    if (!vehicleOpen || vehicleResults.length === 0) {
      if (vehicleQuery.trim() && (e.key === "ArrowDown" || (e.key === "Enter" && !vehicleOpen))) {
        e.preventDefault();
        setVehicleOpen(true);
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
    }
  };

  function addPart(part: SparePartRecord) {
    setPartRows((current) => [
      ...current,
      syncOrderPartRow({
        id: part.id,
        partId: part.id,
        name: part.name,
        qty: 1,
        unitPrice: part.cost,
        tax: roundValue(part.cost * TAX_RATE),
        totalWithTax: roundValue(part.cost * (1 + TAX_RATE)),
        stock: part.stock,
        isCustom: false,
      }),
    ]);
    setPartQuery("");
    setPartResults([]);
    setPartOpen(false);
  }

  function addCustomPart() {
    const customId = `custom-spare-${customPartCounter}`;
    const suffix = generatePartSuffix();
    const customPartId = createCustomPartId("", suffix);
    setCustomPartCounter((current) => current + 1);
    setPartRows((current) => [...current, emptyPartRow(customId, customPartId)]);
  }

  function updatePartRow(
    index: number,
    field: "name" | "qty" | "unitPrice" | "totalWithTax",
    value: string,
  ) {
    setPartRows((current) =>
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

        const nextRow = {
          ...row,
          [field]: Math.max(0, Number(value) || 0),
        } as OrderPartRow;

        if (field === "totalWithTax") {
          return syncOrderPartRow(nextRow, { useTotalWithTax: true });
        }

        return syncOrderPartRow(nextRow);
      }),
    );
  }

  function removePart(index: number) {
    setPartRows((current) => {
      const next = current.filter((_, rowIndex) => rowIndex !== index);
      return next.length ? next : [emptyPartRow()];
    });
  }

  function openPrefilledSpareCreation(order: OrderRecord) {
    const vehicle = vehicleMap.get(order.mode || "");
    const vehicleName = vehicle
      ? `${vehicle.owner_name} (${vehicle.car_id})`
      : order.mode || "General";
    const params = new URLSearchParams({
      prefill: "1",
      source_order_id: order.id,
      supplier: order.supplier || "",
      part: order.part || "",
      qty: String(order.qty || 1),
      total: String(order.total || 0),
      vehicle: vehicleName,
    });
    router.push(`/inventory/new/purchase?${params.toString()}`);
  }

  async function updateOrderStatus(order: OrderRecord, nextStatus: OrderStatus) {
    if (order.status === nextStatus) return;

    const { error } = await supabase
      .from("spare_orders")
      .update({ status: nextStatus })
      .eq("id", order.id);

    if (error) {
      toast.error(error.message);
      return;
    }

    await logActivity({
      action: "edit",
      entityType: "spare_order",
      entityId: order.id,
      entityLabel: `${order.supplier} - ${order.part}`,
      description: "Updated spare order status",
      metadata: { status: nextStatus },
    });

    setOrders((current) =>
      current.map((row) =>
        row.id === order.id ? { ...row, status: nextStatus } : row,
      ),
    );
    if (viewOrder?.id === order.id) {
      setViewOrder({ ...order, status: nextStatus });
    }
    if (nextStatus === "completed") {
      toast.success("Opening spare creation with prefilled data");
      openPrefilledSpareCreation({ ...order, status: nextStatus });
      return;
    }
    toast.success("Order status updated");
  }

  async function handleSaveOrder() {
    const validRows = partRows.filter(
      (row) => row.name.trim() && row.qty > 0 && row.totalWithTax > 0,
    );

    if (!supplier.trim()) {
      toast.error("Please enter supplier name.");
      return;
    }

    if (!selectedVehicle) {
      toast.error("Please select a vehicle or purpose.");
      return;
    }

    if (validRows.length === 0) {
      toast.error("Please add at least one spare row.");
      return;
    }

    setSaving(true);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const trimmedVehicleNote = vehicleNote.trim();

      if (editId) {
        const row = validRows[0];
        const payload = {
          supplier: supplier.trim(),
          part: row.name.trim(),
          qty: row.qty,
          total: row.totalWithTax,
          mode: selectedVehicle.car_id,
          date: orderDate,
          bill: billIncluded,
          bill_url: billUrl || null,
          status: orderStatus,
        };

        const { error } = await supabase
          .from("spare_orders")
          .update(payload)
          .eq("id", editId);

        if (error) throw error;

        await logActivity({
          action: "edit",
          entityType: "spare_order",
          entityId: editId,
          entityLabel: `${payload.supplier} - ${payload.part}`,
          description: "Edited spare order",
          metadata: payload,
        });
      } else {
        const newIds = await getNextPurchaseOrderIds(validRows.length);
        const payload = validRows.map((row, index) => ({
          id: newIds[index],
          supplier: supplier.trim(),
          part: row.name.trim(),
          qty: row.qty,
          total: row.totalWithTax,
          mode: selectedVehicle.car_id,
          date: orderDate,
          bill: billIncluded,
          bill_url: billUrl || null,
          status: orderStatus,
          created_by: user?.id,
        }));

        const { error } = await supabase.from("spare_orders").insert(payload);
        if (error) throw error;

        await logActivity({
          action: "create",
          entityType: "spare_order",
          entityId: payload[0]?.id || "spare-order-batch",
          entityLabel: supplier.trim(),
          description: `Created ${payload.length} spare order row(s)`,
          metadata: {
            vehicle_car_id: selectedVehicle.car_id,
            status: orderStatus,
            rows: payload.map((row) => ({
              id: row.id,
              part: row.part,
              qty: row.qty,
              total: row.total,
            })),
          },
        });
      }

      if (trimmedVehicleNote && selectedVehicle && selectedVehicle.id !== "inhouse-inventory") {
        try {
          const { data, error } = await supabase
            .from("vehicles")
            .select("work_description")
            .eq("id", selectedVehicle.id)
            .maybeSingle();

          if (error) throw error;

          const existing = String(data?.work_description || "").trim();
          const nextDescription = existing
            ? `${existing} | Note: ${trimmedVehicleNote}`
            : `Note: ${trimmedVehicleNote}`;

          const { error: updateError } = await supabase
            .from("vehicles")
            .update({ work_description: nextDescription })
            .eq("id", selectedVehicle.id);

          if (updateError) throw updateError;
        } catch (error) {
          console.error("Failed to append vehicle note", error);
        }
      }

      toast.success(editId ? "Spare order updated" : "Spare rows saved");
      setEditId(null);
      router.push("/orders");
      resetDraft();
      void fetchOrders();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to save spare order";
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }

  function handleEditOrder(order: OrderRecord) {
    const suffix = generatePartSuffix();
    const customPartId = createCustomPartId(order.part || "", suffix);
    setCustomPartCounter((current) => current + 1);
    setEditId(order.id);
    setViewOrder(null);
    setIsAdding(true);
    setSupplier(order.supplier || "");
    setOrderDate(order.date || todayValue());
    setOrderStatus((order.status || "pending") as OrderStatus);
    setBillIncluded(Boolean(order.bill_url || order.bill));
    setBillUrl(order.bill_url || "");
    setVehicleNote("");

    const vehicle = vehicleMap.get(order.mode || "");
    setSelectedVehicle(vehicle || null);
    setVehicleQuery("");
    setPartQuery("");
    setPartResults([]);
    setPartOpen(false);
    setPartRows([
      syncOrderPartRow({
        id: order.id,
        partId: customPartId,
        name: order.part || "",
        qty: Math.max(1, Number(order.qty) || 1),
        unitPrice:
          Math.max(0, Number(order.total) || 0) /
          Math.max(1, Number(order.qty) || 1),
        tax: 0,
        totalWithTax: Math.max(0, Number(order.total) || 0),
        stock: null,
        isCustom: true,
      }, { useTotalWithTax: true }),
    ]);
  }

  async function confirmDeleteOrder() {
    if (!orderToDelete) return;

    const { error } = await supabase
      .from("spare_orders")
      .delete()
      .eq("id", orderToDelete.id);

    if (error) {
      toast.error(error.message);
      return;
    }

    await logActivity({
      action: "delete",
      entityType: "spare_order",
      entityId: orderToDelete.id,
      entityLabel: `${orderToDelete.supplier} - ${orderToDelete.part}`,
      description: "Deleted spare order",
      metadata: {
        total: orderToDelete.total,
        vehicle_car_id: orderToDelete.mode,
      },
    });

    setOrderToDelete(null);
    toast.success("Spare row deleted");
    void fetchOrders();
  }

  const filteredOrders = orders.filter((order) => {
    const query = searchQuery.trim().toLowerCase();
    const vehicle = vehicleMap.get(order.mode || "");

    const matchesSearch =
      !query ||
      order.id.toLowerCase().includes(query) ||
      order.supplier.toLowerCase().includes(query) ||
      order.part.toLowerCase().includes(query) ||
      (order.mode || "").toLowerCase().includes(query) ||
      vehicle?.owner_name.toLowerCase().includes(query) ||
      vehicle?.vehicle_reg.toLowerCase().includes(query);

    const matchesStatus = !statusFilter || order.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const totalSpent = orders.reduce((sum, order) => sum + Number(order.total || 0), 0);
  const pendingCount = orders.filter((order) => order.status === "pending").length;
  const completedCount = orders.filter((order) => order.status === "completed").length;
  const rejectedCount = orders.filter((order) => order.status === "rejected").length;
  const previewRows = partRows.filter(
    (row) => row.name.trim() && row.qty > 0 && row.totalWithTax > 0,
  );
  const baseSubtotal = previewRows.reduce(
    (sum, row) => sum + row.qty * row.unitPrice,
    0,
  );
  const totalTax = previewRows.reduce((sum, row) => sum + row.tax, 0);
  const grandTotal = previewRows.reduce((sum, row) => sum + row.totalWithTax, 0);
  const uniqueSuppliers = Array.from(
    new Set(orders.map((order) => order.supplier).filter(Boolean)),
  );

  return (
    <div className="min-h-screen bg-[#f4f6fb] p-5 font-sans text-slate-900">
      {!isAdding && !viewOrder ? (
        <div className="min-h-[calc(100vh-40px)] overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_24px_60px_rgba(15,23,42,0.07)]">
          <div className="flex items-center justify-between px-8 py-6">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Spare Orders</h1>
              <p className="mt-1 text-sm text-slate-500">
                Separate spare rows with vehicle link, bill image, and quick status update.
              </p>
            </div>
            <button
              className="flex items-center gap-2 rounded-lg bg-[#4f46e5] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-indigo-700"
              onClick={() => router.push("/orders/new")}
            >
              <Plus className="h-4 w-4" />
              Add Spares
            </button>
          </div>

          <div className="grid overflow-hidden border-y border-slate-100 bg-slate-50/40 sm:grid-cols-2 xl:grid-cols-5">
            <div className="border-b border-slate-100 px-5 py-3.5 xl:border-b-0 xl:border-r">
              <div className="text-[9px] font-bold uppercase tracking-widest text-slate-400">
                Total spare rows
              </div>
              <div className="mt-1 text-xl font-black text-slate-900">{orders.length}</div>
            </div>
            <div className="border-b border-slate-100 px-5 py-3.5 sm:border-l xl:border-b-0 xl:border-l-0 xl:border-r">
              <div className="text-[9px] font-bold uppercase tracking-widest text-slate-400">
                Pending
              </div>
              <div className="mt-1 text-xl font-black text-amber-600">{pendingCount}</div>
            </div>
            <div className="border-b border-slate-100 px-5 py-3.5 xl:border-b-0 xl:border-r">
              <div className="text-[9px] font-bold uppercase tracking-widest text-slate-400">
                Completed
              </div>
              <div className="mt-1 text-xl font-black text-emerald-600">{completedCount}</div>
            </div>
            <div className="border-b border-slate-100 px-5 py-3.5 sm:border-l xl:border-b-0 xl:border-l-0 xl:border-r">
              <div className="text-[9px] font-bold uppercase tracking-widest text-slate-400">
                Rejected
              </div>
              <div className="mt-1 text-xl font-black text-rose-600">{rejectedCount}</div>
            </div>
            <div className="px-5 py-3.5 sm:border-l xl:border-l-0">
              <div className="text-[9px] font-bold uppercase tracking-widest text-slate-400">
                Total spent
              </div>
              <div className="mt-1 text-xl font-black text-rose-600">{formatMoney(totalSpent)}</div>
            </div>
          </div>

          <div className="flex items-center justify-between border-b border-slate-100 bg-zinc-50/20 px-8 py-6">
            <div>
              <h2 className="text-sm font-black uppercase tracking-widest italic text-slate-800">
                Spare Rows
              </h2>
              <p className="mt-0.5 text-[10px] font-bold text-slate-400">
                Each purchased spare is listed separately
              </p>
            </div>

            <div className="flex items-center gap-3">
              <div className="group relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-300 transition-colors group-focus-within:text-[#4f46e5]" />
                <input
                  type="text"
                  placeholder="Search supplier, spare, vehicle or ID..."
                  className="w-80 rounded-lg border border-slate-100 bg-white py-2 pl-9 pr-4 text-sm font-medium shadow-sm outline-none transition-all focus:border-indigo-500 focus:ring-4 ring-indigo-500/5"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                />
              </div>
              <select
                className="rounded-lg border border-slate-100 bg-white px-4 py-2 text-sm font-medium text-slate-600 shadow-sm outline-none transition-all focus:border-indigo-500 focus:ring-4 ring-indigo-500/5"
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value as "" | OrderStatus)}
              >
                <option value="">All status</option>
                <option value="pending">Pending</option>
                <option value="completed">Completed</option>
                <option value="rejected">Rejected</option>
              </select>
            </div>
          </div>

          <div className="px-8 pt-6">
            <div className="overflow-hidden rounded-[24px] border border-slate-100 bg-white shadow-sm">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50">
                    <th className="px-6 py-4 text-[11px] font-bold uppercase tracking-wider text-slate-400">Spare ID</th>
                    <th className="px-6 py-4 text-[11px] font-bold uppercase tracking-wider text-slate-400">Spare</th>
                    <th className="px-6 py-4 text-[11px] font-bold uppercase tracking-wider text-slate-400">Supplier</th>
                    <th className="px-6 py-4 text-[11px] font-bold uppercase tracking-wider text-slate-400">Purpose</th>
                    <th className="px-6 py-4 text-[11px] font-bold uppercase tracking-wider text-slate-400">Qty</th>
                    <th className="px-6 py-4 text-[11px] font-bold uppercase tracking-wider text-slate-400">Total</th>
                    <th className="px-6 py-4 text-[11px] font-bold uppercase tracking-wider text-slate-400">Status</th>
                    <th className="px-6 py-4 text-[11px] font-bold uppercase tracking-wider text-slate-400">Date</th>
                    <th className="px-6 py-4 text-right text-[11px] font-bold uppercase tracking-wider text-slate-400">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {loading ? (
                    <tr>
                      <td colSpan={9} className="py-24">
                        <LoadingSpinner label="Retrieving spare rows" />
                      </td>
                    </tr>
                  ) : (
                    filteredOrders.map((order) => {
                      const vehicle = vehicleMap.get(order.mode || "");
                      return (
                        <tr
                          key={order.id}
                          className="group cursor-pointer transition-colors hover:bg-slate-50/50"
                          onClick={() => router.push(`/orders/${order.id}`)}
                        >
                          <td className="px-6 py-4">
                            <span className="text-[12px] font-bold tracking-tight text-indigo-600">
                              {order.id}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <p className="text-sm font-bold leading-tight text-slate-900">{order.part}</p>
                            <p className="mt-1 text-[11px] text-slate-400">
                              {order.bill_url ? "Bill attached" : "No bill"}
                            </p>
                          </td>
                          <td className="px-6 py-4">
                            <p className="text-sm font-bold text-slate-900">{order.supplier}</p>
                            <p className="mt-1 text-[11px] text-slate-400">
                              By {order.profiles?.username || "Admin"}
                            </p>
                          </td>
                          <td className="px-6 py-4">
                            {vehicle ? (
                              <>
                                <p className="text-sm font-bold text-slate-900">{vehicle.car_id}</p>
                                <p className="mt-1 text-[11px] text-slate-400">
                                  {vehicle.owner_name} · {vehicle.vehicle_reg}
                                </p>
                              </>
                            ) : (
                              <p className="text-sm text-slate-400">{order.mode || "—"}</p>
                            )}
                          </td>
                          <td className="px-6 py-4">
                            <p className="text-sm font-black tracking-tight text-slate-900">{order.qty}</p>
                          </td>
                          <td className="px-6 py-4">
                            <p className="text-sm font-black tracking-tight text-slate-900">
                              {formatMoney(order.total)}
                            </p>
                          </td>
                          <td className="px-6 py-4">
                            <select
                              className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-wider outline-none ${
                                order.status === "completed"
                                  ? "border-emerald-200 bg-emerald-50 text-emerald-600"
                                  : order.status === "rejected"
                                    ? "border-rose-200 bg-rose-50 text-rose-600"
                                  : "border-amber-200 bg-amber-50 text-amber-600"
                              }`}
                              value={order.status || "pending"}
                              onClick={(event) => event.stopPropagation()}
                              onChange={(event) =>
                                void updateOrderStatus(order, event.target.value as OrderStatus)
                              }
                            >
                              <option value="pending">Pending</option>
                              <option value="completed">Completed</option>
                              <option value="rejected">Rejected</option>
                            </select>
                          </td>
                          <td className="px-6 py-4">
                            <p className="text-[11px] font-bold text-slate-600">{formatDate(order.date)}</p>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={(event) => {
                                  event.stopPropagation();
                                  router.push(`/orders/${order.id}`);
                                }}
                                className="rounded-lg p-1.5 text-slate-300  transition-all hover:bg-indigo-50 hover:text-indigo-600 "
                                title="View spare row"
                              >
                                <Eye className="h-4 w-4" />
                              </button>
                              {order.bill_url ? (
                                <button
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    window.open(order.bill_url || "", "_blank");
                                  }}
                                  className="rounded-lg p-1.5 text-slate-300  transition-all hover:bg-blue-50 hover:text-blue-600 "
                                  title="Open bill"
                                >
                                  <Download className="h-4 w-4" />
                                </button>
                              ) : null}
                              <button
                                onClick={(event) => {
                                  event.stopPropagation();
                                  handleEditOrder(order);
                                }}
                                className="rounded-lg p-1.5 text-slate-300  transition-all hover:bg-slate-100 hover:text-slate-600 "
                                title="Edit spare row"
                              >
                                <Edit2 className="h-4 w-4" />
                              </button>
                              <button
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setOrderToDelete(order);
                                }}
                                className="rounded-lg p-1.5 text-slate-300  transition-all hover:bg-rose-50 hover:text-rose-600 "
                                title="Delete spare row"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>

              {filteredOrders.length === 0 && !loading ? (
                <div className="bg-white py-20 text-center">
                  <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-full bg-slate-50">
                    <FileText className="h-8 w-8 text-slate-200" />
                  </div>
                  <p className="font-bold text-slate-800">No spare rows found</p>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {isAdding ? (
        <div className="mx-auto grid max-w-7xl gap-6 xl:grid-cols-[1.6fr_0.9fr]">
          <div className="rounded-[28px] border border-slate-200 bg-white p-8 shadow-[0_24px_60px_rgba(15,23,42,0.07)]">
            <div className="flex items-start justify-between gap-6">
              <div>
                <button
                  type="button"
                  className="mb-3 inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 transition-all hover:bg-slate-50"
                  onClick={() => {
                    setEditId(null);
                    router.push("/orders");
                  }}
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back
                </button>
                <h2 className="text-2xl font-bold tracking-tight">
                  {editId ? "Edit Spare Row" : "Add Spare Orders"}
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Quotation-style spare entry with fixed 18% GST and no discount.
                </p>
              </div>
            </div>

            <div className="mt-8 space-y-8">
              <section className="rounded-3xl border border-slate-200 p-6">
                <div className="mb-5 flex items-center gap-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-indigo-50 text-sm font-black text-indigo-600">
                    1
                  </div>
                  <div>
                    <div className="text-lg font-bold text-slate-900">Order Details</div>
                    <div className="text-sm text-slate-500">Supplier, date, status, and bill upload</div>
                  </div>
                </div>

                <div className="grid gap-5 md:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-[12px] font-semibold uppercase tracking-wider text-slate-500">
                      Supplier Name
                    </label>
                    <input
                      className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none transition-all focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/5"
                      list="order-suppliers"
                      type="text"
                      placeholder="e.g. Murugan Suppliers"
                      value={supplier}
                      onChange={(event) => setSupplier(event.target.value)}
                    />
                    <datalist id="order-suppliers">
                      {uniqueSuppliers.map((value) => (
                        <option key={value} value={value} />
                      ))}
                    </datalist>
                  </div>
                  <div>
                    <label className="mb-2 block text-[12px] font-semibold uppercase tracking-wider text-slate-500">
                      Order Date
                    </label>
                    <input
                      className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none transition-all focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/5"
                      type="date"
                      value={orderDate}
                      onChange={(event) => setOrderDate(event.target.value)}
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-[12px] font-semibold uppercase tracking-wider text-slate-500">
                      Order Status
                    </label>
                    <select
                      className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none transition-all focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/5"
                      value={orderStatus}
                      onChange={(event) => setOrderStatus(event.target.value as OrderStatus)}
                    >
                      <option value="pending">Pending</option>
                      <option value="completed">Completed</option>
                      <option value="rejected">Rejected</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-2 block text-[12px] font-semibold uppercase tracking-wider text-slate-500">
                      Supplier Bill
                    </label>
                    <div className="flex items-center gap-3">
                      <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 px-4 py-3 text-sm font-medium text-slate-600 transition-all hover:bg-slate-50">
                        {uploadingBill ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Upload className="h-4 w-4" />
                        )}
                        {uploadingBill ? "Uploading..." : billUrl ? "Replace Bill" : "Upload Bill"}
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={handleBillUpload}
                        />
                      </label>
                      <span className="text-sm text-slate-500">
                        {billUrl ? "Bill attached" : "Optional"}
                      </span>
                    </div>
                  </div>
                </div>
              </section>

              <section className="rounded-3xl border border-slate-200 p-6">
                <div className="mb-5 flex items-center gap-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-indigo-50 text-sm font-black text-indigo-600">
                    2
                  </div>
                  <div>
                    <div className="text-lg font-bold text-slate-900">Spare Order Purpose</div>
                    <div className="text-sm text-slate-500">Select the vehicle or purpose this spare purchase belongs to</div>
                  </div>
                </div>

                {selectedVehicle ? (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4">
                      <div className="flex items-center gap-4">
                        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-indigo-600 shadow-sm">
                          {selectedVehicle.id === "inhouse-inventory" ? (
                            <Warehouse className="h-5 w-5" />
                          ) : (
                            <CarFront className="h-5 w-5" />
                          )}
                        </div>
                        <div>
                          <div className="text-sm font-black text-slate-900">{selectedVehicle.car_id}</div>
                          <div className="text-sm text-slate-600">
                            {selectedVehicle.owner_name} · {selectedVehicle.vehicle_reg}
                          </div>
                          <div className="text-xs text-slate-400">{selectedVehicle.phone_number}</div>
                        </div>
                      </div>
                      <button
                        type="button"
                        className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition-all hover:bg-white"
                        onClick={clearVehicle}
                      >
                        Change
                      </button>
                    </div>

                    <div>
                      <label className="mb-2 block text-[12px] font-semibold uppercase tracking-wider text-slate-500">
                        Car ID Notes
                      </label>
                      <textarea
                        className="w-full min-h-[96px] rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none transition-all focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/5"
                        placeholder="Add notes for this car ID (saved to vehicle notes)"
                        value={vehicleNote}
                        onChange={(event) => setVehicleNote(event.target.value)}
                        disabled={selectedVehicle.id === "inhouse-inventory"}
                      />
                      {selectedVehicle.id === "inhouse-inventory" ? (
                        <div className="mt-1 text-[11px] text-slate-400">
                          Notes are available for vehicle records only.
                        </div>
                      ) : (
                        <div className="mt-1 text-[11px] text-slate-400">
                          This note will be appended to the car ID notes.
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="relative" ref={vehicleSearchRef}>
                      <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <input
                        type="text"
                        value={vehicleQuery}
                        placeholder="Search by purpose, Car ID, owner, phone or vehicle number..."
                        className="w-full rounded-xl border border-slate-200 py-3 pl-11 pr-11 text-sm outline-none transition-all focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/5"
                        onChange={(event) => {
                          const nextQuery = event.target.value;
                          setVehicleQuery(nextQuery);
                          setVehicleOpen(Boolean(nextQuery.trim()));
                          setActiveVehicleIndex(0);
                        }}
                        onFocus={() => {
                          if (vehicleQuery.trim()) {
                            setVehicleOpen(true);
                            setActiveVehicleIndex(0);
                          }
                        }}
                        onBlur={() => window.setTimeout(() => setVehicleOpen(false), 150)}
                        onKeyDown={handleVehicleKeyDown}
                      />
                      {vehicleQuery.trim() ? (
                        <button
                          type="button"
                          className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-slate-400 transition-all hover:bg-slate-100 hover:text-slate-700"
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => {
                            setVehicleQuery("");
                            setVehicleResults([]);
                            setVehicleOpen(false);
                            setActiveVehicleIndex(0);
                          }}
                          aria-label="Clear purpose search"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      ) : null}

                      {vehicleOpen && vehicleQuery.trim() ? (
                        <div className="absolute left-0 right-0 top-[calc(100%+10px)] z-20 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
                          {vehicleLoading ? (
                            <div className="px-4 py-4 text-sm text-slate-500">Searching vehicles...</div>
                          ) : vehicleResults.length > 0 ? (
                            vehicleResults.map((vehicle, index) => (
                              <button
                                key={vehicle.id}
                                type="button"
                                className={`flex w-full items-start justify-between border-b border-slate-100 px-4 py-4 text-left last:border-b-0 hover:bg-slate-50 ${
                                  index === activeVehicleIndex ? "bg-slate-50" : ""
                                }`}
                                onMouseDown={() => selectVehicle(vehicle)}
                              >
                                <div>
                                  <div className="text-xs font-black uppercase tracking-wider text-indigo-600">
                                    {vehicle.car_id}
                                  </div>
                                  <div className="mt-1 text-sm font-semibold text-slate-900">
                                    {vehicle.owner_name}
                                  </div>
                                  <div className="text-xs text-slate-500">
                                    {vehicle.phone_number} · {vehicle.vehicle_reg}
                                  </div>
                                </div>
                                <div className="text-xs text-slate-400">{vehicle.make_model || "Vehicle"}</div>
                              </button>
                            ))
                          ) : vehicleQuery.trim() ? (
                            <div className="px-4 py-4 text-sm text-slate-500">No vehicles found</div>
                          ) : null}
                        </div>
                      ) : null}
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="h-px flex-1 bg-slate-100" />
                      <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">or quick select</span>
                      <div className="h-px flex-1 bg-slate-100" />
                    </div>

                    <button
                      type="button"
                      className="group flex w-full items-center justify-between rounded-2xl border border-dashed border-slate-300 p-4 transition-all hover:border-indigo-500 hover:bg-indigo-50/50"
                      onClick={() => selectVehicle(INHOUSE_VEHICLE)}
                    >
                      <div className="flex items-center gap-4">
                        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600 shadow-sm group-hover:bg-indigo-100 transition-colors">
                          <Warehouse className="h-5 w-5" />
                        </div>
                        <div className="text-left">
                          <div className="text-sm font-black text-slate-900">Inhouse Inventory</div>
                          <div className="text-[11px] font-bold text-slate-500">Directly assign to internal warehouse stock</div>
                        </div>
                      </div>
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-50 text-slate-300 group-hover:bg-indigo-100 group-hover:text-indigo-600 transition-all">
                        <ChevronRight className="h-4 w-4" />
                      </div>
                    </button>
                  </div>
                )}
              </section>

              <section className="rounded-3xl border border-slate-200 p-6">
                <div className="mb-5 flex items-center gap-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-indigo-50 text-sm font-black text-indigo-600">
                    3
                  </div>
                  <div>
                    <div className="text-lg font-bold text-slate-900">Spare Parts</div>
                  </div>
                </div>

                <div className="relative">
                  <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={partQuery}
                    placeholder="Search spare parts by name, ID, barcode or category..."
                    className="w-full rounded-xl border border-slate-200 py-3 pl-11 pr-4 text-sm outline-none transition-all focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/5"
                    onChange={(event) => {
                      setPartQuery(event.target.value);
                      setPartOpen(true);
                    }}
                    onFocus={() => setPartOpen(true)}
                    onBlur={() => window.setTimeout(() => setPartOpen(false), 150)}
                  />

                  {partOpen && partQuery.trim() ? (
                    <div className="absolute left-0 right-0 top-[calc(100%+10px)] z-20 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
                      {partLoading ? (
                        <div className="px-4 py-4 text-sm text-slate-500">Searching spares...</div>
                      ) : partResults.length > 0 ? (
                        partResults.map((part) => (
                          <button
                            key={part.id}
                            type="button"
                            className="flex w-full items-center justify-between border-b border-slate-100 px-4 py-4 text-left last:border-b-0 hover:bg-slate-50"
                            onMouseDown={() => addPart(part)}
                          >
                            <div>
                              <div className="text-xs font-black uppercase tracking-wider text-indigo-600">
                                {part.id}
                              </div>
                              <div className="mt-1 text-sm font-semibold text-slate-900">{part.name}</div>
                              <div className="text-xs text-slate-500">
                                {part.cat || "Spare"} · {part.stock} in stock
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="text-sm font-black text-slate-900">{formatMoney(part.cost)}</div>
                              <div className="text-xs text-slate-400">cost price</div>
                            </div>
                          </button>
                        ))
                      ) : (
                        <div className="px-4 py-4 text-sm text-slate-500">No spare parts found</div>
                      )}
                    </div>
                  ) : null}
                </div>

                <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200">
                  <table className="w-full border-collapse text-left">
                    <thead>
                      <tr className="bg-slate-50">
                        <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-slate-400">Part</th>
                        <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-slate-400">ID</th>
                        <th className="px-4 py-3 text-right text-[11px] font-bold uppercase tracking-wider text-slate-400">Qty</th>
                        <th className="px-4 py-3 text-right text-[11px] font-bold uppercase tracking-wider text-slate-400">Price (₹)</th>
                        <th className="px-4 py-3 text-right text-[11px] font-bold uppercase tracking-wider text-amber-600">Tax 18%</th>
                        <th className="px-4 py-3 text-right text-[11px] font-bold uppercase tracking-wider text-emerald-600">After Tax</th>
                        <th className="px-4 py-3" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {partRows.map((row, index) => (
                        <tr key={row.id}>
                          <td className="px-4 py-3">
                            {row.isCustom ? (
                              <input
                                className="w-[320px] max-w-none rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none transition-all focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/5"
                                type="text"
                                value={row.name}
                                placeholder="Custom spare name"
                                onChange={(event) => updatePartRow(index, "name", event.target.value)}
                              />
                            ) : (
                              <div className="text-sm font-semibold text-slate-900">{row.name}</div>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <span className="rounded-full bg-slate-100 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-slate-600">
                              {row.partId || "CUSTOM"}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <input
                              className="w-20 rounded-xl border border-slate-200 px-3 py-2 text-right text-sm outline-none transition-all focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/5"
                              type="number"
                              min={1}
                              max={Math.max(1, row.stock || 9999)}
                              value={row.qty}
                              onChange={(event) => updatePartRow(index, "qty", event.target.value)}
                            />
                          </td>
                          <td className="px-4 py-3 text-right">
                            <input
                              className="w-28 rounded-xl border border-slate-200 px-3 py-2 text-right text-sm outline-none transition-all focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/5"
                              type="number"
                              min={0}
                              value={row.unitPrice}
                              onChange={(event) => updatePartRow(index, "unitPrice", event.target.value)}
                            />
                          </td>
                          <td className="px-4 py-3 text-right text-sm font-semibold text-amber-600">
                            {formatMoney(row.tax)}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <input
                              className="w-28 rounded-xl border border-slate-200 px-3 py-2 text-right text-sm outline-none transition-all focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/5"
                              type="number"
                              min={0}
                              value={row.totalWithTax}
                              onChange={(event) => updatePartRow(index, "totalWithTax", event.target.value)}
                            />
                          </td>
                          <td className="px-4 py-3 text-right">
                            <button
                              type="button"
                              className="rounded-lg p-2 text-slate-400 transition-all hover:bg-rose-50 hover:text-rose-600"
                              onClick={() => removePart(index)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {!editId ? (
                  <div className="mt-4 flex flex-wrap gap-3">
                    <button
                      type="button"
                      className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 transition-all hover:bg-slate-50"
                      onClick={addCustomPart}
                    >
                      <Plus className="h-4 w-4" />
                      Add Custom Spare
                    </button>
                  </div>
                ) : null}
              </section>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  className="inline-flex items-center gap-2 rounded-xl bg-[#4f46e5] px-5 py-3 text-sm font-semibold text-white transition-all hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
                  onClick={() => void handleSaveOrder()}
                  disabled={saving}
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                  {saving ? "Saving..." : editId ? "Save Spare Row" : "Save Spare Rows"}
                </button>
                <button
                  type="button"
                  className="rounded-xl border border-slate-200 px-5 py-3 text-sm font-medium text-slate-600 transition-all hover:bg-slate-50"
                  onClick={() => {
                    setEditId(null);
                    router.push("/orders");
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_24px_60px_rgba(15,23,42,0.07)]">
              <div className="text-sm font-black uppercase tracking-widest text-slate-500">Live Preview</div>

              <div className="mt-5 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-500">Spare subtotal</span>
                  <span className="text-sm font-bold text-slate-900">{formatMoney(baseSubtotal)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-amber-600">Tax 18%</span>
                  <span className="text-sm font-bold text-amber-600">{formatMoney(totalTax)}</span>
                </div>
                <div className="flex items-center justify-between border-t border-slate-200 pt-3">
                  <span className="text-base font-black text-slate-900">Grand total</span>
                  <span className="text-xl font-black text-emerald-600">{formatMoney(grandTotal)}</span>
                </div>
              </div>
            </div>

            <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_24px_60px_rgba(15,23,42,0.07)]">
              <div className="text-sm font-black uppercase tracking-widest text-slate-500">Summary</div>
              <div className="mt-4 space-y-4">
                <div>
                  <div className="text-xs font-bold uppercase tracking-wider text-slate-400">Supplier</div>
                  <div className="mt-1 text-sm font-semibold text-slate-900">{supplier || "—"}</div>
                </div>
                <div>
                  <div className="text-xs font-bold uppercase tracking-wider text-slate-400">Purpose</div>
                  <div className="mt-1 text-sm font-semibold text-slate-900">
                    {selectedVehicle ? selectedVehicle.car_id : "—"}
                  </div>
                  <div className="text-xs text-slate-500">
                    {selectedVehicle
                      ? `${selectedVehicle.owner_name} · ${selectedVehicle.vehicle_reg}`
                      : "Select a vehicle or purpose"}
                  </div>
                </div>
                <div>
                  <div className="text-xs font-bold uppercase tracking-wider text-slate-400">Rows</div>
                  {previewRows.length > 0 ? (
                    <div className="mt-2 space-y-2">
                      {previewRows.map((row) => (
                        <div key={row.id} className="flex items-center justify-between text-sm">
                          <span className="text-slate-700">{row.name}</span>
                          <span className="font-semibold text-slate-900">{formatMoney(row.totalWithTax)}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="mt-2 text-sm text-slate-400">No spare rows added yet</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {viewOrder ? (
        <div className="mx-auto max-w-5xl rounded-[28px] border border-slate-200 bg-white p-8 shadow-[0_24px_60px_rgba(15,23,42,0.07)]">
          <div className="mb-8 flex items-start justify-between gap-6">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">
                Spare Row
              </div>
              <h2 className="mt-2 text-2xl font-bold tracking-tight text-slate-900">{viewOrder.part}</h2>
              <p className="mt-1 text-sm text-slate-500">{viewOrder.id}</p>
            </div>
            <div className="flex items-center gap-3">
              <button
                className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 transition-all hover:bg-slate-50"
                onClick={() => handleEditOrder(viewOrder)}
              >
                Edit
              </button>
              <button
                className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 transition-all hover:bg-slate-50"
                onClick={() => router.push("/orders")}
              >
                Back
              </button>
            </div>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 p-5">
              <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">
                Supplier
              </div>
              <div className="mt-2 text-lg font-semibold text-slate-900">{viewOrder.supplier}</div>
            </div>
            <div className="rounded-2xl border border-slate-200 p-5">
              <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">
                Status
              </div>
              <div className="mt-2">
                <span
                  className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-wider ${
                    viewOrder.status === "completed"
                      ? "bg-emerald-50 text-emerald-600"
                      : viewOrder.status === "rejected"
                        ? "bg-rose-50 text-rose-600"
                      : "bg-amber-50 text-amber-600"
                  }`}
                >
                  {viewOrder.status || "pending"}
                </span>
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200 p-5">
              <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">
                Quantity
              </div>
              <div className="mt-2 text-base text-slate-800">{viewOrder.qty}</div>
            </div>
            <div className="rounded-2xl border border-slate-200 p-5">
              <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">
                Total
              </div>
              <div className="mt-2 text-base font-semibold text-slate-800">{formatMoney(viewOrder.total)}</div>
            </div>
            <div className="rounded-2xl border border-slate-200 p-5 md:col-span-2">
              <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">
                Purpose
              </div>
              <div className="mt-2 text-base text-slate-800">
                {vehicleMap.get(viewOrder.mode || "") ? (
                  <>
                    <div className="font-semibold text-slate-900">
                      {vehicleMap.get(viewOrder.mode || "")?.car_id}
                    </div>
                    <div className="text-sm text-slate-500">
                      {vehicleMap.get(viewOrder.mode || "")?.owner_name} ·{" "}
                      {vehicleMap.get(viewOrder.mode || "")?.vehicle_reg}
                    </div>
                  </>
                ) : (
                  viewOrder.mode || "—"
                )}
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200 p-5">
              <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">
                Date
              </div>
              <div className="mt-2 text-base text-slate-800">{formatDate(viewOrder.date)}</div>
            </div>
            <div className="rounded-2xl border border-slate-200 p-5">
              <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">
                Bill
              </div>
              <div className="mt-2 text-base text-slate-800">{viewOrder.bill_url ? "Attached" : "Not attached"}</div>
            </div>
          </div>

          {viewOrder.bill_url ? (
            <div className="mt-6 rounded-2xl border border-slate-200 p-5">
              <div className="mb-4 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">
                Supplier Bill
              </div>
              <img
                src={viewOrder.bill_url}
                alt="Supplier bill"
                className="max-h-[600px] w-full rounded-2xl border border-slate-200 object-contain"
              />
            </div>
          ) : null}
        </div>
      ) : null}

      {orderToDelete ? (
        <ConfirmDeleteModal
          title="Delete Spare Row?"
          description={`Delete ${orderToDelete.id} for ${orderToDelete.part}. This action cannot be undone.`}
          confirmLabel="Delete Spare Row"
          onConfirm={() => void confirmDeleteOrder()}
          onCancel={() => setOrderToDelete(null)}
        />
      ) : null}
    </div>
  );
}

export default function OrdersPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <OrdersContent />
    </Suspense>
  );
}
