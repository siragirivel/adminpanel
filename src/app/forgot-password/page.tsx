"use client";

import React from "react";
import Image from "next/image";
import { Mail, AlertCircle, ArrowRight, Loader2, CheckCircle2, ChevronLeft } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { toast } from "react-hot-toast";

export default function ForgotPasswordPage() {
  const [email, setEmail] = React.useState("");
  const [isLoading, setIsLoading] = React.useState(false);
  const [isSent, setIsSent] = React.useState(false);
  const [error, setError] = React.useState("");

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      setError("Please enter your email address.");
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });

      if (error) {
        setError(error.message);
        return;
      }

      setIsSent(true);
      toast.success("Password reset link sent!");
    } catch {
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen font-sans bg-[#0c0c14] text-[#e8e8f0] overflow-hidden selection:bg-indigo-500/30 selection:text-white">
      {/* Background Orbs & Grid */}
      <div className="fixed inset-0 z-0 bg-gradient-to-b from-[#0c0c14] via-[#0f0f1e] to-[#13101e]">
        <div className="absolute inset-0 bg-[radial-gradient(rgba(99,102,241,0.18)_1px,transparent_1px)] [background-size:36px_36px] [mask-image:radial-gradient(ellipse_80%_80%_at_50%_50%,black_40%,transparent_100%)]"></div>
      </div>

      <div className="relative z-10 flex min-h-screen items-center justify-center p-8">
        <div className="w-full max-w-[400px] animate-in fade-in slide-in-from-bottom-4 duration-700">
           <div className="flex flex-col items-center mb-8">
              <Image
                src="/Siragiri.png"
                alt="Sirigirvel Workshop"
                width={72}
                height={72}
                className="mb-6 h-[72px] w-[72px] rounded-2xl object-contain shadow-lg shadow-indigo-500/20"
                priority
              />
              <h1 className="text-[32px] font-serif text-white mb-2 tracking-tight text-center">Reset your password</h1>
              <p className="text-[13px] text-zinc-400 text-center max-w-[320px] leading-relaxed">
                {isSent 
                    ? "Check your email for the recovery link to set a new password." 
                    : "Enter your email and we&apos;ll send you a link to get back into your account."}
              </p>
           </div>

           {!isSent ? (
              <div className="bg-white/[0.03] border border-white/5 rounded-2xl p-8 backdrop-blur-xl">
                {error && (
                    <div className="flex items-center gap-3 bg-red-500/10 border border-red-500/20 rounded-xl p-3.5 mb-6">
                        <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                        <p className="text-[12px] text-red-300/90 font-medium leading-normal">{error}</p>
                    </div>
                )}

                <form onSubmit={handleReset} className="space-y-6">
                    <div className="space-y-2">
                        <label className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider pl-1" htmlFor="email">Email address</label>
                        <div className="relative group">
                            <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600 group-focus-within:text-indigo-500 transition-colors" />
                            <input 
                                id="email"
                                type="email"
                                placeholder="admin@sirigirvel.com"
                                className="w-full h-11 bg-white/5 border border-white/10 rounded-xl pl-10.5 pr-4 text-[14px] text-white outline-none focus:border-indigo-500/50 focus:bg-indigo-500/5 focus:ring-4 focus:ring-indigo-500/10 transition-all font-medium"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                            />
                        </div>
                    </div>

                    <button 
                        type="submit" 
                        disabled={isLoading}
                        className="w-full h-12 bg-indigo-600 text-white rounded-xl font-bold text-[14px] tracking-wide relative overflow-hidden group hover:bg-indigo-500 hover:-translate-y-0.5 active:translate-y-0 transition-all shadow-lg shadow-indigo-500/25 disabled:opacity-70 disabled:pointer-events-none"
                    >
                        <span className={cn("flex items-center justify-center gap-2 transition-opacity", isLoading && "opacity-0")}>
                            Send reset link
                            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                        </span>
                        {isLoading && (
                            <div className="absolute inset-0 flex items-center justify-center">
                                <Loader2 className="w-5 h-5 animate-spin" />
                            </div>
                        )}
                        <div className="absolute inset-0 bg-gradient-to-br from-white/15 to-transparent pointer-events-none" />
                    </button>
                </form>

                <div className="mt-8 pt-6 border-t border-white/5">
                   <Link href="/login" className="flex items-center justify-center gap-2 text-[13px] font-bold text-indigo-400 hover:text-indigo-300 transition-colors">
                      <ChevronLeft className="w-4 h-4" />
                      Back to sign in
                   </Link>
                </div>
              </div>
           ) : (
             <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-2xl p-8 text-center backdrop-blur-xl animate-in zoom-in-95 duration-500">
                <div className="w-12 h-12 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                    <CheckCircle2 className="w-6 h-6 text-emerald-400" />
                </div>
                <h3 className="text-xl font-bold text-white mb-2 underline decoration-emerald-500/30 underline-offset-4">Email Sent!</h3>
                <p className="text-[13px] text-zinc-400 mb-8 leading-relaxed">
                   We&apos;ve sent a password recovery link to <span className="text-white font-bold">{email}</span>.
                </p>
                <Link href="/login" className="w-full h-11 flex items-center justify-center bg-white/10 hover:bg-white/15 text-white rounded-xl text-[14px] font-bold transition-all border border-white/10">
                   Back to Login
                </Link>
             </div>
           )}

           <div className="mt-12 text-center">
              <span className="text-[11px] text-zinc-500 uppercase tracking-widest font-medium">© 2026 Sirigirvel Workshop</span>
           </div>
        </div>
      </div>
    </div>
  );
}
