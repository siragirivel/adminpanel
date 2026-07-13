"use client";

import React from "react";
import { Building2, Check, CheckCircle2, Info, Loader2, MapPin, Plus, Receipt } from "lucide-react";
import styles from "./VehicleRegistrationForm.module.css";

export interface VendorRegistrationFormData {
  vendor_id: string;
  name: string;
  phone: string;
  email: string;
  gstin: string;
  address: string;
  notes: string;
}

interface VendorRegistrationFormProps {
  editing: boolean;
  formData: VendorRegistrationFormData;
  submitting: boolean;
  onFieldChange: (field: keyof VendorRegistrationFormData, value: string) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
}

export function VendorRegistrationForm({
  editing,
  formData,
  submitting,
  onFieldChange,
  onSubmit,
  onCancel,
}: VendorRegistrationFormProps) {
  const todayText = new Date().toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  return (
    <div className={styles.page}>
      <div className={styles.layout}>
        <div className={styles.left}>
          <div className={styles.pageHead}>
            <div className={styles.headTag}>
              <span className={styles.headTagDot} />
              {editing ? "Update Vendor" : "New Vendor"}
            </div>
            <h1 className={styles.pageTitle}>Create Vendor</h1>
            <p className={styles.pageSub}>
              Add supplier identity, tax details, contact information, and address
            </p>
          </div>

          <form onSubmit={onSubmit}>
            <div className={styles.section}>
              <div className={styles.sectionLabel}>
                <div className={styles.sectionNum}>1</div>
                <div>
                  <div className={styles.sectionTitle}>Vendor Details</div>
                  <div className={styles.sectionSub}>Supplier name and contact information</div>
                </div>
              </div>
            <div className={styles.sectionDivider} />

            <div className={`${styles.fieldGrid} ${styles.cols2}`}>
              <div className={`${styles.field} ${styles.fieldFull}`}>
                <label className={styles.label}>Vendor ID</label>
                <div className={styles.carIdWrap}>
                  <span className={styles.carIdPrefix}>ID</span>
                  <span className={styles.carIdVal}>{formData.vendor_id || "------"}</span>
                  <span className={styles.carIdBadge}>AUTO ASSIGNED</span>
                </div>
                <div className={styles.helperText}>
                  <Info size={11} />
                  Auto-generated unique code for this vendor profile.
                </div>
              </div>

              <div className={styles.field}>
                <label className={styles.label}>
                  Vendor name <span className={styles.required}>*</span>
                </label>
                  <input
                    className={styles.input}
                    value={formData.name}
                    onChange={(event) => onFieldChange("name", event.target.value)}
                    placeholder="e.g. Sri Vinayaga Spares"
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

                <div className={styles.field}>
                  <label className={styles.label}>Email</label>
                  <input
                    className={styles.input}
                    value={formData.email}
                    onChange={(event) => onFieldChange("email", event.target.value)}
                    placeholder="vendor@example.com"
                  />
                </div>

                <div className={styles.field}>
                  <label className={styles.label}>GSTIN</label>
                  <input
                    className={`${styles.input} ${styles.mono}`}
                    value={formData.gstin}
                    onChange={(event) => onFieldChange("gstin", event.target.value.toUpperCase())}
                    placeholder="33ABCDE1234F1Z5"
                  />
                </div>
              </div>
            </div>

            <div className={styles.section}>
              <div className={styles.sectionLabel}>
                <div className={styles.sectionNum}>2</div>
                <div>
                  <div className={styles.sectionTitle}>Business Address</div>
                  <div className={styles.sectionSub}>Store location and internal notes</div>
                </div>
              </div>
              <div className={styles.sectionDivider} />

              <div className={`${styles.fieldGrid} ${styles.cols2}`}>
                <div className={`${styles.field} ${styles.fieldFull}`}>
                  <label className={styles.label}>Address</label>
                  <textarea
                    className={styles.textarea}
                    value={formData.address}
                    onChange={(event) => onFieldChange("address", event.target.value)}
                    placeholder="Street, area, city, pincode"
                  />
                </div>

                <div className={`${styles.field} ${styles.fieldFull}`}>
                  <label className={styles.label}>Notes</label>
                  <textarea
                    className={styles.textarea}
                    value={formData.notes}
                    onChange={(event) => onFieldChange("notes", event.target.value)}
                    placeholder="Preferred brands, account terms, or supplier remarks"
                  />
                </div>
              </div>
            </div>

            <div className={styles.section}>
              <div className={styles.sectionLabel}>
                <div className={styles.sectionNum}>3</div>
                <div>
                  <div className={styles.sectionTitle}>Vendor Summary</div>
                  <div className={styles.sectionSub}>Preview before saving</div>
                </div>
              </div>
              <div className={styles.sectionDivider} />

              <div className={styles.helperText}>
                <Info size={11} />
                Saved vendors can be reused in inventory purchase flows and vendor payment tracking.
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
                {submitting ? "Saving Vendor..." : editing ? "Update Vendor" : "Create Vendor"}
              </button>
              <button type="button" className={styles.cancelButton} onClick={onCancel}>
                Cancel
              </button>
              <div className={styles.actionNote}>
                <CheckCircle2 size={12} color="#1a8a4a" />
                Vendor profile will be available in accounts and inventory purchase flows
              </div>
            </div>
          </form>
        </div>

        <div className={styles.right}>
            <div className={styles.previewCard}>
              <div className={styles.previewTop}>
                <div className={styles.previewTag}>Vendor Preview</div>
                <div className={styles.previewCarId}>{formData.vendor_id || "SUPPLIER"}</div>
                <div className={styles.previewDate}>{todayText} · Setup date</div>
              </div>

              <div className={styles.previewBody}>
                {[
                  ["Vendor ID", formData.vendor_id],
                  ["Vendor", formData.name],
                  ["Phone", formData.phone],
                  ["Email", formData.email],
                  ["GSTIN", formData.gstin],
                ["Address", formData.address],
                ["Notes", formData.notes],
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
                {submitting ? "Saving vendor..." : "Ready to create"}
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
                <Building2 size={13} />
              </div>
              <div className={styles.tipText}>
                Use the exact supplier name used in inventory purchases to keep vendor dues grouped correctly.
              </div>
            </div>
            <div className={styles.tipItem}>
              <div className={styles.tipIcon}>
                <Receipt size={13} />
              </div>
              <div className={styles.tipText}>
                Add GSTIN now if purchase bills and tax records need to stay aligned later.
              </div>
            </div>
            <div className={styles.tipItem}>
              <div className={styles.tipIcon}>
                <MapPin size={13} />
              </div>
              <div className={styles.tipText}>
                Address and notes help identify branches, delivery points, and payment terms quickly.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
