import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { newUserCreatedAlertMail, welcomeNewUserMail } from "@/lib/server/mail-templates";
import { sendResendMail } from "@/lib/server/resend-mail";
import { getAppUrl, getAppUrlWithPath } from "@/lib/app-url";

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

type ProfileRow = {
  id: string;
  username: string;
  email: string;
  role?: string | null;
  access?: Partial<AccessMap> | null;
  is_active?: boolean | null;
  created_at?: string | null;
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

function normalizeAccess(input?: Partial<AccessMap> | null): AccessMap {
  return {
    dashboard: Boolean(input?.dashboard ?? DEFAULT_ACCESS.dashboard),
    vehicles: Boolean(input?.vehicles ?? DEFAULT_ACCESS.vehicles),
    enquiries: Boolean(input?.enquiries ?? DEFAULT_ACCESS.enquiries),
    inventory: Boolean(input?.inventory ?? DEFAULT_ACCESS.inventory),
    billing: Boolean(input?.billing ?? DEFAULT_ACCESS.billing),
    estimates: Boolean(input?.estimates ?? DEFAULT_ACCESS.estimates),
    daybook: Boolean(input?.daybook ?? DEFAULT_ACCESS.daybook),
    accounts: Boolean(input?.accounts ?? DEFAULT_ACCESS.accounts),
    logs: Boolean(input?.logs ?? DEFAULT_ACCESS.logs),
    settings: Boolean(input?.settings ?? DEFAULT_ACCESS.settings),
  };
}

function resolveAccessForRole(role: AppRole, input?: Partial<AccessMap> | null): AccessMap {
  if (role === "owner") {
    return { ...DEFAULT_ACCESS };
  }
  return normalizeAccess(input);
}

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
    .select("id, username, role, access, is_active")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    const message = profileError.message.toLowerCase();
    const missingColumns =
      message.includes("column") &&
      (message.includes("role") || message.includes("access") || message.includes("is_active"));

    if (!missingColumns) {
      return {
        error: NextResponse.json({ error: profileError.message }, { status: 500 }),
      } as const;
    }

    return {
      user,
      role: "owner" as AppRole,
      access: DEFAULT_ACCESS,
      isActive: true,
      profileName: String(user.user_metadata?.username || user.email || "Owner"),
    } as const;
  }

  const role = (profile?.role || "owner") as AppRole;
  const access = resolveAccessForRole(role, (profile?.access || {}) as Partial<AccessMap>);
  const isActive = profile?.is_active !== false;

  return {
    user,
    role,
    access,
    isActive,
    profileName: String(profile?.username || user.user_metadata?.username || user.email || "User"),
  } as const;
}

function ensureAdmin(role: AppRole) {
  return role === "owner" || role === "admin";
}

async function createPasswordResetLink(email: string) {
  const appUrl = getAppUrl();
  const redirectTo = `${appUrl}/reset-password?source=welcome`;

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

  return `${redirectTo}&token_hash=${encodeURIComponent(hashedToken)}&type=recovery`;
}

async function getRoleCounts() {
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("role");

  if (error) {
    throw new Error(error.message);
  }

  const counts: Record<AppRole, number> = {
    owner: 0,
    admin: 0,
    manager: 0,
    staff: 0,
  };

  for (const row of data || []) {
    const role = String((row as { role?: string | null }).role || "staff") as AppRole;
    if (role in counts) {
      counts[role] += 1;
    }
  }

  return counts;
}

function roleLimitError(role: AppRole, limit: number) {
  return `Cannot assign role '${role}'. Limit reached (${limit}).`;
}

function resolveUsername(email: string, input?: string) {
  const direct = String(input || "").trim();
  if (direct) return direct;
  const local = email.split("@")[0] || "user";
  return local.replace(/[^a-zA-Z0-9_.-]/g, "").slice(0, 40) || "user";
}

async function writeAccountActivityLog(input: {
  action: "create" | "edit" | "delete";
  entityId: string;
  entityLabel: string;
  description: string;
  createdBy?: string;
  metadata?: Record<string, unknown>;
}) {
  try {
    await supabaseAdmin.from("activity_logs").insert([
      {
        action: input.action,
        entity_type: "account",
        entity_id: input.entityId,
        entity_label: input.entityLabel,
        description: input.description,
        metadata: input.metadata || {},
        created_by: input.createdBy || null,
      },
    ]);
  } catch (error) {
    console.error("Failed to write account activity log", error);
  }
}

export async function GET(request: Request) {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "Missing SUPABASE_SERVICE_ROLE_KEY" }, { status: 500 });
  }

  const requester = await getRequester(request);
  if ("error" in requester) return requester.error;
  if (!requester.isActive) {
    return NextResponse.json({ error: "Account is inactive" }, { status: 403 });
  }
  if (!ensureAdmin(requester.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const queryWithCreatedAt = await supabaseAdmin
    .from("profiles")
    .select("id, username, email, role, access, is_active, created_at")
    .order("created_at", { ascending: false });

  let data: ProfileRow[] | null = queryWithCreatedAt.data as ProfileRow[] | null;
  let error = queryWithCreatedAt.error;

  if (error) {
    const message = error.message.toLowerCase();
    const missingCreatedAt = message.includes("column") && message.includes("created_at");
    if (missingCreatedAt) {
      const fallback = await supabaseAdmin
        .from("profiles")
        .select("id, username, email, role, access, is_active");
      data = fallback.data as ProfileRow[] | null;
      error = fallback.error;
    }
  }

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const users = ((data || []) as ProfileRow[]).map((row) => ({
    id: row.id,
    username: row.username,
    email: row.email,
    role: (row.role || "staff") as AppRole,
    access: resolveAccessForRole((row.role || "staff") as AppRole, (row.access || {}) as Partial<AccessMap>),
    is_active: row.is_active !== false,
    created_at: row.created_at || null,
  }));

  return NextResponse.json({ users });
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
  if (!ensureAdmin(requester.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const email = String(body?.email || "").trim().toLowerCase();
  const password = String(body?.password || "").trim();
  const username = resolveUsername(email, body?.username);
  const role = (String(body?.role || "staff") as AppRole);
  const access = resolveAccessForRole(role, body?.access as Partial<AccessMap>);
  const warnings: string[] = [];

  if (!email || !password) {
    return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
  }
  if (password.length < 6) {
    return NextResponse.json({ error: "Password must be at least 6 characters" }, { status: 400 });
  }
  if (!["owner", "admin", "manager", "staff"].includes(role)) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }
  if (requester.role === "admin" && role === "owner") {
    return NextResponse.json({ error: "Only owners can create owner accounts" }, { status: 403 });
  }

  try {
    const counts = await getRoleCounts();
    const limit = ROLE_LIMITS[role];
    if (counts[role] >= limit) {
      return NextResponse.json({ error: roleLimitError(role, limit) }, { status: 400 });
    }
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to validate role limits" },
      { status: 500 },
    );
  }

  const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      username,
      role,
    },
  });

  if (createError || !created.user) {
    return NextResponse.json({ error: createError?.message || "Failed to create user" }, { status: 400 });
  }

  const profilePayload = {
    id: created.user.id,
    username,
    email,
    role,
    access,
    is_active: true,
  };

  const { error: profileError } = await supabaseAdmin
    .from("profiles")
    .upsert(profilePayload, { onConflict: "id" });

  if (profileError) {
    const message = profileError.message.toLowerCase();
    const missingColumns =
      message.includes("column") &&
      (message.includes("role") || message.includes("access") || message.includes("is_active"));

    if (missingColumns) {
      await supabaseAdmin
        .from("profiles")
        .upsert({ id: created.user.id, username, email }, { onConflict: "id" });
      warnings.push("User created, but role/access columns are missing. Run scripts/add-profile-access-control.sql");
      return NextResponse.json({ warning: warnings.join(" ") });
    }

    return NextResponse.json({ error: profileError.message }, { status: 500 });
  }

  await writeAccountActivityLog({
    action: "create",
    entityId: created.user.id,
    entityLabel: email,
    description: "Created team account",
    createdBy: requester.user.id,
    metadata: {
      created_by: requester.profileName,
      role,
      is_active: true,
      access,
    },
  });

  const loginUrl = getAppUrlWithPath("/login");
  let resetPasswordUrl = getAppUrlWithPath("/forgot-password");
  try {
    resetPasswordUrl = await createPasswordResetLink(email);
  } catch (error) {
    warnings.push(
      `Could not generate unique reset link: ${error instanceof Error ? error.message : "unknown error"}`,
    );
  }

  const newUserMail = welcomeNewUserMail({
    username,
    email,
    role,
    temporaryPassword: password,
    resetPasswordUrl,
    loginUrl,
  });
  const newUserMailResult = await sendResendMail({
    to: [email],
    subject: newUserMail.subject,
    html: newUserMail.html,
    text: newUserMail.text,
  });
  if (!newUserMailResult.ok) {
    warnings.push(`User email not sent: ${newUserMailResult.error || "mail transport failure"}`);
  }

  const { data: profilesForMail, error: profilesForMailError } = await supabaseAdmin
    .from("profiles")
    .select("email, role, is_active");
  if (profilesForMailError) {
    warnings.push(`Owner notification mail not sent: ${profilesForMailError.message}`);
  } else {
    const ownerRecipients = (profilesForMail || [])
      .filter((item) => item.is_active !== false && item.role === "owner")
      .map((item) => String(item.email || "").trim().toLowerCase())
      .filter(Boolean);
    const adminRecipients = (profilesForMail || [])
      .filter((item) => item.is_active !== false && item.role === "admin")
      .map((item) => String(item.email || "").trim().toLowerCase())
      .filter(Boolean);

    const notifyAdmins = requester.role === "owner" && process.env.OWNER_ALLOW_ADMIN_NOTIFICATION_RECIPIENTS === "true";
    const managementRecipients = Array.from(
      new Set([...ownerRecipients, ...(notifyAdmins ? adminRecipients : [])]),
    );

    if (managementRecipients.length > 0) {
      const managementMail = newUserCreatedAlertMail({
        createdBy: String(requester.profileName || requester.user.user_metadata?.username || requester.user.email || "System"),
        email,
        role,
        loginUrl,
      });
      const managementMailResult = await sendResendMail({
        to: managementRecipients,
        subject: managementMail.subject,
        html: managementMail.html,
        text: managementMail.text,
      });
      if (!managementMailResult.ok) {
        warnings.push(`Owner/admin alert mail not sent: ${managementMailResult.error || "mail transport failure"}`);
      }
    }
  }

  return NextResponse.json({
    user: {
      id: created.user.id,
      username,
      email,
      role,
      access,
      is_active: true,
    },
    warning: warnings.length ? warnings.join(" | ") : undefined,
  });
}

export async function PATCH(request: Request) {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "Missing SUPABASE_SERVICE_ROLE_KEY" }, { status: 500 });
  }

  const requester = await getRequester(request);
  if ("error" in requester) return requester.error;
  if (!requester.isActive) {
    return NextResponse.json({ error: "Account is inactive" }, { status: 403 });
  }
  if (!ensureAdmin(requester.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const userId = String(body?.userId || "").trim();
  const role = String(body?.role || "staff") as AppRole;
  const isActive = Boolean(body?.is_active ?? true);

  if (!userId) {
    return NextResponse.json({ error: "userId is required" }, { status: 400 });
  }
  if (!["owner", "admin", "manager", "staff"].includes(role)) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }

  const { data: existingProfile, error: existingProfileError } = await supabaseAdmin
    .from("profiles")
    .select("id, role, access, is_active")
    .eq("id", userId)
    .maybeSingle();

  if (existingProfileError) {
    return NextResponse.json({ error: existingProfileError.message }, { status: 500 });
  }
  if (!existingProfile) {
    return NextResponse.json({ error: "User profile not found" }, { status: 404 });
  }

  const currentRole = (existingProfile.role || "staff") as AppRole;
  const currentAccess = resolveAccessForRole(
    currentRole,
    (existingProfile.access || {}) as Partial<AccessMap>,
  );
  const requestedAccess = resolveAccessForRole(role, body?.access as Partial<AccessMap>);
  const isSelfUpdate = requester.user.id === userId;
  const currentIsActive = existingProfile.is_active !== false;

  if (isSelfUpdate) {
    const sameAccess =
      JSON.stringify(currentAccess) === JSON.stringify(requestedAccess);
    const sameStatus = currentIsActive === isActive;
    if (!sameAccess || !sameStatus) {
      return NextResponse.json(
        { error: "You cannot edit module access or status for your own account." },
        { status: 403 },
      );
    }
  }

  if (requester.role === "admin") {
    if (existingProfile.role === "owner") {
      return NextResponse.json({ error: "Admins cannot edit owner accounts" }, { status: 403 });
    }
    if (currentRole !== role) {
      return NextResponse.json({ error: "Only owners can change roles" }, { status: 403 });
    }
  }

  if (currentRole !== role) {
    try {
      const counts = await getRoleCounts();
      const limit = ROLE_LIMITS[role];
      if (counts[role] >= limit) {
        return NextResponse.json({ error: roleLimitError(role, limit) }, { status: 400 });
      }
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Failed to validate role limits" },
        { status: 500 },
      );
    }
  }

  const { error } = await supabaseAdmin
    .from("profiles")
    .update({ role, access: requestedAccess, is_active: isActive })
    .eq("id", userId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await writeAccountActivityLog({
    action: "edit",
    entityId: userId,
    entityLabel: String(body?.email || body?.username || existingProfile.id || userId),
    description: "Updated account role/access/status",
    createdBy: requester.user.id,
    metadata: {
      updated_by: requester.profileName,
      target_user_id: userId,
      role,
      is_active: isActive,
      access: requestedAccess,
    },
  });

  return NextResponse.json({ ok: true });
}
