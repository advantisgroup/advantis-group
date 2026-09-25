import { Elysia } from "elysia";
import { Webhook } from "svix";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";

import { getConvex, getConvexServerKey } from "../../lib/convex.js";
import { inquiryFromReplyAddress, receivedText, stripQuoted } from "../../lib/inquiry-mail.js";
import { withWebhookHealth } from "../../lib/webhook-health.js";
import { Errors } from "../../lib/errors.js";

interface ResendTag {
  name: string;
  value: string;
}
interface ResendEventData {
  email_id?: string;
  to?: string[];
  tags?: ResendTag[] | Record<string, string>;
  bounce?: { type?: string };
}
interface ResendEvent {
  type: string;
  created_at?: string;
  data: ResendEventData;
}

const TRACKED_EVENT_TYPES = new Set([
  "email.sent",
  "email.delivered",
  "email.opened",
  "email.clicked",
  "email.bounced",
  "email.complained",
  "email.delivery_delayed",
]);

// Resend has sent tags both as an array of pairs and as a plain object
function tagValue(tags: ResendEventData["tags"], name: string): string | undefined {
  if (!tags) return undefined;
  if (Array.isArray(tags)) return tags.find((t) => t.name === name)?.value;
  return tags[name];
}

/**
 * POST /webhooks/resend — svix-verified Resend events. Three kinds of mail
 * report back here: Updates broadcasts (delivery/open/click, see
 * internal/updates.ts), the two mails a website inquiry sends (tagged
 * `inquiry_id` + `mail`, so its delivery track can show "delivered" or
 * "bounced"), and — when an inbound domain is set up — customers replying to
 * an inquiry mail, which land in that inquiry's thread.
 */
export const resendWebhookRoute = new Elysia().post(
  "/webhooks/resend",
  async ({ request, set }) => {
    const secret = process.env.RESEND_WEBHOOK_SECRET;
    if (!secret) throw Errors.internal("RESEND_WEBHOOK_SECRET not configured");

    const raw = await request.text();
    const headers = {
      "svix-id": request.headers.get("svix-id") ?? "",
      "svix-timestamp": request.headers.get("svix-timestamp") ?? "",
      "svix-signature": request.headers.get("svix-signature") ?? "",
    };

    let event: ResendEvent;
    try {
      event = new Webhook(secret).verify(raw, headers) as ResendEvent;
    } catch {
      set.status = 400;
      return { ok: false, error: "invalid signature" };
    }

    const occurredAt = event.created_at ? Date.parse(event.created_at) : Date.now();

    if (event.type === "email.received") {
      const inquiryId = (event.data.to ?? []).map(inquiryFromReplyAddress).find(Boolean);
      if (!inquiryId || !event.data.email_id) return { ok: true };
      const received = await receivedText(event.data.email_id);
      await withWebhookHealth("resend", () =>
        getConvex().mutation(api.marketing.inquiries.apiAddInboundReply, {
          serverKey: getConvexServerKey(),
          inquiryId,
          from: received.from,
          body: stripQuoted(received.text),
        }),
      );
      return { ok: true };
    }

    if (!TRACKED_EVENT_TYPES.has(event.type)) return { ok: true };

    const inquiryId = tagValue(event.data.tags, "inquiry_id");
    const mail = tagValue(event.data.tags, "mail");
    if (inquiryId && (mail === "team" || mail === "receipt")) {
      await withWebhookHealth("resend", () =>
        getConvex().mutation(api.marketing.inquiries.apiRecordMailEvent, {
          serverKey: getConvexServerKey(),
          inquiryId,
          mail,
          eventType: event.type,
          bounceType: event.data.bounce?.type,
          occurredAt,
        }),
      );
      return { ok: true };
    }

    const updateId = tagValue(event.data.tags, "update_id");
    const userId = tagValue(event.data.tags, "user_id");
    if (!event.data.email_id && !(updateId && userId)) return { ok: true };

    await withWebhookHealth("resend", () =>
      getConvex().mutation(api.updates.updates.recordEmailEvent, {
        serverKey: getConvexServerKey(),
        resendEmailId: event.data.email_id,
        updateId: updateId as Id<"updates"> | undefined,
        userId: userId as Id<"users"> | undefined,
        eventType: event.type,
        occurredAt,
      }),
    );

    return { ok: true };
  },
);
