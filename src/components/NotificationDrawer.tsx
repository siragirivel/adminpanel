"use client";

import React, { useCallback, useEffect, useState } from "react";
import { X, AlertTriangle, Package, ArrowRight, BellRing, CalendarDays, ClipboardList } from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import Link from "next/link";
import { addMonths, differenceInCalendarDays, format } from "date-fns";
import { computeCreditPendingRows } from "@/lib/vendor-credit";

interface NotificationDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  userAccess: {
    dashboard: boolean;
    vehicles: boolean;
    enquiries: boolean;
    inventory: boolean;
    billing: boolean;
    estimates: boolean;
    daybook: boolean;
    accounts: boolean;
    logs: boolean;
    settings: boolean;
  };
}

interface SparePartRow {
  id: string;
  name: string;
  stock: number;
  threshold: number;
  cost: number;
}

interface EnquiryAlertRow {
  id: string;
  customer_name: string;
  phone_number: string;
  pickup_date: string | null;
  status: "open" | "closed";
}

interface ServiceAlertRow {
  id: string;
  vehicleId: string;
  carId: string;
  ownerName: string;
  invoiceNumber: string;
  serviceDate: string;
  nextServiceDate: string;
  daysLeft: number;
  nextServiceOdo?: number | null;
}

interface ServiceInvoiceRow {
  id: string;
  invoice_number: string;
  vehicle_id: string;
  created_at: string;
  note?: string | null;
  vehicles?: {
    car_id?: string | null;
    owner_name?: string | null;
  } | null;
}

function extractOdoReading(source?: string | null) {
  if (!source) return null;
  const match = source.match(/odometer:\s*([\d,]+)(?:\s*km)?/i);
  if (!match?.[1]) return null;
  const parsed = Number(match[1].replace(/,/g, ""));
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

function normalizeEnquiryStatus(status?: string | null) {
  return String(status || "").trim().toLowerCase();
}

function getDateInTimeZone(timeZone = "Asia/Kolkata", now = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(now);
}

const CLEARED_NOTIFICATIONS_KEY = "siragirivel_cleared_notifications";

function readClearedNotifications() {
  if (typeof window === "undefined") return {} as Record<string, string>;
  try {
    const raw = window.localStorage.getItem(CLEARED_NOTIFICATIONS_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed as Record<string, string> : {};
  } catch {
    return {};
  }
}

function writeClearedNotifications(value: Record<string, string>) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(CLEARED_NOTIFICATIONS_KEY, JSON.stringify(value));
}

export function NotificationDrawer({ isOpen, onClose, userAccess }: NotificationDrawerProps) {
  const [lowStockItems, setLowStockItems] = useState<SparePartRow[]>([]);
  const [creditDueItems, setCreditDueItems] = useState<
    Array<{ id: string; description: string; pendingAmount: number; date: string }>
  >([]);
  const [pickupTodayItems, setPickupTodayItems] = useState<EnquiryAlertRow[]>([]);
  const [pickupOverdueItems, setPickupOverdueItems] = useState<EnquiryAlertRow[]>([]);
  const [openEnquiryItems, setOpenEnquiryItems] = useState<EnquiryAlertRow[]>([]);
  const [serviceAlerts, setServiceAlerts] = useState<ServiceAlertRow[]>([]);
  const [clearedNotifications, setClearedNotifications] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const today = getDateInTimeZone();
    const current = readClearedNotifications();
    const pruned = Object.fromEntries(
      Object.entries(current).filter(([, value]) => value === today),
    );
    setClearedNotifications(pruned);
    writeClearedNotifications(pruned);
  }, []);

  const isClearedToday = useCallback((key: string) => {
    const today = getDateInTimeZone();
    return clearedNotifications[key] === today;
  }, [clearedNotifications]);

  const clearNotification = useCallback((key: string) => {
    const today = getDateInTimeZone();
    setClearedNotifications((current) => {
      const next = { ...current, [key]: today };
      writeClearedNotifications(next);
      return next;
    });
  }, []);

  const clearAllNotifications = useCallback(() => {
    const today = getDateInTimeZone();
    const keys = [
      ...serviceAlerts.map((item) => `service-${item.id}`),
      ...pickupOverdueItems.map((item) => `pickup-overdue-${item.id}`),
      ...pickupTodayItems.map((item) => `pickup-today-${item.id}`),
      ...(openEnquiryItems.length > 0 ? ["open-enquiries-summary"] : []),
      ...creditDueItems.map((item) => `credit-${item.id}`),
      ...lowStockItems.map((item) => `stock-${item.id}`),
    ];
    setClearedNotifications((current) => {
      const next = { ...current };
      keys.forEach((key) => {
        next[key] = today;
      });
      writeClearedNotifications(next);
      return next;
    });
  }, [creditDueItems, lowStockItems, openEnquiryItems.length, pickupOverdueItems, pickupTodayItems, serviceAlerts]);

  const visibleServiceAlerts = serviceAlerts.filter((item) => !isClearedToday(`service-${item.id}`));
  const visiblePickupOverdueItems = pickupOverdueItems.filter((item) => !isClearedToday(`pickup-overdue-${item.id}`));
  const visiblePickupTodayItems = pickupTodayItems.filter((item) => !isClearedToday(`pickup-today-${item.id}`));
  const visibleOpenEnquiryItems = isClearedToday("open-enquiries-summary") ? [] : openEnquiryItems;
  const visibleCreditDueItems = creditDueItems.filter((item) => !isClearedToday(`credit-${item.id}`));
  const visibleLowStockItems = lowStockItems.filter((item) => !isClearedToday(`stock-${item.id}`));
  const hasVisibleNotifications =
    visibleLowStockItems.length > 0 ||
    visibleCreditDueItems.length > 0 ||
    visiblePickupTodayItems.length > 0 ||
    visiblePickupOverdueItems.length > 0 ||
    visibleOpenEnquiryItems.length > 0 ||
    visibleServiceAlerts.length > 0;

  const fetchLowStock = useCallback(async () => {
    setLoading(true);
    try {
      const canInventory = userAccess.inventory;
      const canAccounts = userAccess.accounts;
      const canEnquiries = userAccess.enquiries;
      const canServiceAlerts = userAccess.vehicles || userAccess.billing;

      setLowStockItems([]);
      setCreditDueItems([]);
      setPickupTodayItems([]);
      setPickupOverdueItems([]);
      setOpenEnquiryItems([]);
      setServiceAlerts([]);

      if (canInventory) {
        const { data: allParts } = await supabase.from("spare_parts").select("*");
        if (allParts) {
          setLowStockItems((allParts as SparePartRow[]).filter((p) => p.stock <= p.threshold));
        }
      }

      if (canAccounts) {
        const { data: transactions } = await supabase
          .from("transactions")
          .select("id, description, amount, type, date, created_at, note")
          .order("date", { ascending: false })
          .order("created_at", { ascending: false });
        if (transactions) {
          const rows = transactions as Array<{
            id: string;
            description: string;
            amount: number;
            type: "credit" | "debit";
            date: string;
            created_at: string;
            note?: string | null;
          }>;
          const purchases = rows.filter(
            (txn) =>
              txn.type === "debit" &&
              txn.description.toLowerCase().includes("spare parts purchase") &&
              (txn.note || "").toLowerCase().includes("mode: credit"),
          );
          const dueRows = computeCreditPendingRows(
            purchases.map((purchase) => ({
              id: purchase.id,
              seller: String((purchase.note || "").match(/Seller:\s*([^|]+)/i)?.[1] || "—").trim(),
              originalAmount: Math.max(0, Number(purchase.amount || 0)),
              date: purchase.date || purchase.created_at?.split("T")[0] || "",
              description: purchase.description,
            })),
            rows,
          )
            .map((purchase) => ({
              id: purchase.id,
              description: purchase.description,
              pendingAmount: purchase.pendingAmount,
              date: purchase.date,
            }))
            .filter((item) => item.pendingAmount > 0);
          setCreditDueItems(dueRows);
        }
      }

      if (canEnquiries) {
        const { data: enquiries } = await supabase
          .from("enquiries")
          .select("id, customer_name, phone_number, pickup_date, status");

        if (enquiries) {
          const today = getDateInTimeZone();
          const rows = enquiries as EnquiryAlertRow[];
          const openRows = rows.filter((row) => normalizeEnquiryStatus(row.status) === "open");
          setOpenEnquiryItems(openRows);
          setPickupTodayItems(
            openRows.filter((row) => row.pickup_date && row.pickup_date === today),
          );
          setPickupOverdueItems(
            openRows.filter((row) => row.pickup_date && row.pickup_date < today),
          );
        }
      }

      if (canServiceAlerts) {
        const { data: invoices } = await supabase
          .from("invoices")
          .select("id, invoice_number, vehicle_id, created_at, note, vehicles(car_id, owner_name)")
          .order("created_at", { ascending: false });

        if (invoices) {
          const latestByVehicle = new Map<string, ServiceInvoiceRow>();
          (invoices as ServiceInvoiceRow[]).forEach((invoice) => {
            const vehicleId = String(invoice.vehicle_id || "");
            if (!vehicleId || latestByVehicle.has(vehicleId)) return;
            latestByVehicle.set(vehicleId, invoice);
          });

          const alerts = Array.from(latestByVehicle.values())
            .map((invoice) => {
              const serviceDate = new Date(invoice.created_at);
              const nextDate = addMonths(serviceDate, 6);
              const daysLeft = differenceInCalendarDays(nextDate, new Date());
              const reading = extractOdoReading(invoice.note || "");
              return {
                id: String(invoice.id),
                vehicleId: String(invoice.vehicle_id || ""),
                carId: String(invoice.vehicles?.car_id || "—"),
                ownerName: String(invoice.vehicles?.owner_name || "Vehicle"),
                invoiceNumber: String(invoice.invoice_number || "—"),
                serviceDate: invoice.created_at,
                nextServiceDate: nextDate.toISOString(),
                daysLeft,
                nextServiceOdo: reading ? reading + 5000 : null,
              } as ServiceAlertRow;
            })
            .filter((item) => item.daysLeft <= 7)
            .sort((a, b) => a.daysLeft - b.daysLeft);

          setServiceAlerts(alerts);
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [userAccess]);

  useEffect(() => {
    if (isOpen) {
      void fetchLowStock();
    }
  }, [fetchLowStock, isOpen]);

  return (
    <>
      {/* Backdrop */}
      <div 
        className={cn(
          "fixed inset-0 app-overlay backdrop-blur-sm z-[100] transition-opacity duration-300",
          isOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
        onClick={onClose}
      />

      {/* Drawer */}
      <div 
        className={cn(
          "fixed top-0 right-0 bottom-0 w-full max-w-[400px] bg-[var(--surface-1)] shadow-2xl z-[101] transition-transform duration-500 ease-out transform flex flex-col border-l border-[color:var(--card-border)]",
          isOpen ? "translate-x-0" : "translate-x-full"
        )}
      >
        {/* Header */}
        <div className="h-14 sm:h-16 border-b border-[color:var(--card-border)] px-4 sm:px-6 flex items-center justify-between bg-[var(--surface-2)]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-indigo-50 flex items-center justify-center">
              <BellRing className="w-4 h-4 text-indigo-600" />
            </div>
            <h2 className="text-[13px] sm:text-[15px] font-bold text-[color:var(--text-primary)] tracking-tight">Notifications</h2>
          </div>
          <div className="flex items-center gap-2">
            {hasVisibleNotifications ? (
              <button
                onClick={clearAllNotifications}
                className="rounded-full border border-[color:var(--card-border)] px-3 py-1 text-[10px] sm:text-[11px] font-bold uppercase tracking-wide text-[color:var(--text-secondary)] transition-colors hover:border-zinc-300 hover:text-[color:var(--text-primary)]"
              >
                Clear All
              </button>
            ) : null}
            <button 
              onClick={onClose}
              className="p-2 rounded-full hover:bg-[var(--surface-3)] text-[color:var(--text-muted)] hover:text-[color:var(--text-primary)] transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-4">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 opacity-50">
              <div className="w-8 h-8 border-3 border-indigo-600/10 border-t-indigo-600 rounded-full animate-spin" />
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Scanning inventory...</p>
            </div>
          ) : hasVisibleNotifications ? (
            <>
              {visibleServiceAlerts.length > 0 ? (
                <>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">Next Service Alerts</span>
                    <span className="bg-indigo-50 text-indigo-700 text-[10px] font-black px-2 py-0.5 rounded-full">{visibleServiceAlerts.length} ALERTS</span>
                  </div>
                  {visibleServiceAlerts.map((item) => (
                    <div key={`service-${item.id}`} className="group relative bg-white border border-slate-100 rounded-[20px] p-5 hover:border-indigo-100 hover:bg-indigo-50/20 transition-all hover:shadow-xl hover:shadow-indigo-500/5 overflow-hidden animate-in fade-in slide-in-from-right-4 duration-300">
                      <button
                        type="button"
                        onClick={() => clearNotification(`service-${item.id}`)}
                        className="absolute right-3 top-3 rounded-full border border-slate-200 bg-white px-2 py-1 text-[10px] font-bold text-slate-500 hover:border-slate-300 hover:text-slate-700"
                      >
                        Clear
                      </button>
                      <div className="flex items-start gap-4">
                        <div className="w-11 h-11 bg-indigo-50 rounded-[14px] flex items-center justify-center text-indigo-700 group-hover:scale-110 transition-transform shadow-sm">
                          <CalendarDays className="w-5.5 h-5.5" />
                        </div>
                        <div className="flex-1">
                          <h3 className="text-[13px] font-bold text-slate-800 leading-tight mb-1 tracking-tight">
                            {item.daysLeft < 0 ? "Service overdue" : "Next service due soon"}
                          </h3>
                          <p className="text-[12px] text-slate-500 font-medium leading-relaxed">
                            {item.carId} · {item.ownerName}
                          </p>
                          <div className="mt-2 text-[12px] font-bold text-indigo-700">
                            Next service: {format(new Date(item.nextServiceDate), "dd MMM yyyy")}
                          </div>
                          <div className="mt-1 text-[11px] text-slate-500">
                            {item.daysLeft < 0 ? `${Math.abs(item.daysLeft)} day(s) overdue` : `${item.daysLeft} day(s) left`}
                            {item.nextServiceOdo ? ` · Next ODO ${item.nextServiceOdo.toLocaleString("en-IN")} km` : ""}
                          </div>
                          <div className="mt-3 flex items-center justify-end">
                            <Link
                              href={item.carId && item.carId !== "—" ? `/vehicles/${item.carId}` : "/vehicles"}
                              onClick={onClose}
                              className="flex items-center gap-1.5 py-1.5 px-3 bg-white border border-slate-200 rounded-lg text-[10px] font-bold text-slate-600 hover:bg-slate-900 hover:text-white hover:border-slate-900 transition-all decoration-none group/btn"
                            >
                              Open Vehicle
                              <ArrowRight className="w-3.5 h-3.5 group-hover/btn:translate-x-1 transition-transform" />
                            </Link>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </>
              ) : null}

              {visiblePickupOverdueItems.length > 0 ? (
                <>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">Pickup Overdue</span>
                    <span className="bg-rose-50 text-rose-700 text-[10px] font-black px-2 py-0.5 rounded-full">{visiblePickupOverdueItems.length} OVERDUE</span>
                  </div>
                  {visiblePickupOverdueItems.map((item) => (
                    <div key={`overdue-${item.id}`} className="group relative bg-white border border-slate-100 rounded-[20px] p-5 hover:border-rose-100 hover:bg-rose-50/20 transition-all hover:shadow-xl hover:shadow-rose-500/5 overflow-hidden animate-in fade-in slide-in-from-right-4 duration-300">
                      <button
                        type="button"
                        onClick={() => clearNotification(`pickup-overdue-${item.id}`)}
                        className="absolute right-3 top-3 rounded-full border border-slate-200 bg-white px-2 py-1 text-[10px] font-bold text-slate-500 hover:border-slate-300 hover:text-slate-700"
                      >
                        Clear
                      </button>
                      <div className="flex items-start gap-4">
                        <div className="w-11 h-11 bg-rose-50 rounded-[14px] flex items-center justify-center text-rose-700 group-hover:scale-110 transition-transform shadow-sm">
                          <CalendarDays className="w-5.5 h-5.5" />
                        </div>
                        <div className="flex-1">
                          <h3 className="text-[13px] font-bold text-slate-800 leading-tight mb-1 tracking-tight">
                            Pickup overdue
                          </h3>
                          <p className="text-[12px] text-slate-500 font-medium leading-relaxed">
                            {item.customer_name} · {item.phone_number}
                          </p>
                          <div className="mt-2 text-[12px] font-bold text-rose-700">
                            Pickup date: {item.pickup_date || "—"}
                          </div>
                          <div className="mt-3 flex items-center justify-end">
                            <Link
                              href="/enquiries"
                              onClick={onClose}
                              className="flex items-center gap-1.5 py-1.5 px-3 bg-white border border-slate-200 rounded-lg text-[10px] font-bold text-slate-600 hover:bg-slate-900 hover:text-white hover:border-slate-900 transition-all decoration-none group/btn"
                            >
                              Open Enquiries
                              <ArrowRight className="w-3.5 h-3.5 group-hover/btn:translate-x-1 transition-transform" />
                            </Link>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </>
              ) : null}

              {visiblePickupTodayItems.length > 0 ? (
                <>
                  <div className="flex items-center justify-between mb-2 mt-1">
                    <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">Today Pickups</span>
                    <span className="bg-indigo-50 text-indigo-700 text-[10px] font-black px-2 py-0.5 rounded-full">{visiblePickupTodayItems.length} TODAY</span>
                  </div>
                  {visiblePickupTodayItems.map((item) => (
                    <div key={`today-${item.id}`} className="group relative bg-white border border-slate-100 rounded-[20px] p-5 hover:border-indigo-100 hover:bg-indigo-50/20 transition-all hover:shadow-xl hover:shadow-indigo-500/5 overflow-hidden animate-in fade-in slide-in-from-right-4 duration-300">
                      <button
                        type="button"
                        onClick={() => clearNotification(`pickup-today-${item.id}`)}
                        className="absolute right-3 top-3 rounded-full border border-slate-200 bg-white px-2 py-1 text-[10px] font-bold text-slate-500 hover:border-slate-300 hover:text-slate-700"
                      >
                        Clear
                      </button>
                      <div className="flex items-start gap-4">
                        <div className="w-11 h-11 bg-indigo-50 rounded-[14px] flex items-center justify-center text-indigo-700 group-hover:scale-110 transition-transform shadow-sm">
                          <CalendarDays className="w-5.5 h-5.5" />
                        </div>
                        <div className="flex-1">
                          <h3 className="text-[13px] font-bold text-slate-800 leading-tight mb-1 tracking-tight">
                            Pickup scheduled today
                          </h3>
                          <p className="text-[12px] text-slate-500 font-medium leading-relaxed">
                            {item.customer_name} · {item.phone_number}
                          </p>
                          <div className="mt-3 flex items-center justify-end">
                            <Link
                              href="/enquiries"
                              onClick={onClose}
                              className="flex items-center gap-1.5 py-1.5 px-3 bg-white border border-slate-200 rounded-lg text-[10px] font-bold text-slate-600 hover:bg-slate-900 hover:text-white hover:border-slate-900 transition-all decoration-none group/btn"
                            >
                              Open Enquiries
                              <ArrowRight className="w-3.5 h-3.5 group-hover/btn:translate-x-1 transition-transform" />
                            </Link>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </>
              ) : null}

              {visibleOpenEnquiryItems.length > 0 ? (
                <div className="group relative bg-white border border-slate-100 rounded-[20px] p-5 hover:border-sky-100 hover:bg-sky-50/20 transition-all hover:shadow-xl hover:shadow-sky-500/5 overflow-hidden animate-in fade-in slide-in-from-right-4 duration-300">
                  <button
                    type="button"
                    onClick={() => clearNotification("open-enquiries-summary")}
                    className="absolute right-3 top-3 rounded-full border border-slate-200 bg-white px-2 py-1 text-[10px] font-bold text-slate-500 hover:border-slate-300 hover:text-slate-700"
                  >
                    Clear
                  </button>
                  <div className="flex items-start gap-4">
                    <div className="w-11 h-11 bg-sky-50 rounded-[14px] flex items-center justify-center text-sky-700 group-hover:scale-110 transition-transform shadow-sm">
                      <ClipboardList className="w-5.5 h-5.5" />
                    </div>
                    <div className="flex-1">
                      <h3 className="text-[13px] font-bold text-slate-800 leading-tight mb-1 tracking-tight">
                        Open enquiries
                      </h3>
                      <p className="text-[12px] text-slate-500 font-medium leading-relaxed">
                        {visibleOpenEnquiryItems.length} enquiry{visibleOpenEnquiryItems.length > 1 ? "ies" : "y"} pending follow-up.
                      </p>
                      <div className="mt-3 flex items-center justify-end">
                        <Link
                          href="/enquiries"
                          onClick={onClose}
                          className="flex items-center gap-1.5 py-1.5 px-3 bg-white border border-slate-200 rounded-lg text-[10px] font-bold text-slate-600 hover:bg-slate-900 hover:text-white hover:border-slate-900 transition-all decoration-none group/btn"
                        >
                          Open Enquiries
                          <ArrowRight className="w-3.5 h-3.5 group-hover/btn:translate-x-1 transition-transform" />
                        </Link>
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}

              {visibleCreditDueItems.length > 0 ? (
                <>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">Credit Alerts</span>
                    <span className="bg-amber-50 text-amber-700 text-[10px] font-black px-2 py-0.5 rounded-full">{visibleCreditDueItems.length} DUE</span>
                  </div>
                  {visibleCreditDueItems.map((item) => (
                    <div key={item.id} className="group relative bg-white border border-slate-100 rounded-[20px] p-5 hover:border-amber-100 hover:bg-amber-50/20 transition-all hover:shadow-xl hover:shadow-amber-500/5 overflow-hidden animate-in fade-in slide-in-from-right-4 duration-300">
                      <button
                        type="button"
                        onClick={() => clearNotification(`credit-${item.id}`)}
                        className="absolute right-3 top-3 rounded-full border border-slate-200 bg-white px-2 py-1 text-[10px] font-bold text-slate-500 hover:border-slate-300 hover:text-slate-700"
                      >
                        Clear
                      </button>
                      <div className="absolute top-0 right-0 p-3 opacity-0 group-hover:opacity-100 transition-opacity">
                        <AlertTriangle className="w-4 h-4 text-amber-500" />
                      </div>
                      <div className="flex items-start gap-4">
                        <div className="w-11 h-11 bg-amber-50 rounded-[14px] flex items-center justify-center text-amber-700 group-hover:scale-110 transition-transform shadow-sm">
                          <AlertTriangle className="w-5.5 h-5.5" />
                        </div>
                        <div className="flex-1">
                          <h3 className="text-[13px] font-bold text-slate-800 leading-tight mb-1 transition-colors tracking-tight">
                            Credit payment pending
                          </h3>
                          <p className="text-[12px] text-slate-500 font-medium leading-relaxed">
                            {item.description}
                          </p>
                          <div className="mt-2 text-[12px] font-bold text-amber-700">
                            Due amount: {formatCurrency(item.pendingAmount)}
                          </div>
                          <div className="mt-3 flex items-center justify-between">
                            <span className="text-[10px] font-semibold text-slate-400">Date: {item.date || "—"}</span>
                            <Link
                              href="/accounts"
                              onClick={onClose}
                              className="flex items-center gap-1.5 py-1.5 px-3 bg-white border border-slate-200 rounded-lg text-[10px] font-bold text-slate-600 hover:bg-slate-900 hover:text-white hover:border-slate-900 transition-all decoration-none group/btn"
                            >
                              Open Accounts
                              <ArrowRight className="w-3.5 h-3.5 group-hover/btn:translate-x-1 transition-transform" />
                            </Link>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </>
              ) : null}

              {visibleLowStockItems.length > 0 ? (
                <>
                  <div className="flex items-center justify-between mb-2 mt-1">
                    <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">Inventory Alerts</span>
                    <span className="bg-red-50 text-red-600 text-[10px] font-black px-2 py-0.5 rounded-full">{visibleLowStockItems.length} ACTIVE</span>
                  </div>

                  {visibleLowStockItems.map((item) => (
                    <div key={item.id} className="group relative bg-white border border-slate-100 rounded-[20px] p-5 hover:border-red-100 hover:bg-red-50/30 transition-all hover:shadow-xl hover:shadow-red-500/5 overflow-hidden animate-in fade-in slide-in-from-right-4 duration-300">
                      <button
                        type="button"
                        onClick={() => clearNotification(`stock-${item.id}`)}
                        className="absolute right-3 top-3 rounded-full border border-slate-200 bg-white px-2 py-1 text-[10px] font-bold text-slate-500 hover:border-slate-300 hover:text-slate-700"
                      >
                        Clear
                      </button>
                      <div className="absolute top-0 right-0 p-3 opacity-0 group-hover:opacity-100 transition-opacity">
                        <AlertTriangle className="w-4 h-4 text-red-400" />
                      </div>
                      
                      <div className="flex items-start gap-4">
                        <div className="w-11 h-11 bg-red-50 rounded-[14px] flex items-center justify-center text-red-600 group-hover:scale-110 transition-transform shadow-sm">
                          <Package className="w-5.5 h-5.5" />
                        </div>
                        <div className="flex-1">
                          <h3 className="text-[14px] font-bold text-slate-800 leading-tight mb-1 group-hover:text-red-700 transition-colors uppercase tracking-tight">{item.name}</h3>
                          <p className="text-[12px] text-slate-500 font-medium leading-relaxed">Stock level is critical. Current inventory: <span className="text-red-600 font-bold">{item.stock} units</span>.</p>
                          <div className="mt-4 flex items-center justify-between">
                            <div className="flex flex-col">
                                <span className="text-[9px] font-bold text-slate-300 uppercase tracking-wider">Purchase Rate</span>
                                <span className="text-[13px] font-bold text-slate-700 font-mono">{formatCurrency(item.cost)}</span>
                            </div>
                            <Link 
                              href="/inventory" 
                              onClick={onClose}
                              className="flex items-center gap-1.5 py-1.5 px-3 bg-white border border-slate-200 rounded-lg text-[10px] font-bold text-slate-600 hover:bg-slate-900 hover:text-white hover:border-slate-900 transition-all decoration-none group/btn"
                            >
                              Manage Stock
                              <ArrowRight className="w-3.5 h-3.5 group-hover/btn:translate-x-1 transition-transform" />
                            </Link>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </>
              ) : null}
            </>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center px-10">
              <div className="w-20 h-20 bg-emerald-50 rounded-full flex items-center justify-center mb-6 animate-pulse">
                <BellRing className="w-10 h-10 text-emerald-500/30" />
              </div>
              <h3 className="text-[16px] font-bold text-slate-800 mb-2">Systems Nominal</h3>
              <p className="text-[12px] text-slate-400 font-medium leading-relaxed italic">No unread notifications or critical stock alerts at this time.</p>
            </div>
          )}
        </div>

      </div>
    </>
  );
}
