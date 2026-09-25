import { createHmac } from "node:crypto";

import { classifyResendError, type FailureReason } from "@advantis/convex/marketing/inquiry";
import { Resend } from "resend";

import {
  InquiryReceiptEmail,
  type InquiryMailData,
  TeamInquiryEmail,
  receiptSubject,
  teamSubject,
} from "@/components/email/inquiry-emails";
import { PUBLIC_ORIGIN } from "@/lib/seo";

const resend = new Resend(process.env.RESEND_API_KEY);

export const inbox = () => process.env.NEXT_PUBLIC_EMAIL_ADRESS!;

type SendResult =
  | { ok: true; emailId: string }
  | { ok: false; error: string; reason: FailureReason };

async function send(payload: Parameters<typeof resend.emails.send>[0]): Promise<SendResult> {
  try {
    const { data, error } = await resend.emails.send(payload);
    if (error || !data?.id) {
      return {
        ok: false,
        error: error?.message ?? "No id in the response",
        reason: classifyResendError(error),
      };
    }
    return { ok: true, emailId: data.id };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      reason: classifyResendError(error),
    };
  }
}

/**
 * Where a customer's reply to our mail should go. With an inbound domain set
 * up in Resend it's an address that files the reply under the inquiry
 * (apps/api /webhooks/resend); without one, straight to the team inbox.
 */
export function replyAddress(inquiryId: string) {
  const domain = process.env.INQUIRY_INBOUND_DOMAIN;
  const secret = process.env.INQUIRY_REPLY_SECRET;
  if (!domain || !secret) return inbox();
  const signature = createHmac("sha256", secret).update(inquiryId).digest("hex").slice(0, 16);
  return `reply+${inquiryId}.${signature}@${domain}`;
}

const tags = (id: string, mail: "team" | "receipt") => [
  { name: "inquiry_id", value: id },
  { name: "mail", value: mail },
];

/** The inquiry, in German, to the team inbox; replying goes to the customer. */
export const sendTeamMail = (data: InquiryMailData) =>
  send({
    from: `ADVANTIS GROUP Website <${inbox()}>`,
    to: [inbox()],
    replyTo: data.email,
    subject: teamSubject(data),
    react: TeamInquiryEmail({ data, intranetUrl: process.env.NEXT_PUBLIC_INTRANET_URL }),
    tags: tags(data.id, "team"),
  });

/** The customer's own receipt, in the language they wrote in. */
export const sendReceipt = (data: InquiryMailData, signedIn: boolean) =>
  send({
    from: `ADVANTIS GROUP <${inbox()}>`,
    to: [data.email],
    replyTo: replyAddress(data.id),
    subject: receiptSubject(data),
    react: InquiryReceiptEmail({ data, inbox: inbox(), siteUrl: PUBLIC_ORIGIN, signedIn }),
    tags: tags(data.id, "receipt"),
  });
