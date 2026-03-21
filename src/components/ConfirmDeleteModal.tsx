"use client";

import React from "react";
import { Trash2, X } from "lucide-react";

interface ConfirmDeleteModalProps {
  title?: string;
  description: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDeleteModal({
  title = "Confirm Deletion",
  description,
  confirmLabel = "Delete",
  onConfirm,
  onCancel,
}: ConfirmDeleteModalProps) {
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 animate-in fade-in duration-200">
      <div className="absolute inset-0 bg-slate-950/45 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative z-10 w-full max-w-[420px] rounded-[28px] border border-slate-200 bg-white p-8 shadow-[0_24px_60px_rgba(15,23,42,0.28)] animate-in zoom-in-95 duration-200">
        <button
          type="button"
          onClick={onCancel}
          className="absolute right-4 top-4 inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
          aria-label="Close confirmation dialog"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-rose-50 text-rose-600">
          <Trash2 className="h-7 w-7" />
        </div>

        <h3 className="text-center text-xl font-bold tracking-tight text-slate-900">{title}</h3>
        <p className="mt-2 text-center text-sm leading-6 text-slate-500">{description}</p>

        <div className="mt-8 flex flex-col gap-2">
          <button
            type="button"
            onClick={onConfirm}
            className="inline-flex h-12 items-center justify-center rounded-2xl bg-rose-600 px-4 text-sm font-semibold text-white transition hover:bg-rose-700"
          >
            {confirmLabel}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex h-11 items-center justify-center rounded-2xl border border-slate-200 px-4 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
