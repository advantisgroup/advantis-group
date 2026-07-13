import { Resend } from "resend";

import { type NotificationEmailKind } from "@advantis/types";

import { Errors } from "./errors.js";

let resend: Resend | null = null;
function getResend(): Resend {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.error("[resend] RESEND_API_KEY not configured");
    throw Errors.internal("RESEND_API_KEY not configured");
  }
  if (!resend) resend = new Resend(key);
  return resend;
}

const FROM =
  process.env.INTERNAL_EMAIL_FROM ??
  "Advantis Intranet <noreply@advantisgroup.de>";
const INTERNAL_URL =
  process.env.INTERNAL_URL ?? "https://intern.advantisgroup.de";

function layout(title: string, bodyHtml: string): string {
  return `<!doctype html><html><body style="margin:0;background:#f4f4f5;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#18181b">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 0">
    <tr><td align="center">
      <table role="presentation" width="520" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e4e4e7">
        <tr><td style="padding:24px 32px;border-bottom:1px solid #e4e4e7;font-weight:700;font-size:18px">advantis GmbH · Intranet</td></tr>
        <tr><td style="padding:32px"><h1 style="margin:0 0 16px;font-size:20px">${title}</h1>${bodyHtml}</td></tr>
        <tr><td style="padding:20px 32px;border-top:1px solid #e4e4e7;color:#71717a;font-size:12px">intern.advantisgroup.de</td></tr>
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
      const url = `${INTERNAL_URL}/sign-up?invite=${encodeURIComponent(token)}`;
      return {
        subject: "You've been invited to the Advantis intranet",
        html: layout(
          "You've been invited",
          `<p style="margin:0 0 16px;line-height:1.6">${by ? `${by} invited you` : "You've been invited"} to join the advantis GmbH intranet as <strong>${role}</strong>.</p>
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
           ${button(INTERNAL_URL, "Open the intranet")}`
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
           ${button(`${INTERNAL_URL}/absences`, "View absences")}`
        ),
      };
    }
    case "upload-decision": {
      const decision = str(data, "decision");
      const fileName = str(data, "fileName");
      const folder = str(data, "folder");
      const note = str(data, "note");
      return {
        subject: `Upload ${decision}: ${fileName}`,
        html: layout(
          `Upload ${decision}`,
          `<p style="margin:0 0 16px;line-height:1.6">Your upload <strong>${fileName}</strong>${folder ? ` to <strong>${folder}</strong>` : ""} was <strong>${decision}</strong>.</p>
           ${note ? `<p style="margin:0 0 24px;line-height:1.6;color:#52525b">Note: ${note}</p>` : ""}
           ${button(`${INTERNAL_URL}/files`, "Open files")}`
        ),
      };
    }
    case "guest-invite": {
      const token = str(data, "token");
      const label = str(data, "label") || "Guest";
      const hours = typeof data.hours === "number" ? data.hours : 48;
      const url = `${INTERNAL_URL}/guest/login?token=${encodeURIComponent(token)}`;
      return {
        subject: "Your Advantis intranet guest tour",
        html: layout(
          "You've been given a guest tour",
          `<p style="margin:0 0 16px;line-height:1.6">Hi ${label}, you've been granted a temporary guest view of the advantis GmbH intranet. This link gives a read-only tour and expires in about ${hours} hours.</p>
           ${button(url, "Open guest tour")}`
        ),
      };
    }
    case "chat-reinvite": {
      const inviter = str(data, "inviterName") || "A colleague";
      const conversationId = str(data, "conversationId");
      const url = conversationId
        ? `${INTERNAL_URL}/chat?rejoin=${encodeURIComponent(conversationId)}`
        : `${INTERNAL_URL}/chat`;
      return {
        subject: `${inviter} wants to reconnect on the intranet chat`,
        html: layout(
          "You've been re-invited to a chat",
          `<p style="margin:0 0 16px;line-height:1.6"><strong>${inviter}</strong> would like to keep chatting with you on the advantis GmbH intranet.</p>
           <p style="margin:0 0 24px;line-height:1.6">Re-join to keep the conversation — otherwise it will be deleted within 48 hours.</p>
           ${button(url, "Re-join the chat")}`
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

const UPDATE_SUBJECT_PREFIX: Record<"incident" | "maintenance" | "changelog", string> = {
  incident: "Incident",
  maintenance: "Scheduled maintenance",
  changelog: "What's new",
};

export function renderUpdateEmail(update: {
  type: "incident" | "maintenance" | "changelog";
  title: string;
  summary: string;
  url: string;
}): { subject: string; html: string } {
  return {
    subject: `${UPDATE_SUBJECT_PREFIX[update.type]}: ${update.title}`,
    html: layout(
      update.title,
      `<p style="margin:0 0 24px;line-height:1.6">${update.summary}</p>
       ${button(update.url, "Read the full update")}`
    ),
  };
}

export interface BroadcastRecipient {
  userId: string;
  email: string;
}

export interface BroadcastResult extends BroadcastRecipient {
  resendEmailId?: string;
  failed?: boolean;
}

/** Batch-sends the same update email to many recipients, chunked to Resend's 100-per-call cap. */
export async function sendUpdateBroadcast(
  update: { type: "incident" | "maintenance" | "changelog"; title: string; summary: string; url: string },
  updateId: string,
  recipients: BroadcastRecipient[]
): Promise<BroadcastResult[]> {
  console.log(recipients)
  const { subject, html } = renderUpdateEmail(update);
  const results: BroadcastResult[] = [];
  const CHUNK = 100;
  for (let i = 0; i < recipients.length; i += CHUNK) {
    const chunk = recipients.slice(i, i + CHUNK);
    console.log(
      `[resend] sending batch ${i}-${i + chunk.length} of ${recipients.length} for update ${updateId}`
    );
    let data, error;
    try {
      ({ data, error } = await getResend().batch.send(
        chunk.map(r => ({
          from: FROM,
          to: r.email,
          subject,
          html,
          tags: [
            { name: "update_id", value: updateId },
            { name: "user_id", value: r.userId },
          ],
        }))
      ));
    } catch (thrown) {
      console.error(`[resend] batch send threw for update ${updateId}:`, thrown);
      results.push(...chunk.map(r => ({ ...r, failed: true })));
      continue;
    }
    if (error || !data) {
      console.error(
        `[resend] batch send failed for update ${updateId}:`,
        JSON.stringify(error)
      );
      results.push(...chunk.map(r => ({ ...r, failed: true })));
      continue;
    }
    data.data.forEach((sent, idx) => {
      results.push({ ...chunk[idx], resendEmailId: sent.id });
    });
  }
  return results;
}
