"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { Briefcase, Search, Wrench } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { cn } from "@/lib/utils";

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
  work_date: string;
  employee_id: string;
  vehicle_id: string;
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

export default function JobsPage() {
  const [activeTab, setActiveTab] = useState<"create" | "list">("list");
  const [form, setForm] = useState<JobFormState>(() => ({
    work_date: format(new Date(), "yyyy-MM-dd"),
    employee_id: "",
    vehicle_id: "",
    amount_due: "",
    note: "",
  }));
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [vehicles, setVehicles] = useState<VehicleOption[]>([]);
  const [query, setQuery] = useState("");
  const [lockedEmployeeId, setLockedEmployeeId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [jobsTableAvailable, setJobsTableAvailable] = useState(true);

  const loadData = async () => {
    setLoading(true);
    const [employeesResponse, vehiclesResponse, jobsResponse] = await Promise.all([
      supabase.from("employees").select("id, employee_id, name, role").order("name", { ascending: true }),
      supabase.from("vehicles").select("id, car_id, vehicle_reg, owner_name").order("created_at", { ascending: false }),
      supabase
        .from("employee_work_logs")
        .select("id, employee_id, work_date, entry_type, vehicle_id, amount_due, note, created_at, employees(id, name), vehicles(id, car_id, vehicle_reg, owner_name)")
        .eq("entry_type", "vehicle_contract")
        .order("work_date", { ascending: false })
        .order("created_at", { ascending: false }),
    ]);

    setEmployees((employeesResponse.data || []) as EmployeeOption[]);
    setVehicles((vehiclesResponse.data || []) as VehicleOption[]);
    setJobsTableAvailable(!jobsResponse.error);
    setLoading(false);
  };

  useEffect(() => {
    void loadData();
  }, []);

  const filteredEmployees = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return employees;
    return employees.filter((employee) =>
      [employee.name, employee.role || "", formatEmployeeId(employee.employee_id, employee.id)]
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [employees, query]);

  const handleCreateJob = async () => {
    if (!form.employee_id || !form.vehicle_id) {
      alert("Employee and vehicle are required.");
      return;
    }
    setSaving(true);
    const { data: auth } = await supabase.auth.getUser();
    const { error } = await supabase.from("employee_work_logs").insert([
      {
        employee_id: form.employee_id,
        work_date: form.work_date,
        entry_type: "vehicle_contract",
        vehicle_id: form.vehicle_id,
        amount_due: Math.max(0, Number(form.amount_due || 0)),
        note: form.note.trim() || null,
        created_by: auth.user?.id || null,
      },
    ]);
    setSaving(false);
    if (error) {
      alert(error.message);
      return;
    }
    setForm({
      work_date: format(new Date(), "yyyy-MM-dd"),
      employee_id: "",
      vehicle_id: "",
      amount_due: "",
      note: "",
    });
    setLockedEmployeeId(null);
    await loadData();
    setActiveTab("list");
  };

  // CSV export is available on the dedicated employee jobs page.

  return (
    <div className="min-h-screen bg-[#f4f6fb] p-5 font-sans text-slate-900">
      <div className="min-h-[calc(100vh-40px)] rounded-[28px] border border-slate-200 bg-white shadow-[0_24px_60px_rgba(15,23,42,0.07)] overflow-hidden">
        <div className="px-8 py-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Jobs</h1>
            <p className="mt-1 text-sm text-slate-500">Create contract jobs and track employee work history.</p>
          </div>
          <Link href="/accounts" className="px-4 py-2.5 border border-slate-200 bg-white rounded-lg text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-all">
            Back to Accounts
          </Link>
        </div>

        {!jobsTableAvailable ? (
          <div className="mx-8 mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
            Job tables are not available yet. Make sure the `employee_work_logs` table exists in Supabase.
          </div>
        ) : null}

        <div className="px-8 border-b border-slate-100 py-4 flex items-center justify-between bg-zinc-50/30">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setActiveTab("list")}
              className={cn(
                "inline-flex items-center gap-2 rounded-full px-4 py-2 text-[12px] font-bold uppercase tracking-widest transition-all",
                activeTab === "list"
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "bg-white text-slate-500 border border-slate-200 hover:text-slate-700",
              )}
            >
              <Briefcase className="h-4 w-4" />
              Employees
            </button>
            <Link
              href="/accounts/jobs/new"
              className={cn(
                "inline-flex items-center gap-2 rounded-full px-4 py-2 text-[12px] font-bold uppercase tracking-widest transition-all",
                "bg-white text-slate-500 border border-slate-200 hover:text-slate-700",
              )}
            >
              <Wrench className="h-4 w-4" />
              Add Job
            </Link>
          </div>
          <div className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Employee Jobs</div>
        </div>

        {activeTab === "create" ? (
          <div className="px-8 py-6">
            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <div className="mb-4 flex items-center gap-2 text-lg font-black text-slate-900">
                <Wrench className="h-5 w-5 text-indigo-600" />
                New Job Creation
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <input
                  className="rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-300"
                  type="date"
                  value={form.work_date}
                  onChange={(e) => setForm((current) => ({ ...current, work_date: e.target.value }))}
                />
                <select
                  className="rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-300"
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
                {lockedEmployeeId ? (
                  <button
                    type="button"
                    onClick={() => setLockedEmployeeId(null)}
                    className="text-left text-xs font-semibold text-indigo-600 hover:text-indigo-700"
                  >
                    Change employee
                  </button>
                ) : null}
                <select
                  className="rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-300"
                  value={form.vehicle_id}
                  onChange={(e) => setForm((current) => ({ ...current, vehicle_id: e.target.value }))}
                >
                  <option value="">Select vehicle</option>
                  {vehicles.map((vehicle) => (
                    <option key={vehicle.id} value={vehicle.id}>
                      {vehicleLabel(vehicle)}
                    </option>
                  ))}
                </select>
                <input
                  className="rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-300"
                  placeholder="Value (optional)"
                  type="number"
                  min={0}
                  value={form.amount_due}
                  onChange={(e) => setForm((current) => ({ ...current, amount_due: e.target.value }))}
                />
                <input
                  className="rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-300 md:col-span-2"
                  placeholder="Description"
                  value={form.note}
                  onChange={(e) => setForm((current) => ({ ...current, note: e.target.value }))}
                />
              </div>
              <button
                type="button"
                onClick={() => void handleCreateJob()}
                disabled={saving}
                className="mt-4 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
              >
                {saving ? "Saving..." : "Save Job"}
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("list")}
                className="mt-4 ml-3 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50"
              >
                Back to Employees
              </button>
            </div>
          </div>
        ) : (
          <div className="px-8 py-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-sm font-black text-slate-800 uppercase tracking-widest italic">Employees</h2>
                <p className="text-[10px] text-slate-400 font-bold mt-0.5">Add or view jobs by employee.</p>
              </div>
              <div className="flex items-center gap-3">
                <div className="relative group">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300 group-focus-within:text-[#4f46e5] transition-colors" />
                  <input
                    type="text"
                    placeholder="Search employee..."
                    className="pl-9 pr-4 py-2 bg-white border border-slate-100 rounded-lg text-sm font-medium focus:ring-4 ring-indigo-500/5 focus:border-indigo-500 outline-none w-72 transition-all shadow-sm"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </div>
              </div>
            </div>

            <div className="border border-slate-100 rounded-[24px] overflow-hidden shadow-sm bg-white">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    <th className="px-6 py-4 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Employee</th>
                    <th className="px-6 py-4 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Employee ID</th>
                    <th className="px-6 py-4 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Role</th>
                    <th className="px-6 py-4 text-[11px] font-bold text-slate-400 uppercase tracking-wider text-right pr-10">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {loading ? (
                    <tr>
                      <td colSpan={4} className="py-24">
                        <LoadingSpinner label="Retrieving employee list" />
                      </td>
                    </tr>
                  ) : filteredEmployees.length ? (
                    filteredEmployees.map((employee) => (
                      <tr key={employee.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-6 py-4 text-sm font-semibold text-slate-900">{employee.name}</td>
                        <td className="px-6 py-4 text-sm text-slate-600 font-mono">{formatEmployeeId(employee.employee_id, employee.id)}</td>
                        <td className="px-6 py-4 text-sm text-slate-600">{employee.role || "—"}</td>
                        <td className="px-6 py-4 text-right pr-10">
                          <div className="inline-flex items-center gap-2">
                            <Link
                              href={`/accounts/jobs/new?employeeId=${employee.id}`}
                              className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700"
                            >
                              Add Job
                            </Link>
                            <Link
                              href={`/accounts/jobs/employee/${employee.id}`}
                              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                            >
                              View Jobs
                            </Link>
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={4} className="px-6 py-10 text-sm text-slate-500">
                        No employees found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

          </div>
        )}
      </div>
    </div>
  );
}
