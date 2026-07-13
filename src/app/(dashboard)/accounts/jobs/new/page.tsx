"use client";

import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { format } from "date-fns";
import { Plus, Trash2, Wrench } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { LoadingSpinner } from "@/components/LoadingSpinner";

type EmployeeOption = {
  id: string;
  employee_id?: string | null;
  name: string;
  role?: string | null;
};

type VehicleOption = {
  id: string;
  car_id: string;
  vehicle_reg?: string | null;
  owner_name?: string | null;
};

type JobFormState = {
  employee_id: string;
};

type JobDraft = {
  localId: number;
  work_date: string;
  vehicle_id: string;
  vehicle_query: string;
  amount_due: string;
  note: string;
};

function vehicleLabel(vehicle?: VehicleOption | null) {
  if (!vehicle) return "—";
  return [vehicle.car_id, vehicle.vehicle_reg, vehicle.owner_name].filter(Boolean).join(" · ");
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

export default function NewJobPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const preselectedEmployeeId = (searchParams?.get("employeeId") || "").trim();

  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [vehicles, setVehicles] = useState<VehicleOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [lockedEmployeeId, setLockedEmployeeId] = useState<string | null>(null);
  const [openVehicleRow, setOpenVehicleRow] = useState<number | null>(null);
  const [vehiclePopup, setVehiclePopup] = useState<{
    rowId: number;
    top: number;
    left: number;
    width: number;
  } | null>(null);
  const vehicleInputRefs = useRef(new Map<number, HTMLInputElement | null>());
  const [form, setForm] = useState<JobFormState>(() => ({
    employee_id: "",
  }));
  const [drafts, setDrafts] = useState<JobDraft[]>(() => [
    {
      localId: 1,
      work_date: format(new Date(), "yyyy-MM-dd"),
      vehicle_id: "",
      vehicle_query: "",
      amount_due: "",
      note: "",
    },
  ]);

  const loadData = async () => {
    setLoading(true);
    const [employeesResponse, vehiclesResponse] = await Promise.all([
      supabase.from("employees").select("id, employee_id, name, role").order("name", { ascending: true }),
      supabase.from("vehicles").select("id, car_id, vehicle_reg, owner_name").order("created_at", { ascending: false }),
    ]);

    setEmployees((employeesResponse.data || []) as EmployeeOption[]);
    setVehicles((vehiclesResponse.data || []) as VehicleOption[]);
    setLoading(false);
  };

  useEffect(() => {
    void loadData();
  }, []);

  useEffect(() => {
    if (!preselectedEmployeeId) return;
    setLockedEmployeeId(preselectedEmployeeId);
    setForm((current) => ({ ...current, employee_id: preselectedEmployeeId }));
  }, [preselectedEmployeeId]);

  const preselectedMissing = Boolean(
    preselectedEmployeeId && !employees.some((employee) => employee.id === preselectedEmployeeId),
  );

  const addAnotherDraft = () => {
    setDrafts((rows) => {
      const nextId = rows.reduce((maxId, row) => Math.max(maxId, row.localId), 0) + 1;
      return [
        ...rows,
        {
          localId: nextId,
          work_date: format(new Date(), "yyyy-MM-dd"),
          vehicle_id: "",
          vehicle_query: "",
          amount_due: "",
          note: "",
        },
      ];
    });
  };

  const normalizeText = (value?: string | null) => String(value || "").trim().toLowerCase();

  const findVehicleMatch = (query: string) => {
    const normalized = normalizeText(query);
    if (!normalized) return null;
    const labelMatch = vehicles.find((vehicle) => normalizeText(vehicleLabel(vehicle)) === normalized);
    if (labelMatch) return labelMatch;
    const carIdMatch = vehicles.find((vehicle) => normalizeText(vehicle.car_id) === normalized);
    if (carIdMatch) return carIdMatch;
    const regMatch = vehicles.find((vehicle) => normalizeText(vehicle.vehicle_reg) === normalized);
    if (regMatch) return regMatch;
    const ownerMatch = vehicles.find((vehicle) => normalizeText(vehicle.owner_name) === normalized);
    if (ownerMatch) return ownerMatch;
    return null;
  };

  const getVehicleResults = (query: string) => {
    const normalized = normalizeText(query);
    const matches = normalized
      ? vehicles.filter((vehicle) => {
          const carId = normalizeText(vehicle.car_id);
          const reg = normalizeText(vehicle.vehicle_reg);
          const owner = normalizeText(vehicle.owner_name);
          return (
            carId.includes(normalized) || reg.includes(normalized) || owner.includes(normalized)
          );
        })
      : vehicles;
    return matches.slice(0, normalized ? 8 : 6);
  };

  const updateDraft = (localId: number, field: keyof JobDraft, value: string) => {
    setDrafts((current) =>
      current.map((row) => (row.localId === localId ? { ...row, [field]: value } : row)),
    );
  };

  const updateDraftVehicle = (localId: number, query: string, vehicleId: string) => {
    setDrafts((current) =>
      current.map((row) =>
        row.localId === localId
          ? { ...row, vehicle_query: query, vehicle_id: vehicleId }
          : row,
      ),
    );
  };

  const updateVehiclePopupPosition = (rowId: number) => {
    const input = vehicleInputRefs.current.get(rowId);
    if (!input) return;
    const rect = input.getBoundingClientRect();
    setVehiclePopup({
      rowId,
      top: rect.bottom + 8,
      left: rect.left,
      width: rect.width,
    });
  };

  const openVehiclePopup = (rowId: number) => {
    setOpenVehicleRow(rowId);
    updateVehiclePopupPosition(rowId);
  };

  const closeVehiclePopup = (rowId: number) => {
    setOpenVehicleRow((current) => (current === rowId ? null : current));
    setVehiclePopup((current) => (current?.rowId === rowId ? null : current));
  };

  const handleVehicleSelect = (localId: number, vehicle: VehicleOption) => {
    updateDraftVehicle(localId, vehicleLabel(vehicle), vehicle.id);
    setOpenVehicleRow(null);
    setVehiclePopup(null);
  };

  useEffect(() => {
    if (openVehicleRow === null) {
      setVehiclePopup(null);
      return;
    }
    updateVehiclePopupPosition(openVehicleRow);
  }, [openVehicleRow, drafts]);

  useEffect(() => {
    if (openVehicleRow === null) return;
    const handle = () => updateVehiclePopupPosition(openVehicleRow);
    window.addEventListener("scroll", handle, true);
    window.addEventListener("resize", handle);
    return () => {
      window.removeEventListener("scroll", handle, true);
      window.removeEventListener("resize", handle);
    };
  }, [openVehicleRow]);

  const removeDraft = (localId: number) => {
    setDrafts((current) =>
      current.length > 1 ? current.filter((row) => row.localId !== localId) : current,
    );
  };

  const handleCreateJob = async () => {
    if (!form.employee_id) {
      alert("Employee is required.");
      return;
    }

    const validDrafts = drafts.filter((row) => row.work_date && row.vehicle_id);
    if (!validDrafts.length || validDrafts.length !== drafts.length) {
      alert("Please select vehicle and date for every job row.");
      return;
    }

    setSaving(true);
    const { data: auth } = await supabase.auth.getUser();
    const rows = validDrafts.map((row) => ({
      employee_id: form.employee_id,
      work_date: row.work_date,
      entry_type: "vehicle_contract",
      vehicle_id: row.vehicle_id,
      amount_due: Math.max(0, Number(row.amount_due || 0)),
      note: row.note.trim() || null,
      created_by: auth.user?.id || null,
    }));
    const { error } = await supabase.from("employee_work_logs").insert(rows);
    setSaving(false);
    if (error) {
      alert(error.message);
      return;
    }
    if (form.employee_id) {
      router.push(`/accounts/jobs/employee/${form.employee_id}`);
    } else {
      router.push("/accounts/jobs");
    }
  };

  const activeVehicleRow =
    openVehicleRow === null ? null : drafts.find((row) => row.localId === openVehicleRow) || null;
  const activeVehicleResults = activeVehicleRow
    ? getVehicleResults(activeVehicleRow.vehicle_query)
    : [];
  const vehiclePopupNode =
    activeVehicleRow && vehiclePopup && typeof document !== "undefined"
      ? createPortal(
          <div
            className="fixed z-[9999] max-h-72 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-2xl"
            style={{
              top: vehiclePopup.top,
              left: vehiclePopup.left,
              width: vehiclePopup.width,
            }}
          >
            {activeVehicleResults.length > 0 ? (
              activeVehicleResults.map((vehicle) => (
                <button
                  key={vehicle.id}
                  type="button"
                  className="flex w-full flex-col gap-1 border-b border-slate-100 px-3 py-2.5 text-left text-xs text-slate-700 last:border-b-0 hover:bg-slate-50"
                  onMouseDown={() => handleVehicleSelect(activeVehicleRow.localId, vehicle)}
                >
                  <span className="text-[11px] font-black uppercase tracking-wider text-indigo-600">
                    {vehicle.car_id}
                  </span>
                  <span className="text-xs font-semibold text-slate-900">
                    {vehicle.owner_name || "Customer"}
                  </span>
                  <span className="text-[11px] text-slate-500">
                    {vehicle.vehicle_reg || "—"}
                  </span>
                </button>
              ))
            ) : (
              <div className="px-3 py-3 text-xs text-slate-500">No vehicles found.</div>
            )}
          </div>,
          document.body,
        )
      : null;

  return (
    <div className="min-h-screen bg-[#f4f6fb] p-5 font-sans text-slate-900">
      <div className="min-h-[calc(100vh-40px)] rounded-[28px] border border-slate-200 bg-white shadow-[0_24px_60px_rgba(15,23,42,0.07)] overflow-hidden">
        <div className="px-8 py-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">New Jobs</h1>
            <p className="mt-1 text-sm text-slate-500">Create multiple contract job entries at once.</p>
          </div>
          <Link href="/accounts/jobs" className="px-4 py-2.5 border border-slate-200 bg-white rounded-lg text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-all">
            Back to Jobs
          </Link>
        </div>

        <div className="px-8 py-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="mb-4 flex items-center gap-2 text-lg font-black text-slate-900">
              <Wrench className="h-5 w-5 text-indigo-600" />
              Job Details
            </div>

            {loading ? (
              <div className="py-16">
                <LoadingSpinner label="Loading employees and vehicles" />
              </div>
            ) : (
              <>
                {preselectedMissing ? (
                  <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700">
                    The selected employee was not found. Please choose a valid employee.
                  </div>
                ) : null}

                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <select
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-300"
                      value={form.employee_id}
                      onChange={(e) => setForm((current) => ({ ...current, employee_id: e.target.value }))}
                      disabled={Boolean(lockedEmployeeId)}
                    >
                      <option value="">Select employee</option>
                      {employees.map((employee) => (
                        <option key={employee.id} value={employee.id}>
                          {employee.name}
                        </option>
                      ))}
                    </select>
                    {form.employee_id ? (
                      <div className="mt-1 text-[11px] text-slate-500">
                        Employee ID:{" "}
                        <span className="font-mono">
                          {formatEmployeeId(
                            employees.find((item) => item.id === form.employee_id)?.employee_id,
                            form.employee_id,
                          )}
                        </span>
                      </div>
                    ) : null}
                  </div>
                  <div className="flex items-center">
                    {lockedEmployeeId ? (
                      <button
                        type="button"
                        onClick={() => setLockedEmployeeId(null)}
                        className="text-left text-xs font-semibold text-indigo-600 hover:text-indigo-700"
                      >
                        Change employee
                      </button>
                    ) : null}
                  </div>
                </div>

                <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50/40 p-4">
                  <div className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-500">
                    Job Rows
                  </div>
                  <div className="relative overflow-x-auto overflow-y-visible">
                    <table className="w-full min-w-[760px] text-left border-collapse">
                      <thead>
                        <tr className="text-[11px] uppercase tracking-widest text-slate-400">
                          <th className="pb-2">Date</th>
                          <th className="pb-2">Vehicle</th>
                          <th className="pb-2">Value</th>
                          <th className="pb-2">Description</th>
                          <th className="pb-2 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {drafts.map((row) => {
                          return (
                          <tr key={row.localId}>
                            <td className="py-3 pr-2">
                              <input
                                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-300"
                                type="date"
                                value={row.work_date}
                                onChange={(e) => updateDraft(row.localId, "work_date", e.target.value)}
                              />
                            </td>
                            <td className="py-3 pr-2">
                              <div className="relative">
                                <input
                                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-300"
                                  placeholder="Type vehicle / reg / owner"
                                  value={row.vehicle_query}
                                  ref={(node) => {
                                    if (node) {
                                      vehicleInputRefs.current.set(row.localId, node);
                                    } else {
                                      vehicleInputRefs.current.delete(row.localId);
                                    }
                                  }}
                                  onChange={(e) => {
                                    const query = e.target.value;
                                    const match = findVehicleMatch(query);
                                    updateDraftVehicle(row.localId, query, match ? match.id : "");
                                    openVehiclePopup(row.localId);
                                  }}
                                  onFocus={() => {
                                    openVehiclePopup(row.localId);
                                  }}
                                  onBlur={() => {
                                    window.setTimeout(() => {
                                      closeVehiclePopup(row.localId);
                                    }, 150);
                                  }}
                                />
                              </div>
                              {row.vehicle_query && !row.vehicle_id ? (
                                <div className="mt-1 text-[10px] text-amber-600">
                                  Select a vehicle from the list.
                                </div>
                              ) : null}
                            </td>
                            <td className="py-3 pr-2">
                              <input
                                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-300"
                                placeholder="Value (optional)"
                                type="number"
                                min={0}
                                value={row.amount_due}
                                onChange={(e) => updateDraft(row.localId, "amount_due", e.target.value)}
                              />
                            </td>
                            <td className="py-3 pr-2">
                              <input
                                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-300"
                                placeholder="Description"
                                value={row.note}
                                onChange={(e) => updateDraft(row.localId, "note", e.target.value)}
                              />
                            </td>
                            <td className="py-3 text-right">
                              <button
                                type="button"
                                onClick={() => removeDraft(row.localId)}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 px-2.5 py-1.5 text-[11px] font-semibold text-rose-600 transition-all hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-40"
                                disabled={drafts.length === 1}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                                Remove
                              </button>
                            </td>
                          </tr>
                        );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <button
                    type="button"
                    onClick={addAnotherDraft}
                    className="mt-3 inline-flex items-center gap-2 rounded-lg border border-indigo-200 px-3 py-2 text-xs font-semibold text-indigo-600 hover:bg-indigo-50"
                  >
                    <Plus className="h-4 w-4" />
                    Add another job
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => void handleCreateJob()}
                  disabled={saving}
                  className="mt-4 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
                >
                  {saving ? "Saving..." : "Save Jobs"}
                </button>
                <Link
                  href="/accounts/jobs"
                  className="mt-4 ml-3 inline-flex rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Back to Jobs
                </Link>
              </>
            )}
          </div>
        </div>
      </div>
      {vehiclePopupNode}
    </div>
  );
}
