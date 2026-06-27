import { Resend } from "resend";

import { type NotificationEmailKind } from "@advantis/types";

import { Errors } from "./errors";

let resend: Resend | null = null;
function getResend(): Resend {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw Errors.internal("RESEND_API_KEY not configured");
  if (!resend) resend = new Resend(key);
  return resend;
}

const FROM =
  process.env.INTRANET_EMAIL_FROM ??
  "Advantis Intranet <noreply@intranet.advantisgroup.de>";
const INTRANET_URL =
  process.env.INTRANET_URL ?? "https://intranet.advantisgroup.de";

function layout(title: string, bodyHtml: string): string {
  return `<!doctype html><html><body style="margin:0;background:#f4f4f5;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#18181b">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 0">
    <tr><td align="center">
      <table role="presentation" width="520" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e4e4e7">
        <tr><td style="padding:24px 32px;border-bottom:1px solid #e4e4e7;font-weight:700;font-size:18px">Advantis Group · Intranet</td></tr>
        <tr><td style="padding:32px"><h1 style="margin:0 0 16px;font-size:20px">${title}</h1>${bodyHtml}</td></tr>
        <tr><td style="padding:20px 32px;border-top:1px solid #e4e4e7;color:#71717a;font-size:12px">intranet.advantisgroup.de</td></tr>
      </table>
    </td></tr>
  </table></body></html>`;
}

function button(href: string, label: string): string {
  return `<a href="${href}" style="display:inline-block;background:#18181b;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600">${label}</a>`;
}

type Data = Record<string, unknown>;
const str = (d: Data, k: string) =>
  typeof d[k] === "string" ? (d[k] as string) : "";

function render(
  kind: NotificationEmailKind,
  data: Data
): {
  subject: string;
  html: string;
} {
  switch (kind) {
    case "invite": {
      const token = str(data, "token");
      const role = str(data, "role") || "employee";
      const by = str(data, "invitedByName");
      const url = `${INTRANET_URL}/sign-up?invite=${encodeURIComponent(token)}`;
      return {
        subject: "You've been invited to the Advantis intranet",
        html: layout(
          "You've been invited",
          `<p style="margin:0 0 16px;line-height:1.6">${by ? `${by} invited you` : "You've been invited"} to join the Advantis Group intranet as <strong>${role}</strong>.</p>
           <p style="margin:0 0 24px;line-height:1.6">Sign up with this email address to get instant access.</p>
           ${button(url, "Accept invitation")}`
        ),
      };
    }
    case "access-approved": {
      const role = str(data, "role") || "employee";
      return {
        subject: "Your intranet access was approved",
        html: layout(
          "Access approved",
          `<p style="margin:0 0 24px;line-height:1.6">Your request to access the Advantis intranet was approved (role: <strong>${role}</strong>). You can sign in now.</p>
           ${button(INTRANET_URL, "Open the intranet")}`
        ),
      };
    }
    case "access-denied":
      return {
        subject: "Your intranet access request",
        html: layout(
          "Access request update",
          `<p style="margin:0;line-height:1.6">Your request to access the Advantis intranet was not approved. If you think this is a mistake, please contact your manager or IT.</p>`
        ),
      };
    case "absence-decision": {
      const decision = str(data, "decision");
      const type = str(data, "type");
      const start = str(data, "startDate");
      const end = str(data, "endDate");
      const note = str(data, "note");
      return {
        subject: `Absence ${decision}: ${type} (${start} – ${end})`,
        html: layout(
          `Absence ${decision}`,
          `<p style="margin:0 0 16px;line-height:1.6">Your <strong>${type}</strong> absence from <strong>${start}</strong> to <strong>${end}</strong> was <strong>${decision}</strong>.</p>
           ${note ? `<p style="margin:0 0 24px;line-height:1.6;color:#52525b">Note: ${note}</p>` : ""}
           ${button(`${INTRANET_URL}/absences`, "View absences")}`
        ),
      };
    }
    case "guest-invite": {
      const token = str(data, "token");
      const label = str(data, "label") || "Guest";
      const hours = typeof data.hours === "number" ? data.hours : 48;
      const url = `${INTRANET_URL}/guest/login?token=${encodeURIComponent(token)}`;
      return {
        subject: "Your Advantis intranet guest tour",
        html: layout(
          "You've been given a guest tour",
          `<p style="margin:0 0 16px;line-height:1.6">Hi ${label}, you've been granted a temporary guest view of the Advantis Group intranet. This link gives a read-only tour and expires in about ${hours} hours.</p>
           ${button(url, "Open guest tour")}`
        ),
      };
    }
    case "digest":
      return {
        subject: "Your Advantis intranet digest",
        html: layout(
          "Digest",
          `<p style="margin:0;line-height:1.6">${str(data, "summary") || "Here's what's new on the intranet."}</p>`
        ),
      };
  }
}

export async function sendNotificationEmail(
  kind: NotificationEmailKind,
  to: string,
  data: Data
): Promise<void> {
  const { subject, html } = render(kind, data);
  const { error } = await getResend().emails.send({
    from: FROM,
    to,
    subject,
    html,
  });
  if (error) throw Errors.upstream(`Resend error: ${error.message}`);
}
