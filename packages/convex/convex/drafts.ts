import { ConvexError, v } from "convex/values";

import { internalMutation, query } from "./_generated/server";
import { getCurrentUser, requireUser } from "./lib/auth";
import { draftSurface } from "./lib/drafts";
import { sandboxedMutation } from "./lib/sandbox";

/**
 * Unsent work from every composer and create/edit dialog, per person.
 *
 * `data` is whatever JSON the form wants back — this layer doesn't interpret
 * it, which is what lets one table serve a blog post and an IT ticket alike.
 * Owner-only in both directions: nobody can read or overwrite someone else's
 * draft, including admins.
 */

/** Well under Convex's 1 MB document cap even for multi-byte text. */
const MAX_DRAFT_CHARS = 350_000;
const RETENTION_MS = 60 * 86_400_000;

export const get = query({
  args: { surface: draftSurface, subjectKey: v.string() },
  handler: async (ctx, { surface, subjectKey }) => {
    const user = await getCurrentUser(ctx);
    if (!user) return null;
    const draft = await ctx.db
      .query("drafts")
      .withIndex("by_user_subject", (q) =>
        q.eq("userId", user._id).eq("surface", surface).eq("subjectKey", subjectKey),
      )
      .unique();
    return draft ? { data: draft.data, updatedAt: draft.updatedAt } : null;
  },
});

export const save = sandboxedMutation({
  args: { surface: draftSurface, subjectKey: v.string(), data: v.string() },
  handler: async (ctx, { surface, subjectKey, data }) => {
    const user = await requireUser(ctx);
    if (data.length > MAX_DRAFT_CHARS) {
      throw new ConvexError({ code: "bad_request", message: "Draft is too large to keep" });
    }
    const existing = await ctx.db
      .query("drafts")
      .withIndex("by_user_subject", (q) =>
        q.eq("userId", user._id).eq("surface", surface).eq("subjectKey", subjectKey),
      )
      .unique();
    const updatedAt = Date.now();
    if (existing) await ctx.db.patch(existing._id, { data, updatedAt });
    else await ctx.db.insert("drafts", { userId: user._id, surface, subjectKey, data, updatedAt });
    return { updatedAt };
  },
});

export const discard = sandboxedMutation({
  args: { surface: draftSurface, subjectKey: v.string() },
  handler: async (ctx, { surface, subjectKey }) => {
    const user = await requireUser(ctx);
    const existing = await ctx.db
      .query("drafts")
      .withIndex("by_user_subject", (q) =>
        q.eq("userId", user._id).eq("surface", surface).eq("subjectKey", subjectKey),
      )
      .unique();
    if (existing) await ctx.db.delete(existing._id);
    return null;
  },
});

export const pruneOld = internalMutation({
  args: {},
  handler: async (ctx) => {
    const old = await ctx.db
      .query("drafts")
      .withIndex("by_updated", (q) => q.lt("updatedAt", Date.now() - RETENTION_MS))
      .take(500);
    for (const draft of old) await ctx.db.delete(draft._id);
    return { deleted: old.length };
  },
});
