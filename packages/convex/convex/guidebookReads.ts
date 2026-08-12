import { sandboxedMutation as mutation } from "./lib/sandbox";
import { v } from "convex/values";

import { query } from "./_generated/server";
import { requireCapability, requireUser } from "./lib/auth";
import { profileDisplayName } from "./lib/profile";

/** Slugs the current user has confirmed reading. */
export const listMine = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const rows = await ctx.db
      .query("guidebookReads")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
    return rows.map((r) => r.slug);
  },
});

/** Manual confirmation only — a user explicitly asserting "I read and
 * understood this," not a side effect of opening the page. Idempotent
 * (unique `by_user_slug`), so a re-confirm after the content changes is
 * just a no-op rather than a second row. */
export const markRead = mutation({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    const user = await requireUser(ctx);
    const existing = await ctx.db
      .query("guidebookReads")
      .withIndex("by_user_slug", (q) => q.eq("userId", user._id).eq("slug", slug))
      .unique();
    if (existing) return { ok: true };
    await ctx.db.insert("guidebookReads", { userId: user._id, slug, readAt: Date.now() });
    return { ok: true };
  },
});

/** Who has confirmed reading this wiki entry, newest first — for the page's
 * editors to see who has (and hasn't, relative to the roster) acknowledged
 * it. Gated the same way as editing the page itself. */
export const listConfirmersForSlug = query({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    await requireCapability(ctx, "manage_guidebooks");
    const rows = await ctx.db
      .query("guidebookReads")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .collect();
    const users = await Promise.all(rows.map((r) => ctx.db.get(r.userId)));
    // A since-deleted user still confirmed reading this at the time — drop
    // the row and the confirmer count silently undercounts, so keep it with
    // a placeholder name rather than filtering it out.
    return rows
      .map((r, i) => {
        const u = users[i];
        return {
          userId: r.userId,
          name: u ? profileDisplayName(u) : "Deleted user",
          readAt: r.readAt,
        };
      })
      .sort((a, b) => b.readAt - a.readAt);
  },
});
