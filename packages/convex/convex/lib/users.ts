import { type Doc, type Id } from "../_generated/dataModel";
import { type MutationCtx, type QueryCtx } from "../_generated/server";

/** Take someone out of the intranet without deleting their row. */
export async function markUserRemoved(
  ctx: MutationCtx,
  user: Doc<"users">,
  removedBy?: Id<"users">,
): Promise<void> {
  if (user.status === "removed") return;
  await ctx.db.patch(user._id, {
    status: "removed",
    removedAt: Date.now(),
    removedBy,
    sandboxRole: undefined,
  });
  const presence = await ctx.db
    .query("presence")
    .withIndex("by_user", (q) => q.eq("userId", user._id))
    .unique();
  if (presence) await ctx.db.delete(presence._id);
}

/**
 * Best-effort human display name for an intranet user: "First Last", falling
 * back to email, then a fixed placeholder for a since-deleted user. This was
 * previously re-implemented (identically) in updates.ts, announcements.ts,
 * and onedrive.ts — consolidated here.
 */
export function displayName(user: Doc<"users"> | null): string {
  if (!user) return "unknown";
  const full = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
  return full || user.email || "unknown";
}

/**
 * Batch-resolve a list of user ids to their documents, deduped, via
 * `ctx.db.get` in parallel. Returns a `Map` keyed by id for O(1) lookups
 * while rendering a list of records that each reference a user (audit log
 * actors, update/announcement authors, OneDrive audit actors, etc). Ids that
 * no longer resolve (deleted user) are simply absent from the map — callers
 * should treat a missing entry as "unknown user" via `displayName(null)`.
 */
export async function batchGetUsers(
  ctx: QueryCtx,
  userIds: Id<"users">[],
): Promise<Map<Id<"users">, Doc<"users">>> {
  const uniqueIds = [...new Set(userIds)];
  const users = await Promise.all(uniqueIds.map((id) => ctx.db.get(id)));
  return new Map(users.flatMap((u) => (u ? [[u._id, u] as const] : [])));
}

/**
 * Standard shape for "who did/owns this" fields on a query's return value —
 * a small, UI-ready summary rather than a bare id, a bare name string, or a
 * name-with-ad-hoc-fallback. New/migrated call sites should shape their
 * user-referencing output as `{ ...record, user: UserSummary | null }`
 * (`null` when the referenced user no longer exists) instead of inventing
 * another one-off shape.
 */
export interface UserSummary {
  _id: Id<"users">;
  name: string;
  email: string;
}

/** Build a `UserSummary` from a resolved user doc (or `null` if missing). */
export function toUserSummary(user: Doc<"users"> | null): UserSummary | null {
  if (!user) return null;
  return { _id: user._id, name: displayName(user), email: user.email };
}

/**
 * Batch-resolve ids straight to `UserSummary`s, keyed by id. Combines
 * `batchGetUsers` + `toUserSummary` for the common case of stamping a
 * `user: UserSummary | null` field onto a list of records.
 */
export async function batchUserSummaries(
  ctx: QueryCtx,
  userIds: Id<"users">[],
): Promise<Map<Id<"users">, UserSummary>> {
  const byId = await batchGetUsers(ctx, userIds);
  const out = new Map<Id<"users">, UserSummary>();
  for (const [id, user] of byId) {
    const summary = toUserSummary(user);
    if (summary) out.set(id, summary);
  }
  return out;
}
