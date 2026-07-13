"use client";

import React from "react";

export function DetailPageScaffold({
  breadcrumbRootLabel,
  breadcrumbCurrentLabel,
  onBack,
  recordBadge,
  title,
  subtitle,
  actions,
  metricStrip,
  main,
  side,
}: {
  breadcrumbRootLabel: string;
  breadcrumbCurrentLabel: string;
  onBack: () => void;
  recordBadge: React.ReactNode;
  title: string;
  subtitle: React.ReactNode;
  actions?: React.ReactNode;
  metricStrip?: React.ReactNode;
  main: React.ReactNode;
  side: React.ReactNode;
}) {
  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mb-4 sm:mb-6 flex items-center gap-2 text-[10px] sm:text-[12px] font-medium text-[color:var(--text-muted)]">
        <button type="button" onClick={onBack} className="transition hover:text-indigo-600">
          {breadcrumbRootLabel}
        </button>
        <span>/</span>
        <span className="font-semibold text-indigo-600">{breadcrumbCurrentLabel}</span>
      </div>

      <div className="rounded-[24px] sm:rounded-[28px] p-5 sm:p-6 app-card app-card-gloss">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <div className="mb-4">{recordBadge}</div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-[color:var(--text-primary)]">{title}</h1>
            <div className="mt-2 text-[12px] sm:text-[13px] text-[color:var(--text-secondary)]">{subtitle}</div>
          </div>
          {actions ? <div className="flex flex-wrap items-center gap-3">{actions}</div> : null}
        </div>

        {metricStrip ? <div className="mt-6">{metricStrip}</div> : null}
      </div>

      <div className="mt-5 sm:mt-6 grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4">{main}</div>
        <div className="space-y-4">{side}</div>
      </div>
    </div>
  );
}

export function RecordBadge({
  dotClassName,
  value,
}: {
  dotClassName: string;
  value: string;
}) {
  return (
    <div className="inline-flex items-center gap-2 rounded-xl bg-[var(--badge-bg)] px-4 py-2 text-[var(--badge-text)]">
      <span className={`h-2 w-2 rounded-full ${dotClassName}`} />
      <span className="font-mono text-[12px] sm:text-[13px] font-semibold tracking-[0.08em]">{value}</span>
    </div>
  );
}

export function DetailMetricRow({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">{children}</div>;
}

export function PreviewPanel({
  eyebrow,
  title,
  badge,
  rows,
  icon,
}: {
  eyebrow: string;
  title: string;
  badge: string;
  rows: Array<[string, string]>;
  icon?: React.ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-[24px] sm:rounded-[28px] border border-slate-200 bg-[linear-gradient(180deg,#1f2937_0%,#111827_100%)] text-white shadow-[0_18px_45px_rgba(15,23,42,0.18)]">
      <div className="border-b border-white/10 px-4 sm:px-5 py-4">
        <div className="text-[10px] sm:text-[11px] font-bold uppercase tracking-[0.28em] text-slate-300">{eyebrow}</div>
        <div className="mt-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            {icon ? <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10">{icon}</div> : null}
            <div className="text-lg sm:text-xl font-black tracking-tight">{title}</div>
          </div>
          <div className="rounded-full bg-white/10 px-3 py-1 text-[10px] sm:text-[11px] font-bold uppercase tracking-[0.22em] text-indigo-300">
            {badge}
          </div>
        </div>
      </div>
      <div className="space-y-4 px-4 sm:px-5 py-5">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-start justify-between gap-4 border-b border-white/10 pb-3 last:border-b-0 last:pb-0">
            <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-[0.22em] text-slate-400">{label}</span>
            <span className="max-w-[190px] text-right text-[12px] sm:text-sm font-semibold text-white/90">{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
