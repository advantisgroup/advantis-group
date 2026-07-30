import { v, type Infer } from "convex/values";

import { type Doc } from "../_generated/dataModel";
import { type QueryCtx } from "../_generated/server";

/**
 * Shared vocabulary for how identity is modeled across features. See
 * `docs/architecture/profiles.md` for the full write-up; the short version:
 *
 * - **Profile** — a `users` row (schema.ts). The one canonical intranet
 *   identity. Every feature-specific concept below links back to one.
 * - **Subprofile** — a feature's own identity-shaped record representing
 *   "this profile, in this feature's context" (the Clockodo link, an
 *   ActivityTrack `people` row, a `humanResources` `employeeProfiles` row,
 *   a chat `conversationMembers` row). A subprofile may or may not be
 *   linked yet — a feature can know about a person before an intranet
 *   account exists for them (e.g. a tracked ActivityTrack person, an
 *   applicant not yet hired).
 * - **Partial profile** — this file's `PartialProfile`: the small, stable
 *   projection (id, display name, avatar) used anywhere a full `Doc<"users">`
 *   isn't needed — the intranet's equivalent of Discord's partial
 *   user/guild objects. One canonical resolver (`toPartialProfile`) rather
 *   than each feature hand-rolling its own name/avatar join.
 * - **Enrichment** — a subprofile query always returns the same shape.
 *   When the underlying link/data doesn't exist or is unreachable, return a
 *   fully-populated object with a `linked`/`status` discriminant and
 *   null'd-out detail fields — never a bare `null` for the whole object,
 *   never a silently filtered-out row.
 */

export const partialProfileValidator = v.object({
  userId: v.id("users"),
  name: v.string(),
  email: v.string(),
  avatarUrl: v.union(v.string(), v.null()),
});

export type PartialProfile = Infer<typeof partialProfileValidator>;

/** The fields `toPartialProfile` needs — narrower than a full `Doc<"users">`
 *  so callers can build one from any curated user projection they already
 *  have in hand (mirrors `lib/auth.ts`'s `Pick<...>` convention). */
export type PartialProfileSource = Pick<
  Doc<"users">,
  "_id" | "firstName" | "lastName" | "email" | "avatarUrl" | "avatarStorageId"
>;

/**
 * The canonical name resolver — every consumer wanting "first + last, or
 * email if neither is set" goes through this. Previously reimplemented
 * independently in `chat.ts` (`memberDisplay`) and `humanResources.ts`
 * (`displayName`).
 */
export function profileDisplayName(user: Pick<Doc<"users">, "firstName" | "lastName" | "email">): string {
  return [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email;
}

/**
 * The canonical avatar resolver — an uploaded image takes precedence over an
 * external URL (e.g. from Clerk). Previously reimplemented independently in
 * `chat.ts` (`userAvatar`).
 */
export async function profileAvatarUrl(
  ctx: QueryCtx,
  user: Pick<Doc<"users">, "avatarUrl" | "avatarStorageId">,
): Promise<string | null> {
  if (user.avatarStorageId) return ctx.storage.getUrl(user.avatarStorageId);
  return user.avatarUrl ?? null;
}

/** Build the canonical slim projection for a profile. */
export async function toPartialProfile(
  ctx: QueryCtx,
  user: PartialProfileSource,
): Promise<PartialProfile> {
  return {
    userId: user._id,
    name: profileDisplayName(user),
    email: user.email,
    avatarUrl: await profileAvatarUrl(ctx, user),
  };
}

/** `toPartialProfile`, tolerating a missing user (deleted/unresolved
 *  reference) by returning `null` instead of throwing — for call sites that
 *  already treat "no profile" as a valid outcome (e.g. a subprofile whose
 *  linked user was since removed). */
export async function toPartialProfileOrNull(
  ctx: QueryCtx,
  user: PartialProfileSource | null,
): Promise<PartialProfile | null> {
  return user ? toPartialProfile(ctx, user) : null;
}
