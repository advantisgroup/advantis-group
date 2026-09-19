import { query, userMutation, userQuery } from "../functions";
import { v } from "convex/values";
const KEY = "default";

/** The org-wide default formatting instructions for the "format with AI"
 *  wiki assist — empty string until a manager has ever saved one. */
export const get = userQuery({
  args: {},
  handler: async (ctx) => {
    const row = await ctx.db
      .query("wikiFormatSettings")
      .withIndex("by_key", (q) => q.eq("key", KEY))
      .unique();
    return row?.value ?? "";
  },
});

export const set = userMutation({
  can: "manage_guidebooks",
  args: { value: v.string() },
  handler: async (ctx, { value }) => {
    const user = ctx.caller.user;
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
