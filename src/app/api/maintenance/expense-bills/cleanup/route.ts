import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { v2 as cloudinary } from "cloudinary";

type CleanupRow = {
  id: string;
  bill_public_id?: string | null;
  bill_resource_type?: string | null;
};

function configureCloudinary() {
  const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (!cloudName || !apiKey || !apiSecret) {
    return false;
  }

  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
  });
  return true;
}

export async function POST() {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json({ cleaned: 0, skipped: true, reason: "supabase-service-role-missing" });
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const nowIso = new Date().toISOString();
    const { data, error } = await supabaseAdmin
      .from("transactions")
      .select("id, bill_public_id, bill_resource_type")
      .not("bill_url", "is", null)
      .lt("bill_expires_at", nowIso);

    if (error) {
      throw error;
    }

    const expiredRows = (data || []) as CleanupRow[];
    if (expiredRows.length === 0) {
      return NextResponse.json({ cleaned: 0 });
    }

    const cloudinaryReady = configureCloudinary();
    const cleanedIds: string[] = [];

    for (const row of expiredRows) {
      if (cloudinaryReady && row.bill_public_id) {
        try {
          await cloudinary.uploader.destroy(row.bill_public_id, {
            resource_type: row.bill_resource_type === "raw" ? "raw" : "image",
            invalidate: true,
          });
        } catch (cloudinaryError) {
          console.error("Expense bill cleanup delete error:", cloudinaryError);
        }
      }

      const { error: updateError } = await supabaseAdmin
        .from("transactions")
        .update({
          bill_url: null,
          bill_public_id: null,
          bill_resource_type: null,
          bill_uploaded_at: null,
          bill_expires_at: null,
        })
        .eq("id", row.id);

      if (!updateError) {
        cleanedIds.push(row.id);
      }
    }

    return NextResponse.json({ cleaned: cleanedIds.length, ids: cleanedIds });
  } catch (error) {
    console.error("Expense bill cleanup error:", error);
    return NextResponse.json({ error: "Failed to clean expense bills" }, { status: 500 });
  }
}
