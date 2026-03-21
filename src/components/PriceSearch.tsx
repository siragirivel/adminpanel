"use client";

import React, { useState, useEffect, useRef } from "react";
import { Search, X, Package, Copy, Check } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

export function PriceSearch() {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [loading, setLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd/Ctrl + K for Price Search
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      }
      if (e.key === "Escape") {
        setIsOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    const handleOpenPrice = () => setIsOpen(true);
    window.addEventListener("open-price-search", handleOpenPrice);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("open-price-search", handleOpenPrice);
    };
  }, []);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    } else {
      setQuery("");
      setResults([]);
    }
  }, [isOpen]);

  useEffect(() => {
    const search = async () => {
      if (!query.trim()) {
        setResults([]);
        return;
      }
      setLoading(true);
      const { data, error } = await supabase
        .from("spare_parts")
        .select("id, name, sell, stock, cat, threshold")
        .or(`name.ilike.%${query}%,id.ilike.%${query}%,cat.ilike.%${query}%`)
        .limit(8);

      if (!error && data) {
        setResults(data);
      }
      setLoading(false);
    };

    const timer = setTimeout(search, 200);
    return () => clearTimeout(timer);
  }, [query]);

  const copyVal = (val: number, id: string) => {
    const text = `₹${val.toLocaleString("en-IN")}`;
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[999] bg-[#0f0f1a]/60 backdrop-blur-md flex items-start justify-center pt-[100px] animate-in fade-in duration-300" onClick={(e) => e.target === e.currentTarget && setIsOpen(false)}>
      <div className="w-full max-w-[560px] bg-white rounded-3xl shadow-[0_32px_64px_-16px_rgba(0,0,0,0.3)] overflow-hidden animate-in zoom-in-95 duration-200 border border-white/20">
        
        {/* Search Bar */}
        <div className="flex items-center gap-4 px-6 py-5 border-b border-zinc-50">
          <Search className="w-6 h-6 text-indigo-500" />
          <input
            ref={inputRef}
            type="text"
            className="flex-1 bg-transparent border-none outline-none text-zinc-900 text-xl placeholder:text-zinc-300 font-semibold tracking-tight"
            placeholder="Search part rates..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoComplete="off"
          />
          {query && (
            <button onClick={() => setQuery("")} className="p-1.5 hover:bg-zinc-100 rounded-full transition-colors">
              <X className="w-4 h-4 text-zinc-400" />
            </button>
          )}
        </div>

        {/* Results Body */}
        <div className="max-h-[460px] overflow-y-auto px-2 pb-2 custom-scrollbar">
          {!query && (
            <div className="p-12 text-center">
              <div className="w-16 h-16 bg-indigo-50 border-2 border-indigo-100 border-dashed rounded-2xl flex items-center justify-center mx-auto mb-4 transition-colors">
                 <Package className="w-8 h-8 text-indigo-400" />
              </div>
              <p className="text-zinc-800 font-bold text-lg leading-tight">Price Searcher</p>
              <p className="text-zinc-400 text-sm mt-1 max-w-[240px] mx-auto leading-relaxed">
                Find selling rates and stock availability instantly for any spare part.
              </p>
            </div>
          )}

          {query && results.length === 0 && !loading && (
            <div className="p-12 text-center text-zinc-400 text-sm italic">
              No parts found for "{query}"
            </div>
          )}

          {results.length > 0 && (
            <div className="space-y-1">
               {results.map((p) => {
                 const isLowStock = p.stock <= p.threshold && p.stock > 0;
                 const isOut = p.stock === 0;

                 return (
                   <div
                     key={p.id}
                     className="flex items-center justify-between px-4 py-3.5 rounded-2xl hover:bg-zinc-50 transition-all group cursor-default border border-transparent hover:border-zinc-100"
                   >
                     <div className="flex-1 min-width-0">
                       <div className="flex items-center gap-2 mb-1.5">
                          <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded border uppercase text-indigo-600 bg-indigo-50 border-indigo-100">
                             {p.id}
                          </span>
                          <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-tight italic">
                             {p.cat}
                          </span>
                       </div>
                       <div className="font-bold text-[16px] text-zinc-800 leading-none truncate pr-4">
                          {p.name}
                       </div>
                     </div>

                     <div className="flex items-center gap-6 shrink-0">
                        <div className="text-right hidden sm:block">
                           <div className={cn(
                             "text-[9px] font-extrabold px-2 py-0.5 rounded-full inline-block border uppercase tracking-wider",
                             isOut ? "text-zinc-400 bg-zinc-50 border border-zinc-200" : isLowStock ? "text-rose-600 bg-rose-50 border border-rose-100" : "text-emerald-600 bg-emerald-50 border border-emerald-100"
                           )}>
                             {isOut ? "Out" : `${p.stock} In Stock`}
                           </div>
                        </div>

                        <div className="flex items-center gap-3">
                           <div className="text-right min-w-[90px]">
                             <div className="text-xl font-bold font-mono tracking-tighter leading-none text-zinc-900">
                                ₹{p.sell.toLocaleString("en-IN")}
                             </div>
                             <div className="text-[9px] text-zinc-400 font-bold mt-1.5 uppercase tracking-widest">
                                Selling Rate
                             </div>
                           </div>
                           
                           <button 
                             onClick={() => copyVal(p.sell, p.id)}
                             className={cn(
                               "w-10 h-10 flex items-center justify-center rounded-xl transition-all duration-300 border shadow-sm",
                               copiedId === p.id 
                                 ? "bg-emerald-50 border-emerald-100 text-emerald-600" 
                                 : "bg-white border-zinc-100 text-zinc-400 hover:border-zinc-300 hover:text-zinc-900 active:scale-95"
                             )}
                           >
                             {copiedId === p.id ? <Check className="w-5 h-5" /> : <Copy className="w-4.5 h-4.5" />}
                           </button>
                        </div>
                     </div>
                   </div>
                 );
               })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-zinc-50/50 border-t border-zinc-100 flex items-center justify-between">
          <div className="flex items-center gap-3 text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
             <div className="flex items-center gap-1.5">
                <kbd className="bg-white border border-zinc-200 text-zinc-600 px-1.5 py-0.5 rounded shadow-sm">ESC</kbd>
                <span>Close</span>
             </div>
             <div className="w-px h-3 bg-zinc-200" />
             <div className="flex items-center gap-1.5">
                <kbd className="bg-white border border-zinc-200 text-zinc-600 px-1.5 py-0.5 rounded shadow-sm">⌘K</kbd>
                <span>Search</span>
             </div>
          </div>
          <div className="text-zinc-300 font-bold uppercase tracking-[0.2em] text-[9px]">
             Sirigirvel System
          </div>
        </div>
      </div>
      
      <style jsx>{`
        .custom-scrollbar::-webkit-scrollbar { width: 5px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #e5e7eb; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #d1d5db; }
      `}</style>
    </div>
  );
}
