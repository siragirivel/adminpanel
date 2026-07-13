"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import {
  EmployeeRegistrationForm,
  type EmployeeRegistrationFormData,
  type EmployeeImageKey,
} from "@/components/EmployeeRegistrationForm";
import { LoadingSpinner } from "@/components/LoadingSpinner";
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

export default function EmployeeEditPage() {
  const params = useParams();
  const router = useRouter();
  const slug = decodeURIComponent(String(params?.slug || ""));

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [employee, setEmployee] = useState<EmployeeRow | null>(null);
  const [vehicles, setVehicles] = useState<VehicleOption[]>([]);
  const [form, setForm] = useState<EmployeeRegistrationFormData>(EMPTY_EMPLOYEE_FORM);
  const [images, setImages] = useState<EmployeeImageState>({ aadhaar: null, photo: null });
  const [imageUrls, setImageUrls] = useState<EmployeeImageUrlState>({ aadhaar: null, photo: null });

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const [employeeResponse, vehiclesResponse] = await Promise.all([
        supabase.from("employees").select("*").eq("id", slug).maybeSingle(),
        supabase.from("vehicles").select("id, car_id, vehicle_reg, owner_name").order("created_at", { ascending: false }),
      ]);
      if (employeeResponse.data) {
        const row = employeeResponse.data as EmployeeRow;
        setEmployee(row);
        setForm({
          name: row.name || "",
          role: row.role || "",
          payment_type: row.payment_type || "salary",
          vehicle_id: row.vehicle_id || "",
          daily_salary: String(row.daily_salary || 0),
          phone: row.phone || "",
          blood_group: row.blood_group || "",
          aadhaar_number: row.aadhaar_number || "",
          aadhaar_image_url: row.aadhaar_image_url || "",
          photo_url: row.photo_url || "",
          address: row.address || "",
          nationality: row.nationality || "",
          state: row.state || "",
          district: row.district || "",
          religion: row.religion || "",
          notes: row.notes || "",
          bank_name: row.bank_name || "",
          bank_account_number: row.bank_account_number || "",
          bank_ifsc: row.bank_ifsc || "",
          bank_branch: row.bank_branch || "",
        });
        setImageUrls({
          aadhaar: row.aadhaar_image_url || null,
          photo: row.photo_url || null,
        });
      } else {
        setEmployee(null);
      }
      setVehicles((vehiclesResponse.data || []) as VehicleOption[]);
      setLoading(false);
    };

    if (slug) {
      void load();
    }
  }, [slug]);

  const handleSave = async () => {
    if (!employee) return;
    if (!form.name.trim() || !form.role.trim()) {
      alert("Employee name and role are required.");
      return;
    }

    setSaving(true);
    const { data: auth } = await supabase.auth.getUser();
    let aadhaarUrl = form.aadhaar_image_url?.trim() || "";
    let photoUrl = form.photo_url?.trim() || "";

    try {
      if (images.aadhaar) {
        aadhaarUrl = await uploadToCloudinary(images.aadhaar, {
          kind: "employee",
          folder: "siragirvel/employees/aadhaar",
        });
      }
      if (images.photo) {
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

    const payload = {
      name: form.name.trim(),
      role: form.role.trim(),
      payment_type: form.payment_type,
      vehicle_id: form.payment_type === "against_vehicle" ? form.vehicle_id || null : null,
      daily_salary: Math.max(0, Number(form.daily_salary || 0)),
      phone: form.phone.trim() || null,
      blood_group: form.blood_group.trim() || null,
      aadhaar_number: form.aadhaar_number.trim() || null,
      aadhaar_image_url: aadhaarUrl || null,
      photo_url: photoUrl || null,
      address: form.address.trim() || null,
      nationality: form.nationality.trim() || null,
      state: form.state.trim() || null,
      district: form.district.trim() || null,
      religion: form.religion.trim() || null,
      notes: form.notes.trim() || null,
      bank_name: form.bank_name.trim() || null,
      bank_account_number: form.bank_account_number.trim() || null,
      bank_ifsc: form.bank_ifsc.trim() || null,
      bank_branch: form.bank_branch.trim() || null,
      is_active: true,
      created_by: auth.user?.id || null,
    };

    const response = await supabase.from("employees").update(payload).eq("id", employee.id).select("id").single();
    setSaving(false);
    if (response.error) {
      alert(response.error.message);
      return;
    }

    await logActivity({
      action: "edit",
      entityType: "employee",
      entityId: response.data?.id || employee.id,
      entityLabel: payload.name,
      description: "Updated employee profile",
      metadata: payload,
    });

    router.push(`/accounts/employees/${employee.id}`);
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

  if (!employee) {
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
    <EmployeeRegistrationForm
      editing
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
        void handleSave();
      }}
      onCancel={() => router.push(`/accounts/employees/${employee.id}`)}
    />
  );
}
