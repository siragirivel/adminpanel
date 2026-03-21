"use client";

import React from "react";
import Link from "next/link";
import Image from "next/image";
import { Mail, Lock, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { toast } from "react-hot-toast";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    const checkUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        router.push("/dashboard");
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

      toast.success("Welcome back!");
      router.push("/dashboard");
      router.refresh();
    } catch {
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <div className="min-h-screen bg-zinc-50 flex items-center justify-center p-6">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-xl shadow-black/5 border border-zinc-200 p-8 space-y-8 animate-in fade-in zoom-in-95 duration-500">
          <div className="text-center space-y-3">
            <div className="flex justify-center mb-2">
              <Image
                src="/Siragiri.png"
                alt="Siragirvel"
                width={64}
                height={64}
                className="w-16 h-16 object-contain rounded-2xl shadow-md"
              />
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-zinc-900 leading-tight">Sirigirvel</h1>
            <p className="text-zinc-500 text-sm">Sign in to your workshop account</p>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-100 text-red-600 px-4 py-3 rounded-xl text-sm font-medium animate-in shake duration-500">
              {error}
            </div>
          )}

          <form onSubmit={handleSignIn} className="space-y-6">
            <div className="space-y-2">
              <label className="text-sm font-semibold text-zinc-700 pl-1" htmlFor="email">
                Email Address
              </label>
              <div className="relative group">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-zinc-400 group-focus-within:text-indigo-600 transition-colors" />
                <input
                  id="email"
                  type="email"
                  placeholder="admin@sirigirvel.com"
                  className="w-full h-12 bg-zinc-50 border-none rounded-xl pl-12 pr-4 text-[15px] outline-none ring-2 ring-transparent focus:ring-indigo-600/20 focus:bg-white transition-all shadow-sm"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between pl-1">
                <label className="text-sm font-semibold text-zinc-700" htmlFor="password">
                  Password
                </label>
                <Link
                  href="/forgot-password"
                  className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 transition-colors"
                >
                  Forgot password?
                </Link>
              </div>
              <div className="relative group">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-zinc-400 group-focus-within:text-indigo-600 transition-colors" />
                <input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  className="w-full h-12 bg-zinc-50 border-none rounded-xl pl-12 pr-4 text-[15px] outline-none ring-2 ring-transparent focus:ring-indigo-600/20 focus:bg-white transition-all shadow-sm"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full h-12 bg-indigo-600 text-white rounded-xl font-bold text-[15px] hover:bg-indigo-700 active:scale-[0.98] transition-all shadow-lg shadow-indigo-600/20 disabled:opacity-70 flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                "Sign In"
              )}
            </button>
          </form>

          <div className="pt-4 text-center">
            <p className="text-sm text-zinc-500">© 2026 Sirigirvel Workshop Management</p>
          </div>
        </div>
      </div>

      {/* Yesp Studio Watermark */}
      <div className="fixed bottom-4 right-4 z-50 pointer-events-none select-none">
        <div className="flex items-center gap-1.5 bg-white/60 backdrop-blur-sm border border-black/[0.05] rounded-full px-3 py-1.5 shadow-sm">
          <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
          <span className="text-[10px] font-semibold text-zinc-400 tracking-wide">Developed by <span className="text-indigo-500 font-bold">Yesp Studio</span></span>
        </div>
      </div>
    </>
  );
}
