import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAppUrl } from "@/lib/app-url";
import { passwordResetMail } from "@/lib/server/mail-templates";
import { sendResendMail } from "@/lib/server/resend-mail";

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

async function createPasswordResetLink(email: string) {
  const redirectTo = `${getAppUrl()}/reset-password`;

  const { data, error } = await supabaseAdmin.auth.admin.generateLink({
    type: "recovery",
    email,
    options: { redirectTo },
  });

  if (error) {
    throw error;
  }

  const hashedToken =
    (
      data as {
        properties?: { hashed_token?: string };
      } | null
    )?.properties?.hashed_token || "";

  if (!hashedToken) {
    throw new Error("Failed to generate reset password token");
  }

  return `${redirectTo}?token_hash=${encodeURIComponent(hashedToken)}&type=recovery`;
}

export async function POST(request: Request) {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "Missing SUPABASE_SERVICE_ROLE_KEY" }, { status: 500 });
  }

  try {
    const body = await request.json();
    const email = String(body?.email || "").trim().toLowerCase();

    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    const resetPasswordUrl = await createPasswordResetLink(email);
    const mail = passwordResetMail({ email, resetPasswordUrl });
    const mailResult = await sendResendMail({
      to: [email],
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
    });

    if (!mailResult.ok) {
      return NextResponse.json(
        { error: mailResult.error || "Failed to send reset email" },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to send reset email" },
      { status: 500 },
    );
  }
}
