"use client";

import React, { Suspense, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { ConfirmDeleteModal } from "@/components/ConfirmDeleteModal";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { logActivity } from "@/lib/activity-log";
import { CalendarDays, ClipboardList, Edit2, Eye, Plus, Search, Trash2, X } from "lucide-react";

type EnquiryStatus = "open" | "closed";

interface EnquiryRow {
  id: string;
  customer_name: string;
  phone_number: string;
  vehicle_details: string;
  status: EnquiryStatus;
  pickup_date: string | null;
  created_at: string;
  profiles?: {
    username?: string;
  } | null;
}

function EnquiriesContent() {
  const params = useParams();
  const router = useRouter();
  const slug = params?.slug as string[] | undefined;

  const [enquiries, setEnquiries] = useState<EnquiryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [viewEnquiry, setViewEnquiry] = useState<EnquiryRow | null>(null);
  const [enquiryToDelete, setEnquiryToDelete] = useState<EnquiryRow | null>(null);
  const [statusModalEnquiry, setStatusModalEnquiry] = useState<EnquiryRow | null>(null);
  const [statusSaving, setStatusSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"" | EnquiryStatus>("");
  const [form, setForm] = useState({
    customer_name: "",
    phone_number: "",
    vehicle_details: "",
    status: "open" as EnquiryStatus,
    pickup_date: "",
  });
  const [quickStatusForm, setQuickStatusForm] = useState({
    status: "open" as EnquiryStatus,
    pickup_date: "",
  });

  const applyRouteState = (rows: EnquiryRow[]) => {
    if (slug && slug.length > 0) {
      if (slug[0] === "add-new") {
        setIsAdding(true);
        setEditId(null);
        setViewEnquiry(null);
        setForm({
          customer_name: "",
          phone_number: "",
          vehicle_details: "",
          status: "open",
          pickup_date: "",
        });
        return;
      }

      const id = slug.join("/");
      const enquiry = rows.find((item) => item.id === id) || null;
      if (enquiry) {
        setViewEnquiry(enquiry);
        setIsAdding(false);
        setEditId(null);
        return;
      }
    }

    setIsAdding(false);
    setEditId(null);
    setViewEnquiry(null);
  };

  const fetchEnquiries = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("enquiries")
      .select("*, profiles(username)")
      .order("created_at", { ascending: false });

    const rows = !error && data ? (data as EnquiryRow[]) : [];
    setEnquiries(rows);
    applyRouteState(rows);
    setLoading(false);
  };

  useEffect(() => {
    void fetchEnquiries();
  }, [slug]);

  const filteredEnquiries = enquiries.filter((enquiry) => {
    const q = searchQuery.trim().toLowerCase();
    const matchesSearch =
      !q ||
      enquiry.customer_name.toLowerCase().includes(q) ||
      enquiry.phone_number.toLowerCase().includes(q) ||
      enquiry.vehicle_details.toLowerCase().includes(q) ||
      enquiry.id.toLowerCase().includes(q);

    const matchesStatus = !statusFilter || enquiry.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const openCount = enquiries.filter((enquiry) => enquiry.status === "open").length;
  const closedCount = enquiries.filter((enquiry) => enquiry.status === "closed").length;
  const todayPickupCount = enquiries.filter(
    (enquiry) => enquiry.pickup_date === new Date().toISOString().split("T")[0],
  ).length;

  const handleSave = async () => {
    if (!form.customer_name || !form.phone_number || !form.vehicle_details) {
      alert("Please fill all required fields.");
      return;
    }

    const payload = {
      customer_name: form.customer_name,
      phone_number: form.phone_number,
      vehicle_details: form.vehicle_details,
      status: form.status,
      pickup_date: form.pickup_date || null,
    };

    if (editId) {
      const { error } = await supabase.from("enquiries").update(payload).eq("id", editId);
      if (error) {
        alert(error.message);
        return;
      }
      await logActivity({
        action: "edit",
        entityType: "enquiry",
        entityId: editId,
        entityLabel: form.customer_name,
        description: "Edited enquiry",
        metadata: payload,
      });
    } else {
      const { data: auth } = await supabase.auth.getUser();
      const newId = `ENQ-${Math.floor(1000 + Math.random() * 9000)}`;
      const { error } = await supabase.from("enquiries").insert([
        {
          id: newId,
          ...payload,
          created_by: auth.user?.id,
        },
      ]);
      if (error) {
        alert(error.message);
        return;
      }
      await logActivity({
        action: "create",
        entityType: "enquiry",
        entityId: newId,
        entityLabel: form.customer_name,
        description: "Created enquiry",
        metadata: payload,
      });
    }

    router.push("/enquiries");
    void fetchEnquiries();
  };

  const handleEdit = (enquiry: EnquiryRow) => {
    setEditId(enquiry.id);
    setViewEnquiry(null);
    setIsAdding(true);
    setForm({
      customer_name: enquiry.customer_name,
      phone_number: enquiry.phone_number,
      vehicle_details: enquiry.vehicle_details,
      status: enquiry.status,
      pickup_date: enquiry.pickup_date || "",
    });
  };

  const confirmDelete = async () => {
    if (!enquiryToDelete) return;
    const { error } = await supabase.from("enquiries").delete().eq("id", enquiryToDelete.id);
    if (error) {
      alert(error.message);
      return;
    }
    await logActivity({
      action: "delete",
      entityType: "enquiry",
      entityId: enquiryToDelete.id,
      entityLabel: enquiryToDelete.customer_name,
      description: "Deleted enquiry",
      metadata: { phone_number: enquiryToDelete.phone_number, status: enquiryToDelete.status },
    });
    setEnquiryToDelete(null);
    void fetchEnquiries();
  };

  const openStatusModal = (enquiry: EnquiryRow) => {
    setStatusModalEnquiry(enquiry);
    setQuickStatusForm({
      status: enquiry.status,
      pickup_date: enquiry.pickup_date || "",
    });
  };

  const handleQuickStatusSave = async () => {
    if (!statusModalEnquiry) return;

    setStatusSaving(true);
    const payload = {
      status: quickStatusForm.status,
      pickup_date: quickStatusForm.pickup_date || null,
    };

    const { error } = await supabase
      .from("enquiries")
      .update(payload)
      .eq("id", statusModalEnquiry.id);

    setStatusSaving(false);

    if (error) {
      alert(error.message);
      return;
    }

    await logActivity({
      action: "edit",
      entityType: "enquiry",
      entityId: statusModalEnquiry.id,
      entityLabel: statusModalEnquiry.customer_name,
      description: "Updated enquiry status",
      metadata: payload,
    });

    setStatusModalEnquiry(null);
    void fetchEnquiries();
  };

  return (
    <div className="min-h-screen bg-[#f4f6fb] p-5 font-sans text-slate-900">
      {!isAdding && !viewEnquiry ? (
        <div className="min-h-[calc(100vh-40px)] rounded-[28px] border border-slate-200 bg-white shadow-[0_24px_60px_rgba(15,23,42,0.07)] overflow-hidden">
          <div className="px-8 py-6 flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Enquiries</h1>
              <p className="mt-1 text-sm text-slate-500">Track customer enquiries, status, and pickup dates.</p>
            </div>
            <button
              className="px-5 py-2.5 bg-[#4f46e5] text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 transition-all flex items-center gap-2 shadow-sm"
              onClick={() => router.push("/enquiries/add-new")}
            >
              <Plus className="w-4 h-4" />
              New Enquiry
            </button>
          </div>

          <div className="grid overflow-hidden border-y border-slate-100 bg-slate-50/40 sm:grid-cols-2 xl:grid-cols-4">
            <div className="px-8 py-5 border-b border-slate-100 sm:border-b-0 sm:border-r">
              <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Total enquiries</div>
              <div className="mt-1 text-2xl font-black text-slate-900">{enquiries.length}</div>
            </div>
            <div className="px-8 py-5 border-b border-slate-100 sm:border-b-0 sm:border-r">
              <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Open</div>
              <div className="mt-1 text-2xl font-black text-sky-600">{openCount}</div>
            </div>
            <div className="px-8 py-5 border-b border-slate-100 xl:border-b-0 xl:border-r">
              <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Closed</div>
              <div className="mt-1 text-2xl font-black text-slate-700">{closedCount}</div>
            </div>
            <div className="px-8 py-5">
              <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Pickup today</div>
              <div className="mt-1 text-2xl font-black text-emerald-600">{todayPickupCount}</div>
            </div>
          </div>

          <div className="px-8 border-b border-slate-100 py-6 flex items-center justify-between bg-zinc-50/20">
            <div>
              <h2 className="text-sm font-black text-slate-800 uppercase tracking-widest italic">Enquiry Records</h2>
              <p className="text-[10px] text-slate-400 font-bold mt-0.5">Customer follow-up and pickup schedule</p>
            </div>

            <div className="flex items-center gap-3">
              <div className="relative group">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300 group-focus-within:text-[#4f46e5] transition-colors" />
                <input
                  type="text"
                  placeholder="Search customer, phone, vehicle..."
                  className="pl-9 pr-4 py-2 bg-white border border-slate-100 rounded-lg text-sm font-medium focus:ring-4 ring-indigo-500/5 focus:border-indigo-500 outline-none w-72 transition-all shadow-sm"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                />
              </div>
              <select
                className="px-4 py-2 bg-white border border-slate-100 rounded-lg text-sm font-medium text-slate-600 focus:ring-4 ring-indigo-500/5 focus:border-indigo-500 outline-none transition-all shadow-sm"
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value as "" | EnquiryStatus)}
              >
                <option value="">All status</option>
                <option value="open">Open</option>
                <option value="closed">Closed</option>
              </select>
            </div>
          </div>

          <div className="px-8 pt-6">
            <div className="border border-slate-100 rounded-[24px] overflow-hidden shadow-sm bg-white">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    <th className="px-6 py-4 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Enquiry ID</th>
                    <th className="px-6 py-4 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Customer</th>
                    <th className="px-6 py-4 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Vehicle Details</th>
                    <th className="px-6 py-4 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-4 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Pickup Date</th>
                    <th className="px-6 py-4 text-right pr-10 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {loading ? (
                    <tr>
                      <td colSpan={6} className="py-24">
                        <LoadingSpinner label="Retrieving enquiries" />
                      </td>
                    </tr>
                  ) : filteredEnquiries.map((enquiry) => {
                    const badgeClass =
                      enquiry.status === "open"
                        ? "bg-sky-50 text-sky-600"
                        : "bg-slate-100 text-slate-600";

                    return (
                      <tr key={enquiry.id} onClick={() => router.push(`/enquiries/${enquiry.id}`)} className="group hover:bg-slate-50/50 transition-colors cursor-pointer">
                        <td className="px-6 py-4">
                          <span className="font-bold text-[12px] text-indigo-600 tracking-tight">{enquiry.id}</span>
                        </td>
                        <td className="px-6 py-4">
                          <p className="font-bold text-sm text-slate-900 leading-tight">{enquiry.customer_name}</p>
                          <p className="text-[11px] text-slate-400 mt-1">{enquiry.phone_number}</p>
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-sm text-slate-700">{enquiry.vehicle_details}</p>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${badgeClass}`}>
                            {enquiry.status}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-sm font-medium text-slate-900">{enquiry.pickup_date || "—"}</p>
                        </td>
                        <td className="px-6 py-4 text-right pr-10">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={(event) => {
                                event.stopPropagation();
                                openStatusModal(enquiry);
                              }}
                              className="rounded-lg border border-slate-200 px-2.5 py-1 text-[11px] font-semibold text-slate-600 transition-all hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-600 opacity-0 group-hover:opacity-100"
                              title="Quick status update"
                            >
                              Status
                            </button>
                            <button
                              onClick={(event) => { event.stopPropagation(); router.push(`/enquiries/${enquiry.id}`); }}
                              className="p-1.5 hover:bg-indigo-50 rounded-lg text-slate-300 hover:text-indigo-600 transition-all opacity-0 group-hover:opacity-100"
                              title="View enquiry"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                            <button
                              onClick={(event) => { event.stopPropagation(); handleEdit(enquiry); }}
                              className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-300 hover:text-slate-600 transition-all opacity-0 group-hover:opacity-100"
                              title="Edit enquiry"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={(event) => {
                                event.stopPropagation();
                                setEnquiryToDelete(enquiry);
                              }}
                              className="p-1.5 hover:bg-rose-50 rounded-lg text-slate-300 hover:text-rose-600 transition-all opacity-0 group-hover:opacity-100"
                              title="Delete enquiry"
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
              {filteredEnquiries.length === 0 && !loading ? (
                <div className="py-20 text-center bg-white">
                  <div className="inline-flex w-16 h-16 bg-slate-50 rounded-full items-center justify-center mb-4">
                    <ClipboardList className="w-8 h-8 text-slate-200" />
                  </div>
                  <p className="font-bold text-slate-800">No enquiries found</p>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {isAdding ? (
        <div className="mx-auto max-w-5xl rounded-[28px] border border-slate-200 bg-white p-8 shadow-[0_24px_60px_rgba(15,23,42,0.07)]">
          <div className="mb-8">
            <h2 className="text-2xl font-bold tracking-tight">{editId ? "Edit enquiry" : "Add new enquiry"}</h2>
            <p className="mt-1 text-sm text-slate-500">Record customer name, phone, vehicle details, status, and pickup date.</p>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-[12px] font-semibold uppercase tracking-wider text-slate-500">Customer name</label>
              <input
                className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none transition-all focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/5"
                type="text"
                value={form.customer_name}
                onChange={(event) => setForm((current) => ({ ...current, customer_name: event.target.value }))}
                placeholder="e.g. Rajan Kumar"
              />
            </div>
            <div>
              <label className="mb-2 block text-[12px] font-semibold uppercase tracking-wider text-slate-500">Phone number</label>
              <input
                className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none transition-all focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/5"
                type="text"
                value={form.phone_number}
                onChange={(event) => setForm((current) => ({ ...current, phone_number: event.target.value }))}
                placeholder="e.g. +91 98765 43210"
              />
            </div>
            <div className="md:col-span-2">
              <label className="mb-2 block text-[12px] font-semibold uppercase tracking-wider text-slate-500">Vehicle details</label>
              <textarea
                className="min-h-[120px] w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none transition-all focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/5"
                value={form.vehicle_details}
                onChange={(event) => setForm((current) => ({ ...current, vehicle_details: event.target.value }))}
                placeholder="e.g. TN 58 AB 1234 · Maruti Swift VXI · Brake noise and service enquiry"
              />
            </div>
            <div>
              <label className="mb-2 block text-[12px] font-semibold uppercase tracking-wider text-slate-500">Status</label>
              <select
                className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none transition-all focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/5"
                value={form.status}
                onChange={(event) => setForm((current) => ({ ...current, status: event.target.value as EnquiryStatus }))}
              >
                <option value="open">Open</option>
                <option value="closed">Closed</option>
              </select>
            </div>
            <div>
              <label className="mb-2 block text-[12px] font-semibold uppercase tracking-wider text-slate-500">Pickup date</label>
              <div className="relative">
                <CalendarDays className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  className="w-full rounded-xl border border-slate-200 py-3 pl-11 pr-4 text-sm outline-none transition-all focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/5"
                  type="date"
                  value={form.pickup_date}
                  onChange={(event) => setForm((current) => ({ ...current, pickup_date: event.target.value }))}
                />
              </div>
            </div>
          </div>

          <div className="mt-8 flex items-center gap-3">
            <button
              className="inline-flex items-center gap-2 rounded-xl bg-[#4f46e5] px-5 py-3 text-sm font-semibold text-white transition-all hover:bg-indigo-700"
              onClick={handleSave}
            >
              <ClipboardList className="h-4 w-4" />
              {editId ? "Save enquiry" : "Create enquiry"}
            </button>
            <button
              className="rounded-xl border border-slate-200 px-5 py-3 text-sm font-medium text-slate-600 transition-all hover:bg-slate-50"
              onClick={() => router.push("/enquiries")}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {viewEnquiry ? (
        <div className="mx-auto max-w-4xl rounded-[28px] border border-slate-200 bg-white p-8 shadow-[0_24px_60px_rgba(15,23,42,0.07)]">
          <div className="mb-8 flex items-start justify-between gap-6">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">Enquiry</div>
              <h2 className="mt-2 text-2xl font-bold tracking-tight text-slate-900">{viewEnquiry.customer_name}</h2>
              <p className="mt-1 text-sm text-slate-500">{viewEnquiry.id}</p>
            </div>
            <div className="flex items-center gap-3">
              <button
                className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2.5 text-sm font-medium text-indigo-600 transition-all hover:bg-indigo-100"
                onClick={() => openStatusModal(viewEnquiry)}
              >
                Quick status
              </button>
              <button
                className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 transition-all hover:bg-slate-50"
                onClick={() => handleEdit(viewEnquiry)}
              >
                Edit
              </button>
              <button
                className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 transition-all hover:bg-slate-50"
                onClick={() => router.push("/enquiries")}
              >
                Back
              </button>
            </div>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 p-5">
              <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">Phone number</div>
              <div className="mt-2 text-lg font-semibold text-slate-900">{viewEnquiry.phone_number}</div>
            </div>
            <div className="rounded-2xl border border-slate-200 p-5">
              <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">Status</div>
              <div className="mt-2 text-lg font-semibold text-slate-900">{viewEnquiry.status}</div>
            </div>
            <div className="rounded-2xl border border-slate-200 p-5 md:col-span-2">
              <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">Vehicle details</div>
              <div className="mt-2 text-base text-slate-800">{viewEnquiry.vehicle_details}</div>
            </div>
            <div className="rounded-2xl border border-slate-200 p-5">
              <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">Pickup date</div>
              <div className="mt-2 text-base text-slate-800">{viewEnquiry.pickup_date || "—"}</div>
            </div>
            <div className="rounded-2xl border border-slate-200 p-5">
              <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">Created by</div>
              <div className="mt-2 text-base text-slate-800">{viewEnquiry.profiles?.username || "Admin"}</div>
            </div>
          </div>
        </div>
      ) : null}

      {enquiryToDelete ? (
        <ConfirmDeleteModal
          title="Delete Enquiry?"
          description={`Delete enquiry ${enquiryToDelete.id} for ${enquiryToDelete.customer_name}. This action cannot be undone.`}
          confirmLabel="Delete Enquiry"
          onConfirm={() => void confirmDelete()}
          onCancel={() => setEnquiryToDelete(null)}
        />
      ) : null}

      {statusModalEnquiry ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4">
          <div className="w-full max-w-md rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_24px_60px_rgba(15,23,42,0.18)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">Quick status update</div>
                <h3 className="mt-2 text-xl font-bold tracking-tight text-slate-900">
                  {statusModalEnquiry.customer_name}
                </h3>
                <p className="mt-1 text-sm text-slate-500">{statusModalEnquiry.id}</p>
              </div>
              <button
                className="rounded-xl p-2 text-slate-400 transition-all hover:bg-slate-100 hover:text-slate-600"
                onClick={() => setStatusModalEnquiry(null)}
                title="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-6 space-y-5">
              <div>
                <label className="mb-2 block text-[12px] font-semibold uppercase tracking-wider text-slate-500">
                  Status
                </label>
                <div className="grid grid-cols-2 gap-3">
                  {(["open", "closed"] as EnquiryStatus[]).map((value) => {
                    const isActive = quickStatusForm.status === value;
                    return (
                      <button
                        key={value}
                        className={`rounded-xl border px-4 py-3 text-sm font-semibold capitalize transition-all ${
                          isActive
                            ? "border-indigo-200 bg-indigo-50 text-indigo-600"
                            : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                        }`}
                        onClick={() => setQuickStatusForm((current) => ({ ...current, status: value }))}
                      >
                        {value}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="mb-2 block text-[12px] font-semibold uppercase tracking-wider text-slate-500">
                  Pickup date
                </label>
                <div className="relative">
                  <CalendarDays className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    className="w-full rounded-xl border border-slate-200 py-3 pl-11 pr-4 text-sm outline-none transition-all focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/5"
                    type="date"
                    value={quickStatusForm.pickup_date}
                    onChange={(event) =>
                      setQuickStatusForm((current) => ({ ...current, pickup_date: event.target.value }))
                    }
                  />
                </div>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 transition-all hover:bg-slate-50"
                onClick={() => setStatusModalEnquiry(null)}
                disabled={statusSaving}
              >
                Cancel
              </button>
              <button
                className="rounded-xl bg-[#4f46e5] px-4 py-2.5 text-sm font-semibold text-white transition-all hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
                onClick={() => void handleQuickStatusSave()}
                disabled={statusSaving}
              >
                {statusSaving ? "Updating..." : "Update status"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function EnquiriesPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <EnquiriesContent />
    </Suspense>
  );
}
