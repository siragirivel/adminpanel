"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronRight, Clock, Loader2, ScrollText, ShieldCheck, UserPlus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import toast from "react-hot-toast";
import { cn } from "@/lib/utils";

type AppRole = "owner" | "admin" | "manager" | "staff";
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

const ROLE_LIMITS: Record<AppRole, number> = {
  owner: 2,
  admin: 1,
  manager: 2,
  staff: 4,
};

type ManagedAccount = {
  id: string;
  username: string;
  email: string;
  role: AppRole;
  access: AccessMap;
  is_active: boolean;
  created_at?: string | null;
};

type SessionUser = {
  id: string;
  created_at: string;
  email?: string | null;
  user_metadata?: {
    username?: string;
  };
};

const DEFAULT_ACCESS: AccessMap = {
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

const ACCESS_ITEMS: Array<{ key: keyof AccessMap; label: string; description: string }> = [
  { key: "dashboard", label: "Dashboard", description: "Overview cards and workshop summary" },
  { key: "vehicles", label: "Vehicles", description: "Car ID pages, vehicle records and service history" },
  { key: "enquiries", label: "Enquiries", description: "Create and manage customer enquiries" },
  { key: "inventory", label: "Inventory", description: "Spare parts, purchase entries and stock views" },
  { key: "billing", label: "Invoices", description: "Invoice creation and billing records" },
  { key: "estimates", label: "Estimates", description: "Estimate/quotation creation and updates" },
  { key: "daybook", label: "Day Book", description: "Cash flow entries and daybook history" },
  { key: "accounts", label: "Accounts", description: "Credit dues, payment status and account totals" },
  { key: "logs", label: "Logs", description: "System activity and operation audit logs" },
  { key: "settings", label: "Settings", description: "Configuration and admin setup pages" },
];

const CURRENT_USER_DEFAULT_ACCESS: AccessMap = {
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

function normalizeAccess(input?: Partial<AccessMap> | null, fallback: AccessMap = DEFAULT_ACCESS): AccessMap {
  return {
    dashboard: Boolean(input?.dashboard ?? fallback.dashboard),
    vehicles: Boolean(input?.vehicles ?? fallback.vehicles),
    enquiries: Boolean(input?.enquiries ?? fallback.enquiries),
    inventory: Boolean(input?.inventory ?? fallback.inventory),
    billing: Boolean(input?.billing ?? fallback.billing),
    estimates: Boolean(input?.estimates ?? fallback.estimates),
    daybook: Boolean(input?.daybook ?? fallback.daybook),
    accounts: Boolean(input?.accounts ?? fallback.accounts),
    logs: Boolean(input?.logs ?? fallback.logs),
    settings: Boolean(input?.settings ?? fallback.settings),
  };
}

function resolveAccessForRole(role: AppRole, input?: Partial<AccessMap> | null, fallback: AccessMap = DEFAULT_ACCESS): AccessMap {
  if (role === "owner") {
    return { ...DEFAULT_ACCESS };
  }
  return normalizeAccess(input, fallback);
}

function generateTemporaryPassword(length = 12) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const symbols = "@#$%!";
  const chars = `${alphabet}${symbols}`;
  let password = "";

  if (typeof window !== "undefined" && window.crypto?.getRandomValues) {
    const random = new Uint32Array(length);
    window.crypto.getRandomValues(random);
    for (let i = 0; i < length; i += 1) {
      password += chars[random[i] % chars.length];
    }
  } else {
    for (let i = 0; i < length; i += 1) {
      password += chars[Math.floor(Math.random() * chars.length)];
    }
  }

  // Ensure at least one symbol for temporary-password complexity.
  if (![...password].some((char) => symbols.includes(char))) {
    const index = Math.floor(Math.random() * Math.max(1, length - 1));
    password = `${password.slice(0, index)}${symbols[Math.floor(Math.random() * symbols.length)]}${password.slice(index + 1)}`;
  }

  return password;
}

function SmoothToggle({
  checked,
  disabled,
}: {
  checked: boolean;
  disabled?: boolean;
}) {
  return (
    <span
      className={cn(
        "relative inline-flex h-7 w-14 items-center rounded-full border bg-white transition-all duration-300 ease-out",
        checked ? "border-slate-700" : "border-slate-300",
        disabled ? "opacity-60" : "",
      )}
    >
      <span
        className={cn(
          "absolute h-5 w-5 rounded-full bg-slate-800 shadow-[0_2px_8px_rgba(15,23,42,0.25)] transition-all duration-300 ease-out",
          checked ? "left-8" : "left-0.5",
        )}
      />
      <span className={cn("absolute text-[9px] font-bold tracking-wide", checked ? "left-1.5 text-slate-900" : "left-7 text-slate-400")}>
        {checked ? "ON" : "OFF"}
      </span>
    </span>
  );
}

function AccessToggleRow({
  label,
  description,
  checked,
  onToggle,
  disabled,
}: {
  label: string;
  description: string;
  checked: boolean;
  onToggle: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={onToggle}
      className={cn(
        "flex w-full items-center justify-between rounded-xl border px-3 py-2.5 text-left transition-all duration-200",
        checked ? "border-slate-300 bg-slate-50" : "border-slate-200 bg-white hover:border-slate-300",
        disabled ? "cursor-not-allowed opacity-60" : "",
      )}
    >
      <div>
        <div className="text-[12px] font-semibold text-slate-800">{label}</div>
        <div className="text-[11px] text-slate-500">{description}</div>
      </div>
      <SmoothToggle checked={checked} disabled={disabled} />
    </button>
  );
}

export default function ProfilePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [role, setRole] = useState<AppRole>("owner");
  const [currentUserAccess, setCurrentUserAccess] = useState<AccessMap>(CURRENT_USER_DEFAULT_ACCESS);
  const [canManageAccounts, setCanManageAccounts] = useState(false);
  const [manageLoading, setManageLoading] = useState(false);
  const [manageSaving, setManageSaving] = useState(false);
  const [accounts, setAccounts] = useState<ManagedAccount[]>([]);
  const [formData, setFormData] = useState({
    email: "",
    username: "",
    password: "",
    confirmPassword: "",
  });
  const [newAccount, setNewAccount] = useState({
    email: "",
    password: "",
    role: "staff" as AppRole,
    access: { ...DEFAULT_ACCESS },
  });
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);

  const formatCreatedDate = useCallback((value?: string | null) => {
    if (!value) return "Created date unavailable";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Created date unavailable";
    return `Created ${date.toLocaleDateString()}`;
  }, []);

  useEffect(() => {
    void fetchProfile();
  }, []);

  const getAuthHeaders = async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) throw new Error("Session expired");
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    };
  };

  const fetchManagedAccounts = useCallback(async () => {
    if (!canManageAccounts) return;
    setManageLoading(true);
    try {
      const headers = await getAuthHeaders();
      const response = await fetch("/api/admin/users", {
        method: "GET",
        headers,
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "Failed to load accounts");
      }
      const users = ((result.users || []) as ManagedAccount[]).map((account) => ({
        ...account,
        access: resolveAccessForRole(account.role, account.access),
      }));
      setAccounts(users);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load accounts");
    } finally {
      setManageLoading(false);
    }
  }, [canManageAccounts]);

  const fetchProfile = async () => {
    try {
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();

      if (!authUser) return;

      setUser(authUser as SessionUser);
      setFormData((prev) => ({
        ...prev,
        email: authUser.email || "",
        username: authUser.user_metadata?.username || "Admin",
      }));

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("role, access, is_active")
        .eq("id", authUser.id)
        .maybeSingle();

      if (!profileError && profile) {
        const currentRole = (profile.role || "owner") as AppRole;
        setRole(currentRole);
        setCurrentUserAccess(
          resolveAccessForRole(
            currentRole,
            (profile.access || {}) as Partial<AccessMap>,
            CURRENT_USER_DEFAULT_ACCESS,
          ),
        );
        setCanManageAccounts(currentRole === "owner" || currentRole === "admin");
      } else {
        setRole("owner");
        setCurrentUserAccess({ ...DEFAULT_ACCESS });
        setCanManageAccounts(true);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (canManageAccounts) {
      void fetchManagedAccounts();
    }
  }, [canManageAccounts, fetchManagedAccounts]);

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setUpdating(true);

    try {
      if (formData.password) {
        if (formData.password !== formData.confirmPassword) {
          toast.error("Passwords do not match!");
          setUpdating(false);
          return;
        }
        const { error: pwdErr } = await supabase.auth.updateUser({
          password: formData.password,
        });
        if (pwdErr) throw pwdErr;
      }

      const { error: userErr } = await supabase.auth.updateUser({
        email: formData.email,
        data: { username: formData.username },
      });
      if (userErr) throw userErr;

      toast.success("Profile updated successfully!");
      setFormData((prev) => ({ ...prev, password: "", confirmPassword: "" }));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update profile");
    } finally {
      setUpdating(false);
    }
  };

  const handleCreateAccount = async () => {
    if (!newAccount.email || !newAccount.password) {
      toast.error("Email and password are required");
      return;
    }
    if (!canAssignRoleForCreate(newAccount.role)) {
      toast.error(`Cannot create ${newAccount.role}. Limit reached (${ROLE_LIMITS[newAccount.role]}).`);
      return;
    }
    if (role === "admin" && newAccount.role === "owner") {
      toast.error("Only owners can create owner accounts.");
      return;
    }

    setManageSaving(true);
    try {
      const headers = await getAuthHeaders();
      const payload = {
        ...newAccount,
        access: resolveAccessForRole(newAccount.role, newAccount.access),
      };
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "Failed to create account");
      }
      if (result.warning) {
        toast.success(result.warning);
      } else {
        toast.success("New account created");
      }
      setNewAccount({
        email: "",
        password: "",
        role: "staff",
        access: { ...DEFAULT_ACCESS },
      });
      await fetchManagedAccounts();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create account");
    } finally {
      setManageSaving(false);
    }
  };

  const handleSaveAccount = async (account: ManagedAccount) => {
    if (role === "admin" && account.role === "owner") {
      toast.error("Admins cannot edit owner accounts.");
      return;
    }
    if (!canAssignRoleForUpdate(account.id, account.role)) {
      toast.error(`Cannot assign ${account.role}. Limit reached (${ROLE_LIMITS[account.role]}).`);
      return;
    }

    setManageSaving(true);
    try {
      const headers = await getAuthHeaders();
      const response = await fetch("/api/admin/users", {
        method: "PATCH",
        headers,
        body: JSON.stringify({
          userId: account.id,
          role: account.role,
          access: resolveAccessForRole(account.role, account.access),
          is_active: account.is_active,
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "Failed to save account access");
      }
      toast.success("Account access updated");
      await fetchManagedAccounts();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save account access");
    } finally {
      setManageSaving(false);
    }
  };

  const adminCount = useMemo(
    () => accounts.filter((account) => account.role === "owner" || account.role === "admin").length,
    [accounts],
  );

  const roleCounts = useMemo(() => {
    return accounts.reduce(
      (acc, account) => {
        acc[account.role] += 1;
        return acc;
      },
      { owner: 0, admin: 0, manager: 0, staff: 0 } as Record<AppRole, number>,
    );
  }, [accounts]);

  const canAssignRoleForCreate = useCallback(
    (targetRole: AppRole) => roleCounts[targetRole] < ROLE_LIMITS[targetRole],
    [roleCounts],
  );

  const canAssignRoleForUpdate = useCallback(
    (userId: string, targetRole: AppRole) => {
      const existing = accounts.find((account) => account.id === userId);
      if (!existing) return false;
      if (existing.role === targetRole) return true;
      return roleCounts[targetRole] < ROLE_LIMITS[targetRole];
    },
    [accounts, roleCounts],
  );

  const selectedAccount = useMemo(
    () => accounts.find((account) => account.id === selectedAccountId) || null,
    [accounts, selectedAccountId],
  );
  const canCurrentUserManageRoles = role === "owner";
  const adminBlockedOwnerEdit = role === "admin" && selectedAccount?.role === "owner";
  const selfAccountLocked = selectedAccount?.id === user?.id;

  useEffect(() => {
    if (!selectedAccountId) return;
    const exists = accounts.some((account) => account.id === selectedAccountId);
    if (!exists) {
      setSelectedAccountId(null);
    }
  }, [accounts, selectedAccountId]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 opacity-50 bg-white rounded-3xl p-20 shadow-sm border border-black/5">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
        <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest leading-none">Accessing Account Archive...</p>
      </div>
    );
  }

  return (
    <div className="max-w-[980px] mx-auto animate-in fade-in slide-in-from-bottom-2 duration-500 py-10 space-y-8">
      <div className="mb-2 text-center md:text-left">
        <h1 className="text-[28px] font-bold text-slate-900 tracking-tight leading-none mb-2">Account settings</h1>
        <p className="text-[14px] text-slate-500 font-medium">Manage your workshop identity, security, and team access control</p>
      </div>

      <div className="bg-white rounded-[32px] border border-black/[0.04] shadow-sm p-10 overflow-hidden relative">
        <form onSubmit={handleUpdate} className="space-y-10">
          <div className="pb-10 border-b border-black/[0.03] space-y-6">
            <div className="space-y-1.5">
              <label className="text-[12px] font-bold text-slate-400 uppercase tracking-widest ml-0.5">Workshop Display Name</label>
              <input
                type="text"
                className="w-full h-12 px-4 bg-slate-50 border border-transparent rounded-xl text-[15px] font-medium text-slate-800 outline-none transition-all focus:border-indigo-600/20 focus:bg-white focus:shadow-sm"
                value={formData.username}
                onChange={(e) => setFormData((prev) => ({ ...prev, username: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[12px] font-bold text-slate-400 uppercase tracking-widest ml-0.5">Command Email Address</label>
              <input
                type="email"
                className="w-full h-12 px-4 bg-slate-50 border border-transparent rounded-xl text-[15px] font-medium text-slate-800 outline-none transition-all focus:border-indigo-600/20 focus:bg-white focus:shadow-sm"
                value={formData.email}
                onChange={(e) => setFormData((prev) => ({ ...prev, email: e.target.value }))}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-1.5">
              <label className="text-[12px] font-bold text-slate-400 uppercase tracking-widest ml-0.5">New Password</label>
              <input
                type="password"
                className="w-full h-12 px-4 bg-slate-50 border border-transparent rounded-xl text-[15px] font-medium text-slate-800 outline-none transition-all focus:border-indigo-600/20 focus:bg-white focus:shadow-sm"
                placeholder="Leave blank to keep current"
                value={formData.password}
                onChange={(e) => setFormData((prev) => ({ ...prev, password: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[12px] font-bold text-slate-400 uppercase tracking-widest ml-0.5">Confirm New Password</label>
              <input
                type="password"
                className="w-full h-12 px-4 bg-slate-50 border border-transparent rounded-xl text-[15px] font-medium text-slate-800 outline-none transition-all focus:border-indigo-600/20 focus:bg-white focus:shadow-sm"
                placeholder="Repeat new password"
                value={formData.confirmPassword}
                onChange={(e) => setFormData((prev) => ({ ...prev, confirmPassword: e.target.value }))}
              />
            </div>
          </div>

          {currentUserAccess.logs ? (
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
          ) : null}

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

      {canManageAccounts ? (
        <div className="bg-white rounded-[32px] border border-black/[0.04] shadow-sm p-6 md:p-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-[22px] font-bold text-slate-900 tracking-tight">Team Accounts</h2>
              <p className="mt-1 text-[13px] text-slate-500">Create users, assign roles, and manage module access</p>
            </div>
            <div className="inline-flex items-center gap-2 rounded-xl border border-indigo-100 bg-indigo-50 px-3 py-2 text-[12px] font-semibold text-indigo-700">
              <ShieldCheck className="h-4 w-4" />
              Your role: {role.toUpperCase()}
            </div>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Total Accounts</div>
              <div className="mt-1 text-2xl font-bold text-slate-900">{accounts.length}</div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Admin / Owner</div>
              <div className="mt-1 text-2xl font-bold text-slate-900">{adminCount}</div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Current Access</div>
              <div className="mt-1 text-sm font-semibold text-indigo-700">{role.toUpperCase()}</div>
            </div>
          </div>

          <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50/70 p-5">
            <div className="text-[12px] font-bold uppercase tracking-widest text-slate-500">Create New Account</div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-slate-500">Email</label>
                <input
                  type="email"
                  placeholder="staff@workshop.com"
                  className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-indigo-500"
                  value={newAccount.email}
                  onChange={(e) => setNewAccount((prev) => ({ ...prev, email: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-slate-500">Role</label>
                <select
                  className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-indigo-500"
                  value={newAccount.role}
                  onChange={(e) =>
                    setNewAccount((prev) => {
                      const nextRole = e.target.value as AppRole;
                      return {
                        ...prev,
                        role: nextRole,
                        access: resolveAccessForRole(nextRole, prev.access),
                      };
                    })
                  }
                >
                  <option value="staff" disabled={!canAssignRoleForCreate("staff")}>Staff</option>
                  <option value="manager" disabled={!canAssignRoleForCreate("manager")}>Manager</option>
                  <option value="admin" disabled={!canAssignRoleForCreate("admin")}>Admin</option>
                  <option value="owner" disabled={!canAssignRoleForCreate("owner") || role !== "owner"}>Owner</option>
                </select>
              </div>
              <div className="md:col-span-2 flex flex-col gap-2 sm:flex-row">
                <input
                  type="password"
                  placeholder="Temporary password"
                  className="h-11 flex-1 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-indigo-500"
                  value={newAccount.password}
                  onChange={(e) => setNewAccount((prev) => ({ ...prev, password: e.target.value }))}
                />
                <button
                  type="button"
                  onClick={() =>
                    setNewAccount((prev) => ({
                      ...prev,
                      password: generateTemporaryPassword(),
                    }))
                  }
                  className="h-11 rounded-xl border border-indigo-300 bg-indigo-100 px-4 text-sm font-semibold text-indigo-700 transition hover:bg-indigo-200"
                >
                  Generate Password
                </button>
              </div>
            </div>

            {newAccount.role === "owner" ? (
              <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-medium text-emerald-800">
                Owners always have full module access. No module selection is needed.
              </div>
            ) : (
              <div className="mt-4 rounded-xl border border-slate-200 bg-white p-3">
                <div className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Module Access</div>
                <div className="grid gap-2 md:grid-cols-2">
                  {ACCESS_ITEMS.map((item) => {
                    const checked = newAccount.access[item.key];
                    return (
                      <AccessToggleRow
                        key={item.key}
                        label={item.label}
                        description={item.description}
                        checked={checked}
                        onToggle={() =>
                          setNewAccount((prev) => ({
                            ...prev,
                            access: {
                              ...prev.access,
                              [item.key]: !prev.access[item.key],
                            },
                          }))
                        }
                      />
                    );
                  })}
                </div>
              </div>
            )}

            <div className="mt-4">
              <button
                type="button"
                onClick={() => void handleCreateAccount()}
                disabled={manageSaving || !canAssignRoleForCreate(newAccount.role)}
                className="inline-flex h-11 items-center gap-2 rounded-xl bg-indigo-600 px-5 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-60"
              >
                {manageSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
                Create Account
              </button>
            </div>
          </div>

          <div className="mt-6">
            <div className="space-y-3">
              {manageLoading ? (
                <div className="py-8 text-center text-sm text-slate-400">Loading accounts...</div>
              ) : accounts.length === 0 ? (
                <div className="py-8 text-center text-sm text-slate-400">No accounts found.</div>
              ) : (
                accounts.map((account) => (
                  <button
                    key={account.id}
                    type="button"
                    onClick={() => setSelectedAccountId(account.id)}
                    className="w-full rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-indigo-200 hover:bg-indigo-50/40"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-slate-900">
                          {account.username || account.email.split("@")[0]}
                        </div>
                        <div className="mt-0.5 text-xs text-slate-500">{account.email}</div>
                        <div className="mt-1 text-[11px] text-slate-400">{formatCreatedDate(account.created_at)}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="rounded-full border border-slate-200 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
                          {account.role.toUpperCase()}
                        </span>
                        <span
                          className={cn(
                            "rounded-full px-2.5 py-1 text-[11px] font-semibold",
                            account.is_active
                              ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
                              : "border border-rose-200 bg-rose-50 text-rose-700",
                          )}
                        >
                          {account.is_active ? "Active" : "Inactive"}
                        </span>
                        <ChevronRight className="h-4 w-4 text-slate-400" />
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>

          {selectedAccount ? (
            <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4 md:items-center">
              <div className="flex w-full max-w-3xl flex-col rounded-3xl border border-slate-200 bg-white shadow-2xl md:max-h-[85vh]">
                <div className="flex items-start justify-between gap-3 border-b border-slate-200 p-5 md:p-6">
                  <div>
                    <div className="text-[20px] font-bold text-slate-900">
                      {selectedAccount.username || selectedAccount.email.split("@")[0]}
                    </div>
                    <div className="mt-1 text-sm text-slate-500">{selectedAccount.email}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedAccountId(null)}
                    className="rounded-xl border border-slate-200 p-2 text-slate-500 transition hover:bg-slate-50"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="overflow-y-auto p-5 md:p-6">
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="space-y-1">
                      <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Role</div>
                      <select
                        className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-indigo-500"
                        value={selectedAccount.role}
                        disabled={!canCurrentUserManageRoles || adminBlockedOwnerEdit}
                        onChange={(e) =>
                          setAccounts((current) => {
                            const nextRole = e.target.value as AppRole;
                            const currentRow = current.find((row) => row.id === selectedAccount.id);
                            if (!currentRow) return current;
                            if (currentRow.role !== nextRole) {
                              const nextCount = current.filter((row) => row.role === nextRole).length;
                              if (nextCount >= ROLE_LIMITS[nextRole]) {
                                toast.error(`Cannot assign ${nextRole}. Limit reached (${ROLE_LIMITS[nextRole]}).`);
                                return current;
                              }
                            }
                            return current.map((row) =>
                              row.id === selectedAccount.id
                                ? { ...row, role: nextRole, access: resolveAccessForRole(nextRole, row.access) }
                                : row,
                            );
                          })
                        }
                      >
                        <option value="staff">Staff</option>
                        <option value="manager">Manager</option>
                        <option value="admin">Admin</option>
                        <option value="owner">Owner</option>
                      </select>
                    </div>
                    <div className="space-y-1">
                      <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Status</div>
                      <button
                        type="button"
                        disabled={adminBlockedOwnerEdit || selfAccountLocked}
                        onClick={() =>
                          setAccounts((current) =>
                            current.map((row) =>
                              row.id === selectedAccount.id ? { ...row, is_active: !row.is_active } : row,
                            ),
                          )
                        }
                        className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <SmoothToggle checked={selectedAccount.is_active} disabled={adminBlockedOwnerEdit || selfAccountLocked} />
                          <span className={cn("text-xs font-semibold", selectedAccount.is_active ? "text-emerald-700" : "text-rose-700")}>
                            {selectedAccount.is_active ? "Active" : "Inactive"}
                          </span>
                        </div>
                      </button>
                    </div>
                  </div>

                  {selectedAccount.role === "owner" ? (
                    <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-medium text-emerald-800">
                      Owners always have full module access. Module toggles are not editable.
                    </div>
                  ) : (
                    <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                      <div className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Module Access</div>
                      {selfAccountLocked ? (
                        <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-medium text-amber-800">
                          You can view your module access and status, but you cannot edit your own module access or status.
                        </div>
                      ) : null}
                      <div className="grid gap-2 md:grid-cols-2">
                        {ACCESS_ITEMS.map((item) => {
                          const checked = selectedAccount.access[item.key];
                          return (
                            <AccessToggleRow
                              key={`${selectedAccount.id}-${item.key}`}
                              label={item.label}
                              description={item.description}
                              checked={checked}
                              disabled={selfAccountLocked}
                              onToggle={() =>
                                selfAccountLocked
                                  ? undefined
                                  :
                                setAccounts((current) =>
                                  current.map((row) =>
                                    row.id === selectedAccount.id
                                      ? {
                                          ...row,
                                          access: {
                                            ...row.access,
                                            [item.key]: !row.access[item.key],
                                          },
                                        }
                                      : row,
                                  ),
                                )
                              }
                            />
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-end gap-2 border-t border-slate-200 p-5 md:p-6">
                  <button
                    type="button"
                    onClick={() => setSelectedAccountId(null)}
                    className="inline-flex h-10 items-center rounded-lg border border-slate-200 px-4 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleSaveAccount(selectedAccount)}
                    disabled={manageSaving || adminBlockedOwnerEdit}
                    className="inline-flex h-10 items-center gap-2 rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
                  >
                    {manageSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    Save Access
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          Account creation and access control are available for Admin/Owner roles only.
        </div>
      )}

      <div className="text-center text-zinc-400 text-[11px] font-medium">
        Root Access ID: {(user?.id || "—").substring(0, 8)}...
      </div>
    </div>
  );
}
