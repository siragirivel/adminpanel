"use client";

import React from "react";
import Link from "next/link";
import Image from "next/image";
import { Lock, Loader2, AlertCircle, CheckCircle2, ArrowRight, Home } from "lucide-react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { toast } from "react-hot-toast";

function getRecoveryTokens() {
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const searchParams = new URLSearchParams(window.location.search);

  return {
    accessToken: hashParams.get("access_token") || searchParams.get("access_token"),
    refreshToken: hashParams.get("refresh_token") || searchParams.get("refresh_token"),
    type: hashParams.get("type") || searchParams.get("type"),
  };
}

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [isReady, setIsReady] = React.useState(false);
  const [error, setError] = React.useState("");
  const [success, setSuccess] = React.useState(false);

  React.useEffect(() => {
    let isMounted = true;

    const prepareRecoverySession = async () => {
      try {
        const { accessToken, refreshToken, type } = getRecoveryTokens();

        if (type === "recovery" && accessToken && refreshToken) {
          const { error: sessionError } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });

          if (sessionError) {
            throw sessionError;
          }

          window.history.replaceState({}, document.title, window.location.pathname);
        } else {
          const {
            data: { session },
          } = await supabase.auth.getSession();

          if (!session) {
            throw new Error("This reset link is invalid or has expired.");
          }
        }

        if (isMounted) {
          setIsReady(true);
          setError("");
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Unable to verify your reset link.";

        if (isMounted) {
          setError(message);
          setIsReady(false);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    prepareRecoverySession();

    return () => {
      isMounted = false;
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!password || !confirmPassword) {
      setError("Please fill in both password fields.");
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters long.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setSaving(true);
    setError("");

    try {
      const { error: updateError } = await supabase.auth.updateUser({
        password,
      });

      if (updateError) {
        throw updateError;
      }

      await supabase.auth.signOut();

      setSuccess(true);
      toast.success("Password updated. Please sign in again.");

      setTimeout(() => {
        router.push("/");
      }, 1500);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to reset password.";
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="relative min-h-screen font-sans bg-[#0c0c14] text-[#e8e8f0] overflow-hidden selection:bg-indigo-500/30 selection:text-white">
      <div className="fixed inset-0 z-0 bg-gradient-to-b from-[#0c0c14] via-[#0f0f1e] to-[#13101e]">
        <div className="absolute inset-0 bg-[radial-gradient(rgba(99,102,241,0.18)_1px,transparent_1px)] [background-size:36px_36px] [mask-image:radial-gradient(ellipse_80%_80%_at_50%_50%,black_40%,transparent_100%)]"></div>
      </div>

      <div className="relative z-10 flex min-h-screen items-center justify-center p-8">
        <div className="w-full max-w-[420px] animate-in fade-in slide-in-from-bottom-4 duration-700">
          <div className="flex flex-col items-center mb-8">
            <Image
              src="/Siragiri.png"
              alt="Sirigirvel Workshop"
              width={72}
              height={72}
              className="mb-6 h-[72px] w-[72px] rounded-2xl object-contain shadow-lg shadow-indigo-500/20"
              priority
            />
            <h1 className="text-[32px] font-serif text-white mb-2 tracking-tight text-center">Set a new password</h1>
            <p className="text-[13px] text-zinc-400 text-center max-w-[320px] leading-relaxed">
              Use your Supabase recovery session to secure the account with a fresh password.
            </p>
          </div>

          <div className="bg-white/[0.03] border border-white/5 rounded-2xl p-8 backdrop-blur-xl">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-8 gap-4">
                <Loader2 className="w-6 h-6 animate-spin text-indigo-400" />
                <p className="text-[12px] text-zinc-400 font-medium">Validating recovery link...</p>
              </div>
            ) : success ? (
              <div className="text-center animate-in zoom-in-95 duration-500">
                <div className="w-12 h-12 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                  <CheckCircle2 className="w-6 h-6 text-emerald-400" />
                </div>
                <h3 className="text-xl font-bold text-white mb-2">Password updated</h3>
                <p className="text-[13px] text-zinc-400 leading-relaxed">
                  Redirecting you back to sign in.
                </p>
              </div>
            ) : !isReady ? (
              <div className="space-y-6">
                <div className="flex items-center gap-3 bg-red-500/10 border border-red-500/20 rounded-xl p-3.5">
                  <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                  <p className="text-[12px] text-red-300/90 font-medium leading-normal">
                    {error || "This reset link is invalid or has expired."}
                  </p>
                </div>

                <Link
                  href="/forgot-password"
                  className="w-full h-11 flex items-center justify-center bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-[14px] font-bold transition-all"
                >
                  Request a new reset link
                </Link>
              </div>
            ) : (
              <>
                {error && (
                  <div className="flex items-center gap-3 bg-red-500/10 border border-red-500/20 rounded-xl p-3.5 mb-6">
                    <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                    <p className="text-[12px] text-red-300/90 font-medium leading-normal">{error}</p>
                  </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider pl-1" htmlFor="password">
                      New password
                    </label>
                    <div className="relative group">
                      <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600 group-focus-within:text-indigo-500 transition-colors" />
                      <input
                        id="password"
                        type="password"
                        placeholder="Enter a new password"
                        className="w-full h-11 bg-white/5 border border-white/10 rounded-xl pl-10.5 pr-4 text-[14px] text-white outline-none focus:border-indigo-500/50 focus:bg-indigo-500/5 focus:ring-4 focus:ring-indigo-500/10 transition-all font-medium"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider pl-1" htmlFor="confirmPassword">
                      Confirm password
                    </label>
                    <div className="relative group">
                      <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600 group-focus-within:text-indigo-500 transition-colors" />
                      <input
                        id="confirmPassword"
                        type="password"
                        placeholder="Repeat the new password"
                        className="w-full h-11 bg-white/5 border border-white/10 rounded-xl pl-10.5 pr-4 text-[14px] text-white outline-none focus:border-indigo-500/50 focus:bg-indigo-500/5 focus:ring-4 focus:ring-indigo-500/10 transition-all font-medium"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={saving}
                    className="w-full h-12 bg-indigo-600 text-white rounded-xl font-bold text-[14px] tracking-wide relative overflow-hidden group hover:bg-indigo-500 hover:-translate-y-0.5 active:translate-y-0 transition-all shadow-lg shadow-indigo-500/25 disabled:opacity-70 disabled:pointer-events-none"
                  >
                    <span className={cn("flex items-center justify-center gap-2 transition-opacity", saving && "opacity-0")}>
                      Update password
                      <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                    </span>
                    {saving && (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <Loader2 className="w-5 h-5 animate-spin" />
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-br from-white/15 to-transparent pointer-events-none" />
                  </button>
                </form>
              </>
            )}

            <div className="mt-8 pt-6 border-t border-white/5">
              <Link href="/" className="flex items-center justify-center gap-2 text-[13px] font-bold text-indigo-400 hover:text-indigo-300 transition-colors">
                <Home className="w-4 h-4" />
                Back to sign in
              </Link>
            </div>
          </div>

          <div className="mt-12 text-center">
            <span className="text-[11px] text-zinc-500 uppercase tracking-widest font-medium">© 2026 Sirigirvel Workshop</span>
          </div>
        </div>
      </div>
    </div>
  );
}
