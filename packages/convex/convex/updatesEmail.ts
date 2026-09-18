import { v } from "convex/values";

import { internal } from "./_generated/api";
import { type Id } from "./_generated/dataModel";
import { internalAction } from "./_generated/server";
import { type Audience, userMatchesAudience } from "./lib/audience";
import { internalApiFetch } from "./lib/internalApi";

/**
 * Hands the company-wide email blast for a published update off to the
 * Elysia API (api.advantisgroup.de), which owns Resend — same
 * Convex-never-calls-Resend-directly convention as outbound.ts. Safe no-op
 * when the API isn't configured (e.g. local dev without the API running).
 */
export const sendBulk = internalAction({
  args: { updateId: v.id("updates") },
  handler: async (ctx, { updateId }) => {
    const update = await ctx.runQuery(internal.updatesInternal.getForEmail, {
      updateId,
    });
    if (!update) return { sent: false, reason: "no update found" };

    const users = await ctx.runQuery(internal.updatesInternal.listActiveUsers, {});
    const recipients = users
      .filter((u) => userMatchesAudience(u, update.audience as Audience))
      // Externals must explicitly opt in to Updates emails (default off);
      // internal employees are always eligible.
      .filter((u) => !u.external || u.updatesEmailConsent === true)
      .map((u) => ({ userId: u._id, email: u.email }));
    if (recipients.length === 0) return { sent: false, reason: "recicpient length is 0" };

    const internalUrl = process.env.INTERNAL_URL ?? "https://intern.advantisgroup.de";
    try {
      const res = await internalApiFetch("/internal/updates/broadcast", {
        updateId,
        type: update.type,
        title: update.title,
        summary: update.summary,
        url: `${internalUrl}/updates/${updateId}`,
        recipients,
      });
      if (!res) {
        console.log(
          `[updatesEmail] skipping bulk send for ${updateId} — API_URL/CONVEX_SERVER_KEY not set`,
        );
        return { sent: false, reason: "skipping cause unset keys" };
      }
      if (!res.ok) {
        console.error(`[updatesEmail] broadcast failed: ${res.status} ${await res.text()}`);
        return { sent: false, reason: `Not ok` };
      }
      const body = await res.text();
      console.log(`[updatesEmail] broadcast response: ${res.status} ${body}`);
      const { results } = JSON.parse(body) as {
        results: {
          userId: string;
          email: string;
          resendEmailId?: string;
          failed?: boolean;
        }[];
      };
      await ctx.runMutation(internal.updates.recordEmailSendResults, {
        updateId,
        results: results.map((r) => ({
          userId: r.userId as Id<"users">,
          email: r.email,
          resendEmailId: r.resendEmailId,
          failed: r.failed,
        })),
      });
      return { sent: true };
    } catch (error) {
      console.error(`[updatesEmail] broadcast error:`, error);
      return { sent: false, reason: "broadcast error" };
    }
  },
});
