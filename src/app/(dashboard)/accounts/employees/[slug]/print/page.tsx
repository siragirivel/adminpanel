"use client";

import React, { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";

type EmployeeRow = {
  id: string;
  employee_id?: string | null;
  name: string;
  role: string;
  payment_type: "salary" | "against_vehicle";
  daily_salary: number;
  phone?: string | null;
  blood_group?: string | null;
  aadhaar_number?: string | null;
  aadhaar_image_url?: string | null;
  photo_url?: string | null;
  address?: string | null;
  nationality?: string | null;
  state?: string | null;
  district?: string | null;
  religion?: string | null;
  notes?: string | null;
  bank_name?: string | null;
  bank_account_number?: string | null;
  bank_ifsc?: string | null;
  bank_branch?: string | null;
};

function formatEmployeeId(value: string) {
  const digits = String(value || "").replace(/\D/g, "");
  const base = digits ? Number(digits.slice(-5)) : 0;
  if (base > 0) {
    return `EMP-${String(base).padStart(5, "0")}`;
  }
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) % 100000;
  }
  return `EMP-${String(hash).padStart(5, "0")}`;
}

export default function EmployeePrintPage() {
  const params = useParams();
  const slug = decodeURIComponent(String(params?.slug || ""));
  const [employee, setEmployee] = useState<EmployeeRow | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const { data } = await supabase.from("employees").select("*").eq("id", slug).maybeSingle();
      setEmployee((data as EmployeeRow) || null);
      setLoading(false);
    };

    if (slug) {
      void load();
    }
  }, [slug]);

  useEffect(() => {
    if (!loading && employee) {
      const timer = setTimeout(() => window.print(), 400);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [employee, loading]);

  if (loading) {
    return (
      <div style={{ padding: 32, fontFamily: "Inter, Arial, sans-serif", color: "#0f172a" }}>
        Loading employee data...
      </div>
    );
  }

  if (!employee) {
    return (
      <div style={{ padding: 32, fontFamily: "Inter, Arial, sans-serif", color: "#0f172a" }}>
        Employee not found.
      </div>
    );
  }

  const employeeIdText = employee.employee_id || formatEmployeeId(employee.id);
  const rows: Array<[string, string]> = [
    ["Employee ID", employeeIdText],
    ["Name", employee.name || "—"],
    ["Role", employee.role || "—"],
    ["Phone", employee.phone || "—"],
    ["Blood Group", employee.blood_group || "—"],
    ["Aadhaar Number", employee.aadhaar_number || "—"],
    ["Nationality", employee.nationality || "—"],
    ["Religion", employee.religion || "—"],
    ["State", employee.state || "—"],
    ["District", employee.district || "—"],
    ["Address", employee.address || "—"],
    ["Notes", employee.notes || "—"],
    ["Bank Name", employee.bank_name || "—"],
    ["Account No", employee.bank_account_number || "—"],
    ["IFSC", employee.bank_ifsc || "—"],
    ["Branch", employee.bank_branch || "—"],
    ["Payment Type", employee.payment_type === "salary" ? "Daily Salary" : "Against Vehicle"],
  ];

  return (
    <div className="min-h-screen bg-white p-8 print:p-0">
      <div className="mx-auto max-w-[860px] rounded-[20px] border border-slate-200 bg-white p-8 print:border-none print:rounded-none print:p-4 print:mt-0">
        <div className="flex items-start justify-between gap-6">
          <div>
            <img src="/Siragiri.png" alt="Sirigirvel" className="h-8 mb-4 print:mb-3" />
            <div className="text-[22px] font-extrabold text-slate-900">Employee Profile</div>
            <div className="mt-1 text-xs font-semibold uppercase tracking-[0.08em] text-slate-400">
              Employee ID: {employeeIdText}
            </div>
            <button
              type="button"
              onClick={() => window.print()}
              className="mt-4 inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 print:hidden"
            >
              Print
            </button>
          </div>
          {employee.photo_url ? (
            <div className="text-right">
              <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400">
                Employee Photo
              </div>
              <img
                src={employee.photo_url}
                alt={`${employee.name} photo`}
                className="mt-2 h-28 w-28 rounded-xl border border-slate-200 object-cover"
              />
            </div>
          ) : null}
        </div>

        <table className="mt-6 w-full border-collapse">
          <tbody>
            {rows.map(([label, value]) => (
              <tr key={label} className="border-b border-slate-200">
                <th className="py-2 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">
                  {label}
                </th>
                <td className="py-2 text-sm font-medium text-slate-900">{value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {employee.aadhaar_image_url ? (
        <div
          style={{ pageBreakBefore: "always" }}
          className="mx-auto mt-10 max-w-[860px] rounded-[20px] border border-slate-200 bg-white p-8 print:mt-0 print:border-none print:rounded-none print:p-4"
        >
          <div className="text-[16px] font-bold text-slate-900">Aadhaar Photo</div>
          <div className="mt-1 text-xs font-semibold uppercase tracking-[0.08em] text-slate-400">
            Employee ID: {employeeIdText}
          </div>
          <img
            src={employee.aadhaar_image_url}
            alt={`${employee.name} Aadhaar`}
            className="mt-6 h-[520px] w-full rounded-2xl border border-slate-200 object-contain"
          />
        </div>
      ) : null}
    </div>
  );
}
