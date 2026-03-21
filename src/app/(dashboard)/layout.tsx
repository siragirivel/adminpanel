"use client";

import React, { useEffect, useState } from "react";
import { Sidebar } from "@/components/Sidebar";
import { Navbar } from "@/components/Navbar";
import { PriceSearch } from "@/components/PriceSearch";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { GlobalManualShortcut } from "@/components/GlobalManualShortcut";
import { WhatsNewPopup } from "@/components/WhatsNewPopup";

export default function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          router.push("/");
        } else {
          setLoading(false);
        }
      } catch {
        router.push("/");
      }
    };

    checkAuth();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' || !session) {
        router.push("/");
      }
    });

    return () => subscription.unsubscribe();
  }, [router]);

  useEffect(() => {
    const handleGlobalShortcuts = (e: KeyboardEvent) => {
      const isCmdOrCtrl = e.metaKey || e.ctrlKey;
      
      if (isCmdOrCtrl && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        router.push("/quotations/new");
      } else if (isCmdOrCtrl && e.key.toLowerCase() === 'm') {
        e.preventDefault();
        router.push("/billing/new");
      } else if (isCmdOrCtrl && e.key.toLowerCase() === 'e') {
        e.preventDefault();
        router.push("/enquiries/add-new");
      }
    };

    window.addEventListener('keydown', handleGlobalShortcuts);
    return () => window.removeEventListener('keydown', handleGlobalShortcuts);
  }, [router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50">
        <LoadingSpinner label="Securing Terminal Session..." />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50/30">
        <GlobalManualShortcut />
        <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />
        <main className="min-h-screen transition-all duration-300 relative xl:ml-[220px]">
          <Navbar onMenuClick={() => setIsSidebarOpen((current) => !current)} />
          <div className="mx-auto px-4 py-5 sm:px-6 sm:py-6 lg:px-8 lg:py-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
            {children}
          </div>
        </main>
        <PriceSearch />
        <WhatsNewPopup />
        <div className="fixed bottom-4 right-4 z-50 pointer-events-none select-none">
          <div className="flex items-center gap-1.5 bg-white/60 backdrop-blur-sm border border-black/[0.05] rounded-full px-3 py-1.5 shadow-sm">
            <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
            <span className="text-[10px] font-semibold text-zinc-400 tracking-wide">Developed by <span className="text-indigo-500 font-bold">Yesp Studio</span></span>
          </div>
        </div>
    </div>
  );
}
