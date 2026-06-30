import { v } from "convex/values";

import { internalAction } from "./_generated/server";

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
      v.literal("upload-decision"),
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
