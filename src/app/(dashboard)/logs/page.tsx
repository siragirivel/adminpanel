"use client";

import React, { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { format } from "date-fns";
import { Car, FileSignature, Package, BookOpen, Receipt, Loader2, Clock, User, Search, ClipboardList } from "lucide-react";
import { cn } from "@/lib/utils";

type LogEntry = {
  id: string;
  type: "vehicle" | "enquiry" | "spare_part" | "spare_order" | "transaction" | "invoice" | "quotation";
  action: "create" | "edit" | "delete";
  title: string;
  subtitle: string;
  username: string;
  created_at: string;
};

interface ActivityLogRow {
  id: string;
  action: "create" | "edit" | "delete";
  entity_type: LogEntry["type"];
  entity_label: string;
  description: string;
  created_at: string;
  profiles?: {
    username?: string;
  } | null;
}

const typeConfig = {
  vehicle: { icon: Car, color: "text-indigo-600", bg: "bg-indigo-50", label: "Vehicle" },
  enquiry: { icon: ClipboardList, color: "text-sky-600", bg: "bg-sky-50", label: "Enquiry" },
  spare_part: { icon: Package, color: "text-emerald-600", bg: "bg-emerald-50", label: "Spare Part" },
  spare_order: { icon: Receipt, color: "text-orange-500", bg: "bg-orange-50", label: "Spare Order" },
  transaction: { icon: BookOpen, color: "text-amber-600", bg: "bg-amber-50", label: "Day Book" },
  invoice: { icon: Receipt, color: "text-purple-600", bg: "bg-purple-50", label: "Invoice" },
  quotation: { icon: FileSignature, color: "text-violet-600", bg: "bg-violet-50", label: "Quotation" },
};

export default function LogsPage() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "vehicle" | "enquiry" | "spare_part" | "spare_order" | "transaction" | "invoice" | "quotation">("all");
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    fetchAllLogs();
  }, []);

  const fetchAllLogs = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("activity_logs")
        .select("id, action, entity_type, entity_label, description, created_at, profiles(username)")
        .order("created_at", { ascending: false })
        .limit(200);

      if (error) throw error;

      const mapped: LogEntry[] = ((data || []) as ActivityLogRow[]).map((entry) => ({
        id: entry.id,
        type: entry.entity_type,
        action: entry.action,
        title: entry.entity_label,
        subtitle: entry.description,
        username: entry.profiles?.username || "Admin",
        created_at: entry.created_at,
      }));

      setLogs(mapped);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const filtered = logs.filter((l) => {
    const matchesType = filter === "all" || l.type === filter;
    const q = searchQuery.toLowerCase();
      const matchesSearch = !q || 
      l.title.toLowerCase().includes(q) || 
      l.subtitle.toLowerCase().includes(q) || 
      l.username.toLowerCase().includes(q) ||
      l.action.toLowerCase().includes(q);
    return matchesType && matchesSearch;
  });

  return (
    <div className="max-w-[900px] mx-auto py-10 animate-in fade-in slide-in-from-bottom-2 duration-500">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-[28px] font-bold text-slate-900 tracking-tight leading-none mb-1">Activity Logs</h1>
        <p className="text-[14px] text-slate-500 font-medium">Complete audit trail across all workshop modules</p>
      </div>

      {/* Search Bar */}
      <div className="relative mb-5">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 pointer-events-none" />
        <input
          type="text"
          placeholder="Search by name, type, or registrar…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full h-11 pl-11 pr-4 bg-white border border-black/[0.06] rounded-2xl text-[14px] font-medium text-slate-800 outline-none transition-all focus:border-indigo-600/20 focus:shadow-sm placeholder:text-zinc-400"
        />
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 mb-8 flex-wrap">
        {(["all", "vehicle", "enquiry", "spare_part", "spare_order", "transaction", "invoice", "quotation"] as const).map((f) => {
          const cfg = f !== "all" ? typeConfig[f] : null;
          return (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                "px-4 py-1.5 rounded-full text-[12px] font-semibold border transition-all",
                filter === f
                  ? "bg-slate-900 text-white border-slate-900"
                  : "bg-white text-slate-500 border-black/[0.06] hover:border-slate-300"
              )}
            >
              {f === "all" ? "All activity" : cfg?.label}
            </button>
          );
        })}
        <span className="ml-auto text-[12px] text-zinc-400 font-mono">{filtered.length} entries</span>
      </div>

      {/* Log Feed */}
      <div className="bg-white rounded-[28px] border border-black/[0.04] shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            <Loader2 className="w-7 h-7 animate-spin text-indigo-600" />
            <p className="text-[12px] font-bold text-slate-400 uppercase tracking-widest">Loading logs...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3">
            <Clock className="w-10 h-10 text-zinc-200" />
            <p className="text-[13px] text-zinc-400 font-medium">No activity found yet</p>
          </div>
        ) : (
          <div className="divide-y divide-black/[0.03]">
            {filtered.map((log, idx) => {
              const cfg = typeConfig[log.type];
              const Icon = cfg.icon;
              return (
                <div key={`${log.id}-${idx}`} className="flex items-start gap-4 p-5 hover:bg-slate-50/60 transition-colors group">
                  <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center shrink-0", cfg.bg)}>
                    <Icon className={cn("w-4 h-4", cfg.color)} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="text-[14px] font-semibold text-slate-800 truncate leading-tight">{log.title}</p>
                        <p className="text-[11px] text-zinc-400 font-medium mt-0.5 uppercase tracking-wide truncate">{log.subtitle}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 mt-2">
                      <span className={cn("text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full", cfg.bg, cfg.color)}>
                        {cfg.label}
                      </span>
                      <span className={cn(
                        "text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full",
                        log.action === "delete"
                          ? "bg-rose-50 text-rose-600"
                          : log.action === "edit"
                            ? "bg-amber-50 text-amber-700"
                            : "bg-emerald-50 text-emerald-700"
                      )}>
                        {log.action}
                      </span>
                      <div className="flex items-center gap-1 text-[11px] text-zinc-400 font-medium">
                        <User className="w-3 h-3" />
                        {log.username}
                      </div>
                      <div className="flex items-center gap-1 text-[11px] text-zinc-400 font-medium ml-auto">
                        <Clock className="w-3 h-3" />
                        {format(new Date(log.created_at), "dd MMM yyyy, hh:mm a")}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
