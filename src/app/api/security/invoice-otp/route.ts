import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";
import { invoiceDeleteOtpMail } from "@/lib/server/mail-templates";
import { sendResendMail } from "@/lib/server/resend-mail";

type AppRole = "owner" | "admin" | "manager" | "staff";

const OTP_TTL_MINUTES = 10;
const OTP_PURPOSE = "invoice_delete";

const supabaseAnon = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  },
);

async function getRequester(request: Request) {
  const authHeader = request.headers.get("authorization");
  const accessToken = authHeader?.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : "";

  if (!accessToken) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) } as const;
  }

  const {
    data: { user },
    error,
  } = await supabaseAnon.auth.getUser(accessToken);

  if (error || !user) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) } as const;
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("id, email, username, role, is_active")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    return {
      error: NextResponse.json({ error: profileError.message }, { status: 500 }),
    } as const;
  }

  const role = (profile?.role || "owner") as AppRole;
  const isActive = profile?.is_active !== false;
  const profileEmail = String(profile?.email || user.email || "");
  const profileName = String(profile?.username || user.user_metadata?.username || user.email || "Owner");

  return { userId: user.id, role, isActive, profileEmail, profileName } as const;
}

function generateOtp() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let otp = "";
  while (otp.length < 9) {
    otp += chars[Math.floor(Math.random() * chars.length)];
  }
  if (!/[A-Z]/.test(otp) || !/[0-9]/.test(otp)) {
    return generateOtp();
  }
  return otp;
}

function hashOtp(otp: string) {
  const secret =
    process.env.OTP_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    "siragirivel-otp";
  return crypto
    .createHash("sha256")
    .update(`${otp}:${secret}`)
    .digest("hex");
}

function cleanOtp(value: string) {
  return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export async function POST(request: Request) {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "Missing SUPABASE_SERVICE_ROLE_KEY" }, { status: 500 });
  }

  const requester = await getRequester(request);
  if ("error" in requester) return requester.error;

  if (!requester.isActive) {
    return NextResponse.json({ error: "Account is inactive" }, { status: 403 });
  }

  if (requester.role !== "owner") {
    return NextResponse.json({ error: "Only owner can request OTP verification." }, { status: 403 });
  }

  if (!requester.profileEmail) {
    return NextResponse.json({ error: "Owner email not configured." }, { status: 400 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    action?: "request" | "verify";
    otp?: string;
  };

  if (body.action === "request") {
    const otp = generateOtp();
    const otpHash = hashOtp(otp);
    const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000).toISOString();

    const { error } = await supabaseAdmin
      .from("otp_verifications")
      .insert([
        {
          user_id: requester.userId,
          purpose: OTP_PURPOSE,
          otp_hash: otpHash,
          expires_at: expiresAt,
        },
      ]);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const mail = invoiceDeleteOtpMail({
      username: requester.profileName,
      otp,
      expiresMinutes: OTP_TTL_MINUTES,
    });

    const mailResult = await sendResendMail({
      to: [requester.profileEmail],
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
    });

    if (!mailResult.ok) {
      return NextResponse.json(
        { error: mailResult.error || "Failed to send OTP email" },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true, expiresAt });
  }

  if (body.action === "verify") {
    const otp = cleanOtp(body.otp || "");
    if (otp.length !== 9) {
      return NextResponse.json({ error: "Invalid OTP format" }, { status: 400 });
    }

    const { data: record, error } = await supabaseAdmin
      .from("otp_verifications")
      .select("id, otp_hash, expires_at, consumed_at")
      .eq("user_id", requester.userId)
      .eq("purpose", OTP_PURPOSE)
      .is("consumed_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!record) {
      return NextResponse.json({ error: "No OTP request found." }, { status: 400 });
    }

    if (new Date(record.expires_at).getTime() < Date.now()) {
      return NextResponse.json({ error: "OTP expired. Please request a new OTP." }, { status: 400 });
    }

    if (hashOtp(otp) !== record.otp_hash) {
      return NextResponse.json({ error: "Invalid OTP. Please try again." }, { status: 400 });
    }

    const { error: updateError } = await supabaseAdmin
      .from("otp_verifications")
      .update({ consumed_at: new Date().toISOString() })
      .eq("id", record.id);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    const verifiedUntil = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000).toISOString();
    return NextResponse.json({ ok: true, verifiedUntil });
  }

  return NextResponse.json({ error: "Invalid request." }, { status: 400 });
}
