"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, 
  Car, 
  ClipboardList,
  Package, 
  FileText, 
  FileSignature,
  Briefcase,
  BookOpen, 
  CreditCard,
  Building2,
  Users,
  Search,
  History,
  ScrollText,
  LogOut,
  X
} from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";

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

const NAV_SECTIONS = [
  {
    title: "Main",
    items: [
      { label: "Dashboard", icon: LayoutDashboard, href: "/dashboard", accessKey: "dashboard" as const },
      { label: "Car ID", icon: Car, href: "/vehicles", accessKey: "vehicles" as const },
      { label: "Enquire", icon: ClipboardList, href: "/enquiries", accessKey: "enquiries" as const },
    ]
  },
  {
    title: "Inventory",
    items: [
      { label: "Spare Parts", icon: Package, href: "/inventory", accessKey: "inventory" as const },
      { label: "Spare Orders", icon: History, href: "/orders", accessKey: "inventory" as const },
      { label: "Price Search", icon: Search, href: "/search", accessKey: "inventory" as const },
    ]
  },
  {
    title: "Billing",
    items: [
      { label: "Invoices", icon: FileText, href: "/billing", accessKey: "billing" as const },
      { label: "Estimate", icon: FileSignature, href: "/quotations", accessKey: "estimates" as const },
    ]
  },
  {
    title: "Accounts",
    items: [
        { label: "Day Book", icon: BookOpen, href: "/daybook", accessKey: "daybook" as const },
        { label: "Day Book Logs", icon: ScrollText, href: "/daybook/history", accessKey: "daybook" as const },
        { label: "Accounts", icon: CreditCard, href: "/accounts", accessKey: "accounts" as const },
        { label: "Vendors", icon: Building2, href: "/accounts/vendors", accessKey: "accounts" as const },
        { label: "Employees", icon: Users, href: "/accounts/employees", accessKey: "accounts" as const },
        { label: "Jobs", icon: Briefcase, href: "/accounts/jobs", accessKey: "accounts" as const },
    ]
  },
];

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export function Sidebar({ isOpen, onClose }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();

  const [userMetadata, setUserMetadata] = React.useState({ username: "Admin" });
  const [userAccess, setUserAccess] = React.useState<AccessMap>(DEFAULT_ACCESS);
  const [userRole, setUserRole] = React.useState<AppRole>("owner");
  const [accessLoaded, setAccessLoaded] = React.useState(false);

  React.useEffect(() => {
    const fetchUser = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user?.user_metadata?.username) {
          setUserMetadata({ username: user.user_metadata.username });
        }

        if (!user?.id) return;
        const { data: profile } = await supabase
          .from("profiles")
          .select("role, access, is_active")
          .eq("id", user.id)
          .maybeSingle();

        const role = (profile?.role || "owner") as AppRole;
        setUserRole(role);
        setUserAccess(resolveAccessForRole(role, (profile?.access || {}) as Partial<AccessMap>));
      } finally {
        setAccessLoaded(true);
      }
    };
    void fetchUser();
  }, []);

  const handleLogout = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (!error) {
        router.push("/");
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <>
      <button
        type="button"
        aria-label="Close sidebar"
        onClick={onClose}
        className={cn(
          "fixed inset-0 z-[95] bg-slate-950/45 backdrop-blur-sm transition-opacity xl:hidden",
          isOpen ? "opacity-100" : "pointer-events-none opacity-0"
        )}
      />
      <aside
        className={cn(
          "fixed left-0 top-0 bottom-0 z-[100] flex w-[260px] max-w-[88vw] flex-col overflow-hidden border-r border-[color:var(--sidebar-border)] bg-[var(--sidebar-bg)] transition-transform duration-300 sm:w-[280px] xl:w-[230px] xl:max-w-none xl:translate-x-0",
          isOpen ? "translate-x-0" : "-translate-x-full xl:translate-x-0"
        )}
      >
      {/* Brand */}
      <div className="p-[20px_18px_16px] border-b border-[color:var(--sidebar-border)]">
        <div className="flex items-start justify-between gap-3 animate-in zoom-in duration-700">
          <Link href="/dashboard" onClick={onClose} className="flex flex-col gap-0.5 transition-opacity hover:opacity-80">
              <span className="text-[13px] sm:text-[14px] font-bold text-white tracking-tight leading-tight">Sirigirvel</span>
              <span className="text-[9px] sm:text-[10px] text-white/30 tracking-[0.1em] uppercase font-medium mt-0.5">Workshop Management</span>
          </Link>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-white/40 transition hover:bg-white/5 hover:text-white xl:hidden"
            aria-label="Close menu"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto pt-3">
        {NAV_SECTIONS.map((section) => (
          <div key={section.title} className="mb-3">
            <div className="text-[9px] sm:text-[10px] font-semibold text-white/20 uppercase tracking-[0.1em] px-[16px] sm:px-[18px] py-[10px]">
              {section.title}
            </div>
            {section.items
              .filter((item) => {
                if (!accessLoaded) return false;
                if (item.label === "Jobs") {
                  return ["owner", "admin", "manager"].includes(userRole);
                }
                return userAccess[item.accessKey];
              })
              .map((item) => {
              const isActive = pathname === item.href;
              
              const handleClick = (e: React.MouseEvent) => {
                if (item.label === "Price Search") {
                  e.preventDefault();
                  window.dispatchEvent(new CustomEvent("open-price-search"));
                  onClose();
                  return;
                }

                onClose();
              };

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={handleClick}
                  className={cn(
                    "flex items-center gap-2.5 px-[16px] sm:px-[18px] py-[8px] sm:py-[9px] text-[12px] sm:text-[13px] border-l-2 transition-all duration-200 group relative",
                    isActive 
                      ? "text-indigo-400 bg-indigo-500/10 border-indigo-500 font-medium" 
                      : "text-white/45 border-transparent hover:text-white/80 hover:bg-white/5"
                  )}
                >
                  <item.icon className={cn(
                    "w-[14px] h-[14px] sm:w-[15px] sm:h-[15px] shrink-0",
                    isActive ? "opacity-100" : "opacity-70 group-hover:opacity-100"
                  )} />
                  {item.label}
                  {item.label === "Price Search" && (
                    <div className="ml-auto text-[9px] font-mono opacity-30 group-hover:opacity-60 transition-opacity">
                       ⌘K
                    </div>
                  )}
                  {isActive && <div className="absolute right-0 w-1.5 h-1.5 rounded-full bg-indigo-500/30 blur-sm pr-2" />}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="p-[14px_18px] border-t border-[color:var(--sidebar-border)] bg-black/10">
        <div className="flex items-center justify-between group/footer">
          <Link href="/profile" onClick={onClose} className="flex items-center gap-2.5 overflow-hidden group/prof cursor-pointer">
            <div className="w-[28px] h-[28px] sm:w-[30px] sm:h-[30px] rounded-full bg-indigo-600 flex items-center justify-center text-[10px] sm:text-[11px] font-bold text-white font-sans shrink-0 border border-white/10 shadow-lg shadow-indigo-500/10 group-hover/prof:scale-110 transition-transform">
              {userMetadata.username.charAt(0).toUpperCase()}
            </div>
            <div className="overflow-hidden">
              <div className="text-[11px] sm:text-[12px] font-semibold text-white/70 truncate tracking-tight group-hover/prof:text-white transition-colors">
                {userMetadata.username}
              </div>
            </div>
          </Link>
          <button 
            onClick={handleLogout}
            className="p-1.5 rounded-lg text-zinc-500 hover:text-white hover:bg-white/5 transition-all opacity-40 group-hover/footer:opacity-100"
            title="Logout"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </aside>
    </>
  );
}
