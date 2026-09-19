import { ConvexError, v } from "convex/values";

import type { Doc, Id } from "../_generated/dataModel";
import { internalMutation, query, userMutation } from "../functions";
import { type MutationCtx, type QueryCtx } from "../_generated/server";
import { getCurrentUser } from "../lib/auth";
import { getSessionCaller } from "../lib/caller";
import { draftSurface } from "./lib/surfaces";
import {
  APPLICANT_SURFACES,
  PLACEHOLDER_DATA,
  canUseSurface,
  findDraft,
  headOf,
  listDraftVersions,
  resolveParents,
  sharedWith,
  snapshot,
  versionToUse,
} from "./lib/drafts";

/**
 * Unsent work from every composer and create/edit dialog, per person.
 *
 * `data` is whatever JSON the form wants back — this layer doesn't interpret
 * it, which is what lets one table serve a blog post and an IT ticket alike.
 * Owner-only in both directions: nobody can read or overwrite someone else's
 * draft, including admins — the one way out is sharing a single version on
 * purpose (see draftShares.ts).
 */

/** Well under Convex's 1 MB document cap even for multi-byte text. */
const MAX_DRAFT_CHARS = 350_000;
const RETENTION_MS = 60 * 86_400_000;
const PLACEHOLDER_RETENTION_MS = 86_400_000;
/** Stopping typing for this long makes what was there a version, like a commit. */
const CHECKPOINT_PAUSE_MS = 20_000;
/** ...and a long stretch of typing without a pause still gets one this often. */
const CHECKPOINT_EVERY_MS = 3 * 60_000;
const MAX_NAME_CHARS = 80;

/** Whether the text about to be overwritten should become a version first. */
async function dueForCheckpoint(ctx: MutationCtx, draft: Doc<"drafts">, now: number) {
  if (draft.data === PLACEHOLDER_DATA) return false;
  if (now - draft.updatedAt >= CHECKPOINT_PAUSE_MS) return true;
  const latest = await ctx.db
    .query("draftVersions")
    .withIndex("by_draft", (q) => q.eq("draftId", draft._id))
    .order("desc")
    .first();
  return !!latest && now - latest.savedAt >= CHECKPOINT_EVERY_MS;
}

async function moveVersions(ctx: MutationCtx, from: Id<"drafts">, to: Id<"drafts">) {
  const versions = await listDraftVersions(ctx, from);
  for (const version of versions) await ctx.db.patch(version._id, { draftId: to });
}

/** Removes a version along with everything shared about it. */
export async function deleteVersion(ctx: MutationCtx, version: Doc<"draftVersions">) {
  if (version.sharedAt) {
    const shares = await ctx.db
      .query("draftShares")
      .withIndex("by_version_user", (q) => q.eq("versionId", version._id))
      .collect();
    for (const share of shares) await ctx.db.delete(share._id);
    const comments = await ctx.db
      .query("draftComments")
      .withIndex("by_version", (q) => q.eq("versionId", version._id))
      .collect();
    for (const comment of comments) await ctx.db.delete(comment._id);
  }
  await ctx.db.delete(version._id);
}

async function deleteVersions(ctx: MutationCtx, draftId: Id<"drafts">) {
  for (const version of await listDraftVersions(ctx, draftId)) await deleteVersion(ctx, version);
}

export const get = query({
  args: { surface: draftSurface, subjectKey: v.string() },
  handler: async (ctx, { surface, subjectKey }) => {
    const caller = await getSessionCaller(ctx);
    // Null rather than an error when locked: the vault can time out while a
    // form is open, and a throwing query would take the whole page down.
    if (!caller || !(await canUseSurface(ctx, caller, surface))) return null;
    const user = caller.user;
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
export const create = userMutation({
  args: { surface: draftSurface },
  handler: async (ctx, { surface }) => {
    const user = ctx.caller.user;
    if (!(await canUseSurface(ctx, ctx.caller, surface))) {
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

export const save = userMutation({
  args: {
    surface: draftSurface,
    subjectKey: v.string(),
    data: v.string(),
    href: v.optional(v.string()),
  },
  handler: async (ctx, { surface, subjectKey, data, href }) => {
    const user = ctx.caller.user;
    if (!(await canUseSurface(ctx, ctx.caller, surface))) {
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
    if (existing) {
      if (existing.data !== data && (await dueForCheckpoint(ctx, existing, updatedAt))) {
        await snapshot(ctx, existing);
      }
      await ctx.db.patch(existing._id, fields);
    } else {
      await ctx.db.insert("drafts", { userId: user._id, surface, subjectKey, ...fields });
    }
    return { updatedAt };
  },
});

/** Always allowed, vault or not — throwing away your own draft reveals nothing. */
export const discard = userMutation({
  args: { surface: draftSurface, subjectKey: v.string() },
  handler: async (ctx, { surface, subjectKey }) => {
    const user = ctx.caller.user;
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

/** Versions of the draft behind this form, newest first, with the version
 *  the form builds on. What's in the form right now is only one of them if
 *  nothing's been typed since it was saved or brought back. */
export const listVersions = query({
  args: { surface: draftSurface, subjectKey: v.string() },
  handler: async (ctx, { surface, subjectKey }) => {
    const empty = { headId: null, versions: [] };
    const caller = await getSessionCaller(ctx);
    if (!caller || !(await canUseSurface(ctx, caller, surface))) return empty;
    const user = caller.user;
    const draft = await findDraft(ctx, user._id, surface, subjectKey);
    if (!draft) return empty;
    const versions = await listDraftVersions(ctx, draft._id);
    const parents = resolveParents(versions);
    return {
      headId: headOf(draft, versions)?._id ?? null,
      versions: await Promise.all(
        versions.map(async (version) => ({
          _id: version._id,
          data: version.data,
          savedAt: version.savedAt,
          parentId: parents.get(version._id) ?? null,
          name: version.name ?? null,
          sharedWith: version.sharedAt ? await sharedWith(ctx, version._id) : [],
          comments: version.sharedAt ? await commentCount(ctx, version._id) : 0,
        })),
      ),
    };
  },
});

async function commentCount(ctx: QueryCtx, versionId: Id<"draftVersions">) {
  const comments = await ctx.db
    .query("draftComments")
    .withIndex("by_version", (q) => q.eq("versionId", versionId))
    .collect();
  return comments.length;
}

/** The other drafts someone has going for the same composer: ones set aside
 *  from this form, and — for composers where every draft has its own page —
 *  the other drafts of that kind. */
export const listOthers = query({
  args: { surface: draftSurface, subjectKey: v.string() },
  handler: async (ctx, { surface, subjectKey }) => {
    const caller = await getSessionCaller(ctx);
    if (!caller || !(await canUseSurface(ctx, caller, surface))) return [];
    const user = caller.user;
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
export const park = userMutation({
  args: { surface: draftSurface, subjectKey: v.string() },
  handler: async (ctx, { surface, subjectKey }) => {
    const user = ctx.caller.user;
    if (!(await canUseSurface(ctx, ctx.caller, surface))) {
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
      headVersionId: current.headVersionId,
      updatedAt: current.updatedAt,
    });
    await ctx.db.patch(parkedId, { subjectKey: parkedId });
    await moveVersions(ctx, current._id, parkedId);
    await ctx.db.patch(current._id, {
      data: PLACEHOLDER_DATA,
      headVersionId: undefined,
      updatedAt,
    });
    return { updatedAt };
  },
});

/** Brings a set-aside draft back into this form, setting aside whatever the
 *  form held so switching back and forth never loses anything. */
export const resume = userMutation({
  args: { surface: draftSurface, subjectKey: v.string(), draftId: v.id("drafts") },
  handler: async (ctx, { surface, subjectKey, draftId }) => {
    const user = ctx.caller.user;
    if (!(await canUseSurface(ctx, ctx.caller, surface))) {
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
        headVersionId: current.headVersionId,
        updatedAt: current.updatedAt,
      });
      await ctx.db.patch(parkedId, { subjectKey: parkedId });
      await moveVersions(ctx, current._id, parkedId);
    }
    const updatedAt = Date.now();
    if (current) {
      await deleteVersions(ctx, current._id);
      await ctx.db.patch(current._id, {
        data: target.data,
        headVersionId: target.headVersionId,
        updatedAt,
      });
    } else {
      const id = await ctx.db.insert("drafts", {
        userId: user._id,
        surface,
        subjectKey,
        data: target.data,
        href: target.href,
        headVersionId: target.headVersionId,
        updatedAt,
      });
      current = await ctx.db.get(id);
    }
    await moveVersions(ctx, target._id, current!._id);
    await ctx.db.delete(target._id);
    return { data: target.data, updatedAt };
  },
});

/** Puts an earlier version back into the form, like checking out an old
 *  commit: what was there is kept as a version first, and writing on from
 *  here starts a new branch beside it. `previousVersionId` is what an undo
 *  goes back to. */
export const restoreVersion = userMutation({
  args: { surface: draftSurface, subjectKey: v.string(), versionId: v.id("draftVersions") },
  handler: async (ctx, { surface, subjectKey, versionId }) => {
    const user = ctx.caller.user;
    if (!(await canUseSurface(ctx, ctx.caller, surface))) {
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
    const previousVersionId = await snapshot(ctx, draft);
    const updatedAt = Date.now();
    await ctx.db.patch(draft._id, { data: version.data, headVersionId: version._id, updatedAt });
    return { data: version.data, updatedAt, previousVersionId };
  },
});

/** Names a version so it's easy to find again — or, without `versionId`,
 *  makes what's in the form now a named version. An empty name clears it. */
export const nameVersion = userMutation({
  args: {
    surface: draftSurface,
    subjectKey: v.string(),
    versionId: v.optional(v.id("draftVersions")),
    name: v.string(),
  },
  handler: async (ctx, { surface, subjectKey, versionId, name }) => {
    const user = ctx.caller.user;
    if (!(await canUseSurface(ctx, ctx.caller, surface))) {
      throw new ConvexError({
        code: "forbidden",
        message: "You do not have permission to do that",
      });
    }
    const version = await versionToUse(ctx, user._id, surface, subjectKey, versionId);
    const trimmed = name.trim().slice(0, MAX_NAME_CHARS);
    await ctx.db.patch(version._id, { name: trimmed || undefined });
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
    for (const id of ids) {
      await deleteVersions(ctx, id);
      await ctx.db.delete(id);
    }
    return { deleted: ids.size };
  },
});
