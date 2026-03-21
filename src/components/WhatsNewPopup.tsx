"use client";

import React, { useEffect, useState } from "react";
import { X } from "lucide-react";
import Image from "next/image";

const WHATS_NEW_ID = "whats-new-v1-signature-pdfs";
const EXPIRATION_DATE = new Date('2026-03-23T16:00:00Z').getTime();

export function WhatsNewPopup() {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const checkVisibility = () => {
      const now = new Date().getTime();
      
      // If the 2-day global window has passed, never show it again
      if (now > EXPIRATION_DATE) return;

      const storedData = localStorage.getItem(WHATS_NEW_ID);
      const isDismissed = storedData === 'dismissed';

      if (!isDismissed) {
        setIsOpen(true);
      }
    };

    const timer = setTimeout(checkVisibility, 2000);
    return () => clearTimeout(timer);
  }, []);

  const handleDismiss = () => {
    localStorage.setItem(WHATS_NEW_ID, 'dismissed');
    setIsOpen(false);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="relative w-full max-w-[560px] overflow-hidden rounded-[32px] border border-slate-200 bg-white shadow-[0_24px_60px_rgba(15,23,42,0.18)] animate-in zoom-in-95 duration-500">
        
        {/* Header Section */}
        <div className="relative overflow-hidden bg-[#0f172a] p-6 pb-5 text-white">
          <div className="absolute -right-8 -top-8 h-[120px] w-[120px] rounded-full bg-indigo-500/20 blur-2xl" />
          <div className="absolute bottom-[-20px] left-[40%] h-20 w-20 rounded-full bg-teal-500/15 blur-xl" />
          
          <div className="relative mb-3 flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/5 overflow-hidden backdrop-blur-md border border-white/10">
                <Image
                  src="/TerminalLogo.png"
                  alt="Terminal Logo"
                  width={40}
                  height={40}
                  className="h-full w-full object-cover"
                />
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-400">Yesp Studio</p>
                <p className="text-[13px] font-medium text-slate-200 tracking-tight">Workshop Management</p>
              </div>
            </div>
            <button 
              onClick={handleDismiss}
              className="rounded-xl p-1.5 transition-colors hover:bg-white/10"
            >
              <X className="h-4 w-4 text-slate-400" />
            </button>
          </div>

          <div className="relative flex items-baseline gap-2">
            <span className="text-[22px] font-bold text-slate-50 tracking-tight">March 2026</span>
            <span className="rounded-full border border-indigo-500/30 bg-indigo-500/15 px-2 py-0.5 text-[11px] font-bold text-[#6366f1]">Release</span>
          </div>
          <p className="relative mt-1 text-[13px] text-slate-400 font-medium tracking-tight">4 new features and improvements</p>
        </div>

        {/* Content Section */}
        <div className="flex flex-col p-6 pt-2">
          
          <div className="flex gap-4 border-b border-slate-50 py-4 items-center">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <rect x="2" y="2" width="12" height="14" rx="1.5" stroke="currentColor" strokeWidth="1.2"/>
                <path d="M5 6h6M5 8.5h4M5 11h3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                <circle cx="12" cy="13" r="3" fill="#eff6ff" stroke="currentColor" strokeWidth="1.2"/>
                <path d="M11 13l0.8 0.8 1.5-1.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <p className="text-[14px] font-bold text-slate-900 tracking-tight">Premium PDF branding</p>
                <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-600">Invoices & Quotations</span>
              </div>
              <p className="text-[12px] leading-relaxed text-slate-500 font-medium">Official workshop logo, GST details, and contact info are now embedded in all generated PDFs.</p>
            </div>
          </div>

          <div className="flex gap-4 border-b border-slate-50 py-4 items-center">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M3 13V10M8 13V7M13 13V4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                <path d="M2 9.5h2M7 6.5h2M12 3.5h2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <p className="text-[14px] font-bold text-slate-900 tracking-tight">Dual signature blocks</p>
                <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-600">Legal</span>
              </div>
              <p className="text-[12px] leading-relaxed text-slate-500 font-medium">Customer and Authorized signature lines added to all documents for legal compliance.</p>
            </div>
          </div>

          <div className="flex gap-4 border-b border-slate-50 py-4 items-center">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.2"/>
                <path d="M6 6.5C6.2 5.5 7 5 8 5c1.1 0 2 .7 2 1.7 0 .8-.5 1.3-1.2 1.7L8 9v.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                <circle cx="8" cy="11.5" r=".6" fill="currentColor"/>
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <p className="text-[14px] font-bold text-slate-900 tracking-tight">Advanced enquiries</p>
                <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-600">New</span>
              </div>
              <p className="text-[12px] leading-relaxed text-slate-500 font-medium">Track customer enquiries with dedicated status management and automated pickup reminders.</p>
            </div>
          </div>

          <div className="flex gap-4 py-4 items-center">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <circle cx="8" cy="6" r="2.5" stroke="currentColor" strokeWidth="1.2"/>
                <path d="M3 13c0-2.2 2.2-4 5-4s5 1.8 5 4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                <path d="M11 3l1 1-3 3" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <p className="text-[14px] font-bold text-slate-900 tracking-tight">System logs relocated</p>
                <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-bold text-slate-500">Navigation</span>
              </div>
              <p className="text-[12px] leading-relaxed text-slate-500 font-medium">Audit logs and activity history moved to Profile section for a cleaner main navigation.</p>
            </div>
          </div>
        </div>

        {/* Footer Section */}
        <div className="flex items-center justify-end border-t border-slate-50 p-4 px-6 bg-slate-50/50">
          <button 
            onClick={handleDismiss}
            className="rounded-xl bg-[#6366f1] px-10 py-2.5 text-[13px] font-bold text-white transition-all shadow-lg shadow-indigo-200 hover:bg-indigo-700 active:scale-95"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
