"use client";

import React from "react";
import { Mail, Lock, Eye, EyeOff, CheckCircle2, AlertCircle, ArrowRight, Loader2, Home, User } from "lucide-react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { toast } from "react-hot-toast";

export default function RegisterPage() {
  const router = useRouter();
  const [fullName, setFullName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [showPassword, setShowPassword] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState("");
  const [passwordScore, setPasswordScore] = React.useState(0);

  const calculateStrength = (val: string) => {
    if (!val) return 0;
    let score = 0;
    if (val.length >= 6) score++;
    if (val.length >= 10) score++;
    if (/[A-Z]/.test(val) && /[0-9]/.test(val)) score++;
    if (/[^A-Za-z0-9]/.test(val)) score++;
    return Math.max(score, 1);
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password || !fullName) {
      setError("Please fill in all fields.");
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
          }
        }
      });

      if (error) {
        setError(error.message);
        return;
      }

      if (data.user?.identities?.length === 0) {
        setError("This email is already registered. Please sign in.");
      } else {
        toast.success("Registration successful! Check your email for a verification link.");
        router.push("/login");
      }
    } catch (err: any) {
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
        <div className="hidden lg:block">
            <div className="absolute top-[-120px] left-[-80px] w-[500px] h-[500px] bg-indigo-500/10 blur-[80px] rounded-full animate-pulse duration-[14s]"></div>
            <div className="absolute bottom-[-80px] right-[-60px] w-[380px] h-[380px] bg-purple-500/10 blur-[80px] rounded-full animate-pulse duration-[18s]"></div>
        </div>
      </div>

      <div className="relative z-10 flex min-h-screen">
        {/* Left Branding Panel omitted for briefness in register form but recommended for 100% mockup parity */}
        <div className="flex-1 hidden lg:flex flex-col justify-between p-11 px-13 border-r border-white/5 animate-in fade-in slide-in-from-left duration-700">
           <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <Home className="w-5.5 text-white" />
            </div>
            <div>
              <div className="text-[18px] font-semibold text-white tracking-tight">Sirigirvel</div>
              <div className="text-[11px] text-zinc-500 tracking-wide font-medium uppercase">Workshop Management System</div>
            </div>
          </div>
          <div className="flex-1 flex flex-col justify-center py-10 max-w-[420px]">
             <h1 className="text-[46px] leading-[1.1] font-serif text-white mb-5 tracking-tight">
              Create your<br />
              <span className="italic text-indigo-400">admin account.</span>
            </h1>
            <p className="text-[14px] text-zinc-400 leading-relaxed">
              Start managing your workshop efficiently. Join the Sirigirvel Internal Management System today.
            </p>
          </div>
          <div className="text-[11px] text-zinc-500 uppercase tracking-widest font-medium">© 2026 Sirigirvel Workshop</div>
        </div>

        {/* Right Panel: Register Form */}
        <div className="w-full lg:w-[480px] flex items-center justify-center p-8 lg:p-13 animate-in fade-in slide-in-from-right duration-700 delay-150">
           <div className="w-full max-w-[360px]">
              <div className="text-center lg:text-left mb-8">
                <div className="text-[11px] font-bold text-indigo-400 uppercase tracking-[0.15em] mb-2.5">Join the team</div>
                <h2 className="text-[32px] font-serif text-white mb-2 tracking-tight">Get started</h2>
                <p className="text-[13px] text-zinc-400 leading-relaxed">Create an account to begin managing the workshop.</p>
              </div>

              {error && (
                <div className="flex items-center gap-3 bg-red-500/10 border border-red-500/20 rounded-xl p-3.5 mb-6 animate-in shake duration-500">
                    <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                    <p className="text-[12px] text-red-300/90 font-medium leading-normal">{error}</p>
                </div>
              )}

              <form onSubmit={handleRegister} className="space-y-4">
                <div className="space-y-2">
                    <label className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider pl-1" htmlFor="fullName">Full Name</label>
                    <div className="relative group">
                        <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600 group-focus-within:text-indigo-500 transition-colors" />
                        <input 
                            id="fullName"
                            type="text"
                            placeholder="John Doe"
                            className="w-full h-11 bg-white/5 border border-white/10 rounded-xl pl-10.5 pr-4 text-[14px] text-white outline-none focus:border-indigo-500/50 focus:bg-indigo-500/5 focus:ring-4 focus:ring-indigo-500/10 transition-all font-medium"
                            value={fullName}
                            onChange={(e) => setFullName(e.target.value)}
                        />
                    </div>
                </div>

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

                <div className="space-y-2">
                    <label className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider pl-1" htmlFor="password">Password</label>
                    <div className="relative group">
                        <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600 group-focus-within:text-indigo-500 transition-colors" />
                        <input 
                            id="password"
                            type={showPassword ? "text" : "password"}
                            placeholder="••••••••"
                            className="w-full h-11 bg-white/5 border border-white/10 rounded-xl pl-10.5 pr-11 text-[14px] text-white outline-none focus:border-indigo-500/50 focus:bg-indigo-500/5 focus:ring-4 focus:ring-indigo-500/10 transition-all font-medium"
                            value={password}
                            onChange={(e) => {
                                setPassword(e.target.value);
                                setPasswordScore(calculateStrength(e.target.value));
                            }}
                        />
                        <button 
                            type="button" 
                            className="absolute right-3.5 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-zinc-400 transition-colors p-1"
                            onClick={() => setShowPassword(!showPassword)}
                        >
                            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                    </div>
                    {password.length > 0 && (
                        <div className="flex gap-1 pt-1.5 px-0.5">
                            {[1,2,3,4].map(i => (
                                <div key={i} className={cn(
                                    "h-[3px] flex-1 rounded-full transition-all duration-300",
                                    i <= passwordScore 
                                        ? (passwordScore === 1 ? "bg-red-500" : passwordScore === 2 ? "bg-amber-500" : passwordScore === 3 ? "bg-lime-500" : "bg-emerald-500") 
                                        : "bg-white/10"
                                )} />
                            ))}
                        </div>
                    )}
                </div>

                <div className="pt-2">
                    <button 
                        type="submit" 
                        disabled={isLoading}
                        className="w-full h-12 bg-indigo-600 text-white rounded-xl font-bold text-[14px] tracking-wide relative overflow-hidden group hover:bg-indigo-500 hover:-translate-y-0.5 active:translate-y-0 transition-all shadow-lg shadow-indigo-500/25 disabled:opacity-70 disabled:pointer-events-none"
                    >
                        <span className={cn("flex items-center justify-center gap-2 transition-opacity", isLoading && "opacity-0")}>
                            Create admin account
                            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                        </span>
                        {isLoading && (
                            <div className="absolute inset-0 flex items-center justify-center">
                                <Loader2 className="w-5 h-5 animate-spin" />
                            </div>
                        )}
                        <div className="absolute inset-0 bg-gradient-to-br from-white/15 to-transparent pointer-events-none" />
                    </button>
                </div>
              </form>

              <div className="mt-8 text-center">
                <p className="text-[13px] text-zinc-500">
                  Already have an account?{" "}
                  <Link href="/login" className="text-indigo-400 font-bold hover:text-indigo-300 transition-colors">Sign in here</Link>
                </p>
              </div>
           </div>
        </div>
      </div>
    </div>
  );
}
