import { Elysia } from "elysia";
import { Webhook } from "svix";

import { api } from "@advantis/convex/api";

import { getConvex, getConvexServerKey } from "../../lib/convex";
import { Errors } from "../../lib/errors";

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
}
interface ClerkEvent {
  type: string;
  data: ClerkUserData;
}

function primaryEmail(data: ClerkUserData): string | undefined {
  const list = data.email_addresses ?? [];
  const primary = list.find((e) => e.id === data.primary_email_address_id);
  return (primary ?? list[0])?.email_address;
}

/**
 * POST /webhooks/clerk — svix-verified Clerk lifecycle events from the intranet
 * Clerk instance. Keeps the Convex `users` mirror fresh; never creates members.
 */
export const clerkWebhookRoute = new Elysia().post(
  "/webhooks/clerk",
  async ({ request, set }) => {
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

    const convex = getConvex();
    const serverKey = getConvexServerKey();

    if (event.type === "user.created" || event.type === "user.updated") {
      await convex.mutation(api.clerkSync.syncFromClerk, {
        serverKey,
        clerkUserId: event.data.id,
        email: primaryEmail(event.data),
        firstName: event.data.first_name ?? undefined,
        lastName: event.data.last_name ?? undefined,
        avatarUrl: event.data.image_url ?? undefined,
      });
    } else if (event.type === "user.deleted") {
      await convex.mutation(api.clerkSync.deactivateFromClerk, {
        serverKey,
        clerkUserId: event.data.id,
      });
    }

    return { ok: true };
  }
);
