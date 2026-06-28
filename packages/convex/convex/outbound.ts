import { v } from "convex/values";

import { internalAction } from "./_generated/server";

const roleArg = v.union(
  v.literal("admin"),
  v.literal("manager"),
  v.literal("employee")
);

/**
 * Hand a transactional email off to the Elysia API (api.advantisgroup.de),
 * which owns Resend. Scheduled from mutations via
 * `internal.outbound.sendNotificationEmail`. Safe no-op when the API isn't
 * configured (e.g. local dev without the API running) — the in-app
 * notification already covers the user-visible signal.
 */
export const sendNotificationEmail = internalAction({
  args: {
    kind: v.union(
      v.literal("invite"),
      v.literal("access-approved"),
      v.literal("access-denied"),
      v.literal("absence-decision"),
      v.literal("guest-invite"),
      v.literal("digest")
    ),
    to: v.string(),
    data: v.any(),
  },
  handler: async (_ctx, args) => {
    const baseUrl = process.env.API_INTERNAL_URL ?? process.env.API_URL;
    const serverKey = process.env.CONVEX_SERVER_KEY;
    if (!baseUrl || !serverKey) {
      console.warn(
        `[outbound] skipping ${args.kind} email to ${args.to} — API_URL/CONVEX_SERVER_KEY not set`
      );
      return { sent: false };
    }
    try {
      const res = await fetch(`${baseUrl}/internal/notifications`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-convex-server-key": serverKey,
        },
        body: JSON.stringify({ kind: args.kind, to: args.to, data: args.data }),
      });
      if (!res.ok) {
        console.error(
          `[outbound] ${args.kind} email failed: ${res.status} ${await res.text()}`
        );
        return { sent: false };
      }
      return { sent: true };
    } catch (error) {
      console.error(`[outbound] ${args.kind} email error:`, error);
      return { sent: false };
    }
  },
});

/**
 * Ask the Elysia API (which owns the Clerk backend client) to create — and send
 * — a Clerk invitation for `email`. Scheduled from `invites.create`/`resend`.
 * Best-effort: the invite row already exists, so a transient failure just means
 * the admin can hit "resend". The role is carried in the invitation's public
 * metadata for reference; the Convex invite row stays the source of truth.
 */
export const sendClerkInvitation = internalAction({
  args: {
    email: v.string(),
    role: roleArg,
    invitedByName: v.optional(v.string()),
  },
  handler: async (_ctx, args) => {
    const baseUrl = process.env.API_INTERNAL_URL ?? process.env.API_URL;
    const serverKey = process.env.CONVEX_SERVER_KEY;
    if (!baseUrl || !serverKey) {
      console.warn(
        `[outbound] skipping Clerk invitation to ${args.email} — API_URL/CONVEX_SERVER_KEY not set`
      );
      return { sent: false };
    }
    try {
      const res = await fetch(`${baseUrl}/internal/clerk/invitations`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-convex-server-key": serverKey,
        },
        body: JSON.stringify({
          email: args.email,
          role: args.role,
          invitedByName: args.invitedByName,
        }),
      });
      if (!res.ok) {
        console.error(
          `[outbound] Clerk invitation failed: ${res.status} ${await res.text()}`
        );
        return { sent: false };
      }
      return { sent: true };
    } catch (error) {
      console.error(`[outbound] Clerk invitation error:`, error);
      return { sent: false };
    }
  },
});
