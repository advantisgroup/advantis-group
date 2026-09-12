import { ConvexError, v } from "convex/values";

import type { Doc } from "./_generated/dataModel";
import { internalMutation, type MutationCtx, query, type QueryCtx } from "./_generated/server";
import { getCurrentUser, hasApplicantAccess, requireUser } from "./lib/auth";
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
const PLACEHOLDER_RETENTION_MS = 86_400_000;
/** What a box holds between being opened and the first keystroke. */
const PLACEHOLDER_DATA = "{}";

/** Drafts that hold applicant details. Being yours isn't enough for these —
 *  they follow Applicant Management's rules: access plus an unlocked vault. */
const APPLICANT_SURFACES = new Set<string>([
  "applicantContact",
  "applicantEmail",
  "applicantInterview",
  "cvReview",
]);

async function canUseSurface(
  ctx: QueryCtx | MutationCtx,
  user: Doc<"users">,
  surface: string,
): Promise<boolean> {
  if (!APPLICANT_SURFACES.has(surface)) return true;
  if (!hasApplicantAccess(user)) return false;
  const unlock = await ctx.db
    .query("applicantVaultUnlocks")
    .withIndex("by_user", (q) => q.eq("userId", user._id))
    .unique();
  return !!unlock && unlock.expiresAt > Date.now();
}

export const get = query({
  args: { surface: draftSurface, subjectKey: v.string() },
  handler: async (ctx, { surface, subjectKey }) => {
    const user = await getCurrentUser(ctx);
    // Null rather than an error when locked: the vault can time out while a
    // form is open, and a throwing query would take the whole page down.
    if (!user || !(await canUseSurface(ctx, user, surface))) return null;
    const draft = await ctx.db
      .query("drafts")
      .withIndex("by_user_subject", (q) =>
        q.eq("userId", user._id).eq("surface", surface).eq("subjectKey", subjectKey),
      )
      .unique();
    return draft ? { data: draft.data, updatedAt: draft.updatedAt } : null;
  },
});

/** A fresh draft gets its own id up front, before there's anything to save —
 *  that id becomes its `subjectKey` too, so a URL can point at it right away
 *  and every existing `<kind>:<subjectKey>` AI-run convention keys off it
 *  without any changes on that side. */
export const create = sandboxedMutation({
  args: { surface: draftSurface },
  handler: async (ctx, { surface }) => {
    const user = await requireUser(ctx);
    if (!(await canUseSurface(ctx, user, surface))) {
      throw new ConvexError({ code: "forbidden", message: "You do not have permission to do that" });
    }
    const id = await ctx.db.insert("drafts", {
      userId: user._id,
      surface,
      subjectKey: "",
      data: PLACEHOLDER_DATA,
      updatedAt: Date.now(),
    });
    await ctx.db.patch(id, { subjectKey: id });
    return id;
  },
});

/** Every unsent draft across every surface, for the "My drafts" page. Boxes
 *  that were opened but never typed into aren't drafts yet, so they're left out. */
export const listMine = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) return [];
    const drafts = await ctx.db
      .query("drafts")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .order("desc")
      .collect();
    return drafts
      .filter((d) => !APPLICANT_SURFACES.has(d.surface) && d.data !== PLACEHOLDER_DATA)
      .map((d) => ({
        _id: d._id,
        surface: d.surface,
        subjectKey: d.subjectKey,
        data: d.data,
        href: d.href,
        updatedAt: d.updatedAt,
      }));
  },
});

/** Only same-site paths — this ends up as a link, so nothing that could leave the app. */
function safeHref(href: string | undefined): string | undefined {
  if (!href || href.length > 500) return undefined;
  if (!href.startsWith("/") || href.startsWith("//") || href.startsWith("/\\")) return undefined;
  return href;
}

export const save = sandboxedMutation({
  args: {
    surface: draftSurface,
    subjectKey: v.string(),
    data: v.string(),
    href: v.optional(v.string()),
  },
  handler: async (ctx, { surface, subjectKey, data, href }) => {
    const user = await requireUser(ctx);
    if (!(await canUseSurface(ctx, user, surface))) {
      throw new ConvexError({ code: "forbidden", message: "You do not have permission to do that" });
    }
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
    const fields = { data, href: safeHref(href) ?? existing?.href, updatedAt };
    if (existing) await ctx.db.patch(existing._id, fields);
    else await ctx.db.insert("drafts", { userId: user._id, surface, subjectKey, ...fields });
    return { updatedAt };
  },
});

/** Always allowed, vault or not — throwing away your own draft reveals nothing. */
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
    // Every visit to a "new" page opens a box; the ones nobody typed into
    // don't need to wait out the full retention.
    const unused = await ctx.db
      .query("drafts")
      .withIndex("by_updated", (q) => q.lt("updatedAt", Date.now() - PLACEHOLDER_RETENTION_MS))
      .filter((q) => q.eq(q.field("data"), PLACEHOLDER_DATA))
      .take(500);
    const ids = new Set([...old, ...unused].map((draft) => draft._id));
    for (const id of ids) await ctx.db.delete(id);
    return { deleted: ids.size };
  },
});
