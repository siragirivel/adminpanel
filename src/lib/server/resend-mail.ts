export type MailAttachment = {
  filename: string;
  contentBase64: string;
  contentType: string;
};

type SendMailInput = {
  to: string[];
  subject: string;
  html: string;
  text: string;
  attachments?: MailAttachment[];
};

type SendMailResult = {
  ok: boolean;
  skipped: boolean;
  messageId?: string;
  error?: string;
};

const DEFAULT_FROM = "wms@siragirivel.in";

export function getSenderAddress() {
  return process.env.RESEND_FROM_EMAIL || DEFAULT_FROM;
}

export function mailEnabled() {
  return Boolean(process.env.RESEND_API_KEY);
}

export async function sendResendMail(input: SendMailInput): Promise<SendMailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return {
      ok: false,
      skipped: true,
      error: "RESEND_API_KEY is not configured",
    };
  }

  const dedupedRecipients = Array.from(
    new Set(
      (input.to || [])
        .map((value) => String(value || "").trim().toLowerCase())
        .filter(Boolean),
    ),
  );

  if (dedupedRecipients.length === 0) {
    return {
      ok: false,
      skipped: true,
      error: "No recipients were provided",
    };
  }

  const payload: Record<string, unknown> = {
    from: getSenderAddress(),
    to: dedupedRecipients,
    subject: input.subject,
    html: input.html,
    text: input.text,
  };

  if (input.attachments?.length) {
    payload.attachments = input.attachments.map((attachment) => ({
      filename: attachment.filename,
      content: attachment.contentBase64,
      type: attachment.contentType,
    }));
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    const data = (await response.json().catch(() => ({}))) as {
      id?: string;
      message?: string;
      error?: { message?: string };
    };

    if (!response.ok) {
      return {
        ok: false,
        skipped: false,
        error: data?.error?.message || data?.message || `Resend request failed (${response.status})`,
      };
    }

    return {
      ok: true,
      skipped: false,
      messageId: data.id,
    };
  } catch (error) {
    return {
      ok: false,
      skipped: false,
      error: error instanceof Error ? error.message : "Unexpected mail transport error",
    };
  }
}
