"use client";

import React, { useState, useEffect } from "react";
import { Search, Bell, Calendar, Clock, Car, ArrowRight, BookOpen, Menu } from "lucide-react";
import { format } from "date-fns";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import Link from "next/link";
import Image from "next/image";
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

export function Navbar({ onMenuClick }: NavbarProps) {
  const [time, setTime] = useState(new Date());
  const pathname = usePathname();
  const router = useRouter();

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchVehicleResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [isNotificationOpen, setIsNotificationOpen] = useState(false);
  const [hasLowStock, setHasLowStock] = useState(false);
  const [userMetadata, setUserMetadata] = useState({ username: "Admin" });

  useEffect(() => {
    const fetchUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.user_metadata?.username) {
        setUserMetadata({ username: user.user_metadata.username });
      }
    };
    fetchUser();
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Check for low stock periodically or on mount
  useEffect(() => {
    const checkStock = async () => {
      try {
        const { data } = await supabase.from('spare_parts').select('stock, threshold');
        if (data) {
          const low = data.some(p => p.stock <= p.threshold);
          setHasLowStock(low);
        }
      } catch {}
    };
    checkStock();
  }, [pathname]); // Re-check on navigation

  // Live Global Search logic
  useEffect(() => {
    const searchVehicles = async () => {
      if (!searchQuery.trim()) {
        setSearchResults([]);
        setIsSearching(false);
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

  const getPageTitle = () => {
    const path = pathname.split("/").filter(Boolean)[0];
    if (!path) return "Dashboard";
    return path.charAt(0).toUpperCase() + path.slice(1).replace("-", " ");
  };

  const handleSelectResult = (carId: string) => {
    router.push(`/vehicles/${carId}`);
    setSearchQuery("");
    setShowResults(false);
  };

  return (
    <>
      <header className="h-[56px] bg-white border-b border-black/5 sticky top-0 z-50 px-6 flex items-center justify-between shadow-sm backdrop-blur-md bg-white/80">
        <div className="flex items-center gap-3 sm:gap-6">
          <button
            type="button"
            onClick={onMenuClick}
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-black/5 bg-zinc-50 text-zinc-600 transition hover:bg-zinc-100 xl:hidden"
            aria-label="Open menu"
          >
            <Menu className="h-4.5 w-4.5" />
          </button>
          <span className="text-[15px] font-bold text-slate-800 tracking-tight">{getPageTitle()}</span>
          <div className="hidden lg:flex items-center gap-1.5 text-[11px] text-zinc-400 font-mono bg-zinc-50 px-2.5 py-1 rounded-md border border-black/[0.03]">
            <Calendar className="w-3.5 h-3.5" />
            {format(time, "eee, dd MMM yyyy")}
            <span className="opacity-30 mx-1">|</span>
            <Clock className="w-3.5 h-3.5" />
            {format(time, "hh:mm:ss a")}
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-4 flex-1 justify-end min-w-0">
          {/* Global Navbar Search */}
          <div className="relative group hidden md:block max-w-[320px] w-full mr-0 lg:mr-4">
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 group-focus-within:text-indigo-500 transition-colors" />
              <input 
                type="text" 
                placeholder="Search registration or owner..." 
                className="bg-zinc-100/50 border border-transparent rounded-[12px] pl-10 pr-4 py-1.5 text-[12px] w-full focus:ring-4 focus:ring-indigo-500/5 focus:bg-white focus:border-indigo-100 transition-all outline-none font-medium"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setShowResults(true);
                }}
                onFocus={() => setShowResults(true)}
                onBlur={() => {
                  // Short delay to allow onMouseDown to fire
                  setTimeout(() => setShowResults(false), 200);
                }}
              />
              {isSearching && (
                <div className="absolute right-3.5 top-1/2 -translate-y-1/2">
                  <div className="w-3.5 h-3.5 border-2 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin" />
                </div>
              )}
            </div>

            {/* Search Dropdown Results */}
            {showResults && searchQuery.trim() && (
              <div className="absolute top-full mt-2 left-0 right-0 bg-white border border-slate-200 rounded-[18px] shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-1 duration-200 z-[100]">
                <div className="p-2 space-y-1">
                  {searchResults.length > 0 ? (
                    searchResults.map((res) => (
                      <button 
                        key={res.id}
                        onMouseDown={(e) => {
                          e.preventDefault(); // Prevent input onBlur from hiding dropdown
                          handleSelectResult(res.car_id);
                        }}
                        className="w-full text-left p-3 rounded-[12px] hover:bg-slate-50 flex items-center justify-between group/res transition-all border border-transparent hover:border-slate-100"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 bg-slate-50 rounded-full flex items-center justify-center text-slate-400 group-hover/res:bg-indigo-600 group-hover/res:text-white transition-all shadow-sm">
                            <Car className="w-4.5 h-4.5" />
                          </div>
                          <div>
                            <p className="text-sm font-bold text-slate-800 leading-tight">{res.vehicle_reg}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-[10px] text-slate-400 font-bold uppercase">{res.owner_name}</span>
                              <span className="w-1 h-1 bg-slate-200 rounded-full" />
                              <span className="text-[10px] text-slate-400 font-bold uppercase truncate max-w-[120px]">{res.make_model}</span>
                            </div>
                          </div>
                        </div>
                        <ArrowRight className="w-4 h-4 text-slate-200 group-hover/res:text-indigo-600 transition-all -translate-x-2 opacity-0 group-hover/res:translate-x-0 group-hover/res:opacity-100" />
                      </button>
                    ))
                  ) : !isSearching && (
                    <div className="p-8 text-center">
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-widest text-slate-300">No matching records found</p>
                    </div>
                  )}
                </div>
                <div className="bg-slate-50/50 p-2.5 border-t border-slate-100 flex justify-center">
                   <p className="text-[9px] font-black text-slate-300 uppercase tracking-[0.3em]">Vehicle Hub Records</p>
                </div>
              </div>
            )}
          </div>

          <Link
            href="/manual"
            className="inline-flex items-center gap-2 rounded-[12px] border border-indigo-100 bg-indigo-50 px-2.5 py-2 text-[11px] font-semibold text-indigo-600 transition hover:border-indigo-200 hover:bg-indigo-100 sm:px-3"
            title="Open user manual"
          >
            <BookOpen className="h-4 w-4" />
            <span className="hidden sm:inline">Manual</span>
            <span className="hidden lg:inline font-mono text-[10px] text-indigo-400">Ctrl+U</span>
          </Link>

          <button 
            onClick={() => setIsNotificationOpen(true)}
            className="p-2 rounded-full hover:bg-zinc-100 relative text-zinc-500 transition-colors"
          >
            <Bell className="w-4.5 h-4.5" />
            {hasLowStock && (
              <span className="absolute top-2.5 right-2.5 w-2 h-2 bg-red-500 border-2 border-white rounded-full animate-pulse"></span>
            )}
          </button>

          <div className="hidden sm:block h-4 w-px bg-zinc-200 mx-1"></div>

          <Link href="/profile" className="flex items-center gap-2.5 pl-1 group/navprof cursor-pointer">
            <div className="w-8 h-8 rounded-full bg-indigo-600 text-white flex items-center justify-center text-[12px] font-bold border-2 border-indigo-100 shadow-sm shadow-indigo-100 group-hover/navprof:scale-110 transition-transform">
              {userMetadata.username.charAt(0).toUpperCase()}
            </div>
          </Link>

          <div className="hidden lg:flex items-center justify-end pl-3 ml-1 border-l border-zinc-200/80">
            <Image
              src="/Siragiri.png"
              alt="Siragiri Vel Automobiles"
              width={240}
              height={64}
              className="h-10 w-auto object-contain opacity-95 xl:h-11"
              priority
            />
          </div>
        </div>
      </header>

      <NotificationDrawer 
        isOpen={isNotificationOpen} 
        onClose={() => setIsNotificationOpen(false)} 
      />
    </>
  );
}

// Separate component for Navbar state to avoid too many re-renders or just keep it simple
// I'll add the user fetch inside Navbar
