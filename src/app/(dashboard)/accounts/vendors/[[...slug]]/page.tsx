"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { BookOpen, Building2, Edit2, Eye, FileText, Mail, MapPin, Phone, Plus, Receipt, Save, Search, TrendingDown, TrendingUp, Wallet, X } from "lucide-react";
import { format } from "date-fns";
import { supabase } from "@/lib/supabase";
import { computeCreditPendingRows, extractVendorPaymentSellerKey, normalizeVendorKey } from "@/lib/vendor-credit";
import { loadVendorRegistry, syncVendorRecord, type VendorRecord } from "@/lib/vendor-registry";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import {
  VendorRegistrationForm,
  type VendorRegistrationFormData,
} from "@/components/VendorRegistrationForm";
import { DetailMetricRow, DetailPageScaffold, PreviewPanel, RecordBadge } from "@/components/DetailPageScaffold";

type TransactionRow = {
  id: string;
  description: string;
  amount: number;
  type: "credit" | "debit";
  payment_mode: "cash" | "upi" | "card" | "cheque";
  date: string;
  created_at: string;
  note?: string | null;
};

type SparePartRow = {
  id: string;
  name: string;
  seller: string;
  car_name?: string | null;
  cat: string;
  stock: number;
  cost: number;
  created_at: string;
};

type LedgerEntry = {
  id: string;
  date: string;
  description: string;
  invoiceNo: string;
  partsSummary: string;
  mode: string;
  debit: number;
  credit: number;
  entryType: "purchase" | "old_stock" | "payment";
};

type VendorFormState = VendorRegistrationFormData;

function extractSellerFromNote(note?: string | null) {
  const match = String(note || "").match(/Seller:\s*([^|]+)/i);
  return match?.[1]?.trim() || "—";
}

function extractPartsFromNote(note?: string | null) {
  const match = String(note || "").match(/Parts:\s*([^|]+)/i);
  if (!match?.[1]) return [] as string[];
  return match[1].split(",").map((item) => item.trim()).filter(Boolean);
}

function extractInvoiceFromNote(note?: string | null) {
  const match = String(note || "").match(/Invoice:\s*([^|]+)/i);
  return match?.[1]?.trim() || "";
}

function extractModeFromNote(note?: string | null) {
  const match = String(note || "").match(/Mode:\s*([^|]+)/i);
  return match?.[1]?.trim() || "";
}

function isCreditPurchaseTransaction(txn: TransactionRow) {
  return (
    txn.type === "debit" &&
    txn.description.toLowerCase().includes("spare parts purchase") &&
    (txn.note || "").toLowerCase().includes("mode: credit")
  );
}

function formatAmount(value: number) {
  return `₹${Math.round(value).toLocaleString("en-IN")}`;
}

const VENDOR_ID_LENGTH = 6;
const VENDOR_ID_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

function generateVendorIdCandidate() {
  const values = new Uint32Array(VENDOR_ID_LENGTH);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(values);
  } else {
    for (let i = 0; i < values.length; i += 1) {
      values[i] = Math.floor(Math.random() * 256);
    }
  }
  return Array.from(values)
    .map((value) => VENDOR_ID_ALPHABET[value % VENDOR_ID_ALPHABET.length])
    .join("");
}

async function generateUniqueVendorId() {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const candidate = generateVendorIdCandidate();
    const { data, error } = await supabase
      .from("vendors")
      .select("id")
      .eq("vendor_id", candidate)
      .maybeSingle();
    if (error) {
      return candidate;
    }
    if (!data) {
      return candidate;
    }
  }
  return generateVendorIdCandidate();
}

const EMPTY_FORM: VendorFormState = {
  vendor_id: "",
  name: "",
  phone: "",
  email: "",
  gstin: "",
  address: "",
  notes: "",
};

export default function VendorManagementPage() {
  const params = useParams();
  const router = useRouter();
  const slug = params?.slug as string[] | undefined;
  const routeIsNew = slug?.[0] === "new";
  const routeIsLedger = !routeIsNew && slug?.length === 2 && slug[1] === "ledger";
  const routeVendorKey = slug && slug.length > 0 && !routeIsNew ? decodeURIComponent(slug[0]) : "";
  const ledgerVendorKey = routeIsLedger ? routeVendorKey : "";

  const [vendors, setVendors] = useState<VendorRecord[]>([]);
  const [transactions, setTransactions] = useState<TransactionRow[]>([]);
  const [parts, setParts] = useState<SparePartRow[]>([]);
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const [vendorsTableAvailable, setVendorsTableAvailable] = useState(true);
  const [loading, setLoading] = useState(true);
  const [newVendorId, setNewVendorId] = useState("");

  const loadData = async () => {
    setLoading(true);
    const [vendorRegistry, txResponse, partResponse] = await Promise.all([
      loadVendorRegistry(),
      supabase.from("transactions").select("id, description, amount, type, payment_mode, date, created_at, note").order("date", { ascending: false }).order("created_at", { ascending: false }),
      supabase.from("spare_parts").select("id, name, seller, car_name, cat, stock, cost, created_at").order("created_at", { ascending: false }),
    ]);

    setVendors(vendorRegistry.data);
    setVendorsTableAvailable(!vendorRegistry.error);
    setTransactions(((txResponse.data || []) as TransactionRow[]).map((row) => ({ ...row, amount: Number(row.amount) })));
    setParts(((partResponse.data || []) as SparePartRow[]).map((row) => ({ ...row, stock: Number(row.stock || 0), cost: Number(row.cost || 0) })));
    setLoading(false);
  };

  useEffect(() => {
    const initialize = async () => {
      await loadData();
    };

    void initialize();
  }, []);

  const vendorSummaries = useMemo(() => {
    const creditRows = computeCreditPendingRows(
      transactions
        .filter(isCreditPurchaseTransaction)
        .map((txn) => ({
          id: txn.id,
          seller: extractSellerFromNote(txn.note),
          description: txn.description,
          date: txn.date || txn.created_at,
          originalAmount: Math.max(0, Number(txn.amount || 0)),
          partNames: extractPartsFromNote(txn.note),
        })),
      transactions,
    );

    const paymentsByVendor = new Map<string, number>();
    transactions.forEach((txn) => {
      const sellerKey = extractVendorPaymentSellerKey(txn.note);
      if (!sellerKey) return;
      paymentsByVendor.set(sellerKey, (paymentsByVendor.get(sellerKey) || 0) + Math.max(0, Number(txn.amount || 0)));
    });

    const summaryMap = new Map<string, {
      key: string;
      name: string;
      vendor?: VendorRecord;
      partCount: number;
      stockUnits: number;
      inventoryValue: number;
      totalDue: number;
      totalPaid: number;
      purchaseCount: number;
      lastPurchaseDate: string;
    }>();

    vendors.forEach((vendor) => {
      const key = normalizeVendorKey(vendor.name);
      if (!key) return;
      summaryMap.set(key, {
        key,
        name: vendor.name,
        vendor,
        partCount: 0,
        stockUnits: 0,
        inventoryValue: 0,
        totalDue: 0,
        totalPaid: paymentsByVendor.get(key) || 0,
        purchaseCount: 0,
        lastPurchaseDate: "",
      });
    });

    parts.forEach((part) => {
      const key = normalizeVendorKey(part.seller);
      if (!key) return;
      const current = summaryMap.get(key) || {
        key,
        name: part.seller,
        partCount: 0,
        stockUnits: 0,
        inventoryValue: 0,
        totalDue: paymentsByVendor.get(key) || 0,
        totalPaid: paymentsByVendor.get(key) || 0,
        purchaseCount: 0,
        lastPurchaseDate: "",
      };
      current.partCount += 1;
      current.stockUnits += Number(part.stock || 0);
      current.inventoryValue += Number(part.stock || 0) * Number(part.cost || 0);
      summaryMap.set(key, current);
    });

    creditRows.forEach((row) => {
      const key = normalizeVendorKey(row.seller);
      if (!key) return;
      const current = summaryMap.get(key) || {
        key,
        name: row.seller,
        partCount: 0,
        stockUnits: 0,
        inventoryValue: 0,
        totalDue: 0,
        totalPaid: paymentsByVendor.get(key) || 0,
        purchaseCount: 0,
        lastPurchaseDate: "",
      };
      current.totalDue += Number(row.pendingAmount || 0);
      current.purchaseCount += 1;
      if (!current.lastPurchaseDate || new Date(row.date).getTime() > new Date(current.lastPurchaseDate).getTime()) {
        current.lastPurchaseDate = row.date;
      }
      summaryMap.set(key, current);
    });

    return Array.from(summaryMap.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [parts, transactions, vendors]);

  const filteredVendors = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return vendorSummaries.filter((vendor) => !normalizedQuery || vendor.name.toLowerCase().includes(normalizedQuery));
  }, [query, vendorSummaries]);

  const activeVendorKey = useMemo(() => {
    if (routeIsNew || routeIsLedger) return "";
    if (routeVendorKey && vendorSummaries.some((vendor) => vendor.key === routeVendorKey)) {
      return routeVendorKey;
    }
    return "";
  }, [routeIsNew, routeIsLedger, routeVendorKey, vendorSummaries]);

  const selectedSummary = useMemo(
    () => vendorSummaries.find((vendor) => vendor.key === activeVendorKey || vendor.key === ledgerVendorKey) || null,
    [activeVendorKey, ledgerVendorKey, vendorSummaries],
  );

  const selectedParts = useMemo(
    () => parts.filter((part) => normalizeVendorKey(part.seller) === activeVendorKey).slice(0, 12),
    [activeVendorKey, parts],
  );

  const selectedPayments = useMemo(
    () =>
      transactions
        .filter((txn) => extractVendorPaymentSellerKey(txn.note) === activeVendorKey)
        .slice(0, 12),
    [activeVendorKey, transactions],
  );

  const vendorLedgerEntries = useMemo((): LedgerEntry[] => {
    const targetKey = activeVendorKey || ledgerVendorKey;
    if (!targetKey) return [];
    const entries: LedgerEntry[] = [];
    const vendorPurchaseIds = new Set<string>();

    transactions.forEach((txn) => {
      if (txn.type !== "debit") return;
      const desc = txn.description.toLowerCase();
      const isSparePurchase = desc.includes("spare parts purchase");
      const isOldStockRef = desc.startsWith("old stock ref");
      if (!isSparePurchase && !isOldStockRef) return;
      const sellerKey = normalizeVendorKey(extractSellerFromNote(txn.note));
      if (sellerKey !== targetKey) return;

      vendorPurchaseIds.add(txn.id);
      const parts = extractPartsFromNote(txn.note);
      const partsSummary = parts.length
        ? parts.map((p) => p.replace(/\s*\([^)]*\)\s*$/, "").trim()).filter(Boolean).join(", ")
        : "";

      entries.push({
        id: txn.id,
        date: txn.date || txn.created_at.split("T")[0],
        description: isOldStockRef ? "Old Stock Entry" : txn.description,
        invoiceNo: extractInvoiceFromNote(txn.note),
        partsSummary,
        mode: isOldStockRef ? "Old Stock" : extractModeFromNote(txn.note),
        debit: Math.max(0, Number(txn.amount || 0)),
        credit: 0,
        entryType: isOldStockRef ? "old_stock" : "purchase",
      });
    });

    // Credit payments linked to this vendor's purchase transactions
    transactions.forEach((txn) => {
      if (txn.type !== "debit") return;
      const note = String(txn.note || "");
      const creditMatch = note.match(/credit_payment_for:([a-z0-9-]+)/i);
      if (creditMatch && vendorPurchaseIds.has(creditMatch[1])) {
        entries.push({
          id: txn.id,
          date: txn.date || txn.created_at.split("T")[0],
          description: "Credit Payment Made",
          invoiceNo: "",
          partsSummary: "",
          mode: (txn.payment_mode || "").toUpperCase(),
          debit: 0,
          credit: Math.max(0, Number(txn.amount || 0)),
          entryType: "payment",
        });
      }
      // Also match general vendor payments (vendor_payment_for:key)
      const vendorPayKey = extractVendorPaymentSellerKey(txn.note);
      if (vendorPayKey && vendorPayKey === (activeVendorKey || ledgerVendorKey)) {
        entries.push({
          id: txn.id,
          date: txn.date || txn.created_at.split("T")[0],
          description: "Vendor Payment",
          invoiceNo: "",
          partsSummary: "",
          mode: (txn.payment_mode || "").toUpperCase(),
          debit: 0,
          credit: Math.max(0, Number(txn.amount || 0)),
          entryType: "payment",
        });
      }
    });

    return entries.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [activeVendorKey, ledgerVendorKey, transactions]);

  const viewMode: "list" | "profile" | "new" | "ledger" = routeIsNew ? "new" : routeIsLedger ? "ledger" : activeVendorKey ? "profile" : "list";

  useEffect(() => {
    if (viewMode !== "new" && newVendorId) {
      setNewVendorId("");
    }
  }, [newVendorId, viewMode]);

  useEffect(() => {
    if (viewMode !== "new" || newVendorId) return;
    let active = true;
    const assignVendorId = async () => {
      const nextId = await generateUniqueVendorId();
      if (active) {
        setNewVendorId(nextId);
      }
    };
    void assignVendorId();
    return () => {
      active = false;
    };
  }, [viewMode, newVendorId]);

  const saveVendor = async (form: VendorFormState): Promise<boolean> => {
    if (!form.name.trim()) {
      alert("Vendor name is required.");
      return false;
    }

    setSaving(true);
    let vendorId = form.vendor_id?.trim() || "";
    if (!vendorId && viewMode === "new") {
      vendorId = await generateUniqueVendorId();
    }
    const { error } = await syncVendorRecord(form.name, {
      vendor_id: vendorId || undefined,
      phone: form.phone,
      email: form.email,
      gstin: form.gstin,
      address: form.address,
      notes: form.notes,
      is_active: true,
    });
    setSaving(false);

    if (error) {
      alert(error.message);
      return false;
    }

    await loadData();
    router.push(`/accounts/vendors/${encodeURIComponent(normalizeVendorKey(form.name))}`);
    return true;
  };

  const startNewVendor = () => {
    router.push("/accounts/vendors/new");
  };

  const openVendorProfile = (vendorKey: string) => {
    router.push(`/accounts/vendors/${encodeURIComponent(vendorKey)}`);
  };

  return (
    <div className="min-h-screen bg-[#f4f6fb] p-5 font-sans text-slate-900">
      <div className="min-h-[calc(100vh-40px)] rounded-[28px] border border-slate-200 bg-white shadow-[0_24px_60px_rgba(15,23,42,0.07)] overflow-hidden">
        {(viewMode === "list" || loading) && (
          <>
            <div className="px-8 py-6 flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold tracking-tight">Vendors</h1>
                <p className="mt-1 text-sm text-slate-500">Manage vendor profiles, dues, inventory, and payment history.</p>
              </div>
              <div className="flex items-center gap-2">
                <Link href="/accounts" className="px-4 py-2.5 border border-slate-200 bg-white rounded-lg text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-all">
                  Back to Accounts
                </Link>
                <button
                  onClick={startNewVendor}
                  className="px-5 py-2.5 bg-[#4f46e5] text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 transition-all flex items-center gap-2 shadow-sm"
                >
                  <Plus className="w-4 h-4" />
                  Add Vendor
                </button>
              </div>
            </div>

            {!vendorsTableAvailable ? (
              <div className="mx-8 mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
                Vendor table is not available yet. Run [scripts/create-vendors.sql](/Users/srinithinsomasundaram/Downloads/siragirivel/scripts/create-vendors.sql) in Supabase to enable saved vendor profiles.
              </div>
            ) : null}

            <div className="px-8 border-b border-slate-100 py-6 flex items-center justify-between bg-zinc-50/20">
              <div>
                <h2 className="text-sm font-black text-slate-800 uppercase tracking-widest italic">Vendor Records</h2>
                <p className="text-[10px] text-slate-400 font-bold mt-0.5">Showing vendor dues, payments, and inventory links</p>
              </div>

              <div className="flex items-center gap-3">
                <div className="relative group">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300 group-focus-within:text-[#4f46e5] transition-colors" />
                  <input
                    type="text"
                    placeholder="Search vendor..."
                    className="pl-9 pr-4 py-2 bg-white border border-slate-100 rounded-lg text-sm font-medium focus:ring-4 ring-indigo-500/5 focus:border-indigo-500 outline-none w-72 transition-all shadow-sm"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </div>
              </div>
            </div>

            <div className="px-8 pt-6">
              <div className="border border-slate-100 rounded-[24px] overflow-hidden shadow-sm bg-white">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100">
                      <th className="px-6 py-4 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Vendor</th>
                      <th className="px-6 py-4 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Contact</th>
                      <th className="px-6 py-4 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Outstanding</th>
                      <th className="px-6 py-4 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Inventory</th>
                      <th className="px-6 py-4 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Last Purchase</th>
                      <th className="px-6 py-4 text-right pr-10 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {loading ? (
                      <tr>
                        <td colSpan={6} className="py-24">
                          <LoadingSpinner label="Retrieving vendor archive" />
                        </td>
                      </tr>
                    ) : filteredVendors.map((vendor) => (
                      <tr
                        key={vendor.key}
                        onClick={() => openVendorProfile(vendor.key)}
                        className="group hover:bg-slate-50/50 transition-colors cursor-pointer"
                      >
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-11 h-9 rounded-lg bg-slate-50 border border-slate-100 overflow-hidden flex items-center justify-center shrink-0">
                              <Building2 className="w-4 h-4 text-slate-300" />
                            </div>
                            <div>
                              <p className="font-bold text-sm text-slate-900 leading-tight">{vendor.name}</p>
                              <p className="text-[11px] text-slate-400 mt-1">
                                {vendor.purchaseCount} credit purchase{vendor.purchaseCount === 1 ? "" : "s"}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <p className="font-medium text-slate-500 text-[11px]">{vendor.vendor?.phone || vendor.vendor?.email || "No contact saved"}</p>
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-sm font-black text-amber-700 tracking-tight">{formatAmount(vendor.totalDue)}</p>
                          <p className="mt-1 text-[11px] font-medium text-emerald-600">Paid {formatAmount(vendor.totalPaid)}</p>
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-[11px] font-bold text-slate-600">{vendor.partCount} parts</p>
                          <p className="mt-1 text-[11px] text-slate-400">{formatAmount(vendor.inventoryValue)}</p>
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-[11px] font-bold text-slate-600">
                            {vendor.lastPurchaseDate ? format(new Date(vendor.lastPurchaseDate), "dd MMM, yyyy") : "—"}
                          </p>
                        </td>
                        <td className="px-6 py-4 text-right pr-10">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                router.push(`/accounts/vendors/${encodeURIComponent(vendor.key)}/ledger`);
                              }}
                              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-indigo-200 bg-indigo-50 text-[11px] font-semibold text-indigo-700 hover:bg-indigo-100 transition-all"
                              title="View ledger"
                            >
                              <BookOpen className="w-3.5 h-3.5" />
                              Ledger
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                openVendorProfile(vendor.key);
                              }}
                              className="p-1.5 hover:bg-indigo-50 rounded-lg text-slate-300 hover:text-indigo-600 transition-all"
                              title="View vendor"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                openVendorProfile(vendor.key);
                              }}
                              className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-300 hover:text-slate-600 transition-all"
                              title="Edit vendor"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {!loading && filteredVendors.length === 0 && (
                  <div className="py-20 text-center bg-white">
                    <div className="inline-flex w-16 h-16 bg-slate-50 rounded-full items-center justify-center mb-4">
                      <Building2 className="w-8 h-8 text-slate-200" />
                    </div>
                    <p className="font-bold text-slate-800">No vendors found</p>
                    <button
                      onClick={() => setQuery("")}
                      className="mt-2 text-blue-500 font-bold text-sm hover:underline"
                    >
                      Clear search
                    </button>
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {viewMode === "new" && !loading && (
          <VendorEditor
            key="new-vendor"
            mode="new"
            initialForm={{ ...EMPTY_FORM, vendor_id: newVendorId }}
            saving={saving}
            onSave={saveVendor}
            onCancel={() => router.push("/accounts/vendors")}
          />
        )}

        {viewMode === "ledger" && !loading && (
          <VendorLedgerPage
            vendorName={selectedSummary?.name || ledgerVendorKey}
            vendorId={selectedSummary?.vendor?.vendor_id || ""}
            entries={vendorLedgerEntries}
            onBack={() => router.push("/accounts/vendors")}
          />
        )}

        {viewMode === "profile" && !loading && (
          <VendorEditor
            key={`vendor-${activeVendorKey}`}
            mode="profile"
            onOpenLedger={() => router.push(`/accounts/vendors/${encodeURIComponent(activeVendorKey)}/ledger`)}
            initialForm={{
              vendor_id: selectedSummary?.vendor?.vendor_id || "",
              name: selectedSummary?.vendor?.name || selectedSummary?.name || "",
              phone: selectedSummary?.vendor?.phone || "",
              email: selectedSummary?.vendor?.email || "",
              gstin: selectedSummary?.vendor?.gstin || "",
              address: selectedSummary?.vendor?.address || "",
              notes: selectedSummary?.vendor?.notes || "",
            }}
            saving={saving}
            onSave={saveVendor}
            onCancel={() => router.push("/accounts/vendors")}
            vendorMeta={{
              purchaseCount: String(selectedSummary?.purchaseCount || 0),
              lastPurchaseDate: selectedSummary?.lastPurchaseDate ? format(new Date(selectedSummary.lastPurchaseDate), "dd MMM yyyy") : "—",
            }}
            metrics={{
              totalDue: formatAmount(selectedSummary?.totalDue || 0),
              totalPaid: formatAmount(selectedSummary?.totalPaid || 0),
              inventoryValue: formatAmount(selectedSummary?.inventoryValue || 0),
              partCount: String(selectedSummary?.partCount || 0),
            }}
          >
            <div className="grid gap-4 xl:grid-cols-2">
              <section className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="mb-3 text-base font-black text-slate-900">Recent Vendor Payments</div>
                <div className="space-y-2">
                  {selectedPayments.length > 0 ? selectedPayments.map((txn) => (
                    <div key={txn.id} className="rounded-xl border border-slate-200 px-3 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm font-semibold text-slate-900">{txn.description}</div>
                        <div className="text-sm font-black text-emerald-700">{formatAmount(txn.amount)}</div>
                      </div>
                      <div className="mt-1 text-[12px] text-slate-500">{format(new Date(txn.date || txn.created_at), "dd MMM yyyy")} · {txn.payment_mode.toUpperCase()}</div>
                    </div>
                  )) : <div className="rounded-xl bg-slate-50 px-3 py-6 text-center text-sm text-slate-500">No vendor payments recorded.</div>}
                </div>
              </section>
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              <section className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="mb-3 text-base font-black text-slate-900">Spare Parts From Vendor</div>
                <div className="space-y-2">
                  {selectedParts.length > 0 ? selectedParts.map((part) => (
                    <div key={part.id} className="rounded-xl border border-slate-200 px-3 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold text-slate-900">{part.name}</div>
                          <div className="mt-1 text-[12px] text-slate-500">{part.cat} · {part.car_name || "—"}</div>
                        </div>
                        <div className="text-right text-[12px] text-slate-500">
                          <div>Stock {part.stock}</div>
                          <div>{formatAmount(part.cost)}</div>
                        </div>
                      </div>
                    </div>
                  )) : <div className="rounded-xl bg-slate-50 px-3 py-6 text-center text-sm text-slate-500">No spare parts linked to this vendor yet.</div>}
                </div>
              </section>

              <section className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="mb-3 text-base font-black text-slate-900">Credit Purchase Summary</div>
                <div className="space-y-3 text-sm text-slate-600">
                  <div className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-3">
                    <span>Total pending due</span>
                    <strong className="text-amber-700">{formatAmount(selectedSummary?.totalDue || 0)}</strong>
                  </div>
                  <div className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-3">
                    <span>Total vendor payments</span>
                    <strong className="text-emerald-700">{formatAmount(selectedSummary?.totalPaid || 0)}</strong>
                  </div>
                  <div className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-3">
                    <span>Credit purchase count</span>
                    <strong className="text-slate-900">{selectedSummary?.purchaseCount || 0}</strong>
                  </div>
                  <div className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-3">
                    <span>Last purchase</span>
                    <strong className="text-slate-900">{selectedSummary?.lastPurchaseDate ? format(new Date(selectedSummary.lastPurchaseDate), "dd MMM yyyy") : "—"}</strong>
                  </div>
                </div>
              </section>
            </div>
          </VendorEditor>
        )}
      </div>
    </div>
  );
}

function VendorEditor({
  mode,
  initialForm,
  saving,
  onSave,
  onCancel,
  onOpenLedger,
  vendorMeta,
  metrics,
  children,
}: {
  mode: "new" | "profile";
  initialForm: VendorFormState;
  saving: boolean;
  onSave: (form: VendorFormState) => Promise<boolean>;
  onCancel: () => void;
  onOpenLedger?: () => void;
  vendorMeta?: {
    purchaseCount: string;
    lastPurchaseDate: string;
  };
  metrics?: {
    totalDue: string;
    totalPaid: string;
    inventoryValue: string;
    partCount: string;
  };
  children?: React.ReactNode;
}) {
  const [form, setForm] = useState<VendorFormState>(initialForm);
  const isSystemVendor = normalizeVendorKey(form.name) === normalizeVendorKey("Old Stock");
  const [isEditing, setIsEditing] = useState(mode === "new");
  useEffect(() => {
    if (mode !== "new") return;
    if (initialForm.vendor_id && !form.vendor_id) {
      setForm((current) => ({ ...current, vendor_id: initialForm.vendor_id }));
    }
  }, [form.vendor_id, initialForm.vendor_id, mode]);
  const handleSave = async () => {
    const ok = await onSave(form);
    if (ok) {
      setIsEditing(false);
    }
  };

  if (mode === "new") {
    return (
      <VendorRegistrationForm
        editing={false}
        formData={form}
        submitting={saving}
        onFieldChange={(field, value) =>
          setForm((current) => ({ ...current, [field]: value }))
        }
        onSubmit={(event) => {
          event.preventDefault();
          void onSave(form);
        }}
        onCancel={onCancel}
      />
    );
  }

  return (
    <>
      <DetailPageScaffold
      breadcrumbRootLabel="Vendors"
      breadcrumbCurrentLabel={form.name || "Vendor"}
      onBack={onCancel}
      recordBadge={<RecordBadge dotClassName="bg-amber-400" value={form.name ? form.name.slice(0, 18).toUpperCase() : "SUPPLIER"} />}
      title={form.name || "Edit Vendor"}
      subtitle={
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span>{form.phone || "No phone saved"}</span>
          <span className="text-slate-300">•</span>
          <span>{form.email || "No email saved"}</span>
          <span className="text-slate-300">•</span>
          <span>{form.gstin || "No GSTIN"}</span>
        </div>
      }
      actions={
        <>
          <button
            type="button"
            onClick={onOpenLedger}
            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-indigo-200 bg-indigo-50 px-5 py-3 text-sm font-semibold text-indigo-700 hover:bg-indigo-100 transition-all"
          >
            <BookOpen className="h-4 w-4" />
            Ledger
          </button>
          {!isSystemVendor ? (
            <button
              type="button"
              onClick={() => setIsEditing(true)}
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              <Edit2 className="h-4 w-4" />
              Edit Vendor
            </button>
          ) : null}
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Back
          </button>
        </>
      }
      metricStrip={
        <DetailMetricRow>
          <MetricCard icon={Wallet} label="Outstanding Due" value={metrics?.totalDue || "-"} tone="amber" />
          <MetricCard icon={Receipt} label="Vendor Payments" value={metrics?.totalPaid || "-"} tone="emerald" />
          <MetricCard icon={FileText} label="Inventory Value" value={metrics?.inventoryValue || "-"} tone="indigo" />
          <MetricCard icon={Building2} label="Spare Parts" value={metrics?.partCount || "-"} tone="slate" />
        </DetailMetricRow>
      }
      main={<>{children}</>}
      side={
        <>
          {!isSystemVendor ? (
            <PreviewPanel
              eyebrow="Vendor Preview"
              title={form.name || "Unnamed Vendor"}
              badge="Supplier"
              rows={[
                ["Vendor ID", form.vendor_id || "Not set"],
                ["Phone", form.phone || "Not entered"],
                ["Email", form.email || "Not entered"],
                ["GSTIN", form.gstin || "Not entered"],
                ["Address", form.address || "Not entered"],
              ]}
            />
          ) : null}
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="mb-3 text-sm font-black uppercase tracking-[0.18em] text-slate-500">Vendor Snapshot</div>
            <div className="space-y-3">
              <SnapshotRow label="Credit Purchases" value={vendorMeta?.purchaseCount || "0"} />
              <SnapshotRow label="Last Purchase" value={vendorMeta?.lastPurchaseDate || "—"} />
              <SnapshotRow label="Outstanding Due" value={metrics?.totalDue || "-"} />
              <SnapshotRow label="Inventory Value" value={metrics?.inventoryValue || "-"} />
            </div>
          </div>
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <div className="font-black uppercase tracking-[0.16em]">Quick Note</div>
            <p className="mt-2 leading-6">
              Keep the supplier name exactly aligned with inventory purchase entries so vendor dues and payments stay mapped to the same profile.
            </p>
          </div>
        </>
      }
      />
      {isEditing && !isSystemVendor ? (
      <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/40 px-4 py-6">
        <div className="w-full max-w-[560px] rounded-2xl bg-white shadow-2xl border border-slate-200">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <Building2 className="h-4 w-4 text-indigo-600" />
              Edit Vendor
            </div>
            <button
              type="button"
              onClick={() => setIsEditing(false)}
              className="text-slate-400 hover:text-slate-600"
              aria-label="Close"
            >
              ×
            </button>
          </div>
          <div className="px-5 py-4 grid gap-3 md:grid-cols-2">
            <input className="rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-300" placeholder="Vendor name" value={form.name} onChange={(e) => setForm((current) => ({ ...current, name: e.target.value }))} />
            <input className="rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-300" placeholder="Phone" value={form.phone} onChange={(e) => setForm((current) => ({ ...current, phone: e.target.value }))} />
            <input className="rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-300" placeholder="Email" value={form.email} onChange={(e) => setForm((current) => ({ ...current, email: e.target.value }))} />
            <input className="rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-300" placeholder="GSTIN" value={form.gstin} onChange={(e) => setForm((current) => ({ ...current, gstin: e.target.value }))} />
            <textarea className="min-h-[110px] rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-300 md:col-span-2" placeholder="Address" value={form.address} onChange={(e) => setForm((current) => ({ ...current, address: e.target.value }))} />
            <textarea className="min-h-[110px] rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-300 md:col-span-2" placeholder="Notes" value={form.notes} onChange={(e) => setForm((current) => ({ ...current, notes: e.target.value }))} />
          </div>
          <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-5 py-4">
            <button
              type="button"
              onClick={() => setIsEditing(false)}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
            >
              {saving ? "Updating..." : "Update Vendor"}
            </button>
          </div>
        </div>
      </div>
      ) : null}
    </>
  );
}

function SnapshotRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-3">
      <span className="text-sm text-slate-500">{label}</span>
      <span className="text-sm font-black text-slate-900">{value}</span>
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  tone: "amber" | "emerald" | "indigo" | "slate";
}) {
  const tones = {
    amber: "border-amber-200 bg-amber-50 text-amber-800",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-800",
    indigo: "border-indigo-200 bg-indigo-50 text-indigo-800",
    slate: "border-slate-200 bg-slate-50 text-slate-800",
  } as const;
  return (
    <div className={`rounded-2xl border p-4 ${tones[tone]}`}>
      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider">
        <Icon className="h-4 w-4" />
        {label}
      </div>
      <div className="mt-2 text-2xl font-black">{value}</div>
    </div>
  );
}

function DetailRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-slate-200 px-3 py-3">
      <Icon className="mt-0.5 h-4 w-4 text-slate-400" />
      <div>
        <div className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{label}</div>
        <div className="mt-1 text-sm text-slate-700">{value}</div>
      </div>
    </div>
  );
}

function VendorLedgerPage({
  vendorName,
  vendorId,
  entries,
  onBack,
}: {
  vendorName: string;
  vendorId: string;
  entries: LedgerEntry[];
  onBack: () => void;
}) {
  const todayIso = new Date().toISOString().split("T")[0];
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState(todayIso);

  const fmt = (n: number) =>
    "₹" + Math.abs(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const fmtDate = (d: string) => {
    try {
      return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
    } catch {
      return d;
    }
  };

  const today = new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" });

  // Overall outstanding (always full, unfiltered)
  const totalNetBalance = entries.reduce((s, e) => s + e.debit - e.credit, 0);

  // Filtered entries for display/print
  const filteredEntries = useMemo(() => {
    return entries.filter((e) => {
      const d = e.date;
      if (fromDate && d < fromDate) return false;
      if (toDate && d > toDate) return false;
      return true;
    });
  }, [entries, fromDate, toDate]);

  // Opening balance = sum of all entries strictly before fromDate
  const openingBalance = useMemo(() => {
    if (!fromDate) return 0;
    return entries
      .filter((e) => e.date < fromDate)
      .reduce((s, e) => s + e.debit - e.credit, 0);
  }, [entries, fromDate]);

  let runningBalance = openingBalance;
  const rows = filteredEntries.map((entry, i) => {
    runningBalance += entry.debit - entry.credit;
    return { ...entry, balance: runningBalance, sno: i + 1 };
  });

  const periodDebit = filteredEntries.reduce((s, e) => s + e.debit, 0);
  const periodCredit = filteredEntries.reduce((s, e) => s + e.credit, 0);
  const closingBalance = openingBalance + periodDebit - periodCredit;

  const printLabel = fromDate
    ? `${fmtDate(fromDate)} to ${fmtDate(toDate)}`
    : `Up to ${fmtDate(toDate)}`;

  return (
    <div id="vendor-ledger-print" className="min-h-screen bg-white px-8 py-6 print:px-4 print:py-2">
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #vendor-ledger-print, #vendor-ledger-print * { visibility: visible; }
          #vendor-ledger-print { position: fixed; top: 0; left: 0; width: 100%; padding: 16px; }
        }
      `}</style>

      {/* Toolbar — hidden on print */}
      <div className="mb-6 flex items-center justify-between print:hidden">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-slate-900 transition-colors"
        >
          ← Back to Vendors
        </button>

        {/* Date range + print */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <label className="text-[11px] font-bold uppercase tracking-wider text-gray-500">From</label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="rounded border border-gray-300 px-2 py-1.5 text-sm text-gray-700 focus:border-gray-500 focus:outline-none"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-[11px] font-bold uppercase tracking-wider text-gray-500">To</label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="rounded border border-gray-300 px-2 py-1.5 text-sm text-gray-700 focus:border-gray-500 focus:outline-none"
            />
          </div>
          <button
            type="button"
            onClick={() => window.print()}
            className="rounded-lg border border-gray-800 bg-gray-800 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-700 transition-all"
          >
            Print
          </button>
        </div>
      </div>

      {/* Ledger header block */}
      <div className="mb-6 border border-gray-300 bg-gray-50 px-6 py-4">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-500">Vendor Account Ledger</div>
            <div className="mt-1 text-2xl font-black text-gray-900">{vendorName}</div>
            {vendorId ? (
              <div className="mt-1 text-xs font-semibold text-gray-500 font-mono">Vendor ID: {vendorId}</div>
            ) : null}
            <div className="mt-1 text-xs text-gray-500">Period: {printLabel}</div>
          </div>
          <div className="text-right">
            <div className="text-xs text-gray-500">As of {today}</div>
            <div className="mt-2 text-[10px] font-bold uppercase tracking-wider text-gray-500">Outstanding Balance</div>
            <div className={`mt-0.5 text-2xl font-black ${totalNetBalance > 0 ? "text-red-700" : totalNetBalance === 0 ? "text-gray-400" : "text-green-700"}`}>
              {fmt(totalNetBalance)}
              <span className="ml-1.5 text-sm font-bold">{totalNetBalance > 0 ? "Dr" : totalNetBalance < 0 ? "Cr" : ""}</span>
            </div>
            {totalNetBalance !== 0 && (
              <div className={`text-[11px] font-semibold ${totalNetBalance > 0 ? "text-red-500" : "text-green-500"}`}>
                {totalNetBalance > 0 ? "Payable to vendor" : "Overpaid — refund due"}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Ledger table — Excel style */}
      {rows.length === 0 ? (
        <div className="border border-gray-300 py-16 text-center">
          <p className="text-sm font-semibold text-gray-500">No transactions for the selected period.</p>
          <p className="mt-1 text-xs text-gray-400">Adjust the date range to see entries.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm" style={{ borderSpacing: 0 }}>
            <thead>
              <tr className="bg-gray-100">
                <th className="border border-gray-300 px-3 py-2 text-center text-[11px] font-bold text-gray-700 w-10">#</th>
                <th className="border border-gray-300 px-3 py-2 text-[11px] font-bold text-gray-700 w-28">Date</th>
                <th className="border border-gray-300 px-3 py-2 text-[11px] font-bold text-gray-700">Description / Particulars</th>
                <th className="border border-gray-300 px-3 py-2 text-[11px] font-bold text-gray-700 w-32">Invoice No.</th>
                <th className="border border-gray-300 px-3 py-2 text-[11px] font-bold text-gray-700 w-20">Mode</th>
                <th className="border border-gray-300 px-3 py-2 text-right text-[11px] font-bold text-red-700 w-36">Debit (₹)</th>
                <th className="border border-gray-300 px-3 py-2 text-right text-[11px] font-bold text-green-700 w-36">Credit (₹)</th>
                <th className="border border-gray-300 px-3 py-2 text-right text-[11px] font-bold text-gray-700 w-36">Balance (₹)</th>
              </tr>
            </thead>
            <tbody>
              {/* Opening balance row — only when fromDate is set */}
              {fromDate && (
                <tr className="bg-gray-50 italic">
                  <td className="border border-gray-200 px-3 py-2 text-center text-[11px] text-gray-300">—</td>
                  <td className="border border-gray-200 px-3 py-2 text-[12px] text-gray-500 whitespace-nowrap">{fmtDate(fromDate)}</td>
                  <td colSpan={4} className="border border-gray-200 px-3 py-2 text-[12px] text-gray-500">Opening Balance (brought forward)</td>
                  <td className="border border-gray-200 px-3 py-2 text-right font-mono text-[12px] text-gray-700 font-bold" colSpan={1}>
                    {openingBalance !== 0 ? fmt(openingBalance) : "—"}
                  </td>
                  <td className="border border-gray-200 px-3 py-2 text-right font-mono text-[13px] font-bold text-gray-700">
                    {fmt(openingBalance)}
                  </td>
                </tr>
              )}
              {rows.map((row, i) => {
                const isPayment = row.entryType === "payment";
                return (
                  <tr
                    key={`${row.id}-${i}`}
                    className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}
                  >
                    <td className="border border-gray-200 px-3 py-2 text-center text-[11px] text-gray-400 font-mono">
                      {row.sno}
                    </td>
                    <td className="border border-gray-200 px-3 py-2 text-[12px] text-gray-700 whitespace-nowrap">
                      {fmtDate(row.date)}
                    </td>
                    <td className="border border-gray-200 px-3 py-2">
                      <div className="text-[13px] font-semibold text-gray-900">{row.description}</div>
                      {row.partsSummary ? (
                        <div className="mt-0.5 text-[11px] text-gray-400 truncate max-w-xs" title={row.partsSummary}>
                          {row.partsSummary}
                        </div>
                      ) : null}
                    </td>
                    <td className="border border-gray-200 px-3 py-2 text-[12px] font-mono text-gray-700">
                      {row.invoiceNo || "—"}
                    </td>
                    <td className="border border-gray-200 px-3 py-2 text-[11px] text-gray-600">
                      {row.mode || "—"}
                    </td>
                    <td className="border border-gray-200 px-3 py-2 text-right font-mono text-[13px]">
                      {row.debit > 0 ? (
                        <span className="font-semibold text-red-700">{fmt(row.debit)}</span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    <td className="border border-gray-200 px-3 py-2 text-right font-mono text-[13px]">
                      {row.credit > 0 ? (
                        <span className="font-semibold text-green-700">{fmt(row.credit)}</span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    <td className={`border border-gray-200 px-3 py-2 text-right font-mono text-[13px] font-bold ${
                      row.balance > 0 ? "text-red-800" : row.balance === 0 ? "text-gray-400" : "text-green-800"
                    }`}>
                      {fmt(row.balance)}
                      {isPayment && row.balance <= 0 ? <span className="ml-1 text-[10px] font-bold">Cr</span> : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-gray-200 font-bold">
                <td colSpan={5} className="border border-gray-400 px-3 py-2.5 text-[12px] font-black text-gray-800 uppercase tracking-wider">
                  TOTALS (period)
                </td>
                <td className="border border-gray-400 px-3 py-2.5 text-right font-mono text-[13px] text-red-800 font-black">
                  {fmt(periodDebit)}
                </td>
                <td className="border border-gray-400 px-3 py-2.5 text-right font-mono text-[13px] text-green-800 font-black">
                  {fmt(periodCredit)}
                </td>
                <td className={`border border-gray-400 px-3 py-2.5 text-right font-mono text-[13px] font-black ${closingBalance > 0 ? "text-red-800" : "text-green-800"}`}>
                  {fmt(closingBalance)} {closingBalance < 0 ? "Cr" : "Dr"}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <div className="mt-4 text-[11px] text-gray-400 print:mt-8">
        Dr = Debit (purchases from vendor) · Cr = Credit (payments to vendor) · Balance = Amount payable
      </div>
    </div>
  );
}
