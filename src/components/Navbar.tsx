"use client";

import React, { useState, useEffect, useRef } from "react";
import { Search, Bell, Calendar, Clock, Car, ArrowRight, Menu, Calculator, Delete } from "lucide-react";
import { format } from "date-fns";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import Link from "next/link";
import { NotificationDrawer } from "./NotificationDrawer";

interface SearchVehicleResult {
  id: string;
  car_id: string;
  vehicle_reg: string;
  owner_name: string;
  make_model?: string | null;
}

interface NavbarProps {
  onMenuClick: () => void;
}

type AccessMap = {
  dashboard: boolean;
  vehicles: boolean;
  enquiries: boolean;
  inventory: boolean;
  billing: boolean;
  estimates: boolean;
  daybook: boolean;
  accounts: boolean;
  logs: boolean;
  settings: boolean;
};

type AppRole = "owner" | "admin" | "manager" | "staff";

const DEFAULT_ACCESS: AccessMap = {
  dashboard: false,
  vehicles: false,
  enquiries: false,
  inventory: false,
  billing: false,
  estimates: false,
  daybook: false,
  accounts: false,
  logs: false,
  settings: false,
};

function resolveAccessForRole(role: AppRole, access?: Partial<AccessMap> | null): AccessMap {
  if (role === "owner") {
    return {
      dashboard: true,
      vehicles: true,
      enquiries: true,
      inventory: true,
      billing: true,
      estimates: true,
      daybook: true,
      accounts: true,
      logs: true,
      settings: true,
    };
  }
  return {
    dashboard: Boolean(access?.dashboard ?? DEFAULT_ACCESS.dashboard),
    vehicles: Boolean(access?.vehicles ?? DEFAULT_ACCESS.vehicles),
    enquiries: Boolean(access?.enquiries ?? DEFAULT_ACCESS.enquiries),
    inventory: Boolean(access?.inventory ?? DEFAULT_ACCESS.inventory),
    billing: Boolean(access?.billing ?? DEFAULT_ACCESS.billing),
    estimates: Boolean(access?.estimates ?? DEFAULT_ACCESS.estimates),
    daybook: Boolean(access?.daybook ?? DEFAULT_ACCESS.daybook),
    accounts: Boolean(access?.accounts ?? DEFAULT_ACCESS.accounts),
    logs: Boolean(access?.logs ?? DEFAULT_ACCESS.logs),
    settings: Boolean(access?.settings ?? DEFAULT_ACCESS.settings),
  };
}

export function Navbar({ onMenuClick }: NavbarProps) {
  const [time, setTime] = useState(new Date());
  const pathname = usePathname();
  const router = useRouter();
  const [autoSaveStatus, setAutoSaveStatus] = useState<"idle" | "saving" | "saved">("idle");

  useEffect(() => {
    const handler = (e: Event) => {
      const status = (e as CustomEvent<{ status: "idle" | "saving" | "saved" }>).detail?.status;
      if (!status) return;
      setAutoSaveStatus(status);
    };
    window.addEventListener("sgv:autosave", handler);
    return () => window.removeEventListener("sgv:autosave", handler);
  }, []);

  // Auto-hide "saved" after 2s, and clear on navigation
  useEffect(() => {
    if (autoSaveStatus !== "saved") return;
    const t = setTimeout(() => setAutoSaveStatus("idle"), 2000);
    return () => clearTimeout(t);
  }, [autoSaveStatus]);

  useEffect(() => {
    setAutoSaveStatus("idle");
  }, [pathname]);

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchVehicleResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [activeResultIndex, setActiveResultIndex] = useState(-1);
  const resultsListRef = useRef<HTMLDivElement>(null);
  const [isNotificationOpen, setIsNotificationOpen] = useState(false);
  const [isCalculatorOpen, setIsCalculatorOpen] = useState(false);
  const [calculatorInput, setCalculatorInput] = useState("");
  const [calculatorResult, setCalculatorResult] = useState("0");
  const [hasLowStock, setHasLowStock] = useState(false);
  const [userMetadata, setUserMetadata] = useState({ username: "Admin" });
  const [userAccess, setUserAccess] = useState<AccessMap>(DEFAULT_ACCESS);

  useEffect(() => {
    const fetchUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.user_metadata?.username) {
        setUserMetadata({ username: user.user_metadata.username });
      }
      if (user?.id) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("role, access")
          .eq("id", user.id)
          .maybeSingle();
        const role = (profile?.role || "owner") as AppRole;
        setUserAccess(resolveAccessForRole(role, (profile?.access || {}) as Partial<AccessMap>));
      }
    };
    void fetchUser();
  }, [isCalculatorOpen]);

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Check for low stock periodically or on mount
  useEffect(() => {
    const checkStock = async () => {
      if (!userAccess.inventory) {
        setHasLowStock(false);
        return;
      }
      try {
        const { data } = await supabase.from('spare_parts').select('stock, threshold');
        if (data) {
          const low = data.some(p => p.stock <= p.threshold);
          setHasLowStock(low);
        }
      } catch {}
    };
    void checkStock();
  }, [pathname, userAccess.inventory]); // Re-check on navigation and access change

  // Live Global Search logic
  useEffect(() => {
    const searchVehicles = async () => {
      if (!searchQuery.trim()) {
        setSearchResults([]);
        setIsSearching(false);
        setActiveResultIndex(-1);
        return;
      }

      setIsSearching(true);
      try {
        const { data, error } = await supabase
          .from('vehicles')
          .select('id, car_id, vehicle_reg, owner_name, make_model')
          .or(`vehicle_reg.ilike.%${searchQuery}%,owner_name.ilike.%${searchQuery}%,car_id.ilike.%${searchQuery}%`)
          .limit(6);

        if (!error && data) {
          setSearchResults(data);
          setActiveResultIndex((current) => {
            if (!data.length) return -1;
            return current < 0 ? 0 : Math.min(current, data.length - 1);
          });
        }
      } catch (err) {
        console.error(err);
      } finally {
        setIsSearching(false);
      }
    };

    const debounceTimer = setTimeout(searchVehicles, 200);
    return () => clearTimeout(debounceTimer);
  }, [searchQuery]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "/") {
        event.preventDefault();
        setIsCalculatorOpen((current) => !current);
        return;
      }

      if (event.key === "Escape") {
        setIsCalculatorOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const evaluateCalculator = (input: string) => {
    const expression = input.trim();
    if (!expression) {
      setCalculatorResult("0");
      return;
    }

    if (!/^[\d+\-*/().%\s]+$/.test(expression)) {
      setCalculatorResult("Invalid");
      return;
    }

    try {
      const value = Function(`"use strict"; return (${expression})`)();
      if (typeof value !== "number" || !Number.isFinite(value)) {
        setCalculatorResult("Invalid");
        return;
      }
      setCalculatorResult(value.toLocaleString("en-IN", { maximumFractionDigits: 2 }));
    } catch {
      setCalculatorResult("Invalid");
    }
  };

  const appendCalculatorValue = (value: string) => {
    const next = `${calculatorInput}${value}`;
    setCalculatorInput(next);
    evaluateCalculator(next);
  };

  const backspaceCalculator = () => {
    const next = calculatorInput.slice(0, -1);
    setCalculatorInput(next);
    evaluateCalculator(next);
  };

  const clearCalculator = () => {
    setCalculatorInput("");
    setCalculatorResult("0");
  };

  const getPageTitle = () => {
    const path = pathname.split("/").filter(Boolean)[0];
    if (!path) return "Dashboard";
    return path.charAt(0).toUpperCase() + path.slice(1).replace("-", " ");
  };

  const handleSelectResult = (carId: string) => {
    router.push(`/vehicles/${carId}`);
    setSearchQuery("");
    setShowResults(false);
    setActiveResultIndex(-1);
  };

  const handleSearchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    const hasResults = searchResults.length > 0;
    if (event.key === "ArrowDown") {
      if (!showResults) setShowResults(true);
      if (!hasResults) return;
      event.preventDefault();
      setActiveResultIndex((current) =>
        current < 0 ? 0 : Math.min(current + 1, searchResults.length - 1)
      );
      return;
    }
    if (event.key === "ArrowUp") {
      if (!showResults) setShowResults(true);
      if (!hasResults) return;
      event.preventDefault();
      setActiveResultIndex((current) =>
        current < 0 ? searchResults.length - 1 : Math.max(current - 1, 0)
      );
      return;
    }
    if (event.key === "Enter" && showResults && hasResults) {
      event.preventDefault();
      const index = activeResultIndex >= 0 ? activeResultIndex : 0;
      const selected = searchResults[index];
      if (selected) handleSelectResult(selected.car_id);
      return;
    }
    if (event.key === "Escape") {
      setShowResults(false);
      setActiveResultIndex(-1);
    }
  };

  useEffect(() => {
    if (!showResults || activeResultIndex < 0) return;
    const activeItem = resultsListRef.current?.querySelector(
      `[data-result-index="${activeResultIndex}"]`
    );
    if (activeItem instanceof HTMLElement) {
      activeItem.scrollIntoView({ block: "nearest" });
    }
  }, [activeResultIndex, showResults]);

  useEffect(() => {
    if (!showResults) {
      setActiveResultIndex(-1);
    }
  }, [showResults]);

  return (
    <>
      <header className="h-14 sm:h-16 bg-[var(--surface-1)] border-b border-[color:var(--card-border)] sticky top-0 z-50 px-4 sm:px-6 flex items-center justify-between shadow-sm backdrop-blur-md">
        <div className="flex items-center gap-3 sm:gap-6">
          <button
            type="button"
            onClick={onMenuClick}
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[color:var(--card-border)] bg-[var(--surface-2)] text-[color:var(--text-secondary)] transition hover:bg-[var(--surface-3)] hover:text-[color:var(--text-primary)] xl:hidden sm:h-10 sm:w-10"
            aria-label="Open menu"
          >
            <Menu className="h-4.5 w-4.5" />
          </button>
          <span className="text-[13px] sm:text-[15px] font-bold text-[color:var(--text-primary)] tracking-tight">{getPageTitle()}</span>
          {autoSaveStatus !== "idle" && (
            <div className={`hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-[10px] font-semibold transition-all duration-300 ${
              autoSaveStatus === "saving"
                ? "border-amber-200 bg-amber-50 text-amber-600"
                : "border-emerald-200 bg-emerald-50 text-emerald-600"
            }`}>
              {autoSaveStatus === "saving" ? (
                <>
                  <div className="w-2.5 h-2.5 border-2 border-amber-400/40 border-t-amber-500 rounded-full animate-spin" />
                  Saving draft…
                </>
              ) : (
                <>
                  <svg className="w-3 h-3" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  Draft saved
                </>
              )}
            </div>
          )}
          <div className="hidden lg:flex items-center gap-1.5 text-[10px] sm:text-[11px] text-[color:var(--text-muted)] font-mono bg-[var(--surface-2)] px-2.5 py-1 rounded-md border border-[color:var(--card-border)]">
            <Calendar className="w-3.5 h-3.5" />
            {format(time, "eee, dd MMM yyyy")}
            <span className="opacity-30 mx-1">|</span>
            <Clock className="w-3.5 h-3.5" />
            {format(time, "hh:mm:ss a")}
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-4 flex-1 justify-end min-w-0">
          <div className="relative">
            <button
              type="button"
              onClick={() => setIsCalculatorOpen((current) => !current)}
              className="relative w-9 h-9 rounded-xl border border-[color:var(--card-border)] bg-[var(--surface-2)] text-[color:var(--text-secondary)] hover:bg-[var(--surface-3)] hover:text-[color:var(--text-primary)] transition-all flex items-center justify-center"
              aria-label="Open calculator"
              title="Calculator (Ctrl+/ or Cmd+/)"
            >
              <Calculator className="w-4 h-4" />
            </button>

            {isCalculatorOpen ? (
              <div className="absolute right-0 top-full mt-2 w-[280px] rounded-[20px] border border-[color:var(--card-border)] bg-[var(--surface-1)] p-4 shadow-2xl z-[120] animate-in fade-in slide-in-from-top-1 duration-200">
                <div className="mb-3">
                  <div className="flex items-center justify-between text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-[color:var(--text-muted)]">
                    <span>Calculator</span>
                    <span className="rounded-full border border-[color:var(--card-border)] px-2 py-0.5 text-[10px] text-[color:var(--text-secondary)] normal-case tracking-normal">
                      Ctrl+/ or Cmd+/
                    </span>
                  </div>
                  <div className="mt-2 rounded-2xl border border-[color:var(--card-border)] bg-[var(--surface-2)] px-3 py-3">
                    <input
                      type="text"
                      inputMode="decimal"
                      placeholder="Type 1250+18*3"
                      className="w-full bg-transparent text-right text-[15px] sm:text-[16px] font-semibold text-[color:var(--text-primary)] outline-none"
                      value={calculatorInput}
                      onChange={(e) => {
                        setCalculatorInput(e.target.value);
                        evaluateCalculator(e.target.value);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          evaluateCalculator(calculatorInput);
                        }
                      }}
                      autoFocus
                    />
                    <div className="mt-2 text-right text-[22px] sm:text-[24px] font-bold tracking-tight text-indigo-700">
                      {calculatorResult}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-2">
                  {["7", "8", "9", "/","4", "5", "6", "*","1", "2", "3", "-","0", ".", "%", "+"].map((key) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => appendCalculatorValue(key)}
                      className="h-11 rounded-xl border border-[color:var(--card-border)] bg-[var(--surface-1)] text-[13px] sm:text-[14px] font-semibold text-[color:var(--text-secondary)] transition hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700"
                    >
                      {key}
                    </button>
                  ))}
                </div>

                <div className="mt-3 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={clearCalculator}
                    className="flex-1 h-11 rounded-xl border border-[color:var(--card-border)] bg-[var(--surface-2)] text-[12px] sm:text-[13px] font-semibold text-[color:var(--text-secondary)] transition hover:bg-[var(--surface-3)]"
                  >
                    Clear
                  </button>
                  <button
                    type="button"
                    onClick={backspaceCalculator}
                    className="w-11 h-11 rounded-xl border border-[color:var(--card-border)] bg-[var(--surface-2)] text-[color:var(--text-secondary)] transition hover:bg-[var(--surface-3)] flex items-center justify-center"
                    aria-label="Delete last character"
                  >
                    <Delete className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ) : null}
          </div>

          {/* Global Navbar Search */}
          <div className="relative group hidden md:block max-w-[320px] w-full mr-0 lg:mr-4">
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[color:var(--text-muted)] group-focus-within:text-indigo-500 transition-colors" />
              <input 
                type="text" 
                placeholder="Search registration or owner..." 
                className="bg-[var(--surface-2)] border border-transparent rounded-[12px] pl-10 pr-4 py-1.5 text-[11px] sm:text-[12px] w-full focus:ring-4 focus:ring-indigo-500/5 focus:bg-[var(--surface-1)] focus:border-indigo-100 transition-all outline-none font-medium text-[color:var(--text-primary)] placeholder:text-[color:var(--text-muted)]"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setShowResults(true);
                  setActiveResultIndex(-1);
                }}
                onFocus={() => setShowResults(true)}
                onKeyDown={handleSearchKeyDown}
                onBlur={() => {
                  // Short delay to allow onMouseDown to fire
                  setTimeout(() => setShowResults(false), 200);
                }}
                autoComplete="off"
                aria-controls="navbar-search-results"
                aria-activedescendant={
                  showResults && activeResultIndex >= 0
                    ? `navbar-search-result-${activeResultIndex}`
                    : undefined
                }
              />
              {isSearching && (
                <div className="absolute right-3.5 top-1/2 -translate-y-1/2">
                  <div className="w-3.5 h-3.5 border-2 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin" />
                </div>
              )}
            </div>

            {/* Search Dropdown Results */}
            {showResults && searchQuery.trim() && (
              <div
                id="navbar-search-results"
                role="listbox"
                className="absolute top-full mt-2 left-0 right-0 bg-[var(--surface-1)] border border-[color:var(--card-border)] rounded-[18px] shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-1 duration-200 z-[100]"
              >
                <div ref={resultsListRef} className="p-2 space-y-1 max-h-[260px] overflow-y-auto">
                  {searchResults.length > 0 ? (
                    searchResults.map((res, index) => (
                      <button 
                        key={res.id}
                        id={`navbar-search-result-${index}`}
                        data-result-index={index}
                        onMouseDown={(e) => {
                          e.preventDefault(); // Prevent input onBlur from hiding dropdown
                          handleSelectResult(res.car_id);
                        }}
                        className={`w-full text-left p-3 rounded-[12px] flex items-center justify-between group/res transition-all border ${
                          index === activeResultIndex
                            ? "bg-[var(--surface-2)] border-[color:var(--card-border)]"
                            : "border-transparent hover:border-[color:var(--card-border)] hover:bg-[var(--surface-2)]"
                        }`}
                        aria-selected={index === activeResultIndex}
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 bg-[var(--surface-2)] rounded-full flex items-center justify-center text-[color:var(--text-muted)] group-hover/res:bg-indigo-600 group-hover/res:text-white transition-all shadow-sm">
                            <Car className="w-4.5 h-4.5" />
                          </div>
                          <div>
                            <p className="text-sm font-bold text-[color:var(--text-primary)] leading-tight">{res.vehicle_reg}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-[9px] sm:text-[10px] text-[color:var(--text-muted)] font-bold uppercase">{res.owner_name}</span>
                              <span className="w-1 h-1 bg-[color:var(--card-border)] rounded-full" />
                              <span className="text-[9px] sm:text-[10px] text-[color:var(--text-muted)] font-bold uppercase truncate max-w-[120px]">{res.make_model}</span>
                            </div>
                          </div>
                        </div>
                        <ArrowRight className="w-4 h-4 text-[color:var(--text-muted)] group-hover/res:text-indigo-600 transition-all -translate-x-2 opacity-0 group-hover/res:translate-x-0 group-hover/res:opacity-100" />
                      </button>
                    ))
                  ) : !isSearching && (
                    <div className="p-8 text-center">
                      <p className="text-xs font-bold text-[color:var(--text-muted)] uppercase tracking-widest">No matching records found</p>
                    </div>
                  )}
                </div>
                <div className="bg-[var(--surface-2)] p-2.5 border-t border-[color:var(--card-border)] flex justify-center">
                   <p className="text-[9px] font-black text-[color:var(--text-muted)] uppercase tracking-[0.3em]">Vehicle Hub Records</p>
                </div>
              </div>
            )}
          </div>

          <button 
            onClick={() => setIsNotificationOpen(true)}
            className="p-2 rounded-full hover:bg-[var(--surface-2)] relative text-[color:var(--text-secondary)] transition-colors"
          >
            <Bell className="w-4.5 h-4.5" />
            {hasLowStock && (
              <span className="absolute top-2.5 right-2.5 w-2 h-2 bg-red-500 border-2 border-white rounded-full animate-pulse"></span>
            )}
          </button>

          <div className="hidden sm:block h-4 w-px bg-[color:var(--card-border)] mx-1"></div>

          <Link href="/profile" className="flex items-center gap-2.5 pl-1 group/navprof cursor-pointer">
            <div className="w-8 h-8 rounded-full bg-indigo-600 text-white flex items-center justify-center text-[12px] font-bold border-2 border-indigo-100 shadow-sm shadow-indigo-100 group-hover/navprof:scale-110 transition-transform">
              {userMetadata.username.charAt(0).toUpperCase()}
            </div>
          </Link>

          <div className="flex items-center justify-end pl-3 ml-1 border-l border-[color:var(--card-border)] shrink-0">
            <img
              src="/Siragiri.png"
              alt="Siragiri Vel Automobiles"
              className="h-8 sm:h-9 w-auto object-contain opacity-90 xl:h-11"
              loading="eager"
              decoding="async"
            />
          </div>
        </div>
      </header>

      <NotificationDrawer 
        isOpen={isNotificationOpen} 
        onClose={() => setIsNotificationOpen(false)} 
        userAccess={userAccess}
      />
    </>
  );
}

// Separate component for Navbar state to avoid too many re-renders or just keep it simple
// I'll add the user fetch inside Navbar
