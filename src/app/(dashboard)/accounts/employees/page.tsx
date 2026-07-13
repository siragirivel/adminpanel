"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, PencilLine, Plus, Search, UserRound } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { LoadingSpinner } from "@/components/LoadingSpinner";

type EmployeeRow = {
  id: string;
  employee_id?: string | null;
  name: string;
  role: string;
  payment_type: "salary" | "against_vehicle";
  daily_salary: number;
  phone?: string | null;
};

type WorkLogRow = {
  employee_id: string;
  amount_due: number;
};

type PaymentRow = {
  employee_id: string;
  amount: number;
};

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

export default function EmployeesListPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [employeesTableAvailable, setEmployeesTableAvailable] = useState(true);
  const [query, setQuery] = useState("");
  const [employees, setEmployees] = useState<EmployeeRow[]>([]);
  const [workLogs, setWorkLogs] = useState<WorkLogRow[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      const [employeesResponse, workLogsResponse, paymentsResponse] = await Promise.all([
        supabase.from("employees").select("id, employee_id, name, role, payment_type, daily_salary, phone").order("name", { ascending: true }),
        supabase.from("employee_work_logs").select("employee_id, amount_due"),
        supabase.from("employee_payments").select("employee_id, amount"),
      ]);

      setEmployeesTableAvailable(!employeesResponse.error);
      setEmployees(((employeesResponse.data || []) as EmployeeRow[]).map((row) => ({
        ...row,
        daily_salary: Number(row.daily_salary || 0),
      })));
      setWorkLogs(((workLogsResponse.data || []) as WorkLogRow[]).map((row) => ({
        ...row,
        amount_due: Number(row.amount_due || 0),
      })));
      setPayments(((paymentsResponse.data || []) as PaymentRow[]).map((row) => ({
        ...row,
        amount: Number(row.amount || 0),
      })));
      setLoading(false);
    };

    void loadData();
  }, []);

  const filteredEmployees = useMemo(() => {
    const q = query.trim().toLowerCase();
    return employees.filter((employee) =>
      !q
        ? true
        : employee.name.toLowerCase().includes(q) ||
          employee.role.toLowerCase().includes(q) ||
          String(employee.phone || "").toLowerCase().includes(q) ||
          String(employee.employee_id || "").toLowerCase().includes(q),
    );
  }, [employees, query]);

  return (
    <div className="min-h-screen bg-[#f4f6fb] p-5 font-sans text-slate-900">
      <div className="min-h-[calc(100vh-40px)] rounded-[28px] border border-slate-200 bg-white shadow-[0_24px_60px_rgba(15,23,42,0.07)] overflow-hidden">
        <div className="px-8 py-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Employees</h1>
            <p className="mt-1 text-sm text-slate-500">Manage employee salary, attendance, vehicle contracts, advances, and pending amount.</p>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/accounts" className="px-4 py-2.5 border border-slate-200 bg-white rounded-lg text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-all">
              Back to Accounts
            </Link>
            <button
              onClick={() => router.push("/accounts/employees/new")}
              className="px-5 py-2.5 bg-[#4f46e5] text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 transition-all flex items-center gap-2 shadow-sm"
            >
              <Plus className="w-4 h-4" />
              Add Employee
            </button>
          </div>
        </div>

        {!employeesTableAvailable ? (
          <div className="mx-8 mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
            Employee tables are not available yet. Run [scripts/create-employees.sql](/Users/srinithinsomasundaram/Downloads/siragirivel/scripts/create-employees.sql) in Supabase.
          </div>
        ) : null}

        <div className="px-8 border-b border-slate-100 py-6 flex items-center justify-between bg-zinc-50/20">
          <div>
            <h2 className="text-sm font-black text-slate-800 uppercase tracking-widest italic">Employee Records</h2>
            <p className="text-[10px] text-slate-400 font-bold mt-0.5">Daily pay, attendance, advances, contract jobs, and pending balances</p>
          </div>
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

        <div className="px-8 pt-6">
          <div className="border border-slate-100 rounded-[24px] overflow-hidden shadow-sm bg-white">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  <th className="px-6 py-4 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Employee</th>
                  <th className="px-6 py-4 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Role</th>
                  <th className="px-6 py-4 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Payment Type</th>
                  <th className="px-6 py-4 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Pending</th>
                  <th className="px-6 py-4 text-right pr-10 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {loading ? (
                  <tr>
                    <td colSpan={5} className="py-24">
                      <LoadingSpinner label="Retrieving employee archive" />
                    </td>
                  </tr>
                ) : filteredEmployees.map((employee) => {
                  const due = workLogs.filter((item) => item.employee_id === employee.id).reduce((sum, row) => sum + Number(row.amount_due || 0), 0);
                  const paid = payments.filter((item) => item.employee_id === employee.id).reduce((sum, row) => sum + Number(row.amount || 0), 0);
                  return (
                    <tr
                      key={employee.id}
                      onClick={() => router.push(`/accounts/employees/${employee.id}`)}
                      className="group hover:bg-slate-50/50 transition-colors cursor-pointer"
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-11 h-9 rounded-lg bg-slate-50 border border-slate-100 overflow-hidden flex items-center justify-center shrink-0">
                            <UserRound className="w-4 h-4 text-slate-300" />
                          </div>
                          <div>
                            <p className="font-bold text-sm text-slate-900 leading-tight">{employee.name}</p>
                            <p className="text-[11px] text-indigo-600 font-semibold mt-1">{formatEmployeeId(employee.employee_id, employee.id)}</p>
                            <p className="text-[11px] text-slate-400 mt-1">{employee.phone || "No phone saved"}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4"><p className="text-[11px] font-bold text-slate-600">{employee.role}</p></td>
                      <td className="px-6 py-4"><p className="text-[11px] font-bold text-slate-600">{employee.payment_type === "against_vehicle" ? "Against Vehicle" : "Daily Salary"}</p></td>
                      <td className="px-6 py-4">
                        <p className="text-sm font-black text-amber-700 tracking-tight">{formatAmount(due - paid)}</p>
                        <p className="mt-1 text-[11px] font-medium text-emerald-600">Paid {formatAmount(paid)}</p>
                      </td>
                      <td className="px-6 py-4 text-right pr-10">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            router.push(`/accounts/employees/${employee.id}/edit`);
                          }}
                          className="mr-2 p-1.5 hover:bg-indigo-50 rounded-lg text-slate-300 hover:text-indigo-600 transition-all  "
                          title="Edit employee"
                        >
                          <PencilLine className="w-4 h-4" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            router.push(`/accounts/employees/${employee.id}`);
                          }}
                          className="p-1.5 hover:bg-indigo-50 rounded-lg text-slate-300 hover:text-indigo-600 transition-all  "
                          title="View employee"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
