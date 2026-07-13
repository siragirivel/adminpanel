import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { addMonths, differenceInCalendarDays, format } from "date-fns";
import { notificationDigestMail } from "@/lib/server/mail-templates";
import { sendResendMail } from "@/lib/server/resend-mail";
import { getAppUrlWithPath } from "@/lib/app-url";
import { computeCreditPendingRows } from "@/lib/vendor-credit";

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

type SparePartRow = {
  id: string;
  name: string;
  stock: number;
  threshold: number;
  cost: number;
};

type EnquiryAlertRow = {
  id: string;
  customer_name: string;
  phone_number: string;
  pickup_date: string | null;
  status: "open" | "closed";
};

type ServiceInvoiceRow = {
  id: string;
  invoice_number: string;
  vehicle_id: string;
  created_at: string;
  note?: string | null;
  vehicles?: {
    car_id?: string | null;
    owner_name?: string | null;
  } | null;
};

type TransactionRow = {
  id: string;
  description: string;
  amount: number;
  type: "credit" | "debit";
  date: string;
  created_at?: string;
  note?: string | null;
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

function getDateInTimeZone(timeZone = "Asia/Kolkata", now = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(now);
}

function normalizeEnquiryStatus(status?: string | null) {
  return String(status || "").trim().toLowerCase();
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
    .select("id, email, username, role, access, is_active")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    return {
      error: NextResponse.json({ error: profileError.message }, { status: 500 }),
    } as const;
  }

  const role = ((profile?.role || "owner") as AppRole);
  const access = normalizeAccess((profile?.access || {}) as Partial<AccessMap>);
  const isActive = profile?.is_active !== false;

  return {
    user,
    role,
    access,
    isActive,
    profileEmail: String(profile?.email || user.email || ""),
    profileName: String(profile?.username || user.user_metadata?.username || user.email || "User"),
  } as const;
}

function escapeCsv(value: string | number | null | undefined) {
  const text = String(value ?? "");
  if (!text.includes(",") && !text.includes('"') && !text.includes("\n")) {
    return text;
  }
  return `"${text.replace(/"/g, '""')}"`;
}

function parseModeFromNote(note?: string | null) {
  const text = String(note || "").toLowerCase();
  return text.includes("mode: credit") ? "credit" : "cash_carry";
}

function extractOdoReading(source?: string | null) {
  if (!source) return null;
  const match = source.match(/odometer:\s*([\d,]+)(?:\s*km)?/i);
  if (!match?.[1]) return null;
  const parsed = Number(match[1].replace(/,/g, ""));
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

async function getMailRecipients(includeAdminRecipients: boolean) {
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("email, role, is_active");

  if (error) {
    throw new Error(error.message);
  }

  const owners = (data || [])
    .filter((row) => row.is_active !== false && row.role === "owner")
    .map((row) => String(row.email || "").trim().toLowerCase())
    .filter(Boolean);

  const admins = (data || [])
    .filter((row) => row.is_active !== false && row.role === "admin")
    .map((row) => String(row.email || "").trim().toLowerCase())
    .filter(Boolean);

  return Array.from(new Set([...owners, ...(includeAdminRecipients ? admins : [])]));
}

export async function POST(request: Request) {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "Missing SUPABASE_SERVICE_ROLE_KEY" }, { status: 500 });
  }

  const cronSecret = process.env.NOTIFICATION_CRON_SECRET || process.env.CRON_SECRET || "";
  const cronHeader = request.headers.get("x-notification-cron-secret") || "";
  const isCronInvocation = Boolean(cronSecret && cronHeader && cronHeader === cronSecret);

  const requester = isCronInvocation ? null : await getRequester(request);
  if (requester && "error" in requester) return requester.error;
  if (requester && !requester.isActive) {
    return NextResponse.json({ error: "Account is inactive" }, { status: 403 });
  }

  if (!isCronInvocation) {
    const adminAllowed = process.env.ALLOW_ADMIN_NOTIFICATION_EMAIL === "true";
    if (!requester || requester.role !== "owner" && !(requester.role === "admin" && adminAllowed)) {
      return NextResponse.json(
        { error: "Only owners can send notification emails (admins require owner approval)." },
        { status: 403 },
      );
    }
  }

  const body = (await request.json().catch(() => ({}))) as {
    deliveryType?: "alerts" | "weekly-report" | "all";
    includeAdminRecipients?: boolean;
  };

  const deliveryType = body.deliveryType || "all";
  const includeAdminRecipients = isCronInvocation
    ? Boolean(body.includeAdminRecipients)
    : Boolean(body.includeAdminRecipients && requester && requester.role === "owner");

  const recipients = await getMailRecipients(includeAdminRecipients);
  if (!recipients.length) {
    return NextResponse.json({ error: "No active owner/admin recipients found" }, { status: 400 });
  }

  const [partsResponse, enquiriesResponse, invoicesResponse, transactionsResponse] = await Promise.all([
    supabaseAdmin.from("spare_parts").select("id, name, stock, threshold, cost"),
    supabaseAdmin.from("enquiries").select("id, customer_name, phone_number, pickup_date, status"),
    supabaseAdmin
      .from("invoices")
      .select("id, invoice_number, vehicle_id, created_at, note, vehicles(car_id, owner_name)")
      .order("created_at", { ascending: false }),
    supabaseAdmin
      .from("transactions")
      .select("id, description, amount, type, date, created_at, note")
      .order("date", { ascending: false })
      .order("created_at", { ascending: false }),
  ]);

  if (partsResponse.error) return NextResponse.json({ error: partsResponse.error.message }, { status: 500 });
  if (enquiriesResponse.error) return NextResponse.json({ error: enquiriesResponse.error.message }, { status: 500 });
  if (invoicesResponse.error) return NextResponse.json({ error: invoicesResponse.error.message }, { status: 500 });
  if (transactionsResponse.error) {
    return NextResponse.json({ error: transactionsResponse.error.message }, { status: 500 });
  }

  const lowStockItems = ((partsResponse.data || []) as SparePartRow[]).filter(
    (item) => Number(item.stock || 0) <= Number(item.threshold || 0),
  );

  const today = getDateInTimeZone();
  const openEnquiries = ((enquiriesResponse.data || []) as EnquiryAlertRow[]).filter(
    (row) => normalizeEnquiryStatus(row.status) === "open",
  );
  const pickupToday = openEnquiries.filter((row) => row.pickup_date && row.pickup_date === today);
  const pickupOverdue = openEnquiries.filter((row) => row.pickup_date && row.pickup_date < today);

  const invoices = (invoicesResponse.data || []) as ServiceInvoiceRow[];
  const latestByVehicle = new Map<string, ServiceInvoiceRow>();
  invoices.forEach((invoice) => {
    const vehicleId = String(invoice.vehicle_id || "");
    if (!vehicleId || latestByVehicle.has(vehicleId)) return;
    latestByVehicle.set(vehicleId, invoice);
  });

  const serviceAlerts = Array.from(latestByVehicle.values())
    .map((invoice) => {
      const serviceDate = new Date(invoice.created_at);
      const nextDate = addMonths(serviceDate, 6);
      return {
        id: String(invoice.id),
        invoiceNumber: String(invoice.invoice_number || "—"),
        carId: String(invoice.vehicles?.car_id || "—"),
        ownerName: String(invoice.vehicles?.owner_name || "Vehicle"),
        nextServiceDate: nextDate,
        nextServiceOdo: extractOdoReading(invoice.note || "") || null,
        daysLeft: differenceInCalendarDays(nextDate, new Date()),
      };
    })
    .filter((item) => item.daysLeft <= 7)
    .sort((a, b) => a.daysLeft - b.daysLeft);

  const allTransactions = (transactionsResponse.data || []) as TransactionRow[];
  const creditDueItems = computeCreditPendingRows(
    allTransactions
      .filter((txn) => {
      const desc = String(txn.description || "").toLowerCase();
      return (
        txn.type === "debit" &&
        desc.includes("spare parts purchase") &&
        !desc.includes("credit payment -") &&
        parseModeFromNote(txn.note) === "credit"
      );
      })
      .map((purchase) => ({
        id: purchase.id,
        description: purchase.description,
        seller: String((purchase.note || "").match(/Seller:\s*([^|]+)/i)?.[1] || "—").trim(),
        originalAmount: Math.max(0, Number(purchase.amount || 0)),
        date: purchase.date || purchase.created_at?.split("T")[0] || "",
      })),
    allTransactions,
  )
    .map((purchase) => ({
      id: purchase.id,
      description: purchase.description,
      pendingAmount: purchase.pendingAmount,
      date: purchase.date,
    }))
    .filter((item) => item.pendingAmount > 0);

  const startDate = format(new Date(Date.now() - (6 * 24 * 60 * 60 * 1000)), "yyyy-MM-dd");
  const weeklyTransactions = allTransactions.filter((txn) => {
    const date = String(txn.date || "").slice(0, 10);
    return date >= startDate && date <= today;
  });

  const csvRows: Array<Array<string | number>> = [];
  csvRows.push(["Category", "Title", "Details", "Amount", "Date"]);
  lowStockItems.forEach((item) =>
    csvRows.push([
      "Low Stock",
      item.name,
      `Stock ${item.stock} / Threshold ${item.threshold}`,
      Number(item.cost || 0),
      today,
    ]),
  );
  creditDueItems.forEach((item) =>
    csvRows.push(["Credit Due", "Pending vendor payment", item.description, item.pendingAmount, item.date || today]),
  );
  pickupOverdue.forEach((item) =>
    csvRows.push([
      "Pickup Overdue",
      item.customer_name,
      `Phone ${item.phone_number} | Pickup ${item.pickup_date || "N/A"}`,
      "",
      item.pickup_date || today,
    ]),
  );
  pickupToday.forEach((item) =>
    csvRows.push([
      "Pickup Today",
      item.customer_name,
      `Phone ${item.phone_number} | Pickup ${item.pickup_date || "N/A"}`,
      "",
      item.pickup_date || today,
    ]),
  );
  openEnquiries.forEach((item) =>
    csvRows.push([
      "Open Enquiry",
      item.customer_name,
      `Phone ${item.phone_number} | Pickup ${item.pickup_date || "Not set"}`,
      "",
      item.pickup_date || today,
    ]),
  );
  serviceAlerts.forEach((item) =>
    csvRows.push([
      "Service Due",
      `${item.carId} - ${item.ownerName}`,
      `Invoice ${item.invoiceNumber} | Next ODO ${item.nextServiceOdo || "N/A"} | ${item.daysLeft} day(s)`,
      "",
      format(item.nextServiceDate, "yyyy-MM-dd"),
    ]),
  );
  weeklyTransactions.forEach((item) =>
    csvRows.push([
      "Weekly Transaction",
      item.type === "credit" ? "Money In" : "Money Out",
      item.description,
      Number(item.amount || 0),
      item.date || today,
    ]),
  );

  const csvContent = csvRows.map((row) => row.map((cell) => escapeCsv(cell)).join(",")).join("\n");
  const csvBase64 = Buffer.from(csvContent, "utf8").toString("base64");
  const generatedAt = format(new Date(), "dd MMM yyyy, hh:mm a");
  const loginUrl = getAppUrlWithPath("/login");

  const digest = notificationDigestMail({
    generatedAt,
    lowStockCount: lowStockItems.length,
    creditDueCount: creditDueItems.length,
    pickupOverdueCount: pickupOverdue.length,
    pickupTodayCount: pickupToday.length,
    openEnquiryCount: openEnquiries.length,
    serviceDueCount: serviceAlerts.length,
    weeklyTransactionCount: weeklyTransactions.length,
    loginUrl,
    includesCsvAttachment: deliveryType === "weekly-report" || deliveryType === "all",
    lowStockDetails: lowStockItems.map(
      (item) => `${item.name} (Stock ${item.stock}, Threshold ${item.threshold})`,
    ),
    creditDueDetails: creditDueItems.map(
      (item) => `${item.description} (Pending ₹${Math.round(item.pendingAmount).toLocaleString("en-IN")})`,
    ),
    pickupOverdueDetails: pickupOverdue.map(
      (item) => `${item.customer_name} · ${item.phone_number} · Pickup ${item.pickup_date || "N/A"}`,
    ),
    pickupTodayDetails: pickupToday.map(
      (item) => `${item.customer_name} · ${item.phone_number} · Pickup ${item.pickup_date || "N/A"}`,
    ),
    openEnquiryDetails: openEnquiries.map(
      (item) => `${item.customer_name} · ${item.phone_number} · Pickup ${item.pickup_date || "Not set"}`,
    ),
    serviceDueDetails: serviceAlerts.map(
      (item) =>
        `${item.carId} (${item.ownerName}) · Invoice ${item.invoiceNumber} · ${item.daysLeft} day(s) left${
          item.nextServiceOdo ? ` · Next ODO ${item.nextServiceOdo.toLocaleString("en-IN")} km` : ""
        }`,
    ),
  });

  const shouldAttachCsv = deliveryType === "weekly-report" || deliveryType === "all";
  const mailResult = await sendResendMail({
    to: recipients,
    subject:
      deliveryType === "alerts"
        ? "Workshop alerts notification"
        : deliveryType === "weekly-report"
          ? "Weekly workshop report (CSV)"
          : digest.subject,
    html: digest.html,
    text: digest.text,
    attachments: shouldAttachCsv
      ? [
          {
            filename: `weekly-report-${today}.csv`,
            contentBase64: csvBase64,
            contentType: "text/csv",
          },
        ]
      : undefined,
  });

  if (!mailResult.ok) {
    return NextResponse.json(
      {
        error: mailResult.error || "Failed to send mail",
        mail_skipped: mailResult.skipped,
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    mode: isCronInvocation ? "cron" : "manual",
    recipients,
    includeAdminRecipients,
    messageId: mailResult.messageId,
    summary: {
      lowStock: lowStockItems.length,
      creditDue: creditDueItems.length,
      pickupOverdue: pickupOverdue.length,
      pickupToday: pickupToday.length,
      openEnquiries: openEnquiries.length,
      serviceAlerts: serviceAlerts.length,
      weeklyTransactions: weeklyTransactions.length,
    },
  });
}
