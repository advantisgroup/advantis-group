import { Elysia } from "elysia";
import { Webhook } from "svix";

import { api } from "@advantis/convex/api";

import { getConvex, getConvexServerKey } from "../../lib/convex.js";
import { Errors } from "../../lib/errors.js";
import { getRedis } from "../../lib/redis.js";
import { sendClerkEmail } from "../../lib/resend.js";
import { withWebhookHealth } from "../../lib/webhook-health.js";

interface ClerkEmail {
  id: string;
  email_address: string;
}
interface ClerkUserData {
  id: string;
  email_addresses?: ClerkEmail[];
  primary_email_address_id?: string;
  first_name?: string | null;
  last_name?: string | null;
  image_url?: string | null;
  updated_at?: number;
  banned?: boolean;
}
// Matches @clerk/backend's EmailJSON — sent only for templates where
// "Delivered by Clerk" has been turned off in the Clerk Dashboard.
interface ClerkEmailData {
  slug?: string | null;
  to_email_address?: string;
  subject?: string;
  body?: string;
  body_plain?: string | null;
  delivered_by_clerk: boolean;
}
interface ClerkEvent {
  type: string;
  data: unknown;
}

function primaryEmail(data: ClerkUserData): string | undefined {
  const list = data.email_addresses ?? [];
  const primary = list.find((e) => e.id === data.primary_email_address_id);
  return (primary ?? list[0])?.email_address;
}

/**
 * POST /webhooks/clerk — svix-verified Clerk lifecycle events from the shared
 * Clerk instance. Keeps the Convex `users` mirror fresh (never creates
 * members) and, for any template with "Delivered by Clerk" switched off in
 * the Dashboard, delivers `email.created` events ourselves via Resend —
 * Clerk's shared SendGrid pool gets throttled by some German ISPs (1&1/GMX),
 * Resend's advantisgroup.de sending domain does not.
 */
export const clerkWebhookRoute = new Elysia().post("/webhooks/clerk", async ({ request, set }) => {
  const secret = process.env.CLERK_WEBHOOK_SECRET;
  if (!secret) throw Errors.internal("CLERK_WEBHOOK_SECRET not configured");

  const raw = await request.text();
  const headers = {
    "svix-id": request.headers.get("svix-id") ?? "",
    "svix-timestamp": request.headers.get("svix-timestamp") ?? "",
    "svix-signature": request.headers.get("svix-signature") ?? "",
  };

  let event: ClerkEvent;
  try {
    event = new Webhook(secret).verify(raw, headers) as ClerkEvent;
  } catch {
    set.status = 400;
    return { ok: false, error: "invalid signature" };
  }

  return withWebhookHealth("clerk", async () => {
    const convex = getConvex();
    const serverKey = getConvexServerKey();

    if (event.type === "user.created" || event.type === "user.updated") {
      const user = event.data as ClerkUserData;
      await convex.mutation(api.people.clerkSync.syncFromClerk, {
        serverKey,
        clerkUserId: user.id,
        updatedAt: user.updated_at,
        banned: user.banned,
        email: primaryEmail(user),
        firstName: user.first_name ?? undefined,
        lastName: user.last_name ?? undefined,
        avatarUrl: user.image_url ?? undefined,
      });
    } else if (event.type === "user.deleted") {
      const user = event.data as ClerkUserData;
      await convex.mutation(api.people.clerkSync.deactivateFromClerk, {
        serverKey,
        clerkUserId: user.id,
      });
    } else if (event.type === "email.created") {
      const email = event.data as ClerkEmailData;
      // Already delivered by Clerk — nothing to do. Shouldn't happen once a
      // template's toggle is off, but never double-send if it does.
      if (email.delivered_by_clerk) return { ok: true };
      if (!email.to_email_address || !email.subject || !email.body) return { ok: true };
      // Svix retries until it sees a 2xx, so the same email can arrive twice.
      const firstDelivery = await getRedis()?.set(`clerk-email:${headers["svix-id"]}`, 1, {
        nx: true,
        ex: 86_400,
      });
      if (firstDelivery === null) return { ok: true };
      await sendClerkEmail({
        to: email.to_email_address,
        subject: email.subject,
        html: email.body,
        text: email.body_plain,
        slug: email.slug,
      });
    }
    return { ok: true };
  });
});
