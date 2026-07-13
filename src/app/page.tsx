"use client";

import React from "react";
import Link from "next/link";
import Image from "next/image";
import { Mail, Lock, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { toast } from "react-hot-toast";

type AccessMap = {
  dashboard?: boolean;
  vehicles?: boolean;
  enquiries?: boolean;
  inventory?: boolean;
  billing?: boolean;
  estimates?: boolean;
  daybook?: boolean;
  accounts?: boolean;
  logs?: boolean;
  settings?: boolean;
};

type AppRole = "owner" | "admin" | "manager" | "staff";

const LANDING_PRIORITY: Array<{ path: string; key: keyof AccessMap }> = [
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

function resolveLandingPath(role?: AppRole | null, access?: AccessMap | null): string | null {
  if (role === "owner") {
    return "/dashboard";
  }
  const next = LANDING_PRIORITY.find((item) => Boolean(access?.[item.key]));
  return next?.path ?? null;
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    const checkUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { data: profile } = await supabase
        .from("profiles")
        .select("role, access, is_active")
        .eq("id", session.user.id)
        .maybeSingle();

      if (profile?.is_active === false) {
        setError("Your account is inactive. Please contact admin.");
        return;
      }

      const target = resolveLandingPath(
        (profile?.role || "owner") as AppRole,
        (profile?.access || {}) as AccessMap,
      );
      if (target) {
        router.push(target);
      } else {
        setError("No module access assigned for this account. Please contact admin.");
      }
    };
    checkUser();
  }, [router]);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError("Please enter both email and password.");
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        setError(error.message);
        return;
      }

      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData.session?.user?.id;

      if (!userId) {
        setError("Signed in, but user session could not be loaded. Please retry.");
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("role, access, is_active")
        .eq("id", userId)
        .maybeSingle();

      if (profile?.is_active === false) {
        await supabase.auth.signOut();
        setError("Your account is inactive. Please contact admin.");
        return;
      }

      const target = resolveLandingPath(
        (profile?.role || "owner") as AppRole,
        (profile?.access || {}) as AccessMap,
      );
      if (!target) {
        await supabase.auth.signOut();
        setError("No module access assigned for this account. Please contact admin.");
        return;
      }

      toast.success("Welcome back!");
      router.push(target);
      router.refresh();
    } catch {
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <div className="min-h-screen bg-[var(--page-bg)] flex items-center justify-center p-4 sm:p-6">
        <div className="w-full max-w-md rounded-2xl p-6 sm:p-8 space-y-7 sm:space-y-8 animate-in fade-in zoom-in-95 duration-500 app-card app-card-gloss">
          <div className="text-center space-y-3">
            <div className="flex justify-center mb-2">
              <Image
                src="/Siragiri.png"
                alt="Siragirvel"
                width={280}
                height={80}
                className="h-12 sm:h-14 w-auto object-contain"
                priority
              />
            </div>
            <h1 className="sr-only">Sirigirvel</h1>
            <p className="text-[color:var(--text-secondary)] text-[12px] sm:text-sm">Sign in to your workshop account</p>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-100 text-red-600 px-4 py-3 rounded-xl text-[12px] sm:text-sm font-medium animate-in shake duration-500">
              {error}
            </div>
          )}

          <form onSubmit={handleSignIn} className="space-y-5 sm:space-y-6">
            <div className="space-y-2">
              <label className="text-[12px] sm:text-sm font-semibold text-[color:var(--text-secondary)] pl-1" htmlFor="email">
                Email Address
              </label>
              <div className="relative group">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-[color:var(--text-muted)] group-focus-within:text-indigo-600 transition-colors" />
                <input
                  id="email"
                  type="email"
                  placeholder="admin@sirigirvel.com"
                  className="w-full h-11 sm:h-12 bg-[var(--surface-2)] border-none rounded-xl pl-12 pr-4 text-[13px] sm:text-[15px] outline-none ring-2 ring-transparent focus:ring-indigo-600/20 focus:bg-[var(--surface-1)] transition-all shadow-sm text-[color:var(--text-primary)] placeholder:text-[color:var(--text-muted)]"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between pl-1">
                <label className="text-[12px] sm:text-sm font-semibold text-[color:var(--text-secondary)]" htmlFor="password">
                  Password
                </label>
                <Link
                  href="/forgot-password"
                  className="text-[11px] sm:text-xs font-semibold text-indigo-600 hover:text-indigo-700 transition-colors"
                >
                  Forgot password?
                </Link>
              </div>
              <div className="relative group">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-[color:var(--text-muted)] group-focus-within:text-indigo-600 transition-colors" />
                <input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  className="w-full h-11 sm:h-12 bg-[var(--surface-2)] border-none rounded-xl pl-12 pr-4 text-[13px] sm:text-[15px] outline-none ring-2 ring-transparent focus:ring-indigo-600/20 focus:bg-[var(--surface-1)] transition-all shadow-sm text-[color:var(--text-primary)] placeholder:text-[color:var(--text-muted)]"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full h-11 sm:h-12 bg-indigo-600 text-white rounded-xl font-bold text-[13px] sm:text-[15px] hover:bg-indigo-700 active:scale-[0.98] transition-all shadow-lg shadow-indigo-600/20 disabled:opacity-70 flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                "Sign In"
              )}
            </button>
          </form>

          <div className="pt-4 text-center">
            <p className="text-[11px] sm:text-sm text-[color:var(--text-secondary)]">© 2026 Sirigirvel Workshop Management</p>
          </div>
        </div>
      </div>

      {/* Yesp Studio Watermark */}
      <div className="fixed bottom-4 right-4 z-50 pointer-events-none select-none">
        <div className="flex items-center gap-1.5 rounded-full px-3 py-1.5 shadow-sm app-card app-card-gloss">
          <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
          <span className="text-[9px] sm:text-[10px] font-semibold text-[color:var(--text-muted)] tracking-wide">
            Developed by <span className="text-indigo-500 font-bold">Yesp Studio</span>
          </span>
        </div>
      </div>
    </>
  );
}
