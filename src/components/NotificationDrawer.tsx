"use client";

import React, { useEffect, useState } from "react";
import { X, AlertTriangle, Package, ArrowRight, BellRing } from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import Link from "next/link";

interface NotificationDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export function NotificationDrawer({ isOpen, onClose }: NotificationDrawerProps) {
  const [lowStockItems, setLowStockItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      fetchLowStock();
    }
  }, [isOpen]);

  const fetchLowStock = async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from('spare_parts')
        .select('*')
        .lte('stock', 'threshold'); // This might not work directly in Supabase or filter, usually it's stock <= threshold.
      
      // Since Supabase filter doesn't support comparing two columns directly in .lte() for JS SDK easily without RPC, 
      // I'll fetch all and filter or use a better query if I can.
      // Actually, I'll just fetch all and filter in JS for now as it's a small dataset.
      
      const { data: allParts } = await supabase.from('spare_parts').select('*');
      if (allParts) {
        setLowStockItems(allParts.filter(p => p.stock <= p.threshold));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div 
        className={cn(
          "fixed inset-0 bg-slate-900/20 backdrop-blur-sm z-[100] transition-opacity duration-300",
          isOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
        onClick={onClose}
      />

      {/* Drawer */}
      <div 
        className={cn(
          "fixed top-0 right-0 bottom-0 w-full max-w-[400px] bg-white shadow-2xl z-[101] transition-transform duration-500 ease-out transform flex flex-col border-l border-black/5",
          isOpen ? "translate-x-0" : "translate-x-full"
        )}
      >
        {/* Header */}
        <div className="h-[64px] border-b border-black/5 px-6 flex items-center justify-between bg-zinc-50/50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-indigo-50 flex items-center justify-center">
              <BellRing className="w-4 h-4 text-indigo-600" />
            </div>
            <h2 className="text-[15px] font-bold text-slate-800 tracking-tight">Notifications</h2>
          </div>
          <button 
            onClick={onClose}
            className="p-2 rounded-full hover:bg-zinc-100 text-zinc-400 hover:text-zinc-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-4">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 opacity-50">
              <div className="w-8 h-8 border-3 border-indigo-600/10 border-t-indigo-600 rounded-full animate-spin" />
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Scanning inventory...</p>
            </div>
          ) : lowStockItems.length > 0 ? (
            <>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">Inventory Alerts</span>
                <span className="bg-red-50 text-red-600 text-[10px] font-black px-2 py-0.5 rounded-full">{lowStockItems.length} ACTIVE</span>
              </div>
              
              {lowStockItems.map((item) => (
                <div key={item.id} className="group relative bg-white border border-slate-100 rounded-[20px] p-5 hover:border-red-100 hover:bg-red-50/30 transition-all hover:shadow-xl hover:shadow-red-500/5 overflow-hidden animate-in fade-in slide-in-from-right-4 duration-300">
                  <div className="absolute top-0 right-0 p-3 opacity-0 group-hover:opacity-100 transition-opacity">
                    <AlertTriangle className="w-4 h-4 text-red-400" />
                  </div>
                  
                  <div className="flex items-start gap-4">
                    <div className="w-11 h-11 bg-red-50 rounded-[14px] flex items-center justify-center text-red-600 group-hover:scale-110 transition-transform shadow-sm">
                      <Package className="w-5.5 h-5.5" />
                    </div>
                    <div className="flex-1">
                      <h3 className="text-[14px] font-bold text-slate-800 leading-tight mb-1 group-hover:text-red-700 transition-colors uppercase tracking-tight">{item.name}</h3>
                      <p className="text-[12px] text-slate-500 font-medium leading-relaxed">Stock level is critical. Current inventory: <span className="text-red-600 font-bold">{item.stock} units</span>.</p>
                      <div className="mt-4 flex items-center justify-between">
                         <div className="flex flex-col">
                            <span className="text-[9px] font-bold text-slate-300 uppercase tracking-wider">Purchase Rate</span>
                            <span className="text-[13px] font-bold text-slate-700 font-mono">{formatCurrency(item.cost)}</span>
                         </div>
                         <Link 
                          href="/inventory" 
                          onClick={onClose}
                          className="flex items-center gap-1.5 py-1.5 px-3 bg-white border border-slate-200 rounded-lg text-[10px] font-bold text-slate-600 hover:bg-slate-900 hover:text-white hover:border-slate-900 transition-all decoration-none group/btn"
                         >
                           Manage Stock
                           <ArrowRight className="w-3.5 h-3.5 group-hover/btn:translate-x-1 transition-transform" />
                         </Link>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center px-10">
              <div className="w-20 h-20 bg-emerald-50 rounded-full flex items-center justify-center mb-6 animate-pulse">
                <BellRing className="w-10 h-10 text-emerald-500/30" />
              </div>
              <h3 className="text-[16px] font-bold text-slate-800 mb-2">Systems Nominal</h3>
              <p className="text-[12px] text-slate-400 font-medium leading-relaxed italic">No unread notifications or critical stock alerts at this time.</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 bg-zinc-50 border-t border-black/5">
             <div className="flex items-center gap-2 mb-4">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none">Terminal Status: Active</span>
             </div>
             <p className="text-[10px] text-slate-400 leading-relaxed font-medium">Automatic inventory scanning is enabled. Balances and stock levels reflect the latest terminal database synchronization.</p>
        </div>
      </div>
    </>
  );
}
