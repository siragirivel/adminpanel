const PRODUCT_NAME = "SIRAGIRI VEL AUTOMOBILES WMS";

function wrapHtml(content: string) {
  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f8fafc;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
    <table width="100%" cellpadding="0" cellspacing="0" style="padding:24px 12px;">
      <tr>
        <td align="center">
          <table width="640" cellpadding="0" cellspacing="0" style="max-width:640px;background:#ffffff;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden;">
            <tr>
              <td style="background:#0f172a;color:#ffffff;padding:16px 24px;font-size:14px;font-weight:700;letter-spacing:0.3px;">
                ${PRODUCT_NAME}
              </td>
            </tr>
            <tr>
              <td style="padding:24px;line-height:1.55;font-size:14px;color:#0f172a;">
                ${content}
              </td>
            </tr>
            <tr>
              <td style="padding:14px 24px;border-top:1px solid #e2e8f0;color:#64748b;font-size:12px;">
                Sent from wms@siragirivel.in
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function welcomeNewUserMail(input: {
  username: string;
  email: string;
  role: string;
  temporaryPassword: string;
  resetPasswordUrl: string;
  loginUrl: string;
}) {
  const username = escapeHtml(input.username || "Team Member");
  const email = escapeHtml(input.email);
  const role = escapeHtml(input.role);
  const temporaryPassword = escapeHtml(input.temporaryPassword);
  const resetPasswordUrl = escapeHtml(input.resetPasswordUrl);
  const loginUrl = escapeHtml(input.loginUrl);

  return {
    subject: "Your workshop account is ready",
    html: wrapHtml(`
      <h2 style="margin:0 0 10px;font-size:20px;">Welcome, ${username}</h2>
      <p style="margin:0 0 14px;">Your account has been created successfully in the workshop management system.</p>
      <table cellpadding="0" cellspacing="0" style="margin:0 0 16px;">
        <tr><td style="padding:4px 0;"><strong>Login email:</strong> ${email}</td></tr>
        <tr><td style="padding:4px 0;"><strong>Role:</strong> ${role}</td></tr>
        <tr><td style="padding:4px 0;"><strong>Temporary password:</strong> ${temporaryPassword}</td></tr>
      </table>
      <p style="margin:0 0 12px;">Set your own password using the unique secure link below:</p>
      <p style="margin:0 0 18px;">
        <a href="${resetPasswordUrl}" style="display:inline-block;background:#7c3aed;color:#ffffff;text-decoration:none;padding:10px 16px;border-radius:8px;font-weight:700;">Set New Password</a>
      </p>
      <p style="margin:0 0 12px;">Direct reset link:</p>
      <p style="margin:0 0 18px;word-break:break-all;"><a href="${resetPasswordUrl}" style="color:#1d4ed8;">${resetPasswordUrl}</a></p>
      <p style="margin:0 0 12px;">You can then log in to your dashboard:</p>
      <p style="margin:0 0 18px;">
        <a href="${loginUrl}" style="display:inline-block;background:#1d4ed8;color:#ffffff;text-decoration:none;padding:10px 16px;border-radius:8px;font-weight:700;">Login To WMS</a>
      </p>
      <p style="margin:0 0 12px;">Direct login link:</p>
      <p style="margin:0 0 18px;word-break:break-all;"><a href="${loginUrl}" style="color:#1d4ed8;">${loginUrl}</a></p>
      <p style="margin:0;color:#475569;">For security, update your password after first sign in.</p>
    `),
    text:
      `Welcome to ${PRODUCT_NAME}.\n` +
      `Your account is ready.\n` +
      `Login email: ${input.email}\n` +
      `Role: ${input.role}\n` +
      `Temporary password: ${input.temporaryPassword}\n` +
      `Reset password link: ${input.resetPasswordUrl}\n` +
      `Login URL: ${input.loginUrl}\n` +
      "Please change your password after first sign in.",
  };
}

export function passwordResetMail(input: {
  email: string;
  resetPasswordUrl: string;
}) {
  const email = escapeHtml(input.email);
  const resetPasswordUrl = escapeHtml(input.resetPasswordUrl);

  return {
    subject: "Reset your workshop password",
    html: wrapHtml(`
      <h2 style="margin:0 0 10px;font-size:20px;">Password reset requested</h2>
      <p style="margin:0 0 14px;">We received a request to reset the password for your workshop account.</p>
      <table cellpadding="0" cellspacing="0" style="margin:0 0 16px;">
        <tr><td style="padding:4px 0;"><strong>Account email:</strong> ${email}</td></tr>
      </table>
      <p style="margin:0 0 12px;">Use the secure link below to set a new password:</p>
      <p style="margin:0 0 18px;">
        <a href="${resetPasswordUrl}" style="display:inline-block;background:#7c3aed;color:#ffffff;text-decoration:none;padding:10px 16px;border-radius:8px;font-weight:700;">Reset Password</a>
      </p>
      <p style="margin:0 0 12px;">If the button does not open, use this link directly:</p>
      <p style="margin:0 0 18px;word-break:break-all;"><a href="${resetPasswordUrl}" style="color:#1d4ed8;">${resetPasswordUrl}</a></p>
      <p style="margin:0;color:#475569;">If you did not request this change, you can ignore this email.</p>
    `),
    text:
      `Password reset requested for ${input.email}.\n` +
      `Reset password link: ${input.resetPasswordUrl}\n` +
      "If you did not request this change, you can ignore this email.",
  };
}

export function newUserCreatedAlertMail(input: {
  createdBy: string;
  email: string;
  role: string;
  loginUrl: string;
}) {
  const createdBy = escapeHtml(input.createdBy || "System");
  const email = escapeHtml(input.email);
  const role = escapeHtml(input.role);
  const loginUrl = escapeHtml(input.loginUrl);

  return {
    subject: "New user account created",
    html: wrapHtml(`
      <h2 style="margin:0 0 10px;font-size:20px;">New user created</h2>
      <p style="margin:0 0 14px;">A new workshop account has been added.</p>
      <table cellpadding="0" cellspacing="0" style="margin:0 0 16px;">
        <tr><td style="padding:4px 0;"><strong>Created by:</strong> ${createdBy}</td></tr>
        <tr><td style="padding:4px 0;"><strong>User email:</strong> ${email}</td></tr>
        <tr><td style="padding:4px 0;"><strong>Assigned role:</strong> ${role}</td></tr>
      </table>
      <p style="margin:0 0 16px;">The user can sign in using this link:</p>
      <p style="margin:0;"><a href="${loginUrl}" style="color:#1d4ed8;">${loginUrl}</a></p>
    `),
    text:
      `New user account created in ${PRODUCT_NAME}.\n` +
      `Created by: ${input.createdBy}\n` +
      `User email: ${input.email}\n` +
      `Role: ${input.role}\n` +
      `Login URL: ${input.loginUrl}`,
  };
}

export function notificationDigestMail(input: {
  generatedAt: string;
  lowStockCount: number;
  creditDueCount: number;
  pickupOverdueCount: number;
  pickupTodayCount: number;
  openEnquiryCount: number;
  serviceDueCount: number;
  weeklyTransactionCount: number;
  loginUrl: string;
  includesCsvAttachment?: boolean;
  lowStockDetails?: string[];
  creditDueDetails?: string[];
  pickupOverdueDetails?: string[];
  pickupTodayDetails?: string[];
  openEnquiryDetails?: string[];
  serviceDueDetails?: string[];
}) {
  const loginUrl = escapeHtml(input.loginUrl);
  const lowStockDetails = (input.lowStockDetails || []).slice(0, 5);
  const creditDueDetails = (input.creditDueDetails || []).slice(0, 5);
  const pickupOverdueDetails = (input.pickupOverdueDetails || []).slice(0, 5);
  const pickupTodayDetails = (input.pickupTodayDetails || []).slice(0, 5);
  const openEnquiryDetails = (input.openEnquiryDetails || []).slice(0, 5);
  const serviceDueDetails = (input.serviceDueDetails || []).slice(0, 5);

  const renderList = (items: string[]) => {
    if (!items.length) {
      return `<p style="margin:8px 0 0;color:#64748b;font-size:13px;">No active notifications in this section.</p>`;
    }
    const rows = items
      .map(
        (item) =>
          `<li style="margin:0 0 8px;padding:10px 12px;border:1px solid #e2e8f0;border-radius:10px;background:#ffffff;">${escapeHtml(item)}</li>`,
      )
      .join("");
    return `<ul style="list-style:none;margin:10px 0 0;padding:0;">${rows}</ul>`;
  };

  return {
    subject: "Workshop alerts and weekly report",
    html: wrapHtml(`
      <div style="margin:0 0 14px;">
        <h2 style="margin:0;font-size:22px;line-height:1.25;">Workshop Alerts</h2>
        <p style="margin:8px 0 0;color:#475569;">Generated at ${escapeHtml(input.generatedAt)}</p>
      </div>

      <table cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 18px;">
        <tr>
          <td style="width:50%;padding:0 6px 10px 0;">
            <div style="border:1px solid #e2e8f0;border-radius:12px;padding:12px;background:#f8fafc;">
              <div style="font-size:12px;color:#64748b;margin:0 0 4px;">Low Stock</div>
              <div style="font-size:22px;font-weight:700;">${input.lowStockCount}</div>
            </div>
          </td>
          <td style="width:50%;padding:0 0 10px 6px;">
            <div style="border:1px solid #e2e8f0;border-radius:12px;padding:12px;background:#f8fafc;">
              <div style="font-size:12px;color:#64748b;margin:0 0 4px;">Credit Due</div>
              <div style="font-size:22px;font-weight:700;">${input.creditDueCount}</div>
            </div>
          </td>
        </tr>
        <tr>
          <td style="width:50%;padding:0 6px 10px 0;">
            <div style="border:1px solid #e2e8f0;border-radius:12px;padding:12px;background:#f8fafc;">
              <div style="font-size:12px;color:#64748b;margin:0 0 4px;">Pickup Overdue</div>
              <div style="font-size:22px;font-weight:700;">${input.pickupOverdueCount}</div>
            </div>
          </td>
          <td style="width:50%;padding:0 0 10px 6px;">
            <div style="border:1px solid #e2e8f0;border-radius:12px;padding:12px;background:#f8fafc;">
              <div style="font-size:12px;color:#64748b;margin:0 0 4px;">Open Enquiries</div>
              <div style="font-size:22px;font-weight:700;">${input.openEnquiryCount}</div>
            </div>
          </td>
        </tr>
        <tr>
          <td style="width:50%;padding:0 6px 0 0;">
            <div style="border:1px solid #e2e8f0;border-radius:12px;padding:12px;background:#f8fafc;">
              <div style="font-size:12px;color:#64748b;margin:0 0 4px;">Service Due (7 Days)</div>
              <div style="font-size:22px;font-weight:700;">${input.serviceDueCount}</div>
            </div>
          </td>
          <td style="width:50%;padding:0 0 0 6px;">
            <div style="border:1px solid #e2e8f0;border-radius:12px;padding:12px;background:#f8fafc;">
              <div style="font-size:12px;color:#64748b;margin:0 0 4px;">Weekly Transactions</div>
              <div style="font-size:22px;font-weight:700;">${input.weeklyTransactionCount}</div>
            </div>
          </td>
        </tr>
      </table>

      <h3 style="margin:0 0 10px;font-size:16px;">Notification Details</h3>

      <div style="margin:0 0 14px;padding:12px;border:1px solid #e2e8f0;border-radius:12px;background:#f8fafc;">
        <p style="margin:0;font-weight:700;">Low stock (${input.lowStockCount})</p>
        ${renderList(lowStockDetails)}
      </div>

      <div style="margin:0 0 14px;padding:12px;border:1px solid #e2e8f0;border-radius:12px;background:#f8fafc;">
        <p style="margin:0;font-weight:700;">Credit due (${input.creditDueCount})</p>
        ${renderList(creditDueDetails)}
      </div>

      <div style="margin:0 0 14px;padding:12px;border:1px solid #e2e8f0;border-radius:12px;background:#f8fafc;">
        <p style="margin:0;font-weight:700;">Pickup overdue (${input.pickupOverdueCount})</p>
        ${renderList(pickupOverdueDetails)}
      </div>

      <div style="margin:0 0 14px;padding:12px;border:1px solid #e2e8f0;border-radius:12px;background:#f8fafc;">
        <p style="margin:0;font-weight:700;">Pickup today (${input.pickupTodayCount})</p>
        ${renderList(pickupTodayDetails)}
      </div>

      <div style="margin:0 0 14px;padding:12px;border:1px solid #e2e8f0;border-radius:12px;background:#f8fafc;">
        <p style="margin:0;font-weight:700;">Open enquiries (${input.openEnquiryCount})</p>
        ${renderList(openEnquiryDetails)}
      </div>

      <div style="margin:0 0 16px;padding:12px;border:1px solid #e2e8f0;border-radius:12px;background:#f8fafc;">
        <p style="margin:0;font-weight:700;">Service due (${input.serviceDueCount})</p>
        ${renderList(serviceDueDetails)}
      </div>

      ${
        input.includesCsvAttachment
          ? `<p style="margin:0 0 14px;color:#475569;">The weekly CSV report is attached to this email.</p>`
          : ""
      }
      <p style="margin:0;">
        <a href="${loginUrl}" style="display:inline-block;background:#0f172a;color:#ffffff;text-decoration:none;padding:10px 14px;border-radius:8px;font-weight:700;">Open WMS Dashboard</a>
      </p>
    `),
    text:
      "Workshop alerts and weekly report\n" +
      `Generated at: ${input.generatedAt}\n` +
      `Low stock alerts: ${input.lowStockCount}\n` +
      `Credit dues: ${input.creditDueCount}\n` +
      `Pickup overdue: ${input.pickupOverdueCount}\n` +
      `Pickup today: ${input.pickupTodayCount}\n` +
      `Open enquiries: ${input.openEnquiryCount}\n` +
      `Service due within 7 days: ${input.serviceDueCount}\n` +
      `Weekly transactions: ${input.weeklyTransactionCount}\n` +
      `\nLow stock details:\n${lowStockDetails.join("\n") || "None"}\n` +
      `\nCredit due details:\n${creditDueDetails.join("\n") || "None"}\n` +
      `\nPickup overdue details:\n${pickupOverdueDetails.join("\n") || "None"}\n` +
      `\nPickup today details:\n${pickupTodayDetails.join("\n") || "None"}\n` +
      `\nOpen enquiry details:\n${openEnquiryDetails.join("\n") || "None"}\n` +
      `\nService due details:\n${serviceDueDetails.join("\n") || "None"}\n` +
      `Dashboard: ${input.loginUrl}`,
  };
}

export function daybookOtpMail(input: {
  username: string;
  otp: string;
  expiresMinutes: number;
}) {
  const username = escapeHtml(input.username || "Owner");
  const otp = escapeHtml(input.otp);
  const expiresMinutes = Number(input.expiresMinutes || 10);

  return {
    subject: "Day book OTP verification",
    html: wrapHtml(`
      <h2 style="margin:0 0 10px;font-size:20px;">Day book verification required</h2>
      <p style="margin:0 0 14px;">Hello ${username}, use the OTP below to approve the day book edit/delete request.</p>
      <div style="margin:18px 0 20px;padding:14px 18px;border:1px dashed #cbd5f5;border-radius:12px;background:#f8fafc;font-size:22px;font-weight:700;letter-spacing:6px;text-align:center;">
        ${otp}
      </div>
      <p style="margin:0 0 8px;color:#475569;">This OTP expires in ${expiresMinutes} minutes.</p>
      <p style="margin:0;color:#64748b;">If you did not request this verification, please ignore this email.</p>
    `),
    text:
      `Day book verification required for ${username}.\n` +
      `OTP: ${input.otp}\n` +
      `Expires in ${expiresMinutes} minutes.\n` +
      "If you did not request this verification, ignore this email.",
  };
}

export function invoiceDeleteOtpMail(input: {
  username: string;
  otp: string;
  expiresMinutes: number;
}) {
  const username = escapeHtml(input.username || "Owner");
  const otp = escapeHtml(input.otp);
  const expiresMinutes = Number(input.expiresMinutes || 10);

  return {
    subject: "Invoice delete OTP verification",
    html: wrapHtml(`
      <h2 style="margin:0 0 10px;font-size:20px;">Invoice delete verification required</h2>
      <p style="margin:0 0 14px;">Hello ${username}, use the OTP below to approve invoice deletion.</p>
      <div style="margin:18px 0 20px;padding:14px 18px;border:1px dashed #cbd5f5;border-radius:12px;background:#f8fafc;font-size:22px;font-weight:700;letter-spacing:6px;text-align:center;">
        ${otp}
      </div>
      <p style="margin:0 0 8px;color:#475569;">This OTP expires in ${expiresMinutes} minutes.</p>
      <p style="margin:0;color:#64748b;">If you did not request this verification, please ignore this email.</p>
    `),
    text:
      `Invoice delete verification required for ${username}.\n` +
      `OTP: ${input.otp}\n` +
      `Expires in ${expiresMinutes} minutes.\n` +
      "If you did not request this verification, ignore this email.",
  };
}
