import { type Doc, type Id } from "../_generated/dataModel";
import { type QueryCtx } from "../_generated/server";

/**
 * Best-effort human display name for an intranet user: "First Last", falling
 * back to email, then a fixed placeholder for a since-deleted user. This was
 * previously re-implemented (identically) in updates.ts, announcements.ts,
 * onedrive.ts, and activity/lib/users.ts — consolidated here.
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
  userIds: Id<"users">[]
): Promise<Map<Id<"users">, Doc<"users">>> {
  const uniqueIds = [...new Set(userIds)];
  const users = await Promise.all(uniqueIds.map(id => ctx.db.get(id)));
  return new Map(
    users.flatMap(u => (u ? [[u._id, u] as const] : []))
  );
}
