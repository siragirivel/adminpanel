"use client";

import React, { useEffect, useMemo } from "react";
import { Camera, Check, CheckCircle2, Info, Loader2, Plus } from "lucide-react";
import styles from "./VehicleRegistrationForm.module.css";

export type EmployeeImageKey = "aadhaar" | "photo";

export interface EmployeeRegistrationFormData {
  name: string;
  role: string;
  payment_type: "salary" | "against_vehicle";
  vehicle_id: string;
  daily_salary: string;
  phone: string;
  blood_group: string;
  aadhaar_number: string;
  aadhaar_image_url: string;
  photo_url: string;
  address: string;
  nationality: string;
  state: string;
  district: string;
  religion: string;
  notes: string;
  bank_name: string;
  bank_account_number: string;
  bank_ifsc: string;
  bank_branch: string;
}

type VehicleOption = {
  id: string;
  car_id: string;
  vehicle_reg?: string | null;
  owner_name?: string | null;
};

interface EmployeeRegistrationFormProps {
  editing: boolean;
  formData: EmployeeRegistrationFormData;
  vehicles: VehicleOption[];
  images: Record<EmployeeImageKey, File | null>;
  imageUrls: Record<EmployeeImageKey, string | null>;
  submitting: boolean;
  onFieldChange: (field: keyof EmployeeRegistrationFormData, value: string) => void;
  onImageChange: (key: EmployeeImageKey, file: File | null) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
}

function vehicleLabel(vehicle?: VehicleOption | null) {
  if (!vehicle) return "—";
  return [vehicle.car_id, vehicle.vehicle_reg, vehicle.owner_name].filter(Boolean).join(" · ");
}

function EmployeeImageUploadZone({
  label,
  sub,
  zone,
  file,
  imageUrl,
  onImageChange,
}: {
  label: string;
  sub: string;
  zone: EmployeeImageKey;
  file: File | null;
  imageUrl: string | null;
  onImageChange: (key: EmployeeImageKey, file: File | null) => void;
}) {
  const previewUrl = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);

  useEffect(() => {
    return () => {
      if (previewUrl && file) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [file, previewUrl]);

  const displayUrl = previewUrl || imageUrl;

  return (
    <label className={`${styles.uploadZone} ${displayUrl ? styles.hasImage : ""}`}>
      <input
        type="file"
        accept="image/*"
        className={styles.fileInput}
        onChange={(event) => onImageChange(zone, event.target.files?.[0] || null)}
      />

      {displayUrl ? (
        <>
          <img src={displayUrl} alt={`${label} preview`} className={styles.uploadPreview} />
          <div className={styles.uploadOverlay}>Change photo</div>
        </>
      ) : (
        <>
          <div className={styles.uploadIcon}>
            <Camera size={18} />
          </div>
          <div className={styles.uploadLabel}>{label}</div>
          <div className={styles.uploadSub}>{sub}</div>
        </>
      )}
    </label>
  );
}

export function EmployeeRegistrationForm({
  editing,
  formData,
  vehicles,
  images,
  imageUrls,
  submitting,
  onFieldChange,
  onImageChange,
  onSubmit,
  onCancel,
}: EmployeeRegistrationFormProps) {
  const todayText = new Date().toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  const aadhaarStatus = imageUrls.aadhaar || images.aadhaar || formData.aadhaar_image_url ? "Uploaded" : "";
  const photoStatus = imageUrls.photo || images.photo || formData.photo_url ? "Uploaded" : "";

  return (
    <div className={styles.page}>
      <div className={styles.layout}>
        <div className={styles.left}>
          <div className={styles.pageHead}>
            <div className={styles.headTag}>
              <span className={styles.headTagDot} />
              {editing ? "Update Employee" : "New Employee"}
            </div>
            <h1 className={styles.pageTitle}>Create Employee</h1>
            <p className={styles.pageSub}>
              Add employee profile, identity details, documents, and payment basis
            </p>
          </div>

          <form onSubmit={onSubmit}>
            <div className={styles.section}>
              <div className={styles.sectionLabel}>
                <div className={styles.sectionNum}>1</div>
                <div>
                  <div className={styles.sectionTitle}>Employee Details</div>
                  <div className={styles.sectionSub}>Name, role and contact information</div>
                </div>
              </div>
              <div className={styles.sectionDivider} />

              <div className={`${styles.fieldGrid} ${styles.cols2}`}>
                <div className={styles.field}>
                  <label className={styles.label}>
                    Employee name <span className={styles.required}>*</span>
                  </label>
                  <input
                    className={styles.input}
                    value={formData.name}
                    onChange={(event) => onFieldChange("name", event.target.value)}
                    placeholder="e.g. Kumar"
                  />
                </div>

                <div className={styles.field}>
                  <label className={styles.label}>
                    Employee role <span className={styles.required}>*</span>
                  </label>
                  <input
                    className={styles.input}
                    value={formData.role}
                    onChange={(event) => onFieldChange("role", event.target.value)}
                    placeholder="e.g. Mechanic"
                  />
                </div>

                <div className={styles.field}>
                  <label className={styles.label}>Phone</label>
                  <input
                    className={styles.input}
                    value={formData.phone}
                    onChange={(event) => onFieldChange("phone", event.target.value)}
                    placeholder="9876543210"
                  />
                </div>

                <div className={`${styles.field} ${styles.fieldFull}`}>
                  <label className={styles.label}>Notes</label>
                  <input
                    className={styles.input}
                    value={formData.notes}
                    onChange={(event) => onFieldChange("notes", event.target.value)}
                    placeholder="e.g. Specialist in engine work"
                  />
                </div>
              </div>
            </div>

            <div className={styles.section}>
              <div className={styles.sectionLabel}>
                <div className={styles.sectionNum}>2</div>
                <div>
                  <div className={styles.sectionTitle}>Personal Details</div>
                  <div className={styles.sectionSub}>Identity, address, and background</div>
                </div>
              </div>
              <div className={styles.sectionDivider} />

              <div className={`${styles.fieldGrid} ${styles.cols2}`}>
                <div className={styles.field}>
                  <label className={styles.label}>
                    Blood group
                  </label>
                  <input
                    className={`${styles.input} ${styles.mono}`}
                    value={formData.blood_group}
                    onChange={(event) => onFieldChange("blood_group", event.target.value.toUpperCase())}
                    placeholder="e.g. O+"
                  />
                </div>

                <div className={styles.field}>
                  <label className={styles.label}>Aadhaar number</label>
                  <input
                    className={`${styles.input} ${styles.mono}`}
                    inputMode="numeric"
                    maxLength={12}
                    value={formData.aadhaar_number}
                    onChange={(event) =>
                      onFieldChange(
                        "aadhaar_number",
                        event.target.value.replace(/\D/g, "").slice(0, 12),
                      )
                    }
                    placeholder="123456789012"
                  />
                </div>

                <div className={styles.field}>
                  <label className={styles.label}>Nationality</label>
                  <input
                    className={styles.input}
                    value={formData.nationality}
                    onChange={(event) => onFieldChange("nationality", event.target.value)}
                    placeholder="e.g. Indian"
                  />
                </div>

                <div className={styles.field}>
                  <label className={styles.label}>Religion</label>
                  <input
                    className={styles.input}
                    value={formData.religion}
                    onChange={(event) => onFieldChange("religion", event.target.value)}
                    placeholder="e.g. Hindu"
                  />
                </div>

                <div className={styles.field}>
                  <label className={styles.label}>State</label>
                  <input
                    className={styles.input}
                    value={formData.state}
                    onChange={(event) => onFieldChange("state", event.target.value)}
                    placeholder="e.g. Tamil Nadu"
                  />
                </div>

                <div className={styles.field}>
                  <label className={styles.label}>District</label>
                  <input
                    className={styles.input}
                    value={formData.district}
                    onChange={(event) => onFieldChange("district", event.target.value)}
                    placeholder="e.g. Madurai"
                  />
                </div>

                <div className={`${styles.field} ${styles.fieldFull}`}>
                  <label className={styles.label}>Address</label>
                  <textarea
                    className={styles.input}
                    rows={3}
                    value={formData.address}
                    onChange={(event) => onFieldChange("address", event.target.value)}
                    placeholder="Street, area, city, pincode"
                  />
                </div>
              </div>
            </div>

            <div className={styles.section}>
              <div className={styles.sectionLabel}>
                <div className={styles.sectionNum}>3</div>
                <div>
                  <div className={styles.sectionTitle}>Documents & Photos</div>
                  <div className={styles.sectionSub}>Aadhaar proof and employee photo</div>
                </div>
              </div>
              <div className={styles.sectionDivider} />

              <div className={styles.uploadGrid}>
                <EmployeeImageUploadZone
                  label="Aadhaar card"
                  sub="JPG, PNG up to 5MB"
                  zone="aadhaar"
                  file={images.aadhaar}
                  imageUrl={imageUrls.aadhaar}
                  onImageChange={onImageChange}
                />
                <EmployeeImageUploadZone
                  label="Employee photo"
                  sub="JPG, PNG up to 5MB"
                  zone="photo"
                  file={images.photo}
                  imageUrl={imageUrls.photo}
                  onImageChange={onImageChange}
                />
              </div>
            </div>

            <div className={styles.section}>
              <div className={styles.sectionLabel}>
                <div className={styles.sectionNum}>4</div>
                <div>
                  <div className={styles.sectionTitle}>Payment Setup</div>
                  <div className={styles.sectionSub}>Salary basis or vehicle-based contract</div>
                </div>
              </div>
              <div className={styles.sectionDivider} />

              <div className={`${styles.fieldGrid} ${styles.cols2}`}>
                <div className={styles.field}>
                  <label className={styles.label}>
                    Payment type <span className={styles.required}>*</span>
                  </label>
                  <select
                    className={styles.select}
                    value={formData.payment_type}
                    onChange={(event) => onFieldChange("payment_type", event.target.value)}
                  >
                    <option value="salary">Salary</option>
                    <option value="against_vehicle">Against Vehicle</option>
                  </select>
                </div>
              </div>
            </div>

            <div className={styles.section}>
              <div className={styles.sectionLabel}>
                <div className={styles.sectionNum}>5</div>
                <div>
                  <div className={styles.sectionTitle}>Bank Details</div>
                  <div className={styles.sectionSub}>Optional payout information</div>
                </div>
              </div>
              <div className={styles.sectionDivider} />

              <div className={`${styles.fieldGrid} ${styles.cols2}`}>
                <div className={styles.field}>
                  <label className={styles.label}>Bank name</label>
                  <input
                    className={styles.input}
                    value={formData.bank_name}
                    onChange={(event) => onFieldChange("bank_name", event.target.value)}
                    placeholder="e.g. SBI"
                  />
                </div>
                <div className={styles.field}>
                  <label className={styles.label}>Account number</label>
                  <input
                    className={`${styles.input} ${styles.mono}`}
                    inputMode="numeric"
                    value={formData.bank_account_number}
                    onChange={(event) => onFieldChange("bank_account_number", event.target.value.replace(/\s+/g, ""))}
                    placeholder="Account number"
                  />
                </div>
                <div className={styles.field}>
                  <label className={styles.label}>IFSC</label>
                  <input
                    className={`${styles.input} ${styles.mono}`}
                    value={formData.bank_ifsc}
                    onChange={(event) => onFieldChange("bank_ifsc", event.target.value.toUpperCase())}
                    placeholder="IFSC code"
                  />
                </div>
                <div className={styles.field}>
                  <label className={styles.label}>Branch</label>
                  <input
                    className={styles.input}
                    value={formData.bank_branch}
                    onChange={(event) => onFieldChange("bank_branch", event.target.value)}
                    placeholder="Branch name"
                  />
                </div>
              </div>
            </div>

            <div className={styles.section}>
              <div className={styles.sectionLabel}>
                <div className={styles.sectionNum}>6</div>
                <div>
                  <div className={styles.sectionTitle}>Employee Summary</div>
                  <div className={styles.sectionSub}>Preview before saving</div>
                </div>
              </div>
              <div className={styles.sectionDivider} />

              <div className={styles.helperText}>
                <Info size={11} />
                Salary employees use attendance and salary payments. Against vehicle employees use vehicle-based contract payments.
              </div>
            </div>

            <div className={styles.actions}>
              <button type="submit" className={styles.registerButton} disabled={submitting}>
                {submitting ? (
                  <Loader2 size={15} className="animate-spin" />
                ) : editing ? (
                  <Check size={15} />
                ) : (
                  <Plus size={15} />
                )}
                {submitting ? "Saving Employee..." : editing ? "Update Employee" : "Create Employee"}
              </button>
              <button type="button" className={styles.cancelButton} onClick={onCancel}>
                Cancel
              </button>
              <div className={styles.actionNote}>
                <CheckCircle2 size={12} color="#1a8a4a" />
                Employee profile will be available in accounts and day book
              </div>
            </div>
          </form>
        </div>

        <div className={styles.right}>
          <div className={styles.previewCard}>
            <div className={styles.previewTop}>
              <div className={styles.previewTag}>Employee Preview</div>
              <div className={styles.previewCarId}>
                {formData.payment_type === "against_vehicle" ? "VEHICLE" : "SALARY"}
              </div>
              <div className={styles.previewDate}>{todayText} · Setup date</div>
            </div>

            <div className={styles.previewBody}>
              {[
                ["Name", formData.name],
                ["Role", formData.role],
                ["Phone", formData.phone],
                ["Blood Group", formData.blood_group],
                ["Aadhaar", formData.aadhaar_number],
                ["Aadhaar Image", aadhaarStatus],
                ["Employee Photo", photoStatus],
                ["Address", formData.address],
                ["Nationality", formData.nationality],
                ["State", formData.state],
                ["District", formData.district],
                ["Religion", formData.religion],
                ["Bank", formData.bank_name],
                ["Account", formData.bank_account_number],
                ["IFSC", formData.bank_ifsc],
                ["Branch", formData.bank_branch],
                ["Payment", formData.payment_type === "against_vehicle" ? "Against Vehicle" : "Salary"],
              ].map(([label, value]) => (
                <div key={label} className={styles.previewRow}>
                  <span className={styles.previewLabel}>{label}</span>
                  <span className={`${styles.previewValue} ${value ? "" : styles.previewEmpty}`}>
                    {value || "Not entered"}
                  </span>
                </div>
              ))}
            </div>

            <div className={styles.previewFooter}>
              <span className={styles.statusDot} />
              <span className={styles.statusText}>
                {submitting ? "Saving employee..." : "Ready to create"}
              </span>
            </div>
          </div>

          <div className={styles.tipsCard}>
            <div className={styles.tipsTitle}>
              <Info size={13} color="#e85d26" />
              Quick tips
            </div>
            <div className={styles.tipItem}>
              <div className={styles.tipIcon}>
                <Check size={13} />
              </div>
              <div className={styles.tipText}>
                Use <strong>Salary</strong> for per-day attendance-based staff payments.
              </div>
            </div>
            <div className={styles.tipItem}>
              <div className={styles.tipIcon}>
                <Plus size={13} />
              </div>
              <div className={styles.tipText}>
                Use <strong>Against Vehicle</strong> when the employee is tied to one specific vehicle or contract flow.
              </div>
            </div>
            <div className={styles.tipItem}>
              <div className={styles.tipIcon}>
                <Info size={13} />
              </div>
              <div className={styles.tipText}>
                Salary, advance, and contract payments later update the day book automatically.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
