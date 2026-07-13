"use client";

import React, { useState, useEffect, useRef } from "react";
import { Search, X, Package, Copy, Check } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

interface SparePriceRow {
  id: string;
  name: string;
  sell: number;
  stock: number;
  cat?: string | null;
  parts_category?: string | null;
  threshold: number;
  car_name?: string | null;
}

export function PriceSearch() {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SparePriceRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [brandFilter, setBrandFilter] = useState("");
  const [partsCategoryFilter, setPartsCategoryFilter] = useState("");
  const [brandOptions, setBrandOptions] = useState<string[]>([]);
  const [partsCategoryOptions, setPartsCategoryOptions] = useState<string[]>([]);

  const inputRef = useRef<HTMLInputElement>(null);

  const resetSearchState = () => {
    setQuery("");
    setResults([]);
    setBrandFilter("");
    setPartsCategoryFilter("");
  };

  const closeSearch = () => {
    setIsOpen(false);
    resetSearchState();
  };

  const fetchFilterOptions = async () => {
    const { data, error } = await supabase
      .from("spare_parts")
      .select("cat, parts_category")
      .limit(1000);

    if (error || !data) return;

    const nextBrands = Array.from(
      new Set(
        data
          .map((row) => String(row.cat || "").trim())
          .filter(Boolean),
      ),
    ).sort((a, b) => a.localeCompare(b));

    const nextPartsCategories = Array.from(
      new Set(
        data
          .map((row) => String(row.parts_category || "").trim())
          .filter(Boolean),
      ),
    ).sort((a, b) => a.localeCompare(b));

    setBrandOptions(nextBrands);
    setPartsCategoryOptions(nextPartsCategories);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd/Ctrl + K for Price Search
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (isOpen) {
          closeSearch();
        } else {
          setIsOpen(true);
        }
      }
      if (e.key === "Escape") {
        closeSearch();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    const handleOpenPrice = () => setIsOpen(true);
    window.addEventListener("open-price-search", handleOpenPrice);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("open-price-search", handleOpenPrice);
    };
  }, [isOpen]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetchFilterOptions();
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  useEffect(() => {
    const search = async () => {
      if (!query.trim() && !brandFilter && !partsCategoryFilter) {
        setResults([]);
        return;
      }
      setLoading(true);
      let request = supabase
        .from("spare_parts")
        .select("id, name, sell, stock, cat, parts_category, threshold, car_name")
        .limit(8);

      const trimmedQuery = query.trim();
      if (trimmedQuery) {
        request = request.or(
          `name.ilike.%${trimmedQuery}%,id.ilike.%${trimmedQuery}%,cat.ilike.%${trimmedQuery}%,parts_category.ilike.%${trimmedQuery}%,car_name.ilike.%${trimmedQuery}%`,
        );
      }
      if (brandFilter) {
        request = request.eq("cat", brandFilter);
      }
      if (partsCategoryFilter) {
        request = request.eq("parts_category", partsCategoryFilter);
      }

      const { data, error } = await request;

      if (!error && data) {
        setResults(data as SparePriceRow[]);
      }
      setLoading(false);
    };

    const timer = setTimeout(search, 200);
    return () => clearTimeout(timer);
  }, [brandFilter, partsCategoryFilter, query]);

  const copyVal = (val: number, id: string) => {
    const text = `₹${val.toLocaleString("en-IN")}`;
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[999] app-overlay backdrop-blur-md flex items-start justify-center pt-16 sm:pt-[100px] animate-in fade-in duration-300" onClick={(e) => e.target === e.currentTarget && closeSearch()}>
      <div className="w-full max-w-[560px] rounded-3xl overflow-hidden animate-in zoom-in-95 duration-200 border border-[color:var(--card-border)] app-card app-card-gloss">
        
        {/* Search Bar */}
        <div className="flex items-center gap-3 sm:gap-4 px-4 sm:px-6 py-4 sm:py-5 border-b border-[color:var(--card-border)]">
          <Search className="w-6 h-6 text-indigo-500" />
          <input
            ref={inputRef}
            type="text"
            className="flex-1 bg-transparent border-none outline-none text-[color:var(--text-primary)] text-lg sm:text-xl placeholder:text-[color:var(--text-muted)] font-semibold tracking-tight"
            placeholder="Search by part, brand, category, or car name..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoComplete="off"
          />
          {(query || brandFilter || partsCategoryFilter) && (
            <button
              onClick={() => {
                setQuery("");
                setBrandFilter("");
                setPartsCategoryFilter("");
              }}
              className="p-1.5 hover:bg-[var(--surface-2)] rounded-full transition-colors"
            >
              <X className="w-4 h-4 text-[color:var(--text-muted)]" />
            </button>
          )}
        </div>

        <div className="flex flex-col gap-3 border-b border-[color:var(--card-border)] px-4 sm:px-6 py-3 sm:flex-row sm:items-center">
          <select
            value={brandFilter}
            onChange={(e) => setBrandFilter(e.target.value)}
            className="h-10 min-w-[160px] rounded-xl border border-[color:var(--card-border)] bg-[var(--surface-1)] px-3 text-sm font-medium text-[color:var(--text-primary)] outline-none"
          >
            <option value="">All brands</option>
            {brandOptions.map((brand) => (
              <option key={brand} value={brand}>
                {brand}
              </option>
            ))}
          </select>

          <select
            value={partsCategoryFilter}
            onChange={(e) => setPartsCategoryFilter(e.target.value)}
            className="h-10 min-w-[170px] rounded-xl border border-[color:var(--card-border)] bg-[var(--surface-1)] px-3 text-sm font-medium text-[color:var(--text-primary)] outline-none"
          >
            <option value="">All categories</option>
            {partsCategoryOptions.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        </div>

        {/* Results Body */}
        <div className="max-h-[460px] overflow-y-auto px-2 pb-2 custom-scrollbar">
          {!query && !brandFilter && !partsCategoryFilter && (
            <div className="p-12 text-center">
              <div className="w-16 h-16 bg-indigo-50 border-2 border-indigo-100 border-dashed rounded-2xl flex items-center justify-center mx-auto mb-4 transition-colors">
                 <Package className="w-8 h-8 text-indigo-400" />
              </div>
              <p className="text-[color:var(--text-primary)] font-bold text-base sm:text-lg leading-tight">Price Searcher</p>
              <p className="text-[color:var(--text-muted)] text-[12px] sm:text-sm mt-1 max-w-[240px] mx-auto leading-relaxed">
                Find selling rates and stock availability instantly for any spare part.
              </p>
            </div>
          )}

          {(query || brandFilter || partsCategoryFilter) && results.length === 0 && !loading && (
            <div className="p-12 text-center text-[color:var(--text-muted)] text-sm italic">
              No parts found for this search
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
                     className="flex items-center justify-between px-4 py-3.5 rounded-2xl hover:bg-[var(--surface-2)] transition-all group cursor-default border border-transparent hover:border-[color:var(--card-border)]"
                   >
                     <div className="flex-1 min-width-0">
                       <div className="flex items-center gap-2 mb-1.5">
                          <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded border uppercase text-indigo-600 bg-indigo-50 border-indigo-100">
                             {p.id}
                          </span>
                          <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-tight italic">
                             {p.cat || "No brand"}
                          </span>
                          {p.parts_category ? (
                            <span className="text-[10px] font-bold text-violet-600 bg-violet-50 border border-violet-100 px-1.5 py-0.5 rounded uppercase tracking-tight">
                              {p.parts_category}
                            </span>
                          ) : null}
                          {p.car_name ? (
                            <span className="text-[10px] font-bold text-sky-600 bg-sky-50 border border-sky-100 px-1.5 py-0.5 rounded uppercase tracking-tight">
                              {p.car_name}
                            </span>
                          ) : null}
                       </div>
                       <div className="font-bold text-[14px] sm:text-[16px] text-[color:var(--text-primary)] leading-none truncate pr-4">
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
                             <div className="text-lg sm:text-xl font-bold font-mono tracking-tighter leading-none text-[color:var(--text-primary)]">
                                ₹{p.sell.toLocaleString("en-IN")}
                             </div>
                             <div className="text-[9px] text-[color:var(--text-muted)] font-bold mt-1.5 uppercase tracking-widest">
                                Selling Rate
                             </div>
                           </div>
                           
                           <button 
                             onClick={() => copyVal(p.sell, p.id)}
                             className={cn(
                               "w-10 h-10 flex items-center justify-center rounded-xl transition-all duration-300 border shadow-sm",
                               copiedId === p.id 
                                 ? "bg-emerald-50 border-emerald-100 text-emerald-600" 
                                 : "bg-[var(--surface-1)] border-[color:var(--card-border)] text-[color:var(--text-muted)] hover:border-zinc-300 hover:text-[color:var(--text-primary)] active:scale-95"
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
        <div className="px-4 sm:px-6 py-4 bg-[var(--surface-2)] border-t border-[color:var(--card-border)] flex items-center justify-between">
          <div className="flex items-center gap-3 text-[9px] sm:text-[10px] font-bold text-[color:var(--text-muted)] uppercase tracking-wider">
             <div className="flex items-center gap-1.5">
                <kbd className="bg-[var(--surface-1)] border border-[color:var(--card-border)] text-[color:var(--text-secondary)] px-1.5 py-0.5 rounded shadow-sm">ESC</kbd>
                <span>Close</span>
             </div>
             <div className="w-px h-3 bg-zinc-200" />
             <div className="flex items-center gap-1.5">
                <kbd className="bg-[var(--surface-1)] border border-[color:var(--card-border)] text-[color:var(--text-secondary)] px-1.5 py-0.5 rounded shadow-sm">⌘K</kbd>
                <span>Search</span>
             </div>
          </div>
          <div className="text-[color:var(--text-muted)] font-bold uppercase tracking-[0.2em] text-[9px]">
             Sirigirvel System
          </div>
        </div>
      </div>
      
      <style jsx>{`
        .custom-scrollbar::-webkit-scrollbar { width: 5px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: var(--card-border); border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: var(--text-muted); }
      `}</style>
    </div>
  );
}
