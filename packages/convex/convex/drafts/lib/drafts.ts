import { ConvexError } from "convex/values";
import { type Doc, type Id } from "../../_generated/dataModel";
import { type MutationCtx, type QueryCtx } from "../../_generated/server";
import { hasApplicantAccess } from "../../lib/auth";

/** What a box holds between being opened and the first keystroke. */
export const PLACEHOLDER_DATA = "{}";

/** Everything from the last hour stays; older versions thin out to the newest
 *  one per window, so history reaches back far without piling up. */
export const THINNING: [maxAgeMs: number, windowMs: number][] = [
  [60 * 60_000, 0],
  [86_400_000, 10 * 60_000],
  [7 * 86_400_000, 60 * 60_000],
  [Infinity, 86_400_000],
];

export const MAX_VERSIONS = 100;

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

export function listDraftVersions(ctx: QueryCtx | MutationCtx, draftId: Id<"drafts">) {
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
export async function thin(ctx: MutationCtx, newestFirst: Doc<"draftVersions">[], headId: string) {
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
