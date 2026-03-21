"use client";

import React, { useState, useEffect } from "react";
import { 
  Smartphone,
  Wallet,
  FileText,
  TrendingDown,
  TrendingUp,
  Loader2,
  X,
  History,
  CheckCircle2,
  Save as SaveIcon,
  Info
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { format } from "date-fns";
import toast from "react-hot-toast";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { logActivity } from "@/lib/activity-log";
import Link from "next/link";

interface SuggestionRow {
  description: string;
  amount: number;
  payment_mode: "cash" | "eft";
  type: "debit" | "credit";
  created_at: string;
  note?: string | null;
  dt: string;
}

export default function DayBookPage() {
  const [submitting, setSubmitting] = useState(false);
  const [suggestions, setSuggestions] = useState<SuggestionRow[]>([]);
  const [showAc, setShowAc] = useState(false);
  const [isFilledFromAc, setIsFilledFromAc] = useState(false);
  const [filledDate, setFilledDate] = useState("");
  
  // Form State
  const [formData, setFormData] = useState({
    description: "",
    type: 'debit' as 'debit' | 'credit',
    amount: "",
    payment_mode: 'eft' as 'cash' | 'eft',
    note: "",
    date: format(new Date(), "yyyy-MM-dd")
  });

  useEffect(() => {
    fetchSuggestions();
  }, []);

  const fetchSuggestions = async () => {
    try {
      const { data } = await supabase
        .from('transactions')
        .select('description, amount, payment_mode, type, created_at, note')
        .limit(50);
      
      if (data) {
        const seen = new Set();
        const unique = data.filter(item => {
          const k = `${item.type}:${item.description.toLowerCase()}`;
          return seen.has(k) ? false : seen.add(k);
        }).map(item => ({
          ...item,
          payment_mode: item.payment_mode === 'cash' ? 'cash' : 'eft',
          dt: format(new Date(item.created_at), "dd MMM")
        })) as SuggestionRow[];
        setSuggestions(unique);
      }
    } catch {}
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.description || !formData.amount) {
      toast.error("Please fill in description and amount");
      return;
    }

    try {
      setSubmitting(true);
      const { data: { user } } = await supabase.auth.getUser();
      const storedPaymentMode = formData.payment_mode === "cash" ? "cash" : "upi";
      const { data: inserted, error } = await supabase
        .from('transactions')
        .insert([{
          ...formData,
          amount: parseFloat(formData.amount),
          date: formData.date,
          payment_mode: storedPaymentMode,
          created_by: user?.id
        }])
        .select("id")
        .single();

      if (error) throw error;

      await logActivity({
        action: "create",
        entityType: "transaction",
        entityId: inserted?.id || formData.description,
        entityLabel: formData.description,
        description: `Created day book ${formData.type} entry via ${formData.payment_mode.toUpperCase()}`,
        metadata: {
          amount: parseFloat(formData.amount),
          type: formData.type,
          payment_mode: storedPaymentMode,
          date: formData.date,
        },
      });

      toast.success("Entry saved successfully");
      setFormData({
        ...formData,
        description: "",
        amount: "",
        note: ""
      });
      setIsFilledFromAc(false);
      fetchSuggestions();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save entry");
    } finally {
      setSubmitting(false);
    }
  };

  const setType = (t: 'debit' | 'credit') => {
    setFormData({ ...formData, type: t });
  };

  const setMode = (m: 'cash' | 'eft') => {
    setFormData({ ...formData, payment_mode: m });
  };

  const pickSuggestion = (s: SuggestionRow) => {
    setFormData((current) => ({
      ...current,
      type: current.type,
      description: s.description,
      amount: s.amount.toString(),
      payment_mode: s.payment_mode,
      note: s.note || ""
    }));
    setIsFilledFromAc(true);
    setFilledDate(s.dt);
    setShowAc(false);
  };

  const clearDesc = () => {
    setFormData({ ...formData, description: "", amount: "" });
    setIsFilledFromAc(false);
  };

  return (
    <div className="flex flex-col min-h-screen bg-[#f9fafb] font-['DM_Sans'] relative">
      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=DM+Mono:wght@400;500&display=swap');
      `}</style>
      
      {/* Content Area - Full Width Card */}
      <div className="flex-1">
        <div className="w-full bg-white rounded-[32px] shadow-[0_4px_25px_rgba(0,0,0,0.03)] border border-black/[0.03] p-12 min-h-[calc(100vh-100px)] animate-in fade-in slide-in-from-bottom-2 duration-300">
          
          <div className="mb-10 flex items-start justify-between">
            <div>
              <h1 className="text-[24px] font-semibold text-[#111827] tracking-tight">New day book entry</h1>
              <p className="text-[14px] text-[#6b7280] mt-1">Balances update automatically based on payment mode.</p>
            </div>
            <Link 
              href="/daybook/history" 
              className="flex items-center gap-2 px-5 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-[13px] font-semibold text-zinc-600 hover:bg-zinc-100 hover:text-zinc-950 transition-all decoration-none"
            >
              <FileText className="w-4 h-4" />
              View all entries
            </Link>
          </div>

          <form onSubmit={handleSave} className="space-y-8">
            
            {/* Entry Type */}
            <div className="space-y-2.5">
              <label className="block text-[12px] font-semibold text-[#6b7280] uppercase tracking-wider">Entry type</label>
              <div className="inline-flex bg-[#f3f4f6] p-1 rounded-[10px] gap-0.5">
                <button 
                  type="button"
                  onClick={() => setType('debit')}
                  className={cn(
                    "flex items-center gap-1.5 px-5 py-2 rounded-[8px] text-[13px] font-medium transition-all",
                    formData.type === 'debit' ? "bg-white text-[#dc2626] shadow-sm" : "text-[#6b7280] hover:bg-white/50"
                  )}
                >
                  <TrendingDown className="w-3.5 h-3.5" />
                  Debit (expense)
                </button>
                <button 
                  type="button"
                  onClick={() => setType('credit')}
                  className={cn(
                    "flex items-center gap-1.5 px-5 py-2 rounded-[8px] text-[13px] font-medium transition-all",
                    formData.type === 'credit' ? "bg-white text-[#16a34a] shadow-sm" : "text-[#6b7280] hover:bg-white/50"
                  )}
                >
                  <TrendingUp className="w-3.5 h-3.5" />
                  Credit (income)
                </button>
              </div>
            </div>

            {/* Date */}
            <div className="space-y-2.5">
              <label className="block text-[12px] font-semibold text-[#6b7280] uppercase tracking-wider">Date</label>
              <input 
                type="date"
                className="w-[200px] bg-transparent border-0 border-b-2 border-[#e5e7eb] outline-none focus:border-zinc-400 py-2 text-[15px] font-['DM_Mono'] text-[#111827] transition-colors"
                value={formData.date}
                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
              />
            </div>

            {/* Description */}
            <div className="space-y-2.5">
              <label className="block text-[12px] font-semibold text-[#6b7280] uppercase tracking-wider">Description</label>
              <div className="relative group">
                <div className="relative">
                  <input 
                    type="text"
                    placeholder="e.g. Brake pad purchase"
                    className={cn(
                      "w-full bg-transparent border-0 border-b-2 outline-none py-2 text-[15px] transition-colors",
                      isFilledFromAc
                        ? "border-[#16a34a] text-[#15803d]"
                        : "border-[#e5e7eb] text-[#111827] focus:border-zinc-400"
                    )}
                    value={formData.description}
                    onChange={(e) => {
                      setFormData({ ...formData, description: e.target.value });
                      setIsFilledFromAc(false);
                      setShowAc(true);
                    }}
                    onFocus={() => setShowAc(true)}
                    onBlur={() => setTimeout(() => setShowAc(false), 200)}
                  />
                  {isFilledFromAc && formData.description ? (
                    <button
                      type="button"
                      onClick={clearDesc}
                      className="absolute right-0 top-1/2 -translate-y-1/2 text-[#15803d] hover:bg-[#dcfce7] rounded-full p-1 transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  ) : null}
                </div>

                {isFilledFromAc && (
                  <div className="flex items-center gap-1.5 mt-2 text-[11px] text-[#6366f1] animate-in slide-in-from-top-1 duration-200">
                    <CheckCircle2 className="w-3 h-3" />
                    Auto-filled from previous entry · {filledDate}
                  </div>
                )}

                {showAc && formData.description.length >= 2 && !isFilledFromAc && (
                  <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-[#e5e7eb] rounded-[12px] shadow-[0_8px_28px_rgba(0,0,0,0.1)] z-50 overflow-hidden py-1 animate-in zoom-in-95 duration-200">
                    <div className="px-4 py-2 bg-[#f5f5ff] border-b border-[#e5e7eb]/50 flex items-center gap-2 text-[11px] font-semibold text-[#6366f1]">
                      <History className="w-3 h-3" />
                      Previous entries
                    </div>
                    {suggestions
                      .filter(s =>
                        s.description.toLowerCase().includes(formData.description.toLowerCase())
                      )
                      .map((s, idx) => (
                        <button 
                          key={idx}
                          type="button"
                          onMouseDown={() => pickSuggestion(s)}
                          className="w-full px-4 py-3 hover:bg-[#f5f5ff] text-left flex items-center justify-between transition-colors group"
                        >
                          <div className="flex items-center gap-3">
                            <div className={cn("w-2 h-2 rounded-full", s.type === 'debit' ? "bg-[#dc2626]" : "bg-[#16a34a]")} />
                            <div>
                              <span className="text-[14px] font-medium text-[#111827] group-hover:text-[#6366f1] transition-colors">{s.description}</span>
                              <div className="flex flex-col mt-0.5">
                                 <div className="flex items-center gap-2">
                                   <span className={cn("text-[9px] font-semibold px-1.5 py-0.5 rounded-full uppercase", 
                                     s.payment_mode === 'cash' ? "bg-[#dcfce7] text-[#15803d]" : "bg-[#dbeafe] text-[#1d4ed8]"
                                   )}>{s.payment_mode}</span>
                                   {s.note && <span className="text-[9px] text-[#9ca3af] font-['DM_Mono'] truncate max-w-[120px]">· {s.note}</span>}
                                 </div>
                              </div>
                            </div>
                          </div>
                          <div className="text-right">
                             <div className={cn("text-[13px] font-semibold font-['DM_Mono']", s.type === 'debit' ? "text-[#dc2626]" : "text-[#16a34a]")}>₹{s.amount.toLocaleString()}</div>
                             <div className="text-[10px] text-[#9ca3af]">{s.dt}</div>
                          </div>
                        </button>
                      ))
                    }
                  </div>
                )}
              </div>
            </div>

            {/* Amount */}
            <div className="space-y-2.5">
              <label className="block text-[12px] font-semibold text-[#6b7280] uppercase tracking-wider">Amount (₹)</label>
              <div className="flex items-baseline gap-1.5 border-b-2 border-[#e5e7eb] focus-within:border-zinc-400 transition-colors pb-1">
                <span className="text-[22px] font-medium text-[#6b7280] font-['DM_Mono']">₹</span>
                <input 
                  type="number"
                  placeholder="0"
                  className={cn(
                    "flex-1 bg-transparent border-none outline-none py-1 text-[32px] font-semibold font-['DM_Mono'] tracking-tight transition-colors",
                    formData.type === 'debit' ? "text-[#dc2626]" : "text-[#16a34a]",
                    !formData.amount && "placeholder-[#e5e7eb]"
                  )}
                  value={formData.amount}
                  onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                />
                {isFilledFromAc && <span className="text-[12px] text-[#9ca3af] mb-2">Edit if changed</span>}
              </div>
            </div>

            {/* Mode */}
            <div className="space-y-2.5">
              <label className="block text-[12px] font-semibold text-[#6b7280] uppercase tracking-wider">Mode of payment</label>
              <div className="flex flex-wrap gap-2.5">
                <ModeBtn 
                  icon={Wallet} 
                  label="Cash" 
                  active={formData.payment_mode === 'cash'} 
                  onClick={() => setMode('cash')} 
                  activeClass="border-[#16a34a] text-[#15803d] bg-[#f0fdf4]" 
                  iconColor="#16a34a"
                />
                <ModeBtn 
                  icon={Smartphone} 
                  label="EFT" 
                  active={formData.payment_mode === 'eft'} 
                  onClick={() => setMode('eft')} 
                  activeClass="border-[#6366f1] text-[#6366f1] bg-[#f5f5ff]" 
                  iconColor="#6366f1"
                />
              </div>
              <div className="flex items-center gap-1.5 mt-2 text-[12px] text-[#9ca3af]">
                <Info className="w-3.5 h-3.5 text-[#6366f1]" />
                <span>
                  {formData.payment_mode === 'cash' ? "Cash → updates Petty Cash balance" : "EFT → updates Bank balance"}
                </span>
              </div>
            </div>

            {/* Note */}
            <div className="space-y-2.5">
              <label className="block text-[12px] font-semibold text-[#6b7280] uppercase tracking-wider">Note <span className="normal-case font-normal text-[#9ca3af]">(optional)</span></label>
              <input 
                type="text"
                placeholder="Add a note…"
                className="w-full bg-transparent border-0 border-b-2 border-[#e5e7eb] outline-none focus:border-zinc-400 py-2 text-[15px] text-[#111827] transition-colors"
                value={formData.note}
                onChange={(e) => setFormData({ ...formData, note: e.target.value })}
              />
            </div>

            {/* Preview */}
            <div className="flex items-center justify-between py-[18px] border-y border-[#e5e7eb] my-8 animate-in fade-in duration-300">
              <div className="flex items-center gap-2.5">
                <div className={cn("w-2.5 h-2.5 rounded-full", formData.type === 'debit' ? "bg-[#dc2626]" : "bg-[#16a34a]")} />
                <div>
                  <div className="text-[14px] font-medium text-[#111827] decoration-none">{formData.description || "Entry preview"}</div>
                  <div className="text-[12px] text-[#9ca3af] mt-0.5 uppercase">{formData.payment_mode} · {formData.type}</div>
                </div>
              </div>
              <div className={cn("text-[22px] font-semibold font-['DM_Mono'] tracking-tight", formData.type === 'debit' ? "text-[#dc2626]" : "text-[#16a34a]")}>
                {formData.type === 'debit' ? "−" : "+"}₹{Number(formData.amount || 0).toLocaleString()}
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-3.5">
              <button 
                type="submit"
                disabled={submitting}
                className={cn(
                  "h-11 px-8 rounded-[8px] text-[14px] font-semibold text-white transition-all flex items-center gap-2 shadow-sm decoration-none",
                  formData.type === 'debit' ? "bg-[#6366f1] hover:bg-[#4f46e5]" : "bg-[#16a34a] hover:bg-[#15803d]"
                )}
              >
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <SaveIcon className="w-4 h-4" />}
                Save entry
              </button>
              <button type="button" onClick={() => window.history.back()} className="text-[14px] text-[#6b7280] hover:text-[#dc2626] font-medium transition-colors cursor-pointer bg-none border-none p-0">
                 Cancel
              </button>
              <div className="ml-auto text-[12px] text-[#9ca3af] flex items-center gap-1.5">
                 <CheckCircle2 className="w-3.5 h-3.5 text-[#16a34a]" />
                 Balance updates automatically
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

function ModeBtn({
  icon: Icon,
  label,
  active,
  onClick,
  activeClass,
  iconColor,
}: {
  icon: LucideIcon;
  label: string;
  active: boolean;
  onClick: () => void;
  activeClass: string;
  iconColor: string;
}) {
  return (
    <button 
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 px-4 py-2.5 rounded-[8px] border-[1.5px] border-[#e5e7eb] bg-white text-[13px] font-medium text-[#6b7280] transition-all",
        active ? activeClass : "hover:border-[#6366f1] hover:text-[#6366f1] group"
      )}
    >
      <Icon className="w-4 h-4" style={{ color: active ? iconColor : 'inherit' }} />
      {label}
    </button>
  );
}
