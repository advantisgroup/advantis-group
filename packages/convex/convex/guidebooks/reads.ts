import { userQuery, userMutation } from "../functions";
import { v } from "convex/values";
import { type QueryCtx } from "../_generated/server";
import { profileDisplayName } from "../lib/profile";

/** Slugs the current user has confirmed reading — for a policy, only if
 *  they confirmed its current version. */
export const listMine = userQuery({
  args: {},
  handler: async (ctx) => {
    const user = ctx.caller.user;
    const rows = await ctx.db
      .query("guidebookReads")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
    const policies = await currentPolicyVersions(ctx);
    return rows.filter((r) => (r.version ?? 1) >= (policies.get(r.slug) ?? 0)).map((r) => r.slug);
  },
});

/** The current user's confirmation of one entry, if any. */
export const mineForSlug = userQuery({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    const row = await ctx.db
      .query("guidebookReads")
      .withIndex("by_user_slug", (q) => q.eq("userId", ctx.caller.user._id).eq("slug", slug))
      .unique();
    return row ? { readAt: row.readAt, version: row.version ?? 1 } : null;
  },
});

/** slug → the policy version everyone must have confirmed. */
async function currentPolicyVersions(ctx: QueryCtx) {
  const entries = await ctx.db.query("wikiEntries").collect();
  return new Map(
    entries.filter((e) => e.policy).map((e) => [e.slug, e.policyVersion ?? 1] as const),
  );
}

/** Manual confirmation only — a user explicitly asserting "I read and
 * understood this," not a side effect of opening the page. Idempotent
 * (unique `by_user_slug`), so a re-confirm after the content changes is
 * just a no-op rather than a second row. */
export const markRead = userMutation({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    const user = ctx.caller.user;
    const existing = await ctx.db
      .query("guidebookReads")
      .withIndex("by_user_slug", (q) => q.eq("userId", user._id).eq("slug", slug))
      .unique();
    const entry = await ctx.db
      .query("wikiEntries")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique();
    const version = entry?.policy ? (entry.policyVersion ?? 1) : undefined;
    if (existing) {
      // Re-confirming a policy that changed records the version now agreed to.
      if (version !== undefined && (existing.version ?? 1) < version) {
        await ctx.db.patch(existing._id, { version, readAt: Date.now() });
      }
      return { ok: true };
    }
    await ctx.db.insert("guidebookReads", { userId: user._id, slug, readAt: Date.now(), version });
    return { ok: true };
  },
});

/** Who has confirmed reading this wiki entry, newest first — for the page's
 * editors to see who has (and hasn't, relative to the roster) acknowledged
 * it. Gated the same way as editing the page itself. */
export const listConfirmersForSlug = userQuery({
  can: "manage_guidebooks",
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
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
          version: r.version ?? 1,
        };
      })
      .sort((a, b) => b.readAt - a.readAt);
  },
});
