import { Elysia } from "elysia";
import { Webhook } from "svix";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";

import { getConvex, getConvexServerKey } from "../../lib/convex.js";
import { withWebhookHealth } from "../../lib/webhook-health.js";
import { Errors } from "../../lib/errors.js";

interface ResendTag {
  name: string;
  value: string;
}
interface ResendEventData {
  email_id?: string;
  tags?: ResendTag[];
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

function tagValue(tags: ResendTag[] | undefined, name: string): string | undefined {
  return tags?.find((t) => t.name === name)?.value;
}

/**
 * POST /webhooks/resend — svix-verified Resend delivery/open/click events for
 * Updates email broadcasts (see internal/updates.ts + updateEmailRecipients
 * in Convex). Same verification shape as webhooks/clerk.ts — Resend signs
 * webhooks with Svix too.
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

    if (!TRACKED_EVENT_TYPES.has(event.type)) return { ok: true };

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
        occurredAt: event.created_at ? Date.parse(event.created_at) : Date.now(),
      }),
    );

    return { ok: true };
  },
);
