import { ConvexError, v } from "convex/values";

import { type MutationCtx, type QueryCtx } from "../_generated/server";
import { serverQuery, userMutation, userQuery } from "../functions";
import { recordUnifiedAudit } from "../lib/auditLogWrite";

/**
 * HR-wide settings. For now only the advertised job: CV imports (upload and
 * the application inbox) file every new applicant under it, because the
 * position a CV names is the person's last job, not the one they applied to.
 */

const MAX_POSITION_LENGTH = 120;

async function current(ctx: QueryCtx | MutationCtx) {
  return await ctx.db.query("hrSettings").first();
}

export const get = userQuery({
  applicant: "access",
  args: {},
  handler: async (ctx) => {
    const row = await current(ctx);
    return { openPosition: row?.openPosition ?? null };
  },
});

/** Empty clears it: imports then keep the position from the CV. */
export const setOpenPosition = userMutation({
  applicant: "access",
  args: { openPosition: v.string() },
  handler: async (ctx, args) => {
    const openPosition = args.openPosition.trim() || undefined;
    if (openPosition && openPosition.length > MAX_POSITION_LENGTH) {
      throw new ConvexError({
        code: "bad_request",
        message: `Höchstens ${MAX_POSITION_LENGTH} Zeichen`,
      });
    }
    const now = Date.now();
    const existing = await current(ctx);
    const fields = { openPosition, updatedBy: ctx.caller.id, updatedAt: now };
    if (existing) await ctx.db.patch(existing._id, fields);
    else await ctx.db.insert("hrSettings", fields);
    await recordUnifiedAudit(ctx, {
      domain: "applicant",
      actorUserId: ctx.caller.id,
      action: "hr_open_position_set",
      detail: openPosition ?? "",
      at: now,
    });
  },
});

/** apps/api reads this before it creates an applicant from a CV. */
export const apiImportDefaults = serverQuery({
  args: {},
  handler: async (ctx) => {
    const row = await current(ctx);
    return { openPosition: row?.openPosition ?? null };
  },
});
