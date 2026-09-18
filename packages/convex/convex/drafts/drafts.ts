import { ConvexError, v } from "convex/values";

import type { Doc, Id } from "../_generated/dataModel";
import { internalMutation, mutation, query } from "../functions";
import { type MutationCtx, type QueryCtx } from "../_generated/server";
import { getCurrentUser, hasApplicantAccess, requireUser } from "../lib/auth";
import { draftSurface } from "./lib/surfaces";

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
/** What a box holds between being opened and the first keystroke. */
const PLACEHOLDER_DATA = "{}";
/** Stopping typing for this long makes what was there a version, like a commit. */
const CHECKPOINT_PAUSE_MS = 20_000;
/** ...and a long stretch of typing without a pause still gets one this often. */
const CHECKPOINT_EVERY_MS = 3 * 60_000;
/** Everything from the last hour stays; older versions thin out to the newest
 *  one per window, so history reaches back far without piling up. */
const THINNING: [maxAgeMs: number, windowMs: number][] = [
  [60 * 60_000, 0],
  [86_400_000, 10 * 60_000],
  [7 * 86_400_000, 60 * 60_000],
  [Infinity, 86_400_000],
];
const MAX_VERSIONS = 100;
const MAX_NAME_CHARS = 80;

export async function findDraft(
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

function listDraftVersions(ctx: QueryCtx | MutationCtx, draftId: Id<"drafts">) {
  return ctx.db
    .query("draftVersions")
    .withIndex("by_draft", (q) => q.eq("draftId", draftId))
    .order("desc")
    .collect();
}

/** Each version's parent. Versions from before branches were tracked have no
 *  `parentId` at all, and descend from the next-older version. */
export function resolveParents(
  newestFirst: Doc<"draftVersions">[],
): Map<Id<"draftVersions">, Id<"draftVersions"> | null> {
  return new Map(
    newestFirst.map((version, i) => [
      version._id,
      version.parentId !== undefined ? version.parentId : (newestFirst[i + 1]?._id ?? null),
    ]),
  );
}

export function headOf(draft: Doc<"drafts">, newestFirst: Doc<"draftVersions">[]) {
  return newestFirst.find((version) => version._id === draft.headVersionId) ?? newestFirst[0];
}

/** Unnamed versions that fall out of the thinning windows or past the cap. */
export function versionsToDrop<V extends { savedAt: number; name?: string }>(
  newestFirst: V[],
  now: number,
): V[] {
  const seen = new Set<string>();
  const drop: V[] = [];
  let kept = 0;
  for (const version of newestFirst) {
    if (version.name) continue;
    const age = now - version.savedAt;
    const tier = THINNING.findIndex(([maxAge]) => age < maxAge);
    const window = THINNING[tier][1];
    const bucket = window ? `${tier}:${Math.floor(version.savedAt / window)}` : null;
    if ((bucket && seen.has(bucket)) || kept >= MAX_VERSIONS) {
      drop.push(version);
      continue;
    }
    if (bucket) seen.add(bucket);
    kept++;
  }
  return drop;
}

/** Thins out versions in the middle of a line. Anything someone could be
 *  looking for stays: the one the form builds on, named and shared ones, the
 *  ends of branches and the points they split off. */
async function thin(ctx: MutationCtx, newestFirst: Doc<"draftVersions">[], headId: string) {
  const parents = resolveParents(newestFirst);
  const children = new Map<string, number>();
  for (const parent of parents.values()) {
    if (parent) children.set(parent, (children.get(parent) ?? 0) + 1);
  }
  const candidates = newestFirst.filter(
    (version) =>
      version._id !== headId && !version.sharedAt && (children.get(version._id) ?? 0) === 1,
  );
  const drop = versionsToDrop(candidates, Date.now());
  if (drop.length === 0) return;

  // Whatever hung off a removed version now hangs off its parent instead.
  const before = new Map(parents);
  for (const version of drop) {
    const parent = parents.get(version._id) ?? null;
    for (const [child, childParent] of parents) {
      if (childParent === version._id) parents.set(child, parent);
    }
  }
  const dropped = new Set<string>(drop.map((version) => version._id));
  for (const version of newestFirst) {
    if (dropped.has(version._id)) {
      await ctx.db.delete(version._id);
    } else if (parents.get(version._id) !== before.get(version._id)) {
      await ctx.db.patch(version._id, { parentId: parents.get(version._id) ?? null });
    }
  }
}

/** Makes what the draft holds right now a version on top of its head. Returns
 *  its id — or the head's, if that already holds the same thing. */
export async function snapshot(
  ctx: MutationCtx,
  draft: Doc<"drafts">,
): Promise<Id<"draftVersions"> | null> {
  if (draft.data === PLACEHOLDER_DATA) return null;
  const versions = await listDraftVersions(ctx, draft._id);
  const head = headOf(draft, versions);
  if (head?.data === draft.data) return head._id;
  const id = await ctx.db.insert("draftVersions", {
    draftId: draft._id,
    userId: draft.userId,
    data: draft.data,
    savedAt: draft.updatedAt,
    parentId: head?._id ?? null,
  });
  await ctx.db.patch(draft._id, { headVersionId: id });
  const inserted = await ctx.db.get(id);
  await thin(ctx, [inserted!, ...versions], id);
  return id;
}

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

/** Drafts that hold applicant details. Being yours isn't enough for these —
 *  they follow Applicant Management's rules: access plus an unlocked vault. */
export const APPLICANT_SURFACES = new Set<string>([
  "applicantContact",
  "applicantEmail",
  "applicantInterview",
  "cvReview",
]);

export async function canUseSurface(
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
export const create = mutation({
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

export const save = mutation({
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
export const discard = mutation({
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

/** Versions of the draft behind this form, newest first, with the version
 *  the form builds on. What's in the form right now is only one of them if
 *  nothing's been typed since it was saved or brought back. */
export const listVersions = query({
  args: { surface: draftSurface, subjectKey: v.string() },
  handler: async (ctx, { surface, subjectKey }) => {
    const empty = { headId: null, versions: [] };
    const user = await getCurrentUser(ctx);
    if (!user || !(await canUseSurface(ctx, user, surface))) return empty;
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

export function personName(user: Doc<"users">) {
  return [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email;
}

export async function person(ctx: QueryCtx, userId: Id<"users">) {
  const user = await ctx.db.get(userId);
  if (!user) return null;
  const avatar = user.avatarStorageId
    ? await ctx.storage.getUrl(user.avatarStorageId)
    : (user.avatarUrl ?? null);
  return { _id: user._id, name: personName(user), email: user.email, avatar };
}

export async function sharedWith(ctx: QueryCtx, versionId: Id<"draftVersions">) {
  const shares = await ctx.db
    .query("draftShares")
    .withIndex("by_version_user", (q) => q.eq("versionId", versionId))
    .collect();
  const people = await Promise.all(shares.map((share) => person(ctx, share.userId)));
  return people.filter((p) => p !== null);
}

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
export const park = mutation({
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
export const resume = mutation({
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
export const restoreVersion = mutation({
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
    const previousVersionId = await snapshot(ctx, draft);
    const updatedAt = Date.now();
    await ctx.db.patch(draft._id, { data: version.data, headVersionId: version._id, updatedAt });
    return { data: version.data, updatedAt, previousVersionId };
  },
});

/** Names a version so it's easy to find again — or, without `versionId`,
 *  makes what's in the form now a named version. An empty name clears it. */
export const nameVersion = mutation({
  args: {
    surface: draftSurface,
    subjectKey: v.string(),
    versionId: v.optional(v.id("draftVersions")),
    name: v.string(),
  },
  handler: async (ctx, { surface, subjectKey, versionId, name }) => {
    const user = await requireUser(ctx);
    if (!(await canUseSurface(ctx, user, surface))) {
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

/** The version a name or share is for: the one given, or what's in the form now. */
export async function versionToUse(
  ctx: MutationCtx,
  userId: Id<"users">,
  surface: string,
  subjectKey: string,
  versionId: Id<"draftVersions"> | undefined,
) {
  const draft = await findDraft(ctx, userId, surface, subjectKey);
  const id = draft && (versionId ?? (await snapshot(ctx, draft)));
  const version = id ? await ctx.db.get(id) : null;
  if (!draft || !version || version.draftId !== draft._id) {
    throw new ConvexError({ code: "not_found", message: "Version not found" });
  }
  return version;
}

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
