"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { UserRound } from "lucide-react";
import { supabase } from "@/lib/supabase";
import {
  EmployeeRegistrationForm,
  type EmployeeRegistrationFormData,
} from "@/components/EmployeeRegistrationForm";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { DetailPageScaffold, PreviewPanel, RecordBadge } from "@/components/DetailPageScaffold";
import { logActivity } from "@/lib/activity-log";
import { uploadToCloudinary } from "@/lib/cloudinary";

type EmployeeRow = {
  id: string;
  employee_id?: string | null;
  name: string;
  role: string;
  payment_type: "salary" | "against_vehicle";
  vehicle_id?: string | null;
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

type VehicleOption = {
  id: string;
  car_id: string;
  vehicle_reg?: string | null;
  owner_name?: string | null;
};

type EmployeeImageKey = "aadhaar" | "photo";

const EMPTY_EMPLOYEE_FORM: EmployeeRegistrationFormData = {
  name: "",
  role: "",
  payment_type: "salary",
  vehicle_id: "",
  daily_salary: "",
  phone: "",
  blood_group: "",
  aadhaar_number: "",
  aadhaar_image_url: "",
  photo_url: "",
  address: "",
  nationality: "",
  state: "",
  district: "",
  religion: "",
  notes: "",
  bank_name: "",
  bank_account_number: "",
  bank_ifsc: "",
  bank_branch: "",
};

type EmployeeImageState = Record<EmployeeImageKey, File | null>;
type EmployeeImageUrlState = Record<EmployeeImageKey, string | null>;

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

async function getNextEmployeeId() {
  const { data, error } = await supabase
    .from("employees")
    .select("employee_id")
    .ilike("employee_id", "EMP-%")
    .order("employee_id", { ascending: false })
    .limit(1);

  if (error) {
    throw error;
  }

  const latest = data?.[0]?.employee_id || "";
  const match = String(latest).match(/EMP-(\d+)/i);
  const base = Number(match?.[1] || 0);
  const next = Number.isFinite(base) && base > 0 ? base + 1 : 1;
  return `EMP-${String(next).padStart(5, "0")}`;
}

export default function EmployeeSlugPage() {
  const params = useParams();
  const router = useRouter();
  const slug = decodeURIComponent(String(params?.slug || ""));
  const routeIsNew = slug === "new";

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [employees, setEmployees] = useState<EmployeeRow[]>([]);
  const [vehicles, setVehicles] = useState<VehicleOption[]>([]);

  const loadData = async () => {
    setLoading(true);
    const [employeesResponse, vehiclesResponse] = await Promise.all([
      supabase.from("employees").select("*").order("name", { ascending: true }),
      supabase.from("vehicles").select("id, car_id, vehicle_reg, owner_name").order("created_at", { ascending: false }),
    ]);

    setEmployees(((employeesResponse.data || []) as EmployeeRow[]).map((row) => ({
      ...row,
      daily_salary: Number(row.daily_salary || 0),
    })));
    setVehicles((vehiclesResponse.data || []) as VehicleOption[]);
    setLoading(false);
  };

  useEffect(() => {
    const initialize = async () => {
      await loadData();
    };

    void initialize();
  }, []);

  const selectedEmployee = useMemo(
    () => (routeIsNew ? null : employees.find((employee) => employee.id === slug) || null),
    [employees, routeIsNew, slug],
  );

  const saveEmployee = async (employeeForm: EmployeeRegistrationFormData, images?: EmployeeImageState) => {
    if (!employeeForm.name.trim() || !employeeForm.role.trim()) {
      alert("Employee name and role are required.");
      return;
    }

    setSaving(true);
    const { data: auth } = await supabase.auth.getUser();
    let aadhaarUrl = employeeForm.aadhaar_image_url?.trim() || "";
    let photoUrl = employeeForm.photo_url?.trim() || "";

    try {
      if (images?.aadhaar) {
        aadhaarUrl = await uploadToCloudinary(images.aadhaar, {
          kind: "employee",
          folder: "siragirvel/employees/aadhaar",
        });
      }
      if (images?.photo) {
        photoUrl = await uploadToCloudinary(images.photo, {
          kind: "employee",
          folder: "siragirvel/employees/photos",
        });
      }
    } catch (error) {
      setSaving(false);
      alert(error instanceof Error ? error.message : "Failed to upload employee documents.");
      return;
    }

    const employeeName = employeeForm.name.trim();
    const payload: Record<string, unknown> = {
      name: employeeName,
      role: employeeForm.role.trim(),
      payment_type: employeeForm.payment_type,
      vehicle_id: employeeForm.payment_type === "against_vehicle" ? employeeForm.vehicle_id || null : null,
      daily_salary: Math.max(0, Number(employeeForm.daily_salary || 0)),
      phone: employeeForm.phone.trim() || null,
      blood_group: employeeForm.blood_group.trim() || null,
      aadhaar_number: employeeForm.aadhaar_number.trim() || null,
      aadhaar_image_url: aadhaarUrl || null,
      photo_url: photoUrl || null,
      address: employeeForm.address.trim() || null,
      nationality: employeeForm.nationality.trim() || null,
      state: employeeForm.state.trim() || null,
      district: employeeForm.district.trim() || null,
      religion: employeeForm.religion.trim() || null,
      notes: employeeForm.notes.trim() || null,
      bank_name: employeeForm.bank_name.trim() || null,
      bank_account_number: employeeForm.bank_account_number.trim() || null,
      bank_ifsc: employeeForm.bank_ifsc.trim() || null,
      bank_branch: employeeForm.bank_branch.trim() || null,
      is_active: true,
      created_by: auth.user?.id || null,
    };

    if (!selectedEmployee) {
      payload.employee_id = await getNextEmployeeId();
    }

    const response = selectedEmployee
      ? await supabase.from("employees").update(payload).eq("id", selectedEmployee.id).select("id").single()
      : await supabase.from("employees").insert([payload]).select("id").single();

    setSaving(false);
    if (response.error) {
      alert(response.error.message);
      return;
    }

    await logActivity({
      action: selectedEmployee ? "edit" : "create",
      entityType: "employee",
      entityId: response.data?.id || selectedEmployee?.id || employeeForm.name,
      entityLabel: employeeName,
      description: selectedEmployee ? "Updated employee profile" : "Created employee profile",
      metadata: payload,
    });

    await loadData();
    if (response.data?.id) {
      router.push(`/accounts/employees/${response.data.id}`);
    }
  };


  if (loading) {
    return (
      <div className="min-h-screen bg-[#f4f6fb] p-5">
        <div className="min-h-[calc(100vh-40px)] rounded-[28px] border border-slate-200 bg-white shadow-[0_24px_60px_rgba(15,23,42,0.07)]">
          <LoadingSpinner label="Loading employee profile" />
        </div>
      </div>
    );
  }

  if (routeIsNew) {
    return (
      <EmployeeCreationGate
        saving={saving}
        vehicles={vehicles}
        onSave={saveEmployee}
        onCancel={() => router.push("/accounts/employees")}
      />
    );
  }

  if (!selectedEmployee) {
    return (
      <div className="min-h-screen bg-[#f4f6fb] p-5">
        <div className="min-h-[calc(100vh-40px)] rounded-[28px] border border-slate-200 bg-white p-10 shadow-[0_24px_60px_rgba(15,23,42,0.07)]">
          <button onClick={() => router.push("/accounts/employees")} className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700">
            Back to Employees
          </button>
          <div className="mt-8 text-2xl font-black text-slate-900">Employee not found</div>
        </div>
      </div>
    );
  }

  return (
    <EmployeeProfileEditor
      key={selectedEmployee.id}
      employee={selectedEmployee}
      onBack={() => router.push("/accounts/employees")}
    />
  );
}

function EmployeeCreationGate({
  saving,
  vehicles,
  onSave,
  onCancel,
}: {
  saving: boolean;
  vehicles: VehicleOption[];
  onSave: (form: EmployeeRegistrationFormData, images?: EmployeeImageState) => Promise<void>;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<EmployeeRegistrationFormData>(EMPTY_EMPLOYEE_FORM);
  const [images, setImages] = useState<EmployeeImageState>({ aadhaar: null, photo: null });
  const [imageUrls, setImageUrls] = useState<EmployeeImageUrlState>({ aadhaar: null, photo: null });

  return (
    <EmployeeRegistrationForm
      editing={false}
      formData={form}
      vehicles={vehicles}
      images={images}
      imageUrls={imageUrls}
      submitting={saving}
      onFieldChange={(field, value) => setForm((current) => ({ ...current, [field]: value }))}
      onImageChange={(key, file) => {
        setImages((current) => ({ ...current, [key]: file }));
        if (file) {
          setImageUrls((current) => ({ ...current, [key]: null }));
        }
      }}
      onSubmit={(event) => {
        event.preventDefault();
        void onSave(form, images);
      }}
      onCancel={onCancel}
    />
  );
}

function EmployeeProfileEditor({
  employee,
  onBack,
}: {
  employee: EmployeeRow;
  onBack: () => void;
}) {
  const router = useRouter();
  const [form] = useState<EmployeeRegistrationFormData>({
    name: employee.name,
    role: employee.role,
    payment_type: employee.payment_type,
    vehicle_id: employee.vehicle_id || "",
    daily_salary: String(employee.daily_salary || 0),
    phone: employee.phone || "",
    blood_group: employee.blood_group || "",
    aadhaar_number: employee.aadhaar_number || "",
    aadhaar_image_url: employee.aadhaar_image_url || "",
    photo_url: employee.photo_url || "",
    address: employee.address || "",
    nationality: employee.nationality || "",
    state: employee.state || "",
    district: employee.district || "",
    religion: employee.religion || "",
    notes: employee.notes || "",
    bank_name: employee.bank_name || "",
    bank_account_number: employee.bank_account_number || "",
    bank_ifsc: employee.bank_ifsc || "",
    bank_branch: employee.bank_branch || "",
  });
  const employeeIdText = employee.employee_id || formatEmployeeId(employee.id);
  const downloadImage = async (url: string, filename: string) => {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
    } catch {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  };

  const handlePrint = () => {
    const url = `/accounts/employees/${employee.id}/print`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="min-h-screen bg-[#f4f6fb] p-5 font-sans text-slate-900">
      <div className="min-h-[calc(100vh-40px)] rounded-[28px] border border-slate-200 bg-white shadow-[0_24px_60px_rgba(15,23,42,0.07)] overflow-hidden">
        <DetailPageScaffold
          breadcrumbRootLabel="Employees"
          breadcrumbCurrentLabel={employeeIdText}
          onBack={onBack}
          recordBadge={<RecordBadge dotClassName="bg-emerald-400" value={employeeIdText} />}
          title={employee.name}
          subtitle={
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <span>{form.role || "No role set"}</span>
              <span className="text-slate-300">•</span>
              <span>{form.phone || "No phone saved"}</span>
              <span className="text-slate-300">•</span>
              <span>{form.payment_type === "salary" ? "Daily Salary" : "Against Vehicle"}</span>
            </div>
          }
          actions={
            <>
              <button
                type="button"
                onClick={() => router.push(`/accounts/employees/${employee.id}/edit`)}
                className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Edit Employee
              </button>
              <button
                type="button"
                onClick={handlePrint}
                className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Print
              </button>
              <button
                type="button"
                onClick={onBack}
                className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Back
              </button>
            </>
          }
          main={
            <>
              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
                  <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                    <UserRound className="h-4 w-4 text-indigo-600" />
                    Employee Information
                  </div>
                </div>
                <div className="grid md:grid-cols-2">
                  {[
                    ["Employee ID", employeeIdText, true],
                    ["Role", form.role || "—", false],
                    ["Phone", form.phone || "—", false],
                    ["Blood Group", form.blood_group || "—", false],
                    ["Aadhaar Number", form.aadhaar_number || "—", true],
                    ["Aadhaar Image", form.aadhaar_image_url ? "Uploaded" : "—", false],
                    ["Employee Photo", form.photo_url ? "Uploaded" : "—", false],
                    ["Payment Type", form.payment_type === "salary" ? "Daily Salary" : "Against Vehicle", false],
                    ["Nationality", form.nationality || "—", false],
                    ["Religion", form.religion || "—", false],
                    ["State", form.state || "—", false],
                    ["District", form.district || "—", false],
                    ["Address", form.address || "—", false],
                    ["Bank Name", form.bank_name || "—", false],
                    ["Account No", form.bank_account_number || "—", true],
                    ["IFSC", form.bank_ifsc || "—", true],
                    ["Branch", form.bank_branch || "—", false],
                  ].map(([label, value, mono], index) => (
                    <div
                      key={`${label}-${index}`}
                      className="border-b border-slate-200 px-5 py-4 md:[&:nth-child(odd)]:border-r last:border-b-0 md:[&:nth-last-child(-n+2)]:border-b-0"
                    >
                      <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400">{label}</div>
                      <div className={`mt-1 text-sm font-medium text-slate-900 ${mono ? "font-mono" : ""}`}>{value}</div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          }
          side={
            <>
              <PreviewPanel
                eyebrow="Employee Preview"
                title={form.name || "Unnamed Employee"}
                badge={form.payment_type === "salary" ? "Daily Pay" : "Vehicle"}
                icon={<UserRound className="h-5 w-5 text-white/90" />}
                rows={[
                  ["Phone", form.phone || "Not entered"],
                  ["Blood Group", form.blood_group || "Not entered"],
                  ["Aadhaar", form.aadhaar_number || "Not entered"],
                  ["Bank", form.bank_name || "Not entered"],
                  ["IFSC", form.bank_ifsc || "Not entered"],
                  ["Pay Basis", form.payment_type === "salary" ? "Daily Salary" : "Against Vehicle"],
                ]}
              />
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="text-sm font-black text-slate-900">Employee Images</div>
                <div className="mt-3 space-y-4">
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Employee Photo</div>
                    {form.photo_url ? (
                      <div className="mt-2 space-y-2">
                        <button
                          type="button"
                          onClick={() => window.open(form.photo_url, "_blank", "noopener,noreferrer")}
                          className="w-full"
                        >
                          <img
                            src={form.photo_url}
                            alt={`${form.name} photo`}
                            className="h-40 w-full rounded-xl border border-slate-200 object-cover"
                          />
                        </button>
                        <button
                          type="button"
                          onClick={() => downloadImage(form.photo_url, `employee-${employeeIdText}-photo.jpg`)}
                          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                        >
                          Download photo
                        </button>
                      </div>
                    ) : (
                      <div className="mt-2 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-6 text-center text-xs font-semibold text-slate-400">
                        No photo uploaded
                      </div>
                    )}
                  </div>
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Aadhaar Image</div>
                    {form.aadhaar_image_url ? (
                      <div className="mt-2 space-y-2">
                        <button
                          type="button"
                          onClick={() => window.open(form.aadhaar_image_url, "_blank", "noopener,noreferrer")}
                          className="w-full"
                        >
                          <img
                            src={form.aadhaar_image_url}
                            alt={`${form.name} Aadhaar`}
                            className="h-40 w-full rounded-xl border border-slate-200 object-cover"
                          />
                        </button>
                        <button
                          type="button"
                          onClick={() => downloadImage(form.aadhaar_image_url, `employee-${employeeIdText}-aadhaar.jpg`)}
                          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                        >
                          Download Aadhaar
                        </button>
                      </div>
                    ) : (
                      <div className="mt-2 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-6 text-center text-xs font-semibold text-slate-400">
                        No Aadhaar uploaded
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </>
          }
        />
      </div>
    </div>
  );
}
