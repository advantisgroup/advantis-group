import { Resend } from "resend";

import { type NotificationEmailKind } from "./types.js";

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

const FROM = process.env.INTERNAL_EMAIL_FROM ?? "Advantis Intranet <noreply@advantisgroup.de>";
const INTERNAL_URL = process.env.INTERNAL_URL ?? "https://intern.advantisgroup.de";

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
const str = (d: Data, k: string) => (typeof d[k] === "string" ? (d[k] as string) : "");

/** Escapes a value before it goes into an email body. Needed for the password
 * reset templates specifically: the account email there is typed into a
 * public login form, so it's attacker-controlled all the way to the admin's
 * inbox. */
function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function render(
  kind: NotificationEmailKind,
  data: Data,
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
           ${button(url, "Accept invitation")}`,
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
           ${button(INTERNAL_URL, "Open the intranet")}`,
        ),
      };
    }
    case "access-denied":
      return {
        subject: "Your intranet access request",
        html: layout(
          "Access request update",
          `<p style="margin:0;line-height:1.6">Your request to access the Advantis intranet was not approved. If you think this is a mistake, please contact your manager or IT.</p>`,
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
           ${button(`${INTERNAL_URL}/absences`, "View absences")}`,
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
           ${button(`${INTERNAL_URL}/files`, "Open files")}`,
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
           ${button(url, "Re-join the chat")}`,
        ),
      };
    }
    case "digest":
      return {
        subject: "Your Advantis intranet digest",
        html: layout(
          "Digest",
          `<p style="margin:0;line-height:1.6">${str(data, "summary") || "Here's what's new on the intranet."}</p>`,
        ),
      };
    case "academy-invite": {
      const academyName = str(data, "academyName") || "the Wallbox Sales Academy";
      const code = str(data, "code");
      const by = str(data, "invitedByName");
      const path = str(data, "path") || "/wallbox-sales-academy";
      const url = `${INTERNAL_URL}${path}?code=${encodeURIComponent(code)}`;
      return {
        subject: `You've been invited to ${academyName}`,
        html: layout(
          "You've been invited to a training",
          `<p style="margin:0 0 16px;line-height:1.6">${by ? `${by} invited you` : "You've been invited"} to ${academyName} on the intranet.</p>
           <p style="margin:0 0 8px;line-height:1.6">Your access code:</p>
           <p style="margin:0 0 24px;font-size:22px;font-weight:700;letter-spacing:0.08em">${code}</p>
           ${button(url, "Open the training")}`,
        ),
      };
    }
    case "password-reset-request": {
      const area = esc(str(data, "area"));
      const accountEmail = esc(str(data, "accountEmail"));
      const requestedByEmail = esc(str(data, "requestedByEmail"));
      const requestedAt = str(data, "requestedAt");
      const requestId = str(data, "requestId");
      const selfService = data.selfService === true;
      const when = requestedAt ? new Date(requestedAt).toUTCString() : "just now";
      const url = `${INTERNAL_URL}/admin/password-resets?request=${encodeURIComponent(requestId)}`;
      // The filer and the account are shown as two separate lines on purpose:
      // approving is a judgement call about whether those two are the same
      // person, and burying that in prose is how it gets skimmed past.
      const filedBy = requestedByEmail
        ? selfService
          ? `<p style="margin:0 0 8px;line-height:1.6">Filed by: <strong>${requestedByEmail}</strong> (the account holder)</p>`
          : `<p style="margin:0 0 8px;line-height:1.6;color:#b91c1c">Filed by: <strong>${requestedByEmail}</strong> — <strong>not</strong> the account holder. Confirm in person before issuing anything.</p>`
        : `<p style="margin:0 0 8px;line-height:1.6;color:#b91c1c">Filed by: not signed in — identity unverified. Confirm in person before issuing anything.</p>`;
      return {
        subject: `Password reset requested: ${accountEmail} (${area})`,
        html: layout(
          "Password reset requested",
          `<p style="margin:0 0 8px;line-height:1.6">Account: <strong>${accountEmail}</strong></p>
           <p style="margin:0 0 8px;line-height:1.6">Area: <strong>${area}</strong></p>
           <p style="margin:0 0 8px;line-height:1.6">When: <strong>${when}</strong></p>
           ${filedBy}
           <p style="margin:16px 0 24px;line-height:1.6">Nothing has changed yet. Open the queue to review who asked, for which account, and issue a one-time reset link if it checks out — the link is mailed to the account holder, never to whoever asked.</p>
           ${button(url, "Review the request")}`,
        ),
      };
    }
    // Clerk sends its own security mail for the things Clerk owns — password
    // changes, new sign-ins. It knows nothing about this app's passkeys or
    // authenticator app, which live in Convex, so those events are ours to
    // report. Deliberately notification-only: there is no "manage
    // preferences" link, because the one person who must never be able to
    // switch these off is whoever just took the credential away.
    case "security-alert": {
      const headline = str(data, "headline");
      const detail = typeof data.detail === "string" ? data.detail : "";
      const url = typeof data.url === "string" ? data.url : "";
      return {
        subject: `Security alert: ${headline}`,
        html: layout(
          headline,
          `<p style="margin:0 0 16px;line-height:1.6">${esc(detail)}</p>
           <p style="margin:0 0 24px;line-height:1.6">If this was you, nothing more to do.</p>
           ${url ? button(url, "Review account security") : ""}
           <p style="margin:24px 0 0;line-height:1.6;color:#b91c1c;font-size:13px">If it wasn't you, someone else may be signed in as you. Sign out everywhere from the security page and tell IT straight away.</p>`,
        ),
      };
    }
    case "admin-verification-code": {
      const code = str(data, "code");
      const expiresInMinutes =
        typeof data.expiresInMinutes === "number" ? data.expiresInMinutes : 10;
      return {
        subject: `Your verification code: ${code}`,
        html: layout(
          "Verify it's you",
          `<p style="margin:0 0 16px;line-height:1.6">Use this code to approve or dismiss a password-reset request in the intranet admin queue.</p>
           <p style="margin:0 0 24px;font-size:28px;font-weight:700;letter-spacing:0.12em;font-family:monospace">${esc(code)}</p>
           <p style="margin:0 0 8px;line-height:1.6;color:#71717a;font-size:13px">Expires in about ${expiresInMinutes} minutes.</p>
           <p style="margin:24px 0 0;line-height:1.6;color:#b91c1c;font-size:13px">Didn't request this? Someone may have access to your intranet session — change your password and tell IT immediately.</p>`,
        ),
      };
    }
    case "password-reset-link": {
      const area = esc(str(data, "area"));
      const url = str(data, "url");
      const expiresAt = typeof data.expiresAt === "number" ? data.expiresAt : null;
      const minutes = expiresAt ? Math.max(1, Math.round((expiresAt - Date.now()) / 60000)) : 60;
      return {
        subject: `Your ${area} password reset link`,
        html: layout(
          "Reset your password",
          `<p style="margin:0 0 16px;line-height:1.6">An admin approved your request to reset your <strong>${area}</strong> password.</p>
           <p style="margin:0 0 24px;line-height:1.6">This link works once and expires in about <strong>${minutes} minutes</strong>.</p>
           ${button(url, "Choose a new password")}
           <p style="margin:24px 0 0;line-height:1.6;color:#71717a;font-size:13px">Didn't ask for this? Don't open the link — tell an admin, and it will be revoked.</p>`,
        ),
      };
    }
  }
}

export async function sendNotificationEmail(
  kind: NotificationEmailKind,
  to: string,
  data: Data,
): Promise<void> {
  const { subject, html } = render(kind, data);
  const { error } = await getResend().emails.send({
    from: FROM,
    to,
    subject,
    html,
  });
  if (
    kind === "password-reset-request" ||
    kind === "password-reset-link" ||
    kind === "admin-verification-code"
  ) {
    // Masked recipient only — a reset link in a log line would be a
    // credential in a log line.
    const [local, domain] = to.split("@");
    console.log(
      `[passwordReset] email kind=${kind} to=${local?.slice(0, 1)}***@${domain} ok=${!error}`,
    );
  }
  if (error) throw Errors.upstream(`Resend error: ${error.message}`);
}

/**
 * Delivers an email Clerk already rendered (subject/body from its
 * `email.created` webhook payload) via Resend instead of Clerk's own
 * SendGrid pool. Used for any template with "Delivered by Clerk" switched
 * off in the Clerk Dashboard. Never logs the body — it's the actual OTP
 * code / reset link for auth emails.
 */
export async function sendClerkEmail(params: {
  to: string;
  subject: string;
  html: string;
  text?: string | null;
  slug?: string | null;
}): Promise<void> {
  const { to, subject, html, text, slug } = params;
  const { error } = await getResend().emails.send({
    from: FROM,
    to,
    subject,
    html,
    ...(text ? { text } : {}),
    ...(slug ? { tags: [{ name: "clerk_template", value: slug }] } : {}),
  });
  const [local, domain] = to.split("@");
  console.log(
    `[clerkEmail] slug=${slug ?? "unknown"} to=${local?.slice(0, 1)}***@${domain} ok=${!error}`,
  );
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
       ${button(update.url, "Read the full update")}`,
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
  update: {
    type: "incident" | "maintenance" | "changelog";
    title: string;
    summary: string;
    url: string;
  },
  updateId: string,
  recipients: BroadcastRecipient[],
): Promise<BroadcastResult[]> {
  const { subject, html } = renderUpdateEmail(update);
  const results: BroadcastResult[] = [];
  const CHUNK = 100;
  for (let i = 0; i < recipients.length; i += CHUNK) {
    const chunk = recipients.slice(i, i + CHUNK);
    console.log(
      `[resend] sending batch ${i}-${i + chunk.length} of ${recipients.length} for update ${updateId}`,
    );
    let data, error;
    try {
      ({ data, error } = await getResend().batch.send(
        chunk.map((r) => ({
          from: FROM,
          to: r.email,
          subject,
          html,
          tags: [
            { name: "update_id", value: updateId },
            { name: "user_id", value: r.userId },
          ],
        })),
      ));
    } catch (thrown) {
      console.error(`[resend] batch send threw for update ${updateId}:`, thrown);
      results.push(...chunk.map((r) => ({ ...r, failed: true })));
      continue;
    }
    if (error || !data) {
      console.error(`[resend] batch send failed for update ${updateId}:`, JSON.stringify(error));
      results.push(...chunk.map((r) => ({ ...r, failed: true })));
      continue;
    }
    data.data.forEach((sent, idx) => {
      results.push({ ...chunk[idx], resendEmailId: sent.id });
    });
  }
  return results;
}
