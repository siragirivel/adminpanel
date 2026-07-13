"use client";

import React, { useEffect, useRef, useState } from "react";
import { Sidebar } from "@/components/Sidebar";
import { Navbar } from "@/components/Navbar";
import { PriceSearch } from "@/components/PriceSearch";
import { supabase } from "@/lib/supabase";
import { usePathname, useRouter } from "next/navigation";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { WhatsNewPopup } from "@/components/WhatsNewPopup";

function NavProgress() {
  const pathname = usePathname();
  const prevRef = useRef(pathname);
  const [width, setWidth] = useState(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (prevRef.current === pathname) return;
    prevRef.current = pathname;
    setVisible(true);
    setWidth(0);
    const t1 = setTimeout(() => setWidth(75), 10);
    const t2 = setTimeout(() => setWidth(100), 250);
    const t3 = setTimeout(() => setVisible(false), 550);
    const t4 = setTimeout(() => setWidth(0), 600);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); clearTimeout(t4); };
  }, [pathname]);

  if (!visible && width === 0) return null;
  return (
    <div className="fixed top-0 left-0 right-0 z-[9999] h-[2px] pointer-events-none">
      <div
        className="h-full bg-indigo-500"
        style={{
          width: `${width}%`,
          opacity: visible ? 1 : 0,
          transition: "width 0.25s ease-out, opacity 0.15s ease-in",
        }}
      />
    </div>
  );
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
type AccessKey = keyof AccessMap;

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

const ACCESS_ROUTES: Array<{ prefix: string; key: AccessKey }> = [
  { prefix: "/dashboard", key: "dashboard" },
  { prefix: "/vehicles", key: "vehicles" },
  { prefix: "/enquiries", key: "enquiries" },
  { prefix: "/inventory", key: "inventory" },
  { prefix: "/orders", key: "inventory" },
  { prefix: "/search", key: "inventory" },
  { prefix: "/billing", key: "billing" },
  { prefix: "/quotations", key: "estimates" },
  { prefix: "/daybook", key: "daybook" },
  { prefix: "/accounts", key: "accounts" },
  { prefix: "/logs", key: "logs" },
  { prefix: "/profile", key: "settings" },
];

const FALLBACK_ROUTES: Array<{ path: string; key: AccessKey }> = [
  { path: "/dashboard", key: "dashboard" },
  { path: "/vehicles", key: "vehicles" },
  { path: "/enquiries", key: "enquiries" },
  { path: "/inventory", key: "inventory" },
  { path: "/billing", key: "billing" },
  { path: "/quotations", key: "estimates" },
  { path: "/daybook", key: "daybook" },
  { path: "/accounts", key: "accounts" },
  { path: "/logs", key: "logs" },
  { path: "/profile", key: "settings" },
];

function normalizeAccess(input?: Partial<AccessMap> | null): AccessMap {
  return {
    dashboard: Boolean(input?.dashboard ?? DEFAULT_ACCESS.dashboard),
    vehicles: Boolean(input?.vehicles ?? DEFAULT_ACCESS.vehicles),
    enquiries: Boolean(input?.enquiries ?? DEFAULT_ACCESS.enquiries),
    inventory: Boolean(input?.inventory ?? DEFAULT_ACCESS.inventory),
    billing: Boolean(input?.billing ?? DEFAULT_ACCESS.billing),
    estimates: Boolean(input?.estimates ?? DEFAULT_ACCESS.estimates),
    daybook: Boolean(input?.daybook ?? DEFAULT_ACCESS.daybook),
    accounts: Boolean(input?.accounts ?? DEFAULT_ACCESS.accounts),
    logs: Boolean(input?.logs ?? DEFAULT_ACCESS.logs),
    settings: Boolean(input?.settings ?? DEFAULT_ACCESS.settings),
  };
}

function resolveAccessForRole(role: AppRole, input?: Partial<AccessMap> | null): AccessMap {
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
  return normalizeAccess(input);
}

function getRequiredAccess(pathname: string): AccessKey | null {
  for (const route of ACCESS_ROUTES) {
    if (pathname === route.prefix || pathname.startsWith(`${route.prefix}/`)) {
      return route.key;
    }
  }
  return null;
}

export default function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const router = useRouter();
  const pathname = usePathname();
  const [loading, setLoading] = useState(true);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [userAccess, setUserAccess] = useState<AccessMap>(DEFAULT_ACCESS);
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          router.push("/");
        } else {
          const { data: profile } = await supabase
            .from("profiles")
            .select("role, access, is_active")
            .eq("id", session.user.id)
            .maybeSingle();

          const role = (profile?.role || "owner") as AppRole;
          setUserAccess(resolveAccessForRole(role, (profile?.access || {}) as Partial<AccessMap>));
          setIsActive(profile?.is_active !== false);
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
    if (loading) return;
    if (!isActive) {
      router.replace("/");
      return;
    }
    const requiredKey = getRequiredAccess(pathname);
    if (!requiredKey) return;
    if (userAccess[requiredKey]) return;

    const fallback = FALLBACK_ROUTES.find((item) => userAccess[item.key])?.path;
    if (fallback && fallback !== pathname) {
      router.replace(fallback);
      return;
    }
    router.replace("/");
  }, [isActive, loading, pathname, router, userAccess]);

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
      <div className="min-h-screen flex items-center justify-center bg-[var(--page-bg)]">
        <LoadingSpinner label="Securing Terminal Session..." />
      </div>
    );
  }

  const requiredKey = getRequiredAccess(pathname);
  const blocked = !isActive || (requiredKey !== null && !userAccess[requiredKey]);
  if (blocked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--page-bg)]">
        <LoadingSpinner label="Checking Access..." />
      </div>
    );
  }

  if (pathname.includes("/print")) {
    return (
      <div className="min-h-screen bg-white">
        {children}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--page-bg)]">
        <NavProgress />
        <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />
        <main className="min-h-screen transition-all duration-300 relative xl:ml-[230px]">
          <Navbar onMenuClick={() => setIsSidebarOpen((current) => !current)} />
          <div className="mx-auto w-full max-w-[1400px] px-3 py-4 sm:px-5 sm:py-6 lg:px-8 lg:py-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
            {children}
          </div>
        </main>
        <PriceSearch />
        <WhatsNewPopup />
        <div className="fixed bottom-4 right-4 z-50 pointer-events-none select-none">
          <div className="flex items-center gap-1.5 rounded-full px-3 py-1.5 shadow-sm app-card app-card-gloss">
            <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
            <span className="text-[9px] sm:text-[10px] font-semibold text-[var(--text-muted)] tracking-wide">
              Developed by <span className="text-indigo-500 font-bold">Yesp Studio</span>
            </span>
          </div>
        </div>
    </div>
  );
}
