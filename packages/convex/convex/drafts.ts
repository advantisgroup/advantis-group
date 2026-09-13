import { ConvexError, v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
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
/** A new snapshot at most this often while someone keeps typing. */
const VERSION_EVERY_MS = 5 * 60_000;
const MAX_VERSIONS = 20;

async function findDraft(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
  surface: string,
  subjectKey: string,
) {
  return ctx.db
    .query("drafts")
    .withIndex("by_user_subject", (q) =>
      q
        .eq("userId", userId)
        .eq("surface", surface as Doc<"drafts">["surface"])
        .eq("subjectKey", subjectKey),
    )
    .unique();
}

async function snapshot(ctx: MutationCtx, draft: Doc<"drafts">, force = false) {
  if (draft.data === PLACEHOLDER_DATA) return;
  const versions = await ctx.db
    .query("draftVersions")
    .withIndex("by_draft", (q) => q.eq("draftId", draft._id))
    .order("desc")
    .collect();
  const latest = versions[0];
  if (latest?.data === draft.data) return;
  if (!force && latest && Date.now() - latest.savedAt < VERSION_EVERY_MS) return;
  await ctx.db.insert("draftVersions", {
    draftId: draft._id,
    userId: draft.userId,
    data: draft.data,
    savedAt: draft.updatedAt,
  });
  for (const old of versions.slice(MAX_VERSIONS - 1)) await ctx.db.delete(old._id);
}

async function moveVersions(ctx: MutationCtx, from: Id<"drafts">, to: Id<"drafts">) {
  const versions = await ctx.db
    .query("draftVersions")
    .withIndex("by_draft", (q) => q.eq("draftId", from))
    .collect();
  for (const version of versions) await ctx.db.patch(version._id, { draftId: to });
}

async function deleteVersions(ctx: MutationCtx, draftId: Id<"drafts">) {
  const versions = await ctx.db
    .query("draftVersions")
    .withIndex("by_draft", (q) => q.eq("draftId", draftId))
    .collect();
  for (const version of versions) await ctx.db.delete(version._id);
}

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
      throw new ConvexError({
        code: "forbidden",
        message: "You do not have permission to do that",
      });
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
        parkedFrom: d.parkedFrom ?? null,
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
      throw new ConvexError({
        code: "forbidden",
        message: "You do not have permission to do that",
      });
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
    let id = existing?._id;
    if (existing) await ctx.db.patch(existing._id, fields);
    else id = await ctx.db.insert("drafts", { userId: user._id, surface, subjectKey, ...fields });
    const saved = await ctx.db.get(id!);
    if (saved) await snapshot(ctx, saved);
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
    if (existing) {
      await deleteVersions(ctx, existing._id);
      await ctx.db.delete(existing._id);
    }
    return null;
  },
});

/** Snapshots of the draft behind this form, newest first. */
export const listVersions = query({
  args: { surface: draftSurface, subjectKey: v.string() },
  handler: async (ctx, { surface, subjectKey }) => {
    const user = await getCurrentUser(ctx);
    if (!user || !(await canUseSurface(ctx, user, surface))) return [];
    const draft = await findDraft(ctx, user._id, surface, subjectKey);
    if (!draft) return [];
    const versions = await ctx.db
      .query("draftVersions")
      .withIndex("by_draft", (q) => q.eq("draftId", draft._id))
      .order("desc")
      .take(MAX_VERSIONS);
    return versions
      .filter((version) => version.data !== draft.data)
      .map((version) => ({ _id: version._id, data: version.data, savedAt: version.savedAt }));
  },
});

/** The other drafts someone has going for the same composer: ones set aside
 *  from this form, and — for composers where every draft has its own page —
 *  the other drafts of that kind. */
export const listOthers = query({
  args: { surface: draftSurface, subjectKey: v.string() },
  handler: async (ctx, { surface, subjectKey }) => {
    const user = await getCurrentUser(ctx);
    if (!user || !(await canUseSurface(ctx, user, surface))) return [];
    const drafts = await ctx.db
      .query("drafts")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .order("desc")
      .collect();
    const current = drafts.find((d) => d.surface === surface && d.subjectKey === subjectKey);
    const ownPage = current !== undefined && current._id === subjectKey && !current.parkedFrom;
    return drafts
      .filter(
        (d) =>
          d.surface === surface &&
          d._id !== current?._id &&
          d.data !== PLACEHOLDER_DATA &&
          (d.parkedFrom === subjectKey || (ownPage && d._id === d.subjectKey && !d.parkedFrom)),
      )
      .map((d) => ({
        _id: d._id,
        data: d.data,
        updatedAt: d.updatedAt,
        href: d.href,
        parked: d.parkedFrom !== undefined,
      }));
  },
});

/** "Start a new draft": moves what's in the form into a draft of its own, set
 *  aside, and leaves this form empty. */
export const park = sandboxedMutation({
  args: { surface: draftSurface, subjectKey: v.string() },
  handler: async (ctx, { surface, subjectKey }) => {
    const user = await requireUser(ctx);
    if (!(await canUseSurface(ctx, user, surface))) {
      throw new ConvexError({
        code: "forbidden",
        message: "You do not have permission to do that",
      });
    }
    const current = await findDraft(ctx, user._id, surface, subjectKey);
    const updatedAt = Date.now();
    if (!current || current.data === PLACEHOLDER_DATA) return { updatedAt };
    const parkedId = await ctx.db.insert("drafts", {
      userId: user._id,
      surface,
      subjectKey: "",
      data: current.data,
      href: current.href,
      parkedFrom: subjectKey,
      updatedAt: current.updatedAt,
    });
    await ctx.db.patch(parkedId, { subjectKey: parkedId });
    await moveVersions(ctx, current._id, parkedId);
    await ctx.db.patch(current._id, { data: PLACEHOLDER_DATA, updatedAt });
    return { updatedAt };
  },
});

/** Brings a set-aside draft back into this form, setting aside whatever the
 *  form held so switching back and forth never loses anything. */
export const resume = sandboxedMutation({
  args: { surface: draftSurface, subjectKey: v.string(), draftId: v.id("drafts") },
  handler: async (ctx, { surface, subjectKey, draftId }) => {
    const user = await requireUser(ctx);
    if (!(await canUseSurface(ctx, user, surface))) {
      throw new ConvexError({
        code: "forbidden",
        message: "You do not have permission to do that",
      });
    }
    const target = await ctx.db.get(draftId);
    if (!target || target.userId !== user._id || target.surface !== surface) {
      throw new ConvexError({ code: "not_found", message: "Draft not found" });
    }
    let current = await findDraft(ctx, user._id, surface, subjectKey);
    if (current && current.data !== PLACEHOLDER_DATA) {
      const parkedId = await ctx.db.insert("drafts", {
        userId: user._id,
        surface,
        subjectKey: "",
        data: current.data,
        href: current.href,
        parkedFrom: subjectKey,
        updatedAt: current.updatedAt,
      });
      await ctx.db.patch(parkedId, { subjectKey: parkedId });
      await moveVersions(ctx, current._id, parkedId);
    }
    const updatedAt = Date.now();
    if (current) {
      await deleteVersions(ctx, current._id);
      await ctx.db.patch(current._id, { data: target.data, updatedAt });
    } else {
      const id = await ctx.db.insert("drafts", {
        userId: user._id,
        surface,
        subjectKey,
        data: target.data,
        href: target.href,
        updatedAt,
      });
      current = await ctx.db.get(id);
    }
    await moveVersions(ctx, target._id, current!._id);
    await ctx.db.delete(target._id);
    return { data: target.data, updatedAt };
  },
});

/** Puts an earlier snapshot back into the form; what was there becomes a
 *  snapshot itself first. */
export const restoreVersion = sandboxedMutation({
  args: { surface: draftSurface, subjectKey: v.string(), versionId: v.id("draftVersions") },
  handler: async (ctx, { surface, subjectKey, versionId }) => {
    const user = await requireUser(ctx);
    if (!(await canUseSurface(ctx, user, surface))) {
      throw new ConvexError({
        code: "forbidden",
        message: "You do not have permission to do that",
      });
    }
    const draft = await findDraft(ctx, user._id, surface, subjectKey);
    const version = await ctx.db.get(versionId);
    if (!draft || !version || version.draftId !== draft._id) {
      throw new ConvexError({ code: "not_found", message: "Version not found" });
    }
    await snapshot(ctx, draft, true);
    const updatedAt = Date.now();
    await ctx.db.patch(draft._id, { data: version.data, updatedAt });
    return { data: version.data, updatedAt };
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
    for (const id of ids) {
      await deleteVersions(ctx, id);
      await ctx.db.delete(id);
    }
    return { deleted: ids.size };
  },
});
