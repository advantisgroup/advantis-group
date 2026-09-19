import { ConvexError } from "convex/values";
import { type Doc } from "../../_generated/dataModel";
import { type MutationCtx, type QueryCtx } from "../../_generated/server";
import { requireSessionCaller } from "../../lib/caller";

export const DEFAULT_PIN = "1234";

export async function resolveCurrentPin(
  ctx: QueryCtx | MutationCtx,
  academyId: string,
): Promise<string> {
  const row = await ctx.db
    .query("academySettings")
    .withIndex("by_academyId", (q) => q.eq("academyId", academyId))
    .unique();
  return row?.pin ?? DEFAULT_PIN;
}

/**
 * Gate for every Trainer-area mutation: a real intranet admin bypasses the
 * PIN entirely (same rule the client's `AdminLogin`/`admin/layout` already
 * apply); everyone else must supply the academy's current PIN. Without this,
 * the PIN was only ever checked client-side (via `checkPin`) — any signed-in
 * employee could call the mutations below directly and skip it.
 */
export async function requireAcademyAdmin(
  ctx: QueryCtx | MutationCtx,
  academyId: string,
  pin: string,
): Promise<Doc<"users">> {
  const caller = await requireSessionCaller(ctx);
  const user = caller.user;
  if (caller.isAdmin) return user;
  const current = await resolveCurrentPin(ctx, academyId);
  if (current !== pin.trim()) {
    throw new ConvexError({
      code: "forbidden",
      message: "Falsche PIN.",
    });
  }
  return user;
}
