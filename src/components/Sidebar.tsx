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
  BookOpen, 
  CreditCard,
  Search,
  History,
  LogOut,
  ScrollText,
  X
} from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";

const NAV_SECTIONS = [
  {
    title: "Main",
    items: [
      { label: "Dashboard", icon: LayoutDashboard, href: "/dashboard" },
      { label: "Car ID", icon: Car, href: "/vehicles" },
      { label: "Enquiry", icon: ClipboardList, href: "/enquiries" },
    ]
  },
  {
    title: "Inventory",
    items: [
      { label: "Spare Parts", icon: Package, href: "/inventory" },
      { label: "Spare Orders", icon: History, href: "/orders" },
      { label: "Price Search", icon: Search, href: "/search" },
    ]
  },
  {
    title: "Billing",
    items: [
      { label: "Invoices", icon: FileText, href: "/billing" },
      { label: "Quotation", icon: FileSignature, href: "/quotations" },
    ]
  },
  {
    title: "Accounts",
    items: [
        { label: "Day Book", icon: BookOpen, href: "/daybook" },
        { label: "Accounts", icon: CreditCard, href: "/accounts" },
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

  React.useEffect(() => {
    const fetchUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.user_metadata?.username) {
        setUserMetadata({ username: user.user_metadata.username });
      }
    };
    fetchUser();
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
          "fixed left-0 top-0 bottom-0 z-[100] flex w-[280px] max-w-[86vw] flex-col overflow-hidden border-r border-white/5 bg-[#0f0f1a] transition-transform duration-300 xl:w-[220px] xl:max-w-none xl:translate-x-0",
          isOpen ? "translate-x-0" : "-translate-x-full xl:translate-x-0"
        )}
      >
      {/* Brand */}
      <div className="p-[20px_18px_16px] border-b border-white/5">
        <div className="flex items-start justify-between gap-3 animate-in zoom-in duration-700">
          <div>
          <div className="text-[14px] font-semibold text-white tracking-tight leading-tight">Sirigirvel</div>
          <div className="text-[9px] text-white/30 tracking-[0.1em] uppercase font-medium mt-0.5">Workshop Management</div>
          </div>
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
            <div className="text-[9px] font-semibold text-white/20 uppercase tracking-[0.1em] px-[18px] py-[10px]">
              {section.title}
            </div>
            {section.items.map((item) => {
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
                    "flex items-center gap-2.5 px-[18px] py-[9px] text-[13px] border-l-2 transition-all duration-200 group relative",
                    isActive 
                      ? "text-indigo-400 bg-indigo-500/10 border-indigo-500 font-medium" 
                      : "text-white/45 border-transparent hover:text-white/80 hover:bg-white/5"
                  )}
                >
                  <item.icon className={cn(
                    "w-[15px] h-[15px] shrink-0",
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
      <div className="p-[14px_18px] border-t border-white/5 bg-black/10">
        <div className="flex items-center justify-between group/footer">
          <Link href="/profile" onClick={onClose} className="flex items-center gap-2.5 overflow-hidden group/prof cursor-pointer">
            <div className="w-[30px] h-[30px] rounded-full bg-indigo-600 flex items-center justify-center text-[11px] font-bold text-white font-sans shrink-0 border border-white/10 shadow-lg shadow-indigo-500/10 group-hover/prof:scale-110 transition-transform">
              {userMetadata.username.charAt(0).toUpperCase()}
            </div>
            <div className="overflow-hidden">
              <div className="text-[12px] font-semibold text-white/70 truncate tracking-tight group-hover/prof:text-white transition-colors">
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
