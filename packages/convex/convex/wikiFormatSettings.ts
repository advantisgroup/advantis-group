import { sandboxedMutation as mutation } from "./lib/sandbox";
import { v } from "convex/values";

import { query } from "./_generated/server";
import { requireCapability, requireUser } from "./lib/auth";

const KEY = "default";

/** The org-wide default formatting instructions for the "format with AI"
 *  wiki assist — empty string until a manager has ever saved one. */
export const get = query({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx);
    const row = await ctx.db
      .query("wikiFormatSettings")
      .withIndex("by_key", (q) => q.eq("key", KEY))
      .unique();
    return row?.value ?? "";
  },
});

export const set = mutation({
  args: { value: v.string() },
  handler: async (ctx, { value }) => {
    const user = await requireCapability(ctx, "manage_guidebooks");
    const row = await ctx.db
      .query("wikiFormatSettings")
      .withIndex("by_key", (q) => q.eq("key", KEY))
      .unique();
    const patch = { value: value.trim(), updatedByUserId: user._id, updatedAt: Date.now() };
    if (row) await ctx.db.patch(row._id, patch);
    else await ctx.db.insert("wikiFormatSettings", { key: KEY, ...patch });
    return { ok: true };
  },
});
