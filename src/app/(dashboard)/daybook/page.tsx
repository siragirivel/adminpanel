"use client";

import React, { useState, useEffect, useRef } from "react";
import { 
  Smartphone,
  Wallet,
  FileText,
  TrendingDown,
  TrendingUp,
  Loader2,
  X,
  History,
  CheckCircle2,
  Save as SaveIcon,
  Info
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { format } from "date-fns";
import toast from "react-hot-toast";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { logActivity } from "@/lib/activity-log";
import Link from "next/link";
import { normalizeVendorKey } from "@/lib/vendor-credit";
import { loadVendorRegistry, syncVendorRecord } from "@/lib/vendor-registry";
import { uploadToCloudinaryDetailed } from "@/lib/cloudinary";

interface SuggestionRow {
  description: string;
  amount: number;
  payment_mode: "cash" | "eft";
  type: "debit" | "credit";
  created_at: string;
  note?: string | null;
  dt: string;
  source?: "history" | "vendor" | "car" | "invoice";
  vendor?: string;
  vendor_id?: string;
  employee_id?: string;
  employee_name?: string;
  party_id?: string;
  party_name?: string;
  car_id?: string;
  invoice_number?: string;
}

interface VendorOption {
  name: string;
  vendor_id?: string | null;
}

interface VehicleOption {
  car_id: string;
  vehicle_reg?: string | null;
  owner_name?: string | null;
}

interface EmployeeOption {
  id: string;
  employee_id?: string | null;
  name: string;
  role?: string | null;
}

interface CustomPartyOption {
  id: string;
  name: string;
  created_at?: string | null;
}

interface InvoiceOption {
  invoice_number: string;
  grand_total: number;
  paid_amount?: number | null;
  outstanding_amount?: number | null;
}

type ToSuggestion =
  | { kind: "vendor"; label: string; subLabel: string; vendor: VendorOption }
  | { kind: "employee"; label: string; subLabel: string; employee: EmployeeOption; displayId: string }
  | { kind: "car"; label: string; subLabel: string; vehicle: VehicleOption }
  | { kind: "party"; label: string; subLabel: string; party: CustomPartyOption }
  | { kind: "create"; label: string; subLabel: string; name: string; id: string };

function extractSellerFromNote(note?: string | null) {
  const match = String(note || "").match(/Seller:\s*([^|\n]+)/i);
  return match?.[1]?.trim() || "";
}

function extractTagValue(note: string | null | undefined, tag: string) {
  const match = String(note || "").match(new RegExp(`${tag}:([^\\n|]+)`, "i"));
  return match?.[1]?.trim() || "";
}

function formatEmployeeId(value?: string | null, fallback?: string | null) {
  if (value) return value;
  const source = String(fallback || "");
  const digits = source.replace(/\D/g, "");
  const base = digits ? Number(digits.slice(-5)) : 0;
  if (base > 0) {
    return `EMP-${String(base).padStart(5, "0")}`;
  }
  let hash = 0;
  for (let i = 0; i < source.length; i += 1) {
    hash = (hash * 31 + source.charCodeAt(i)) % 100000;
  }
  return `EMP-${String(hash).padStart(5, "0")}`;
}

const CUSTOM_PARTY_STORAGE_KEY = "daybook_party_registry_v1";

function loadCustomParties(): CustomPartyOption[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(CUSTOM_PARTY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => ({
        id: String(item?.id || "").trim(),
        name: String(item?.name || "").trim(),
        created_at: item?.created_at ? String(item.created_at) : null,
      }))
      .filter((item) => item.id && item.name);
  } catch {
    return [];
  }
}

function persistCustomParties(parties: CustomPartyOption[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CUSTOM_PARTY_STORAGE_KEY, JSON.stringify(parties));
  } catch {}
}

function createBasicId(name: string, existingIds: Set<string>) {
  const cleaned = String(name || "").trim();
  if (!cleaned) return "ID-00000";
  let hash = 0;
  for (let i = 0; i < cleaned.length; i += 1) {
    hash = (hash * 31 + cleaned.charCodeAt(i)) % 100000;
  }
  const candidate = `ID-${String(hash).padStart(5, "0")}`;
  if (!existingIds.has(candidate)) return candidate;
  let suffix = 1;
  while (existingIds.has(`${candidate}-${suffix}`)) suffix += 1;
  return `${candidate}-${suffix}`;
}

export default function DayBookPage() {
  const [submitting, setSubmitting] = useState(false);
  const [attachExpenseBill, setAttachExpenseBill] = useState(false);
  const [expenseBillFile, setExpenseBillFile] = useState<File | null>(null);
  const [expenseBillType, setExpenseBillType] = useState<"company" | "employee">("company");
  const [expenseBillRemarks, setExpenseBillRemarks] = useState("");
  const [suggestions, setSuggestions] = useState<SuggestionRow[]>([]);
  const [vendorOptions, setVendorOptions] = useState<VendorOption[]>([]);
  const [vehicleOptions, setVehicleOptions] = useState<VehicleOption[]>([]);
  const [invoiceOptions, setInvoiceOptions] = useState<InvoiceOption[]>([]);
  const [employeeOptions, setEmployeeOptions] = useState<EmployeeOption[]>([]);
  const [customParties, setCustomParties] = useState<CustomPartyOption[]>([]);
  const [showAc, setShowAc] = useState(false);
  const [isFilledFromAc, setIsFilledFromAc] = useState(false);
  const [filledDate, setFilledDate] = useState("");
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(-1);
  const suggestionListRef = useRef<HTMLDivElement>(null);
  const [toQuery, setToQuery] = useState("");
  const [showToAc, setShowToAc] = useState(false);
  const [isToFilled, setIsToFilled] = useState(false);
  const [activeToSuggestionIndex, setActiveToSuggestionIndex] = useState(-1);
  const toSuggestionListRef = useRef<HTMLDivElement>(null);
  
  // Form State
  const [formData, setFormData] = useState({
    description: "",
    type: 'debit' as 'debit' | 'credit',
    amount: "",
    payment_mode: 'eft' as 'cash' | 'eft',
    note: "",
    date: format(new Date(), "yyyy-MM-dd"),
    vendor: "",
    vendor_id: "",
    employee_id: "",
    employee_name: "",
    party_id: "",
    party_name: "",
    car_id: "",
    invoice_number: "",
  });

  useEffect(() => {
    fetchSuggestions();
    fetchVendors();
    fetchReferenceOptions();
    fetchEmployees();
    setCustomParties(loadCustomParties());
  }, []);

  const fetchSuggestions = async () => {
    try {
      const { data } = await supabase
        .from('transactions')
        .select('description, amount, payment_mode, type, created_at, note')
        .limit(50);
      
      if (data) {
        const seen = new Set();
        const unique = data.filter(item => {
          const k = `${item.type}:${item.description.toLowerCase()}`;
          return seen.has(k) ? false : seen.add(k);
        }).map(item => ({
          ...item,
          payment_mode: item.payment_mode === 'cash' ? 'cash' : 'eft',
          dt: format(new Date(item.created_at), "dd MMM")
        })) as SuggestionRow[];
        setSuggestions(unique);
      }
    } catch {}
  };

  const fetchVendors = async () => {
    try {
      const [vendorRegistry, sparePartsResponse] = await Promise.all([
        loadVendorRegistry(),
        supabase.from("spare_parts").select("seller"),
      ]);
      const vendorMap = new Map<string, VendorOption>();
      vendorRegistry.data.forEach((item) => {
        const name = String(item.name || "").trim();
        if (!name) return;
        vendorMap.set(name.toLowerCase(), { name, vendor_id: item.vendor_id || null });
      });
      (sparePartsResponse.data || []).forEach((item) => {
        const name = String(item.seller || "").trim();
        if (!name) return;
        const key = name.toLowerCase();
        if (!vendorMap.has(key)) {
          vendorMap.set(key, { name, vendor_id: null });
        }
      });
      const next = Array.from(vendorMap.values()).sort((a, b) => a.name.localeCompare(b.name));
      setVendorOptions(next);
    } catch {}
  };

  const fetchEmployees = async () => {
    try {
      const response = await supabase
        .from("employees")
        .select("id, employee_id, name, role")
        .order("name", { ascending: true });
      setEmployeeOptions((response.data || []) as EmployeeOption[]);
    } catch {}
  };

  const fetchReferenceOptions = async () => {
    try {
      const [vehiclesResponse, invoicesResponse] = await Promise.all([
        supabase.from("vehicles").select("car_id, vehicle_reg, owner_name").order("created_at", { ascending: false }),
        supabase.from("invoices").select("invoice_number, grand_total, paid_amount, outstanding_amount").order("created_at", { ascending: false }),
      ]);
      setVehicleOptions((vehiclesResponse.data || []) as VehicleOption[]);
      setInvoiceOptions((invoicesResponse.data || []) as InvoiceOption[]);
    } catch {}
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.description || !formData.amount) {
      toast.error("Please fill in description and amount");
      return;
    }

    try {
      setSubmitting(true);
      const { data: { user } } = await supabase.auth.getUser();
      const storedPaymentMode = formData.payment_mode === "cash" ? "cash" : "upi";
      const trimmedVendor = String(formData.vendor || "").trim();
      const trimmedVendorId = String(formData.vendor_id || "").trim();
      const trimmedEmployeeName = String(formData.employee_name || "").trim();
      const trimmedEmployeeId = String(formData.employee_id || "").trim();
      let trimmedPartyName = String(formData.party_name || "").trim();
      let trimmedPartyId = String(formData.party_id || "").trim();
      const trimmedCarId = String(formData.car_id || "").trim();
      const trimmedInvoiceNumber = String(formData.invoice_number || "").trim();
      const trimmedBillRemarks = String(expenseBillRemarks || "").trim();
      const shouldAttachBill = formData.type === "debit" && attachExpenseBill;

      if (shouldAttachBill && !expenseBillFile) {
        toast.error("Upload the expense bill file");
        return;
      }
      if (shouldAttachBill && expenseBillType === "employee" && (!trimmedEmployeeName || !trimmedEmployeeId)) {
        toast.error("Select the employee in reference for employee bills");
        return;
      }
      if (shouldAttachBill && expenseBillType === "employee" && !trimmedBillRemarks) {
        toast.error("Remarks are required for employee bills");
        return;
      }

      let uploadedBillUrl: string | null = null;
      let uploadedBillPublicId: string | null = null;
      let uploadedBillResourceType: "image" | "raw" | null = null;
      let billUploadedAt: string | null = null;
      let billExpiresAt: string | null = null;

      if (
        !trimmedVendor &&
        !trimmedEmployeeName &&
        !trimmedEmployeeId &&
        !trimmedCarId &&
        !trimmedPartyName &&
        !trimmedPartyId &&
        toQuery.trim()
      ) {
        const nextId = createBasicId(toQuery.trim(), new Set(customParties.map((party) => party.id)));
        const newParty: CustomPartyOption = {
          id: nextId,
          name: toQuery.trim(),
          created_at: new Date().toISOString(),
        };
        const nextRegistry = [newParty, ...customParties.filter((party) => party.id !== newParty.id)];
        setCustomParties(nextRegistry);
        persistCustomParties(nextRegistry);
        trimmedPartyName = newParty.name;
        trimmedPartyId = newParty.id;
      }
      const vendorMetaParts: string[] = [];
      if (trimmedVendor) vendorMetaParts.push(`Seller: ${trimmedVendor}`);
      if (trimmedVendorId) vendorMetaParts.push(`vendor_id:${trimmedVendorId}`);
      if (trimmedVendor) vendorMetaParts.push(`vendor_payment_for:${normalizeVendorKey(trimmedVendor)}`);
      const vendorMetadata = trimmedVendor ? `Vendor Payment | ${vendorMetaParts.join(" | ")}` : "";
      const employeeMetaParts: string[] = [];
      if (trimmedEmployeeName) employeeMetaParts.push(`employee_name:${trimmedEmployeeName}`);
      if (trimmedEmployeeId) employeeMetaParts.push(`employee_id:${trimmedEmployeeId}`);
      const employeeMetadata = employeeMetaParts.length ? `Employee Ref | ${employeeMetaParts.join(" | ")}` : "";
      const partyMetaParts: string[] = [];
      if (trimmedPartyName) partyMetaParts.push(`party_name:${trimmedPartyName}`);
      if (trimmedPartyId) partyMetaParts.push(`party_id:${trimmedPartyId}`);
      const partyMetadata = partyMetaParts.length ? `Party Ref | ${partyMetaParts.join(" | ")}` : "";
      const invoiceMetadata = trimmedInvoiceNumber ? `Invoice Ref | invoice_payment_for:${trimmedInvoiceNumber}` : "";
      const carMetadata = trimmedCarId ? `Vehicle Ref | car_id:${trimmedCarId}` : "";
      if (shouldAttachBill && expenseBillFile) {
        const uploadResult = await uploadToCloudinaryDetailed(expenseBillFile, {
          kind: "bill",
          folder: "siragirvel/daybook-expense-bills",
        });
        uploadedBillUrl = uploadResult.secureUrl;
        uploadedBillPublicId = uploadResult.publicId;
        uploadedBillResourceType = uploadResult.resourceType;
        billUploadedAt = new Date().toISOString();
        billExpiresAt = new Date(
          new Date(billUploadedAt).setMonth(new Date(billUploadedAt).getMonth() + 3),
        ).toISOString();
      }
      const expenseBillMetadata = shouldAttachBill
        ? [
            `Expense Bill | bill_type:${expenseBillType}`,
            trimmedBillRemarks ? `expense_remarks:${trimmedBillRemarks}` : "",
            billUploadedAt ? `bill_uploaded_at:${billUploadedAt}` : "",
            billExpiresAt ? `bill_expires_at:${billExpiresAt}` : "",
          ]
            .filter(Boolean)
            .join("\n")
        : "";
      const note = [
        String(formData.note || "").trim(),
        expenseBillMetadata,
        vendorMetadata,
        invoiceMetadata,
        carMetadata,
        employeeMetadata,
        partyMetadata,
      ]
        .filter(Boolean)
        .join("\n");
      if (trimmedVendor) {
        await syncVendorRecord(trimmedVendor);
      }
      const { data: inserted, error } = await supabase
        .from('transactions')
        .insert([{
          description: formData.description,
          type: formData.type,
          amount: parseFloat(formData.amount),
          date: formData.date,
          payment_mode: storedPaymentMode,
          bill_url: uploadedBillUrl,
          bill_public_id: uploadedBillPublicId,
          bill_resource_type: uploadedBillResourceType,
          bill_uploaded_at: billUploadedAt,
          bill_expires_at: billExpiresAt,
          bill_type: shouldAttachBill ? expenseBillType : null,
          expense_vendor: shouldAttachBill ? trimmedVendor || null : null,
          expense_vendor_id: shouldAttachBill ? trimmedVendorId || null : null,
          expense_employee_id: shouldAttachBill ? trimmedEmployeeId || null : null,
          expense_employee_name: shouldAttachBill ? trimmedEmployeeName || null : null,
          expense_remarks: shouldAttachBill ? trimmedBillRemarks || null : null,
          note,
          created_by: user?.id
        }])
        .select("id")
        .single();

      if (error) throw error;

      if (trimmedInvoiceNumber && formData.type === "credit") {
        const invoice = invoiceOptions.find((item) => item.invoice_number === trimmedInvoiceNumber);
        if (invoice) {
          const nextPaidAmount = Math.max(0, Number(invoice.paid_amount || 0)) + parseFloat(formData.amount);
          const grandTotal = Math.max(0, Number(invoice.grand_total || 0));
          const nextOutstandingAmount = Math.max(grandTotal - nextPaidAmount, 0);
          const nextPaymentStatus = nextPaidAmount <= 0 ? "unpaid" : nextOutstandingAmount <= 0 ? "paid" : "partial";
          await supabase
            .from("invoices")
            .update({
              paid_amount: nextPaidAmount,
              outstanding_amount: nextOutstandingAmount,
              payment_status: nextPaymentStatus,
              payment_date: formData.date,
            })
            .eq("invoice_number", trimmedInvoiceNumber);
        }
      }

      await logActivity({
        action: "create",
        entityType: "transaction",
        entityId: inserted?.id || formData.description,
        entityLabel: formData.description,
        description: `Created day book ${formData.type} entry via ${formData.payment_mode.toUpperCase()}`,
        metadata: {
          amount: parseFloat(formData.amount),
          type: formData.type,
          payment_mode: storedPaymentMode,
          date: formData.date,
          vendor: trimmedVendor || null,
          vendor_id: trimmedVendorId || null,
          employee_id: trimmedEmployeeId || null,
          employee_name: trimmedEmployeeName || null,
          party_id: trimmedPartyId || null,
          party_name: trimmedPartyName || null,
          car_id: trimmedCarId || null,
          invoice_number: trimmedInvoiceNumber || null,
          bill_type: shouldAttachBill ? expenseBillType : null,
          bill_url: uploadedBillUrl,
          bill_expires_at: billExpiresAt,
          expense_remarks: shouldAttachBill ? trimmedBillRemarks || null : null,
        },
      });

      toast.success("Entry saved successfully");
      setFormData({
        ...formData,
        description: "",
        amount: "",
        note: "",
        vendor: "",
        vendor_id: "",
        employee_id: "",
        employee_name: "",
        party_id: "",
        party_name: "",
        car_id: "",
        invoice_number: "",
      });
      setToQuery("");
      setIsToFilled(false);
      setActiveToSuggestionIndex(-1);
      setShowToAc(false);
      setIsFilledFromAc(false);
      setAttachExpenseBill(false);
      setExpenseBillFile(null);
      setExpenseBillType("company");
      setExpenseBillRemarks("");
      fetchSuggestions();
      fetchReferenceOptions();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save entry");
    } finally {
      setSubmitting(false);
    }
  };

  const setType = (t: 'debit' | 'credit') => {
    if (t === "credit") {
      setAttachExpenseBill(false);
      setExpenseBillFile(null);
      setExpenseBillType("company");
      setExpenseBillRemarks("");
    }
    setFormData({ ...formData, type: t });
  };

  const setMode = (m: 'cash' | 'eft') => {
    setFormData({ ...formData, payment_mode: m });
  };

  const pickSuggestion = (s: SuggestionRow) => {
    const vendorFromNote = s.vendor ?? extractSellerFromNote(s.note);
    const vendorIdFromNote = s.vendor_id ?? extractTagValue(s.note, "vendor_id");
    const employeeNameFromNote = s.employee_name ?? extractTagValue(s.note, "employee_name");
    const employeeIdFromNote = s.employee_id ?? extractTagValue(s.note, "employee_id");
    const partyNameFromNote = s.party_name ?? extractTagValue(s.note, "party_name");
    const partyIdFromNote = s.party_id ?? extractTagValue(s.note, "party_id");
    const carIdFromNote = s.car_id ?? extractTagValue(s.note, "car_id");
    const invoiceFromNote = s.invoice_number ?? extractTagValue(s.note, "invoice_payment_for");

    setFormData((current) => ({
      ...current,
      type: current.type,
      description: s.description,
      amount: s.source === "history" ? s.amount.toString() : current.amount,
      payment_mode: s.payment_mode,
      note: s.source === "history" ? s.note || "" : current.note,
      vendor: vendorFromNote,
      vendor_id: vendorIdFromNote,
      employee_name: employeeNameFromNote,
      employee_id: employeeIdFromNote,
      party_name: partyNameFromNote,
      party_id: partyIdFromNote,
      car_id: carIdFromNote,
      invoice_number: invoiceFromNote,
    }));
    setIsFilledFromAc(true);
    setFilledDate(s.source === "history" ? s.dt : `From ${s.source || "db"}`);
    setShowAc(false);
    setActiveSuggestionIndex(-1);

    const toLabel =
      employeeNameFromNote ||
      vendorFromNote ||
      partyNameFromNote ||
      carIdFromNote ||
      "";
    if (toLabel) {
      setToQuery(toLabel);
      setIsToFilled(true);
    }
  };

  const clearDesc = () => {
    setFormData({ ...formData, description: "", amount: "" });
    setIsFilledFromAc(false);
    setActiveSuggestionIndex(-1);
  };

  const clearTo = () => {
    setFormData((current) => ({
      ...current,
      party_id: "",
      party_name: "",
      car_id: "",
    }));
    setToQuery("");
    setIsToFilled(false);
    setActiveToSuggestionIndex(-1);
    setShowToAc(false);
  };

  const descriptionSuggestions = React.useMemo(() => {
    const query = formData.description.trim().toLowerCase();
    if (query.length < 2) return [] as SuggestionRow[];

    const historyMatches = suggestions
      .filter((s) => s.description.toLowerCase().includes(query))
      .map((s) => ({ ...s, source: "history" as const }));

    const vendorMatches = vendorOptions
      .filter(
        (vendor) =>
          vendor.name.toLowerCase().includes(query) ||
          String(vendor.vendor_id || "").toLowerCase().includes(query),
      )
      .map((vendor) => ({
        description: `Vendor: ${vendor.name}`,
        amount: 0,
        payment_mode: formData.payment_mode,
        type: formData.type,
        created_at: "",
        note: "",
        dt: "Vendor",
        source: "vendor" as const,
        vendor: vendor.name,
        vendor_id: vendor.vendor_id || undefined,
      }));

    const carMatches = vehicleOptions
      .filter((vehicle) =>
        vehicle.car_id.toLowerCase().includes(query) ||
        String(vehicle.vehicle_reg || "").toLowerCase().includes(query) ||
        String(vehicle.owner_name || "").toLowerCase().includes(query),
      )
      .map((vehicle) => ({
        description: `Car ID: ${vehicle.car_id}`,
        amount: 0,
        payment_mode: formData.payment_mode,
        type: formData.type,
        created_at: "",
        note: "",
        dt: "Vehicle",
        source: "car" as const,
        car_id: vehicle.car_id,
      }));

    const invoiceMatches = invoiceOptions
      .filter((invoice) => invoice.invoice_number.toLowerCase().includes(query))
      .map((invoice) => ({
        description: `Invoice: ${invoice.invoice_number}`,
        amount: 0,
        payment_mode: formData.payment_mode,
        type: formData.type,
        created_at: "",
        note: "",
        dt: "Invoice",
        source: "invoice" as const,
        invoice_number: invoice.invoice_number,
      }));

    return [...historyMatches, ...vendorMatches, ...carMatches, ...invoiceMatches].slice(0, 12);
  }, [formData.description, formData.payment_mode, formData.type, invoiceOptions, suggestions, vehicleOptions, vendorOptions]);

  const toSuggestions = React.useMemo<ToSuggestion[]>(() => {
    const query = toQuery.trim().toLowerCase();
    if (query.length < 2) return [];

    const vendorMatches: ToSuggestion[] = vendorOptions
      .filter(
        (vendor) =>
          vendor.name.toLowerCase().includes(query) ||
          String(vendor.vendor_id || "").toLowerCase().includes(query),
      )
      .map((vendor) => ({
        kind: "vendor" as const,
        label: vendor.name,
        subLabel: vendor.vendor_id ? `Vendor ID: ${vendor.vendor_id}` : "Vendor",
        vendor,
      }));

    const employeeMatches: ToSuggestion[] = employeeOptions
      .filter(
        (employee) =>
          employee.name.toLowerCase().includes(query) ||
          String(employee.employee_id || "").toLowerCase().includes(query),
      )
      .map((employee) => ({
        kind: "employee" as const,
        label: employee.name,
        subLabel: employee.role ? `Employee • ${employee.role}` : "Employee",
        employee,
        displayId: formatEmployeeId(employee.employee_id, employee.id),
      }));

    const carMatches: ToSuggestion[] = vehicleOptions
      .filter(
        (vehicle) =>
          vehicle.car_id.toLowerCase().includes(query) ||
          String(vehicle.vehicle_reg || "").toLowerCase().includes(query) ||
          String(vehicle.owner_name || "").toLowerCase().includes(query),
      )
      .map((vehicle) => ({
        kind: "car" as const,
        label: vehicle.car_id,
        subLabel: vehicle.vehicle_reg
          ? `Vehicle • ${vehicle.vehicle_reg}`
          : vehicle.owner_name
            ? `Owner • ${vehicle.owner_name}`
            : "Vehicle",
        vehicle,
      }));

    const partyMatches: ToSuggestion[] = customParties
      .filter(
        (party) =>
          party.name.toLowerCase().includes(query) ||
          party.id.toLowerCase().includes(query),
      )
      .map((party) => ({
        kind: "party" as const,
        label: party.name,
        subLabel: `Saved ID • ${party.id}`,
        party,
      }));

    const queryExact = query.trim();
    const hasExactMatch =
      vendorOptions.some(
        (vendor) =>
          vendor.name.toLowerCase() === queryExact ||
          String(vendor.vendor_id || "").toLowerCase() === queryExact,
      ) ||
      employeeOptions.some(
        (employee) =>
          employee.name.toLowerCase() === queryExact ||
          String(employee.employee_id || "").toLowerCase() === queryExact,
      ) ||
      vehicleOptions.some(
        (vehicle) =>
          vehicle.car_id.toLowerCase() === queryExact ||
          String(vehicle.vehicle_reg || "").toLowerCase() === queryExact ||
          String(vehicle.owner_name || "").toLowerCase() === queryExact,
      ) ||
      customParties.some(
        (party) => party.name.toLowerCase() === queryExact || party.id.toLowerCase() === queryExact,
      );

    const existingIds = new Set(customParties.map((party) => party.id));
    const createSuggestion: ToSuggestion[] =
      !hasExactMatch && queryExact
        ? [
            {
              kind: "create",
              label: `Create new ID for "${toQuery.trim()}"`,
              subLabel: `New ID • ${createBasicId(toQuery.trim(), existingIds)}`,
              name: toQuery.trim(),
              id: createBasicId(toQuery.trim(), existingIds),
            },
          ]
        : [];

    return [...vendorMatches, ...employeeMatches, ...carMatches, ...partyMatches, ...createSuggestion].slice(0, 12);
  }, [customParties, employeeOptions, toQuery, vendorOptions, vehicleOptions]);

  useEffect(() => {
    if (!showAc || descriptionSuggestions.length === 0) {
      setActiveSuggestionIndex(-1);
      return;
    }
    setActiveSuggestionIndex((current) => {
      if (current < 0) return 0;
      return current >= descriptionSuggestions.length ? descriptionSuggestions.length - 1 : current;
    });
  }, [descriptionSuggestions.length, showAc]);

  useEffect(() => {
    if (!showToAc || toSuggestions.length === 0) {
      setActiveToSuggestionIndex(-1);
      return;
    }
    setActiveToSuggestionIndex((current) => {
      if (current < 0) return 0;
      return current >= toSuggestions.length ? toSuggestions.length - 1 : current;
    });
  }, [showToAc, toSuggestions.length]);

  const pickToSuggestion = (suggestion: ToSuggestion) => {
    if (suggestion.kind === "vendor") {
      setFormData((current) => ({
        ...current,
        vendor: suggestion.vendor.name,
        vendor_id: suggestion.vendor.vendor_id || "",
      }));
      setToQuery(suggestion.vendor.name);
    } else if (suggestion.kind === "employee") {
      const nextEmployeeId = formatEmployeeId(suggestion.employee.employee_id, suggestion.employee.id);
      setFormData((current) => ({
        ...current,
        employee_id: nextEmployeeId,
        employee_name: suggestion.employee.name,
      }));
      setToQuery(suggestion.employee.name);
    } else if (suggestion.kind === "car") {
      setFormData((current) => ({
        ...current,
        car_id: suggestion.vehicle.car_id,
      }));
      setToQuery(suggestion.vehicle.car_id);
    } else if (suggestion.kind === "party") {
      setFormData((current) => ({
        ...current,
        party_id: suggestion.party.id,
        party_name: suggestion.party.name,
      }));
      setToQuery(suggestion.party.name);
    } else if (suggestion.kind === "create") {
      const newParty: CustomPartyOption = {
        id: suggestion.id,
        name: suggestion.name,
        created_at: new Date().toISOString(),
      };
      const next = [newParty, ...customParties.filter((party) => party.id !== newParty.id)];
      setCustomParties(next);
      persistCustomParties(next);
      setFormData((current) => ({
        ...current,
        party_id: newParty.id,
        party_name: newParty.name,
      }));
      setToQuery(newParty.name);
    }
    setIsToFilled(true);
    setShowToAc(false);
    setActiveToSuggestionIndex(-1);
  };

  const handleToKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    const key = event.key;
    const isArrowDown = key === "ArrowDown" || key === "Down";
    const isArrowUp = key === "ArrowUp" || key === "Up";

    if (isArrowDown) {
      if (!showToAc) setShowToAc(true);
      if (toSuggestions.length === 0) return;
      event.preventDefault();
      setActiveToSuggestionIndex((current) =>
        current < 0 ? 0 : Math.min(current + 1, toSuggestions.length - 1),
      );
      return;
    }

    if (isArrowUp) {
      if (!showToAc) setShowToAc(true);
      if (toSuggestions.length === 0) return;
      event.preventDefault();
      setActiveToSuggestionIndex((current) =>
        current < 0 ? toSuggestions.length - 1 : Math.max(current - 1, 0),
      );
      return;
    }

    if (key === "Enter" && showToAc && toSuggestions.length > 0) {
      event.preventDefault();
      const index = activeToSuggestionIndex >= 0 ? activeToSuggestionIndex : 0;
      const selected = toSuggestions[index];
      if (selected) pickToSuggestion(selected);
      return;
    }

    if (key === "Escape" && showToAc) {
      event.preventDefault();
      setShowToAc(false);
      setActiveToSuggestionIndex(-1);
    }
  };

  const handleDescriptionKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    const key = event.key;
    const isArrowDown = key === "ArrowDown" || key === "Down";
    const isArrowUp = key === "ArrowUp" || key === "Up";

    if (isArrowDown) {
      if (!showAc) setShowAc(true);
      if (descriptionSuggestions.length === 0) return;
      event.preventDefault();
      setActiveSuggestionIndex((current) =>
        current < 0 ? 0 : Math.min(current + 1, descriptionSuggestions.length - 1)
      );
      return;
    }

    if (isArrowUp) {
      if (!showAc) setShowAc(true);
      if (descriptionSuggestions.length === 0) return;
      event.preventDefault();
      setActiveSuggestionIndex((current) =>
        current < 0 ? descriptionSuggestions.length - 1 : Math.max(current - 1, 0)
      );
      return;
    }

    if (key === "Enter" && showAc && descriptionSuggestions.length > 0) {
      event.preventDefault();
      const index = activeSuggestionIndex >= 0 ? activeSuggestionIndex : 0;
      const selected = descriptionSuggestions[index];
      if (selected) pickSuggestion(selected);
      return;
    }

    if (key === "Escape" && showAc) {
      event.preventDefault();
      setShowAc(false);
      setActiveSuggestionIndex(-1);
    }
  };

  useEffect(() => {
    if (!showAc || activeSuggestionIndex < 0) return;
    const activeItem = suggestionListRef.current?.querySelector(
      `[data-suggestion-index="${activeSuggestionIndex}"]`
    );
    if (activeItem instanceof HTMLElement) {
      activeItem.scrollIntoView({ block: "nearest" });
    }
  }, [activeSuggestionIndex, showAc]);

  useEffect(() => {
    if (!showToAc || activeToSuggestionIndex < 0) return;
    const activeItem = toSuggestionListRef.current?.querySelector(
      `[data-to-suggestion-index="${activeToSuggestionIndex}"]`,
    );
    if (activeItem instanceof HTMLElement) {
      activeItem.scrollIntoView({ block: "nearest" });
    }
  }, [activeToSuggestionIndex, showToAc]);

  const toDisplayId =
    formData.party_id ||
    formData.car_id ||
    formData.employee_id ||
    formData.vendor_id ||
    "";
  const toDisplayLabel =
    formData.party_name ||
    formData.car_id ||
    formData.employee_name ||
    formData.vendor ||
    "";

  return (
    <div className="flex flex-col min-h-screen bg-[#f9fafb] font-['DM_Sans'] relative">
      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=DM+Mono:wght@400;500&display=swap');
        .daybook-amount-input::-webkit-outer-spin-button,
        .daybook-amount-input::-webkit-inner-spin-button {
          -webkit-appearance: none;
          margin: 0;
        }
        .daybook-amount-input {
          -moz-appearance: textfield;
        }
      `}</style>
      
      {/* Content Area - Full Width Card */}
      <div className="flex-1">
        <div className="w-full bg-white rounded-[32px] shadow-[0_4px_25px_rgba(0,0,0,0.03)] border border-black/[0.03] p-12 min-h-[calc(100vh-100px)] animate-in fade-in slide-in-from-bottom-2 duration-300">
          
          <div className="mb-10 flex items-start justify-between">
            <div>
              <h1 className="text-[24px] font-semibold text-[#111827] tracking-tight">New day book entry</h1>
              <p className="text-[14px] text-[#6b7280] mt-1">Balances update automatically based on payment mode.</p>
            </div>
            <div className="flex items-center gap-3">
              <Link
                href="/daybook/history?view=expense-bills"
                className="flex items-center gap-2 px-5 py-2.5 bg-white border border-zinc-200 rounded-xl text-[13px] font-semibold text-zinc-600 hover:bg-zinc-100 hover:text-zinc-950 transition-all decoration-none"
              >
                <FileText className="w-4 h-4" />
                Expense bill logs
              </Link>
              <Link 
                href="/daybook/history" 
                className="flex items-center gap-2 px-5 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-[13px] font-semibold text-zinc-600 hover:bg-zinc-100 hover:text-zinc-950 transition-all decoration-none"
              >
                <FileText className="w-4 h-4" />
                View all entries
              </Link>
            </div>
          </div>

          <form onSubmit={handleSave} className="space-y-8">
            
            {/* Entry Type */}
            <div className="space-y-2.5">
              <label className="block text-[12px] font-semibold text-[#6b7280] uppercase tracking-wider">Entry type</label>
              <div className="inline-flex bg-[#f3f4f6] p-1 rounded-[10px] gap-0.5">
                <button 
                  type="button"
                  onClick={() => setType('debit')}
                  className={cn(
                    "flex items-center gap-1.5 px-5 py-2 rounded-[8px] text-[13px] font-medium transition-all",
                    formData.type === 'debit' ? "bg-white text-[#dc2626] shadow-sm" : "text-[#6b7280] hover:bg-white/50"
                  )}
                >
                  <TrendingDown className="w-3.5 h-3.5" />
                  Debit (expense)
                </button>
                <button 
                  type="button"
                  onClick={() => setType('credit')}
                  className={cn(
                    "flex items-center gap-1.5 px-5 py-2 rounded-[8px] text-[13px] font-medium transition-all",
                    formData.type === 'credit' ? "bg-white text-[#16a34a] shadow-sm" : "text-[#6b7280] hover:bg-white/50"
                  )}
                >
                  <TrendingUp className="w-3.5 h-3.5" />
                  Credit (income)
                </button>
              </div>
            </div>

            {/* Date */}
            <div className="space-y-2.5">
              <label className="block text-[12px] font-semibold text-[#6b7280] uppercase tracking-wider">Date</label>
              <input 
                type="date"
                className="w-[200px] bg-transparent border-0 border-b-2 border-[#e5e7eb] outline-none focus:border-zinc-400 py-2 text-[15px] font-['DM_Mono'] text-[#111827] transition-colors"
                value={formData.date}
                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
              />
            </div>

            {/* Description */}
            <div className="space-y-2.5">
              <label className="block text-[12px] font-semibold text-[#6b7280] uppercase tracking-wider">
                {formData.type === "debit" ? "Expense / bill name" : "Description"}
              </label>
              <div className="relative group">
                <div className="relative">
                  <input 
                    type="text"
                    placeholder={formData.type === "debit" ? "e.g. Workshop petty cash bill" : "e.g. Brake pad purchase"}
                    className={cn(
                      "w-full bg-transparent border-0 border-b-2 outline-none py-2 text-[15px] transition-colors",
                      isFilledFromAc
                        ? "border-[#16a34a] text-[#15803d]"
                        : "border-[#e5e7eb] text-[#111827] focus:border-zinc-400"
                    )}
                    value={formData.description}
                    onChange={(e) => {
                      setFormData({ ...formData, description: e.target.value });
                      setIsFilledFromAc(false);
                      setShowAc(true);
                      setActiveSuggestionIndex(-1);
                    }}
                    onFocus={() => setShowAc(true)}
                    onKeyDown={handleDescriptionKeyDown}
                    onBlur={() => setTimeout(() => setShowAc(false), 200)}
                    autoComplete="off"
                    aria-controls="daybook-description-suggestions"
                    aria-activedescendant={
                      showAc && activeSuggestionIndex >= 0
                        ? `daybook-description-suggestion-${activeSuggestionIndex}`
                        : undefined
                    }
                  />
                  {isFilledFromAc && formData.description ? (
                    <button
                      type="button"
                      onClick={clearDesc}
                      className="absolute right-0 top-1/2 -translate-y-1/2 text-[#15803d] hover:bg-[#dcfce7] rounded-full p-1 transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  ) : null}
                </div>

                {isFilledFromAc && (
                  <div className="flex items-center gap-1.5 mt-2 text-[11px] text-[#6366f1] animate-in slide-in-from-top-1 duration-200">
                    <CheckCircle2 className="w-3 h-3" />
                    Auto-filled from previous entry · {filledDate}
                  </div>
                )}

                {showAc && formData.description.length >= 2 && !isFilledFromAc && (
                  <div
                    role="listbox"
                    id="daybook-description-suggestions"
                    ref={suggestionListRef}
                    className="absolute top-full left-0 right-0 mt-2 bg-white border border-[#e5e7eb] rounded-[12px] shadow-[0_8px_28px_rgba(0,0,0,0.1)] z-50 overflow-hidden py-1 animate-in zoom-in-95 duration-200"
                  >
                    <div className="px-4 py-2 bg-[#f5f5ff] border-b border-[#e5e7eb]/50 flex items-center gap-2 text-[11px] font-semibold text-[#6366f1]">
                      <History className="w-3 h-3" />
                      Description search
                    </div>
                    {descriptionSuggestions.map((s, idx) => {
                      const isActive = idx === activeSuggestionIndex;
                      return (
                        <button 
                          key={`${s.source || "history"}-${s.description}-${idx}`}
                          id={`daybook-description-suggestion-${idx}`}
                          data-suggestion-index={idx}
                          type="button"
                          onMouseDown={() => pickSuggestion(s)}
                          onMouseEnter={() => setActiveSuggestionIndex(idx)}
                          role="option"
                          aria-selected={isActive}
                          className={cn(
                            "w-full px-4 py-3 text-left flex items-center justify-between transition-colors group",
                            isActive ? "bg-[#eef2ff]" : "hover:bg-[#f5f5ff]"
                          )}
                        >
                          <div className="flex items-center gap-3">
                            <div className={cn("w-2 h-2 rounded-full", s.type === 'debit' ? "bg-[#dc2626]" : "bg-[#16a34a]")} />
                            <div>
                              <span className="text-[14px] font-medium text-[#111827] group-hover:text-[#6366f1] transition-colors">{s.description}</span>
                              <div className="flex flex-col mt-0.5">
                                 <div className="flex items-center gap-2">
                                   <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full uppercase bg-slate-100 text-slate-600">
                                     {s.source || "history"}
                                   </span>
                                   {s.source === 'history' ? (
                                     <>
                                       <span className={cn("text-[9px] font-semibold px-1.5 py-0.5 rounded-full uppercase", 
                                         s.payment_mode === 'cash' ? "bg-[#dcfce7] text-[#15803d]" : "bg-[#dbeafe] text-[#1d4ed8]"
                                       )}>{s.payment_mode}</span>
                                       {s.note && <span className="text-[9px] text-[#9ca3af] font-['DM_Mono'] truncate max-w-[120px]">· {s.note}</span>}
                                     </>
                                   ) : null}
                                 </div>
                              </div>
                            </div>
                          </div>
                          <div className="text-right">
                             <div className={cn("text-[13px] font-semibold font-['DM_Mono']", s.type === 'debit' ? "text-[#dc2626]" : "text-[#16a34a]")}>
                               {s.source === "history" ? `₹${s.amount.toLocaleString()}` : "Select"}
                             </div>
                             <div className="text-[10px] text-[#9ca3af]">{s.dt}</div>
                          </div>
                        </button>
                      );
                    })
                    }
                    {descriptionSuggestions.length === 0 ? (
                      <div className="px-4 py-3 text-[12px] text-[#9ca3af]">No matching vendors, car IDs, invoices, or past entries.</div>
                    ) : null}
                  </div>
                )}
              </div>
            </div>

            {/* To */}
            <div className="space-y-2.5">
              <label className="block text-[12px] font-semibold text-[#6b7280] uppercase tracking-wider">Custom search / reference</label>
              <div className="relative group">
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Search vendor, employee, car ID, or custom ID..."
                    className={cn(
                      "w-full bg-transparent border-0 border-b-2 outline-none py-2 text-[15px] transition-colors",
                      isToFilled
                        ? "border-[#16a34a] text-[#15803d]"
                        : "border-[#e5e7eb] text-[#111827] focus:border-zinc-400",
                    )}
                    value={toQuery}
                    onChange={(e) => {
                      const value = e.target.value;
                      setToQuery(value);
                      setIsToFilled(false);
                      setShowToAc(true);
                      setActiveToSuggestionIndex(-1);
                      setFormData((current) => ({
                        ...current,
                        party_id: "",
                        party_name: "",
                        car_id: "",
                      }));
                    }}
                    onFocus={() => setShowToAc(true)}
                    onKeyDown={handleToKeyDown}
                    onBlur={() => setTimeout(() => setShowToAc(false), 200)}
                    autoComplete="off"
                    aria-controls="daybook-to-suggestions"
                    aria-activedescendant={
                      showToAc && activeToSuggestionIndex >= 0
                        ? `daybook-to-suggestion-${activeToSuggestionIndex}`
                        : undefined
                    }
                  />
                  {isToFilled && toQuery ? (
                    <button
                      type="button"
                      onClick={clearTo}
                      className="absolute right-0 top-1/2 -translate-y-1/2 text-[#15803d] hover:bg-[#dcfce7] rounded-full p-1 transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  ) : null}
                </div>

                {isToFilled && toDisplayLabel ? (
                  <div className="flex items-center gap-1.5 mt-2 text-[11px] text-[#0f766e] animate-in slide-in-from-top-1 duration-200">
                    <CheckCircle2 className="w-3 h-3" />
                    <span>
                      {toDisplayLabel}
                      {toDisplayId ? ` · ID: ${toDisplayId}` : ""}
                    </span>
                  </div>
                ) : null}

                {showToAc && toQuery.length >= 2 && !isToFilled && (
                  <div
                    role="listbox"
                    id="daybook-to-suggestions"
                    ref={toSuggestionListRef}
                    className="absolute top-full left-0 right-0 mt-2 bg-white border border-[#e5e7eb] rounded-[12px] shadow-[0_8px_28px_rgba(0,0,0,0.1)] z-50 overflow-hidden py-1 animate-in zoom-in-95 duration-200"
                  >
                    <div className="px-4 py-2 bg-[#f5f5ff] border-b border-[#e5e7eb]/50 flex items-center gap-2 text-[11px] font-semibold text-[#6366f1]">
                      <History className="w-3 h-3" />
                      To search
                    </div>
                    {toSuggestions.map((s, idx) => {
                      const isActive = idx === activeToSuggestionIndex;
                      const badge = s.kind === "create" ? "new" : s.kind;
                      const rightText =
                        s.kind === "vendor"
                          ? s.vendor.vendor_id || "Select"
                          : s.kind === "employee"
                            ? s.displayId
                            : s.kind === "car"
                              ? s.vehicle.car_id
                              : s.kind === "party"
                                ? s.party.id
                                : s.id;
                      return (
                        <button
                          key={`${s.kind}-${s.label}-${idx}`}
                          id={`daybook-to-suggestion-${idx}`}
                          data-to-suggestion-index={idx}
                          type="button"
                          onMouseDown={() => pickToSuggestion(s)}
                          onMouseEnter={() => setActiveToSuggestionIndex(idx)}
                          role="option"
                          aria-selected={isActive}
                          className={cn(
                            "w-full px-4 py-3 text-left flex items-center justify-between transition-colors group",
                            isActive ? "bg-[#eef2ff]" : "hover:bg-[#f5f5ff]",
                          )}
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-2 h-2 rounded-full bg-[#6366f1]" />
                            <div>
                              <span className="text-[14px] font-medium text-[#111827] group-hover:text-[#6366f1] transition-colors">
                                {s.label}
                              </span>
                              <div className="flex flex-col mt-0.5">
                                <div className="flex items-center gap-2">
                                  <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full uppercase bg-slate-100 text-slate-600">
                                    {badge}
                                  </span>
                                  <span className="text-[9px] text-[#9ca3af] font-['DM_Mono'] truncate max-w-[160px]">
                                    {s.subLabel}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-[12px] font-semibold font-['DM_Mono'] text-[#111827]">
                              {rightText}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                    {toSuggestions.length === 0 ? (
                      <div className="px-4 py-3 text-[12px] text-[#9ca3af]">
                        No matching vendors, employees, car IDs, or saved IDs.
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            </div>

            {/* Amount */}
            <div className="space-y-2.5">
              <label className="block text-[12px] font-semibold text-[#6b7280] uppercase tracking-wider">Amount (₹)</label>
              <div className="flex items-baseline gap-1.5 border-b-2 border-[#e5e7eb] focus-within:border-zinc-400 transition-colors pb-1">
                <span className="text-[22px] font-medium text-[#6b7280] font-['DM_Mono']">₹</span>
                <input 
                  type="number"
                  placeholder="0"
                  className={cn(
                    "daybook-amount-input flex-1 bg-transparent border-none outline-none py-1 text-[32px] font-semibold font-['DM_Mono'] tracking-tight transition-colors",
                    formData.type === 'debit' ? "text-[#dc2626]" : "text-[#16a34a]",
                    !formData.amount && "placeholder-[#e5e7eb]"
                  )}
                  value={formData.amount}
                  onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                  onWheel={(e) => e.currentTarget.blur()}
                  onKeyDown={(e) => {
                    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
                      e.preventDefault();
                    }
                  }}
                />
                {isFilledFromAc && <span className="text-[12px] text-[#9ca3af] mb-2">Edit if changed</span>}
              </div>
            </div>

            {/* Mode */}
            <div className="space-y-2.5">
              <label className="block text-[12px] font-semibold text-[#6b7280] uppercase tracking-wider">Mode of payment</label>
              <div className="flex flex-wrap gap-2.5">
                <ModeBtn 
                  icon={Wallet} 
                  label="Cash" 
                  active={formData.payment_mode === 'cash'} 
                  onClick={() => setMode('cash')} 
                  activeClass="border-[#16a34a] text-[#15803d] bg-[#f0fdf4]" 
                  iconColor="#16a34a"
                />
                <ModeBtn 
                  icon={Smartphone} 
                  label="EFT" 
                  active={formData.payment_mode === 'eft'} 
                  onClick={() => setMode('eft')} 
                  activeClass="border-[#6366f1] text-[#6366f1] bg-[#f5f5ff]" 
                  iconColor="#6366f1"
                />
              </div>
              <div className="flex items-center gap-1.5 mt-2 text-[12px] text-[#9ca3af]">
                <Info className="w-3.5 h-3.5 text-[#6366f1]" />
                <span>
                  {formData.payment_mode === 'cash' ? "Cash → updates Petty Cash balance" : "EFT → updates Bank balance"}
                </span>
              </div>
            </div>

            {formData.type === "debit" ? (
              <div id="expense-bill-upload" className="space-y-4 rounded-[20px] border border-[#e5e7eb] bg-[#fafbff] p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-[13px] font-semibold uppercase tracking-wider text-[#6b7280]">Expense Bill</div>
                    <p className="mt-1 text-[13px] text-[#9ca3af]">
                      Use this same entry and attach the bill only if needed.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const next = !attachExpenseBill;
                      setAttachExpenseBill(next);
                      if (!next) {
                        setExpenseBillFile(null);
                        setExpenseBillType("company");
                        setExpenseBillRemarks("");
                      }
                    }}
                    className={cn(
                      "rounded-xl border px-4 py-2 text-[12px] font-semibold transition-all",
                      attachExpenseBill
                        ? "border-indigo-200 bg-indigo-50 text-indigo-700"
                        : "border-[#e5e7eb] bg-white text-[#6b7280] hover:border-indigo-200 hover:text-indigo-700"
                    )}
                  >
                    {attachExpenseBill ? "Bill Attached" : "Attach Bill"}
                  </button>
                </div>

                {attachExpenseBill ? (
                  <div className="space-y-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#9ca3af]">
                          Bill Type
                        </label>
                        <select
                          className="w-full rounded-xl border border-[#e5e7eb] bg-white px-3 py-2.5 text-[14px] text-[#111827] outline-none focus:border-[#6366f1]"
                          value={expenseBillType}
                          onChange={(e) => setExpenseBillType(e.target.value as "company" | "employee")}
                        >
                          <option value="company">Company</option>
                          <option value="employee">Employee</option>
                        </select>
                      </div>

                      <div className="space-y-2">
                        <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#9ca3af]">
                          Bill File
                        </label>
                        <input
                          type="file"
                          accept="image/*,application/pdf,.pdf"
                          className="block w-full rounded-xl border border-[#e5e7eb] bg-white px-3 py-2.5 text-[13px] text-[#374151] file:mr-3 file:rounded-lg file:border-0 file:bg-[#eef2ff] file:px-3 file:py-1.5 file:text-[12px] file:font-semibold file:text-[#4f46e5]"
                          onChange={(e) => setExpenseBillFile(e.target.files?.[0] || null)}
                        />
                      </div>
                    </div>

                    {expenseBillType === "employee" ? (
                      <div className="space-y-2">
                        <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#9ca3af]">
                          Remarks
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. Travel reimbursement"
                          className="w-full rounded-xl border border-[#e5e7eb] bg-white px-3 py-2.5 text-[14px] text-[#111827] outline-none focus:border-[#6366f1]"
                          value={expenseBillRemarks}
                          onChange={(e) => setExpenseBillRemarks(e.target.value)}
                        />
                      </div>
                    ) : null}

                    <div className="rounded-xl bg-white px-4 py-3 text-[12px] text-[#6b7280]">
                      {expenseBillType === "employee"
                        ? `Pick the employee in reference above${formData.employee_name ? `: ${formData.employee_name}` : ""}.`
                        : `Vendor can be selected in reference above${formData.vendor ? `: ${formData.vendor}` : ""}.`}
                    </div>

                    {expenseBillFile ? (
                      <div className="flex items-center justify-between gap-3 text-[12px] text-[#6b7280]">
                        <span className="truncate">{expenseBillFile.name}</span>
                        <button
                          type="button"
                          onClick={() => setExpenseBillFile(null)}
                          className="text-[#dc2626] transition-colors hover:text-[#b91c1c]"
                        >
                          Remove
                        </button>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : null}

            {/* Note */}
            <div className="space-y-2.5">
              <label className="block text-[12px] font-semibold text-[#6b7280] uppercase tracking-wider">Note <span className="normal-case font-normal text-[#9ca3af]">(optional)</span></label>
              <input 
                type="text"
                placeholder="Add a note…"
                className="w-full bg-transparent border-0 border-b-2 border-[#e5e7eb] outline-none focus:border-zinc-400 py-2 text-[15px] text-[#111827] transition-colors"
                value={formData.note}
                onChange={(e) => setFormData({ ...formData, note: e.target.value })}
              />
            </div>

            {/* Preview */}
            <div className="flex items-center justify-between py-[18px] border-y border-[#e5e7eb] my-8 animate-in fade-in duration-300">
              <div className="flex items-center gap-2.5">
                <div className={cn("w-2.5 h-2.5 rounded-full", formData.type === 'debit' ? "bg-[#dc2626]" : "bg-[#16a34a]")} />
                <div>
                  <div className="text-[14px] font-medium text-[#111827] decoration-none">{formData.description || "Entry preview"}</div>
                  <div className="text-[12px] text-[#9ca3af] mt-0.5 uppercase">
                    {formData.payment_mode} · {formData.type}
                    {formData.vendor ? ` · Vendor: ${formData.vendor}` : ""}
                    {formData.employee_name ? ` · Employee: ${formData.employee_name}` : ""}
                    {formData.party_name
                      ? ` · Party: ${formData.party_name}${formData.party_id ? ` (${formData.party_id})` : ""}`
                      : ""}
                    {formData.car_id ? ` · Car: ${formData.car_id}` : ""}
                    {formData.invoice_number ? ` · Invoice: ${formData.invoice_number}` : ""}
                  </div>
                </div>
              </div>
              <div className={cn("text-[22px] font-semibold font-['DM_Mono'] tracking-tight", formData.type === 'debit' ? "text-[#dc2626]" : "text-[#16a34a]")}>
                {formData.type === 'debit' ? "−" : "+"}₹{Number(formData.amount || 0).toLocaleString()}
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-3.5">
              <button 
                type="submit"
                disabled={submitting}
                className={cn(
                  "h-11 px-8 rounded-[8px] text-[14px] font-semibold text-white transition-all flex items-center gap-2 shadow-sm decoration-none",
                  formData.type === 'debit' ? "bg-[#6366f1] hover:bg-[#4f46e5]" : "bg-[#16a34a] hover:bg-[#15803d]"
                )}
              >
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <SaveIcon className="w-4 h-4" />}
                {submitting ? "Saving..." : "Save entry"}
              </button>
              <button type="button" onClick={() => window.history.back()} className="text-[14px] text-[#6b7280] hover:text-[#dc2626] font-medium transition-colors cursor-pointer bg-none border-none p-0">
                 Cancel
              </button>
              <div className="ml-auto text-[12px] text-[#9ca3af] flex items-center gap-1.5">
                 <CheckCircle2 className="w-3.5 h-3.5 text-[#16a34a]" />
                 Balance updates automatically
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

function ModeBtn({
  icon: Icon,
  label,
  active,
  onClick,
  activeClass,
  iconColor,
}: {
  icon: LucideIcon;
  label: string;
  active: boolean;
  onClick: () => void;
  activeClass: string;
  iconColor: string;
}) {
  return (
    <button 
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 px-4 py-2.5 rounded-[8px] border-[1.5px] border-[#e5e7eb] bg-white text-[13px] font-medium text-[#6b7280] transition-all",
        active ? activeClass : "hover:border-[#6366f1] hover:text-[#6366f1] group"
      )}
    >
      <Icon className="w-4 h-4" style={{ color: active ? iconColor : 'inherit' }} />
      {label}
    </button>
  );
}
