import { ConvexError, v } from "convex/values";

import type { Doc, Id } from "../_generated/dataModel";
import { query, userMutation } from "../functions";
import { type MutationCtx, type QueryCtx } from "../_generated/server";
import { getCurrentUser } from "../lib/auth";
import { draftSurface } from "./lib/surfaces";
import { createNotification } from "../lib/notify";
import {
  APPLICANT_SURFACES,
  canUseSurface,
  person,
  personName,
  sharedWith,
  versionToUse,
} from "./lib/drafts";

/**
 * Sharing one version of a draft with chosen colleagues, for feedback.
 *
 * Only ever a single version, picked on purpose: the draft itself stays
 * private, and what the author types afterwards isn't shared. Applicant
 * drafts can't be shared at all.
 */

const MAX_COMMENT_CHARS = 4_000;
const MAX_RECIPIENTS = 25;

function titleOf(data: string): string {
  try {
    const parsed = JSON.parse(data) as Record<string, unknown>;
    const title = ["thema", "title", "subject", "name", "titel"]
      .map((field) => parsed[field])
      .find((value): value is string => typeof value === "string" && value.trim().length > 0);
    return title?.trim().slice(0, 120) ?? "";
  } catch {
    return "";
  }
}

/** What someone may do with a version: nothing, read it as its author, or
 *  read it because it was shared with them. */
async function accessTo(
  ctx: QueryCtx,
  user: Doc<"users">,
  versionId: Id<"draftVersions">,
): Promise<{ version: Doc<"draftVersions">; draft: Doc<"drafts">; isOwner: boolean } | null> {
  const version = await ctx.db.get(versionId);
  const draft = version && (await ctx.db.get(version.draftId));
  if (!version || !draft || APPLICANT_SURFACES.has(draft.surface)) return null;
  if (version.userId === user._id) return { version, draft, isOwner: true };
  const share = await ctx.db
    .query("draftShares")
    .withIndex("by_version_user", (q) => q.eq("versionId", versionId).eq("userId", user._id))
    .unique();
  return share ? { version, draft, isOwner: false } : null;
}

async function requireAccess(ctx: QueryCtx, user: Doc<"users">, versionId: Id<"draftVersions">) {
  const access = await accessTo(ctx, user, versionId);
  if (!access) throw new ConvexError({ code: "not_found", message: "Shared draft not found" });
  return access;
}

/** Where "continue from this" lands: the same composer, on a draft of your
 *  own. Only composers where each draft has its own page can do that. */
function forkHref(ctx: QueryCtx, draft: Doc<"drafts">, newDraftId?: string): string | null {
  const pageKey = draft.parkedFrom ?? draft.subjectKey;
  if (!draft.href || !ctx.db.normalizeId("drafts", pageKey) || !draft.href.includes(pageKey)) {
    return null;
  }
  return newDraftId ? draft.href.replace(pageKey, newDraftId) : draft.href;
}

export const share = userMutation({
  args: {
    surface: draftSurface,
    subjectKey: v.string(),
    /** Leave out to share what's in the form now. */
    versionId: v.optional(v.id("draftVersions")),
    userIds: v.array(v.id("users")),
    /** Used when the version has no name yet, e.g. "Shared with Anna". */
    name: v.optional(v.string()),
  },
  handler: async (ctx, { surface, subjectKey, versionId, userIds, name }) => {
    const user = ctx.caller.user;
    if (APPLICANT_SURFACES.has(surface) || !(await canUseSurface(ctx, ctx.caller, surface))) {
      throw new ConvexError({ code: "forbidden", message: "This draft can't be shared" });
    }
    if (userIds.length === 0 || userIds.length > MAX_RECIPIENTS) {
      throw new ConvexError({ code: "bad_request", message: "Pick who to share with" });
    }
    const version = await versionToUse(ctx, user._id, surface, subjectKey, versionId);
    const title = titleOf(version.data);
    const now = Date.now();
    for (const userId of new Set(userIds)) {
      if (userId === user._id) continue;
      const recipient = await ctx.db.get(userId);
      if (!recipient || recipient.status !== "active") continue;
      const existing = await ctx.db
        .query("draftShares")
        .withIndex("by_version_user", (q) => q.eq("versionId", version._id).eq("userId", userId))
        .unique();
      if (existing) continue;
      await ctx.db.insert("draftShares", {
        versionId: version._id,
        ownerId: user._id,
        userId,
        createdAt: now,
      });
      await createNotification(ctx, {
        userId,
        type: "draft_shared",
        title: `${personName(user)} hat einen Entwurf mit dir geteilt`,
        body: title || undefined,
        link: `/drafts/shared/${version._id}`,
      });
    }
    await ctx.db.patch(version._id, {
      sharedAt: version.sharedAt ?? now,
      name: version.name ?? (name?.trim().slice(0, 80) || undefined),
    });
    return version._id;
  },
});

/** Takes one person's access away again. The version keeps its comments —
 *  and stays protected from thinning while it has any. */
export const unshare = userMutation({
  args: { versionId: v.id("draftVersions"), userId: v.id("users") },
  handler: async (ctx, { versionId, userId }) => {
    const user = ctx.caller.user;
    const version = await ctx.db.get(versionId);
    if (!version || version.userId !== user._id) {
      throw new ConvexError({ code: "not_found", message: "Version not found" });
    }
    const existing = await ctx.db
      .query("draftShares")
      .withIndex("by_version_user", (q) => q.eq("versionId", versionId).eq("userId", userId))
      .unique();
    if (existing) await ctx.db.delete(existing._id);
    const shareLeft = await ctx.db
      .query("draftShares")
      .withIndex("by_version_user", (q) => q.eq("versionId", versionId))
      .first();
    const commentLeft = await ctx.db
      .query("draftComments")
      .withIndex("by_version", (q) => q.eq("versionId", versionId))
      .first();
    if (!shareLeft && !commentLeft) await ctx.db.patch(versionId, { sharedAt: undefined });
    return null;
  },
});

/** Versions colleagues have shared with you, newest first. */
export const listSharedWithMe = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) return [];
    const shares = await ctx.db
      .query("draftShares")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .order("desc")
      .take(50);
    const rows = await Promise.all(
      shares.map(async (share) => {
        const version = await ctx.db.get(share.versionId);
        const draft = version && (await ctx.db.get(version.draftId));
        const owner = await person(ctx, share.ownerId);
        if (!version || !draft || !owner) return null;
        return {
          versionId: version._id,
          surface: draft.surface,
          data: version.data,
          savedAt: version.savedAt,
          sharedAt: share.createdAt,
          owner,
        };
      }),
    );
    return rows.filter((row) => row !== null);
  },
});

/** One shared version, for its own page. Null once it's no longer shared
 *  with you or the draft is gone. */
export const get = query({
  args: { versionId: v.string() },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    const versionId = ctx.db.normalizeId("draftVersions", args.versionId);
    if (!user || !versionId) return null;
    const access = await accessTo(ctx, user, versionId);
    if (!access) return null;
    const { version, draft, isOwner } = access;
    const share = isOwner
      ? null
      : await ctx.db
          .query("draftShares")
          .withIndex("by_version_user", (q) => q.eq("versionId", versionId).eq("userId", user._id))
          .unique();
    return {
      versionId,
      surface: draft.surface,
      data: version.data,
      savedAt: version.savedAt,
      name: version.name ?? null,
      sharedAt: share?.createdAt ?? version.sharedAt ?? version.savedAt,
      isOwner,
      owner: await person(ctx, version.userId),
      recipients: await sharedWith(ctx, versionId),
      /** Where the author edits it; only for the author. */
      editHref: isOwner ? (draft.href ?? null) : null,
      canContinue: !isOwner && forkHref(ctx, draft) !== null,
    };
  },
});

export const listComments = query({
  args: { versionId: v.id("draftVersions") },
  handler: async (ctx, { versionId }) => {
    const user = await getCurrentUser(ctx);
    if (!user || !(await accessTo(ctx, user, versionId))) return [];
    const comments = await ctx.db
      .query("draftComments")
      .withIndex("by_version", (q) => q.eq("versionId", versionId))
      .collect();
    return Promise.all(
      comments.map(async (comment) => ({
        _id: comment._id,
        body: comment.body,
        createdAt: comment.createdAt,
        author: await person(ctx, comment.authorId),
        mine: comment.authorId === user._id,
      })),
    );
  },
});

async function notifyParticipants(
  ctx: MutationCtx,
  version: Doc<"draftVersions">,
  author: Doc<"users">,
  body: string,
) {
  const shares = await ctx.db
    .query("draftShares")
    .withIndex("by_version_user", (q) => q.eq("versionId", version._id))
    .collect();
  const people = new Set<Id<"users">>([version.userId, ...shares.map((share) => share.userId)]);
  people.delete(author._id);
  const title = titleOf(version.data);
  for (const userId of people) {
    await createNotification(ctx, {
      userId,
      type: "draft_comment",
      title: title
        ? `${personName(author)} hat „${title}“ kommentiert`
        : `${personName(author)} hat einen geteilten Entwurf kommentiert`,
      body: body.slice(0, 160),
      link: `/drafts/shared/${version._id}`,
    });
  }
}

export const addComment = userMutation({
  args: { versionId: v.id("draftVersions"), body: v.string() },
  handler: async (ctx, { versionId, body }) => {
    const user = ctx.caller.user;
    const { version } = await requireAccess(ctx, user, versionId);
    const text = body.trim();
    if (!text) throw new ConvexError({ code: "bad_request", message: "Write something first" });
    if (text.length > MAX_COMMENT_CHARS) {
      throw new ConvexError({ code: "bad_request", message: "That comment is too long" });
    }
    await ctx.db.insert("draftComments", {
      versionId,
      authorId: user._id,
      body: text,
      createdAt: Date.now(),
    });
    await notifyParticipants(ctx, version, user, text);
    return null;
  },
});

export const deleteComment = userMutation({
  args: { commentId: v.id("draftComments") },
  handler: async (ctx, { commentId }) => {
    const user = ctx.caller.user;
    const comment = await ctx.db.get(commentId);
    if (!comment || comment.authorId !== user._id) {
      throw new ConvexError({ code: "not_found", message: "Comment not found" });
    }
    await ctx.db.delete(commentId);
    return null;
  },
});

/** "Continue from this": copies a version someone shared with you into a
 *  draft of your own. Nothing you do there reaches the original. */
export const continueFrom = userMutation({
  args: { versionId: v.id("draftVersions") },
  handler: async (ctx, { versionId }) => {
    const user = ctx.caller.user;
    const { version, draft, isOwner } = await requireAccess(ctx, user, versionId);
    if (isOwner || !forkHref(ctx, draft)) {
      throw new ConvexError({ code: "bad_request", message: "This draft can't be copied" });
    }
    const id = await ctx.db.insert("drafts", {
      userId: user._id,
      surface: draft.surface,
      subjectKey: "",
      data: version.data,
      updatedAt: Date.now(),
    });
    const href = forkHref(ctx, draft, id)!;
    await ctx.db.patch(id, { subjectKey: id, href });
    return href;
  },
});
