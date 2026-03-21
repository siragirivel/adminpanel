"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  Camera,
  Check,
  CheckCircle2,
  Image as ImageIcon,
  Info,
  Loader2,
  Plus,
} from "lucide-react";
import styles from "./VehicleRegistrationForm.module.css";

export type VehicleImageKey = "front" | "back" | "chassis";

export interface VehicleRegistrationFormData {
  owner_name: string;
  phone_number: string;
  owner_address: string;
  vehicle_reg: string;
  entry_date: string;
  vehicle_type: string;
  vehicle_make: string;
  vehicle_model: string;
  vehicle_year: string;
  vehicle_color: string;
  chassis_number: string;
  entry_note: string;
  make_model: string;
  status: string;
  work_description: string;
}

interface VehicleRegistrationFormProps {
  editingId: string | null;
  nextCarId: string;
  formData: VehicleRegistrationFormData;
  images: Record<VehicleImageKey, File | null>;
  imageUrls: Record<VehicleImageKey, string | null>;
  submitting: boolean;
  uploadStatus: string;
  registrationError: string;
  makeSuggestions: string[];
  modelSuggestions: string[];
  onFieldChange: (field: keyof VehicleRegistrationFormData, value: string) => void;
  onImageChange: (key: VehicleImageKey, file: File | null) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
}

function ImageUploadZone({
  label,
  sub,
  zone,
  file,
  imageUrl,
  dragOver,
  onDragState,
  onImageChange,
}: {
  label: string;
  sub: string;
  zone: VehicleImageKey;
  file: File | null;
  imageUrl: string | null;
  dragOver: boolean;
  onDragState: (zone: VehicleImageKey | null) => void;
  onImageChange: (key: VehicleImageKey, file: File | null) => void;
}) {
  const previewUrl = useMemo(
    () => (file ? URL.createObjectURL(file) : null),
    [file],
  );

  useEffect(() => {
    return () => {
      if (previewUrl && file) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [file, previewUrl]);

  const displayUrl = previewUrl || imageUrl;

  return (
    <label
      className={`${styles.uploadZone} ${displayUrl ? styles.hasImage : ""} ${
        dragOver ? styles.dragOver : ""
      }`}
      onDragOver={(event) => {
        event.preventDefault();
        onDragState(zone);
      }}
      onDragLeave={() => onDragState(null)}
      onDrop={(event) => {
        event.preventDefault();
        onDragState(null);
        const droppedFile = event.dataTransfer.files?.[0] || null;
        if (droppedFile && droppedFile.type.startsWith("image/")) {
          onImageChange(zone, droppedFile);
        }
      }}
    >
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

export function VehicleRegistrationForm({
  editingId,
  nextCarId,
  formData,
  images,
  imageUrls,
  submitting,
  uploadStatus,
  registrationError,
  makeSuggestions,
  modelSuggestions,
  onFieldChange,
  onImageChange,
  onSubmit,
  onCancel,
}: VehicleRegistrationFormProps) {
  const [dragZone, setDragZone] = useState<VehicleImageKey | null>(null);
  const photoCount = (
    Object.entries(images) as Array<[VehicleImageKey, File | null]>
  ).filter(([key, file]) => Boolean(file || imageUrls[key])).length;
  const vehicleName = [formData.vehicle_make, formData.vehicle_model]
    .filter(Boolean)
    .join(" ");
  const todayText = new Date(formData.entry_date).toLocaleDateString(
    "en-IN",
    {
      day: "numeric",
      month: "short",
      year: "numeric",
    },
  );
  const prefix = nextCarId ? nextCarId.slice(0, -3) : "SGV-2026-";
  const suffix = nextCarId ? nextCarId.slice(-3) : "001";

  return (
    <div className={styles.page}>
      <div className={styles.layout}>
        <div className={styles.left}>
          <div className={styles.pageHead}>
            <div className={styles.headTag}>
              <span className={styles.headTagDot} />
              {editingId ? "Update Registration" : "New Registration"}
            </div>
            <h1 className={styles.pageTitle}>Register Vehicle</h1>
            <p className={styles.pageSub}>
              Fill in the owner and vehicle details — Car ID is auto-assigned on save
            </p>
          </div>

          <form onSubmit={onSubmit}>
            <div className={styles.section}>
              <div className={styles.sectionLabel}>
                <div className={styles.sectionNum}>1</div>
                <div>
                  <div className={styles.sectionTitle}>Owner Details</div>
                  <div className={styles.sectionSub}>
                    Customer name and contact info
                  </div>
                </div>
              </div>
              <div className={styles.sectionDivider} />

              <div className={`${styles.fieldGrid} ${styles.cols2}`}>
                <div className={styles.field}>
                  <label className={styles.label}>
                    Full name <span className={styles.required}>*</span>
                  </label>
                  <input
                    className={styles.input}
                    value={formData.owner_name}
                    onChange={(event) =>
                      onFieldChange("owner_name", event.target.value)
                    }
                    placeholder="e.g. Rajan Kumar"
                  />
                </div>

                <div className={styles.field}>
                  <label className={styles.label}>
                    Phone number <span className={styles.required}>*</span>
                  </label>
                  <input
                    className={styles.input}
                    value={formData.phone_number}
                    onChange={(event) =>
                      onFieldChange("phone_number", event.target.value)
                    }
                    placeholder="+91 98765 43210"
                  />
                </div>

                <div className={`${styles.field} ${styles.fieldFull}`}>
                  <label className={styles.label}>
                    Address <span className={styles.optional}>(optional)</span>
                  </label>
                  <input
                    className={styles.input}
                    value={formData.owner_address}
                    onChange={(event) =>
                      onFieldChange("owner_address", event.target.value)
                    }
                    placeholder="Street, City, Pincode"
                  />
                </div>
              </div>
            </div>

            <div className={styles.section}>
              <div className={styles.sectionLabel}>
                <div className={styles.sectionNum}>2</div>
                <div>
                  <div className={styles.sectionTitle}>Vehicle Details</div>
                  <div className={styles.sectionSub}>
                    Make, model and registration info
                  </div>
                </div>
              </div>
              <div className={styles.sectionDivider} />

              <div className={`${styles.fieldGrid} ${styles.cols2}`}>
                <div className={styles.field}>
                  <label className={styles.label}>
                    Vehicle registration no. <span className={styles.required}>*</span>
                  </label>
                  <input
                    className={`${styles.input} ${styles.mono} ${registrationError ? styles.inputError : ""}`}
                    value={formData.vehicle_reg}
                    onChange={(event) =>
                      onFieldChange(
                        "vehicle_reg",
                        event.target.value.replace(/\s+/g, "").toUpperCase(),
                      )
                    }
                    placeholder="TN58AB1234"
                  />
                  {registrationError ? (
                    <div className={styles.errorText}>{registrationError}</div>
                  ) : (
                    <div className={styles.fieldHint}>
                      Spaces are removed automatically from the vehicle number
                    </div>
                  )}
                </div>

                <div className={styles.field}>
                  <label className={styles.label}>
                    Make / Brand <span className={styles.required}>*</span>
                  </label>
                  <input
                    className={styles.input}
                    list="vehicle-make-suggestions"
                    value={formData.vehicle_make}
                    onChange={(event) =>
                      onFieldChange("vehicle_make", event.target.value)
                    }
                    placeholder="e.g. Maruti, Honda"
                  />
                  <datalist id="vehicle-make-suggestions">
                    {makeSuggestions.map((make) => (
                      <option key={make} value={make} />
                    ))}
                  </datalist>
                </div>

                <div className={styles.field}>
                  <label className={styles.label}>
                    Model <span className={styles.required}>*</span>
                  </label>
                  <input
                    className={styles.input}
                    list="vehicle-model-suggestions"
                    value={formData.vehicle_model}
                    onChange={(event) =>
                      onFieldChange("vehicle_model", event.target.value)
                    }
                    placeholder="e.g. Swift VXI, Activa 6G"
                  />
                  <datalist id="vehicle-model-suggestions">
                    {modelSuggestions.map((model) => (
                      <option key={model} value={model} />
                    ))}
                  </datalist>
                </div>

                <div className={styles.field}>
                  <label className={styles.label}>Year of manufacture</label>
                  <select
                    className={styles.select}
                    value={formData.vehicle_year}
                    onChange={(event) =>
                      onFieldChange("vehicle_year", event.target.value)
                    }
                  >
                    <option value="">Select year</option>
                    {Array.from({ length: 20 }, (_, index) => new Date().getFullYear() - index).map(
                      (year) => (
                        <option key={year}>{year}</option>
                      ),
                    )}
                  </select>
                </div>

                <div className={styles.field}>
                  <label className={styles.label}>Colour</label>
                  <input
                    className={styles.input}
                    value={formData.vehicle_color}
                    onChange={(event) =>
                      onFieldChange("vehicle_color", event.target.value)
                    }
                    placeholder="e.g. Pearl White"
                  />
                </div>

                <div className={`${styles.field} ${styles.fieldFull}`}>
                  <label className={styles.label}>
                    Chassis number <span className={styles.optional}>(optional)</span>
                  </label>
                  <input
                    className={`${styles.input} ${styles.mono}`}
                    value={formData.chassis_number}
                    onChange={(event) =>
                      onFieldChange(
                        "chassis_number",
                        event.target.value.toUpperCase(),
                      )
                    }
                    placeholder="MA3ERLF1S00123456"
                  />
                </div>
              </div>
            </div>

            <div className={styles.section}>
              <div className={styles.sectionLabel}>
                <div className={styles.sectionNum}>3</div>
                <div>
                  <div className={styles.sectionTitle}>Car ID</div>
                  <div className={styles.sectionSub}>
                    Auto-generated — used across all records
                  </div>
                </div>
              </div>
              <div className={styles.sectionDivider} />

              <div className={styles.carIdWrap}>
                <span className={styles.carIdPrefix}>{prefix}</span>
                <span className={styles.carIdVal}>{suffix}</span>
                <span className={styles.carIdBadge}>AUTO ASSIGNED</span>
              </div>
              <div className={styles.helperText}>
                <Info size={11} />
                This ID links all invoices, day book entries and service history
                for this vehicle
              </div>
            </div>

            <div className={styles.section}>
              <div className={styles.sectionLabel}>
                <div className={styles.sectionNum}>4</div>
                <div>
                  <div className={styles.sectionTitle}>Vehicle Photos</div>
                  <div className={styles.sectionSub}>
                    Front, rear and chassis number — optional but recommended
                  </div>
                </div>
              </div>
              <div className={styles.sectionDivider} />

              <div className={styles.uploadGrid}>
                <ImageUploadZone
                  label="Front view"
                  sub="JPG, PNG up to 5MB"
                  zone="front"
                  file={images.front}
                  imageUrl={imageUrls.front}
                  dragOver={dragZone === "front"}
                  onDragState={setDragZone}
                  onImageChange={onImageChange}
                />
                <ImageUploadZone
                  label="Rear view"
                  sub="JPG, PNG up to 5MB"
                  zone="back"
                  file={images.back}
                  imageUrl={imageUrls.back}
                  dragOver={dragZone === "back"}
                  onDragState={setDragZone}
                  onImageChange={onImageChange}
                />
                <ImageUploadZone
                  label="Chassis number"
                  sub="Photo of chassis plate"
                  zone="chassis"
                  file={images.chassis}
                  imageUrl={imageUrls.chassis}
                  dragOver={dragZone === "chassis"}
                  onDragState={setDragZone}
                  onImageChange={onImageChange}
                />
              </div>
            </div>

            <div className={styles.section}>
              <div className={styles.sectionLabel}>
                <div className={styles.sectionNum}>5</div>
                <div>
                  <div className={styles.sectionTitle}>Entry note</div>
                  <div className={styles.sectionSub}>
                    Reason for visit or initial observations
                  </div>
                </div>
              </div>
              <div className={styles.sectionDivider} />

              <div className={styles.field}>
                <label className={styles.label}>
                  Note <span className={styles.optional}>(optional)</span>
                </label>
                <input
                  className={styles.input}
                  value={formData.entry_note}
                  onChange={(event) =>
                    onFieldChange("entry_note", event.target.value)
                  }
                  placeholder="e.g. Brought in for oil service and brake check"
                />
              </div>
            </div>

            <div className={styles.actions}>
              <button
                type="submit"
                className={styles.registerButton}
                disabled={submitting}
              >
                {submitting ? (
                  <Loader2 size={15} className="animate-spin" />
                ) : editingId ? (
                  <Check size={15} />
                ) : (
                  <Plus size={15} />
                )}
                {submitting
                  ? uploadStatus || (editingId ? "Updating Vehicle..." : "Registering Vehicle...")
                  : editingId
                    ? "Update Vehicle"
                    : "Register Vehicle"}
              </button>
              <button type="button" className={styles.cancelButton} onClick={onCancel}>
                Cancel
              </button>
              <div className={styles.actionNote}>
                <CheckCircle2 size={12} color="#1a8a4a" />
                {submitting
                  ? uploadStatus || "Saving vehicle record..."
                  : "Car ID assigned automatically on save"}
              </div>
            </div>
          </form>
        </div>

        <div className={styles.right}>
          <div className={styles.previewCard}>
            <div className={styles.previewTop}>
              <div className={styles.previewTag}>Vehicle Record Preview</div>
              <div className={styles.previewCarId}>
                {prefix}
                <span className={styles.previewCarIdAccent}>{suffix}</span>
              </div>
              <div className={styles.previewDate}>{todayText} · Entry date</div>
            </div>

            <div className={styles.previewBody}>
              {[
                ["Owner", formData.owner_name],
                ["Phone", formData.phone_number],
                ["Reg. No.", formData.vehicle_reg],
                ["Vehicle", vehicleName],
                ["Year", formData.vehicle_year],
                ["Colour", formData.vehicle_color],
                ["Photos", photoCount ? `${photoCount} uploaded` : ""],
              ].map(([label, value]) => (
                <div key={label} className={styles.previewRow}>
                  <span className={styles.previewLabel}>{label}</span>
                  <span
                    className={`${styles.previewValue} ${
                      value ? "" : styles.previewEmpty
                    }`}
                  >
                    {value || "Not entered"}
                  </span>
                </div>
              ))}
            </div>

            <div className={styles.previewFooter}>
              <span className={styles.statusDot} />
              <span className={styles.statusText}>
                {submitting ? uploadStatus || "Saving vehicle..." : "Ready to register"}
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
                <strong>Car ID</strong> is auto-generated as SGV-YYYY-NNN and
                links all future invoices to this vehicle.
              </div>
            </div>

            <div className={styles.tipItem}>
              <div className={styles.tipIcon}>
                <ImageIcon size={13} />
              </div>
              <div className={styles.tipText}>
                Enter the <strong>registration number</strong> exactly as on the
                RC book — it appears on all invoices.
              </div>
            </div>

            <div className={styles.tipItem}>
              <div className={styles.tipIcon}>
                <Camera size={13} />
              </div>
              <div className={styles.tipText}>
                Upload <strong>front + rear photos</strong> to keep a visual
                record for dispute resolution and comparison.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
