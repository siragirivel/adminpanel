"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { format } from "date-fns";
import { Download, Wrench } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { LoadingSpinner } from "@/components/LoadingSpinner";

type EmployeeRow = {
  id: string;
  employee_id?: string | null;
  name: string;
  role?: string | null;
  phone?: string | null;
};

type VehicleOption = {
  id: string;
  car_id: string;
  vehicle_reg?: string | null;
  owner_name?: string | null;
};

type JobRow = {
  id: string;
  employee_id: string;
  work_date: string;
  entry_type: "vehicle_contract";
  vehicle_id?: string | null;
  amount_due: number;
  note?: string | null;
  created_at: string;
  vehicles?: VehicleOption | null;
};

type JoinedVehicleField = VehicleOption | VehicleOption[] | null | undefined;
type RawJobRow = Omit<JobRow, "vehicles"> & {
  vehicles?: JoinedVehicleField;
};

function normalizeJoinedVehicle(value: JoinedVehicleField) {
  return Array.isArray(value) ? value[0] || null : value || null;
}

function vehicleLabel(vehicle?: VehicleOption | null) {
  if (!vehicle) return "—";
  return [vehicle.car_id, vehicle.vehicle_reg, vehicle.owner_name].filter(Boolean).join(" · ");
}

function formatAmount(value: number) {
  return `₹${Math.round(Number(value || 0)).toLocaleString("en-IN")}`;
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

function escapeCsv(value: string) {
  const normalized = String(value ?? "");
  if (/[",\n]/.test(normalized)) {
    return `"${normalized.replace(/"/g, '""')}"`;
  }
  return normalized;
}

export default function EmployeeJobsPage() {
  const params = useParams();
  const router = useRouter();
  const employeeId = String(params?.id || "");

  const [loading, setLoading] = useState(true);
  const [employee, setEmployee] = useState<EmployeeRow | null>(null);
  const [jobs, setJobs] = useState<JobRow[]>([]);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      const [employeeResponse, jobsResponse] = await Promise.all([
        supabase.from("employees").select("id, employee_id, name, role, phone").eq("id", employeeId).maybeSingle(),
        supabase
          .from("employee_work_logs")
          .select("id, employee_id, work_date, entry_type, vehicle_id, amount_due, note, created_at, vehicles(id, car_id, vehicle_reg, owner_name)")
          .eq("entry_type", "vehicle_contract")
          .eq("employee_id", employeeId)
          .order("work_date", { ascending: false })
          .order("created_at", { ascending: false }),
      ]);

      setEmployee((employeeResponse.data as EmployeeRow) || null);
      const rawJobs = (jobsResponse.data || []) as RawJobRow[];
      setJobs(
        rawJobs.map((row) => ({
          ...row,
          amount_due: Number(row.amount_due || 0),
          vehicles: normalizeJoinedVehicle(row.vehicles),
        })),
      );
      setLoading(false);
    };

    if (employeeId) {
      void loadData();
    }
  }, [employeeId]);

  const employeeIdText = useMemo(
    () => (employee ? formatEmployeeId(employee.employee_id, employee.id) : ""),
    [employee],
  );

  const handleExportCsv = () => {
    if (!employee) return;
    const rows = jobs.map((job) => [
      format(new Date(job.work_date), "dd MMM yyyy"),
      employee.name || "—",
      vehicleLabel(job.vehicles),
      String(Math.round(Number(job.amount_due || 0))),
      job.note || "",
    ]);
    const headers = ["Job Date", "Employee", "Vehicle", "Value", "Description"];
    const content = [headers, ...rows].map((row) => row.map(escapeCsv).join(",")).join("\n");
    const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `jobs-${employeeIdText || employee.id}-${format(new Date(), "yyyy-MM-dd")}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f4f6fb] p-5">
        <div className="min-h-[calc(100vh-40px)] rounded-[28px] border border-slate-200 bg-white shadow-[0_24px_60px_rgba(15,23,42,0.07)]">
          <LoadingSpinner label="Loading employee jobs" />
        </div>
      </div>
    );
  }

  if (!employee) {
    return (
      <div className="min-h-screen bg-[#f4f6fb] p-5">
        <div className="min-h-[calc(100vh-40px)] rounded-[28px] border border-slate-200 bg-white p-10 shadow-[0_24px_60px_rgba(15,23,42,0.07)]">
          <button onClick={() => router.push("/accounts/jobs")} className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700">
            Back to Jobs
          </button>
          <div className="mt-8 text-2xl font-black text-slate-900">Employee not found</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f4f6fb] p-5 font-sans text-slate-900">
      <div className="min-h-[calc(100vh-40px)] rounded-[28px] border border-slate-200 bg-white shadow-[0_24px_60px_rgba(15,23,42,0.07)] overflow-hidden">
        <div className="px-8 py-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Employee Jobs</h1>
            <p className="mt-1 text-sm text-slate-500">
              {employee.name} · {employeeIdText} · {employee.role || "Role not set"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/accounts/jobs" className="px-4 py-2.5 border border-slate-200 bg-white rounded-lg text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-all">
              Back to Jobs
            </Link>
            <Link
              href={`/accounts/jobs/new?employeeId=${employee.id}`}
              className="px-4 py-2.5 border border-indigo-200 bg-indigo-50 rounded-lg text-sm font-semibold text-indigo-700 hover:bg-indigo-100 transition-all flex items-center gap-2"
            >
              <Wrench className="h-4 w-4" />
              Add Job
            </Link>
            <button
              type="button"
              onClick={handleExportCsv}
              disabled={!jobs.length}
              className="px-4 py-2.5 border border-slate-200 bg-white rounded-lg text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-all flex items-center gap-2 disabled:opacity-50"
            >
              <Download className="h-4 w-4" />
              Download CSV
            </button>
          </div>
        </div>

        <div className="px-8 pb-8">
          <div className="border border-slate-100 rounded-[24px] overflow-hidden shadow-sm bg-white">
            {jobs.length ? (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    <th className="px-6 py-4 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Job Date</th>
                    <th className="px-6 py-4 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Vehicle</th>
                    <th className="px-6 py-4 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Value</th>
                    <th className="px-6 py-4 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Description</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {jobs.map((job) => (
                    <tr key={job.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-6 py-4 text-sm font-semibold text-slate-900">
                        {format(new Date(job.work_date), "dd MMM yyyy")}
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-700">{vehicleLabel(job.vehicles)}</td>
                      <td className="px-6 py-4 text-sm font-semibold text-amber-700">
                        {job.amount_due ? formatAmount(job.amount_due) : "—"}
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600">{job.note || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="px-6 py-12 text-sm text-slate-500">No jobs found for this employee.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
