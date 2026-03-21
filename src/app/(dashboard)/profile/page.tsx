"use client";

import React, { useState, useEffect } from "react";
import { User, Mail, Lock, Save, Loader2, Camera, ShieldCheck, Clock, ScrollText, ChevronRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import toast from "react-hot-toast";
import { cn } from "@/lib/utils";

export default function ProfilePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [formData, setFormData] = useState({
    email: "",
    username: "",
    password: "",
    confirmPassword: ""
  });

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUser(user);
        setFormData(prev => ({
          ...prev,
          email: user.email || "",
          username: user.user_metadata?.username || "Admin"
        }));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setUpdating(true);

    try {
      // 1. Update Password if provided
      if (formData.password) {
        if (formData.password !== formData.confirmPassword) {
          toast.error("Passwords do not match!");
          setUpdating(false);
          return;
        }
        const { error: pwdErr } = await supabase.auth.updateUser({
          password: formData.password
        });
        if (pwdErr) throw pwdErr;
      }

      // 2. Update Email and Username metadata
      const { error: userErr } = await supabase.auth.updateUser({
        email: formData.email,
        data: { username: formData.username }
      });
      if (userErr) throw userErr;

      toast.success("Profile updated successfully!");
      setFormData(prev => ({ ...prev, password: "", confirmPassword: "" }));
    } catch (error: any) {
      toast.error(error.message || "Failed to update profile");
    } finally {
      setUpdating(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 opacity-50 bg-white rounded-3xl p-20 shadow-sm border border-black/5">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
        <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest leading-none">Accessing Account Archive...</p>
      </div>
    );
  }

  return (
    <div className="max-w-[700px] mx-auto animate-in fade-in slide-in-from-bottom-2 duration-500 py-10">
      {/* Header Group */}
      <div className="mb-10 text-center md:text-left">
        <h1 className="text-[28px] font-bold text-slate-900 tracking-tight leading-none mb-2">Account settings</h1>
        <p className="text-[14px] text-slate-500 font-medium">Manage your workshop identity and security credentials</p>
      </div>

      <div className="bg-white rounded-[32px] border border-black/[0.04] shadow-sm p-10 overflow-hidden relative">
        <form onSubmit={handleUpdate} className="space-y-10">
          
          {/* Identity Section */}
          <div className="pb-10 border-b border-black/[0.03] space-y-6">
            <div className="space-y-1.5">
              <label className="text-[12px] font-bold text-slate-400 uppercase tracking-widest ml-0.5">Workshop Display Name</label>
              <input 
                type="text" 
                className="w-full h-12 px-4 bg-slate-50 border border-transparent rounded-xl text-[15px] font-medium text-slate-800 outline-none transition-all focus:border-indigo-600/20 focus:bg-white focus:shadow-sm" 
                value={formData.username}
                onChange={(e) => setFormData(prev => ({ ...prev, username: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[12px] font-bold text-slate-400 uppercase tracking-widest ml-0.5">Command Email Address</label>
              <input 
                type="email" 
                className="w-full h-12 px-4 bg-slate-50 border border-transparent rounded-xl text-[15px] font-medium text-slate-800 outline-none transition-all focus:border-indigo-600/20 focus:bg-white focus:shadow-sm" 
                value={formData.email}
                onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
              />
            </div>
          </div>

          {/* Security Section */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-1.5">
                <label className="text-[12px] font-bold text-slate-400 uppercase tracking-widest ml-0.5">New Password</label>
                <input 
                  type="password" 
                  className="w-full h-12 px-4 bg-slate-50 border border-transparent rounded-xl text-[15px] font-medium text-slate-800 outline-none transition-all focus:border-indigo-600/20 focus:bg-white focus:shadow-sm" 
                  placeholder="Leave blank to keep current"
                  value={formData.password}
                  onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[12px] font-bold text-slate-400 uppercase tracking-widest ml-0.5">Confirm New Password</label>
                <input 
                  type="password" 
                  className="w-full h-12 px-4 bg-slate-50 border border-transparent rounded-xl text-[15px] font-medium text-slate-800 outline-none transition-all focus:border-indigo-600/20 focus:bg-white focus:shadow-sm" 
                  placeholder="Repeat new password"
                  value={formData.confirmPassword}
                  onChange={(e) => setFormData(prev => ({ ...prev, confirmPassword: e.target.value }))}
                />
              </div>
          </div>

          {/* Activity Logs Section */}
          <div className="pt-10 border-t border-black/[0.03] space-y-4">
            <h3 className="text-[12px] font-bold text-slate-400 uppercase tracking-widest ml-0.5">Workshop Activity</h3>
            <button 
              type="button"
              onClick={() => router.push("/logs")}
              className="w-full h-auto flex items-center justify-between p-5 bg-slate-50 hover:bg-slate-100 rounded-[24px] border border-transparent hover:border-indigo-600/10 transition-all group"
            >
              <div className="flex items-center gap-4 text-left">
                <div className="w-12 h-12 rounded-2xl bg-white shadow-sm text-indigo-600 flex items-center justify-center group-hover:bg-indigo-600 group-hover:text-white transition-all duration-300">
                   <ScrollText className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-[15px] font-bold text-slate-800">System Activity Logs</div>
                  <div className="text-[12px] text-slate-500 font-medium tracking-tight">Track all workshop operations and core system changes</div>
                </div>
              </div>
              <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center text-slate-300 group-hover:text-indigo-600 group-hover:shadow-sm transition-all">
                <ChevronRight className="w-4 h-4" />
              </div>
            </button>
          </div>

          <div className="pt-4 flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-[12px] text-zinc-400 font-medium">
              <Clock className="w-3.5 h-3.5" />
              Joined {user ? new Date(user.created_at).toLocaleDateString() : "Present"}
            </div>
            <button 
              type="submit"
              disabled={updating}
              className="px-10 h-12 bg-indigo-600 text-white rounded-xl font-bold text-[14px] hover:bg-indigo-700 active:scale-[0.98] transition-all shadow-lg shadow-indigo-600/10 disabled:opacity-70 flex items-center justify-center gap-2"
            >
              {updating ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save changes"}
            </button>
          </div>
        </form>
      </div>
      
      <div className="mt-8 text-center text-zinc-400 text-[11px] font-medium">
        Root Access ID: {(user?.id || '—').substring(0, 8)}...
      </div>
    </div>
  );
}
