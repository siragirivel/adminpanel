import { supabase } from "@/lib/supabase";

export type VendorRecord = {
  id: string;
  vendor_id?: string | null;
  name: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  gstin?: string | null;
  notes?: string | null;
  is_active?: boolean | null;
  created_at?: string | null;
};

async function getValidCreatedBy() {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.id) {
    return null;
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();

  return profile?.id || null;
}

export async function loadVendorRegistry() {
  const { data, error } = await supabase
    .from("vendors")
    .select("id, vendor_id, name, phone, email, address, gstin, notes, is_active, created_at")
    .order("name", { ascending: true });

  if (error) {
    return { data: [] as VendorRecord[], error };
  }

  return { data: (data || []) as VendorRecord[], error: null };
}

export async function syncVendorRecord(name: string, extra: Partial<VendorRecord> = {}) {
  const trimmedName = String(name || "").trim();
  if (!trimmedName) {
    return { error: null };
  }

  const createdBy = await getValidCreatedBy();
  const payload: Record<string, unknown> = {
    name: trimmedName,
    is_active: extra.is_active ?? true,
    created_by: createdBy,
  };

  if (extra.vendor_id) {
    payload.vendor_id = extra.vendor_id;
  }
  if (extra.phone !== undefined) {
    payload.phone = extra.phone || null;
  }
  if (extra.email !== undefined) {
    payload.email = extra.email || null;
  }
  if (extra.address !== undefined) {
    payload.address = extra.address || null;
  }
  if (extra.gstin !== undefined) {
    payload.gstin = extra.gstin || null;
  }
  if (extra.notes !== undefined) {
    payload.notes = extra.notes || null;
  }

  const conflictKey = extra.vendor_id ? "vendor_id" : "name";
  const { error } = await supabase
    .from("vendors")
    .upsert([payload], { onConflict: conflictKey });

  return { error };
}
