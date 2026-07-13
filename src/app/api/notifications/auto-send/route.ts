import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { POST as sendNotificationMail } from "../mail/route";

type DeliveryType = "alerts" | "weekly-report" | "all";

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

function getIstDateMeta(now = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  });

  const parts = formatter.formatToParts(now);
  const find = (type: string) => parts.find((part) => part.type === type)?.value || "";

  const year = find("year");
  const month = find("month");
  const day = find("day");
  const weekday = find("weekday");
  const dateKey = `${year}-${month}-${day}`;

  return {
    dateKey,
    dayNumber: Number(day),
    weekday,
  };
}

async function acquireRunLock(deliveryType: DeliveryType, dateKey: string) {
  const runKey = `${deliveryType}:${dateKey}`;
  const { error } = await supabaseAdmin.from("notification_mail_runs").insert([
    {
      run_key: runKey,
      delivery_type: deliveryType,
      run_date: dateKey,
    },
  ]);

  if (!error) {
    return { acquired: true as const };
  }

  if ((error as { code?: string }).code === "23505") {
    return { acquired: false as const };
  }

  throw error;
}

export async function POST(request: Request) {
  const cronSecret = process.env.NOTIFICATION_CRON_SECRET || process.env.CRON_SECRET || "";
  const incomingSecret = request.headers.get("x-notification-cron-secret") || "";
  const authHeader = request.headers.get("authorization") || "";
  const bearerToken = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length).trim() : "";

  const authorized = Boolean(
    cronSecret &&
      ((incomingSecret && incomingSecret === cronSecret) || (bearerToken && bearerToken === cronSecret)),
  );

  if (!authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "Missing SUPABASE_SERVICE_ROLE_KEY" }, { status: 500 });
  }

  const { dateKey, weekday, dayNumber } = getIstDateMeta();
  const schedule: DeliveryType[] = ["alerts"];
  if (weekday === "Mon") schedule.push("weekly-report");
  if (dayNumber === 1) schedule.push("all");

  const includeAdminRecipients = process.env.AUTO_NOTIFICATION_INCLUDE_ADMINS === "true";
  const results: Array<Record<string, unknown>> = [];

  for (const deliveryType of schedule) {
    try {
      const lock = await acquireRunLock(deliveryType, dateKey);
      if (!lock.acquired) {
        results.push({
          deliveryType,
          status: "skipped",
          reason: "already-sent-for-day",
        });
        continue;
      }

      const proxyRequest = new Request("http://internal/api/notifications/mail", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-notification-cron-secret": cronSecret,
        },
        body: JSON.stringify({
          deliveryType,
          includeAdminRecipients,
        }),
      });

      const response = await sendNotificationMail(proxyRequest);
      if (!response) {
        throw new Error("Notification mail handler returned no response");
      }
      const payload = await response.json();

      results.push({
        deliveryType,
        status: response.ok ? "sent" : "failed",
        httpStatus: response.status,
        payload,
      });
    } catch (error) {
      results.push({
        deliveryType,
        status: "failed",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  return NextResponse.json({
    ok: true,
    dateKey,
    weekday,
    schedule,
    includeAdminRecipients,
    results,
  });
}
