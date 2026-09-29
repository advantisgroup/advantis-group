import { type Doc } from "../_generated/dataModel";
import { type QueryCtx } from "../_generated/server";
import { userQuery } from "../functions";
import { canReadWikiEntry, userCanReadWikiEntry } from "./entries";

export type PolicyState = "confirmed" | "changed" | "pending";

async function myReads(ctx: QueryCtx, userId: Doc<"users">["_id"]) {
  const rows = await ctx.db
    .query("guidebookReads")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  return new Map(rows.map((r) => [r.slug, r.version ?? 1]));
}

function stateOf(confirmed: number | undefined, current: number): PolicyState {
  if (confirmed === undefined) return "pending";
  return confirmed >= current ? "confirmed" : "changed";
}

/**
 * The policy library: every policy the caller may read, where they stand
 * with it, and — for people who manage the wiki — how many of the colleagues
 * it's visible to have confirmed the current version.
 */
export const list = userQuery({
  args: {},
  handler: async (ctx) => {
    const caller = ctx.caller;
    const policies = (await ctx.db.query("wikiEntries").collect()).filter(
      (e) => e.policy && canReadWikiEntry(caller, e),
    );
    const mine = await myReads(ctx, caller.user._id);
    const canManage = caller.can("manage_guidebooks");
    const activeUsers = canManage
      ? (await ctx.db.query("users").collect()).filter((u) => u.status === "active")
      : [];

    return Promise.all(
      policies
        .sort((a, b) => a.thema.localeCompare(b.thema, "de"))
        .map(async (e) => {
          const current = e.policyVersion ?? 1;
          let confirmedCount: number | null = null;
          let audienceCount: number | null = null;
          if (canManage) {
            const reads = await ctx.db
              .query("guidebookReads")
              .withIndex("by_slug", (q) => q.eq("slug", e.slug))
              .collect();
            const confirmedIds = new Set(
              reads.filter((r) => (r.version ?? 1) >= current).map((r) => r.userId),
            );
            // Only the colleagues the page is visible to are asked to confirm it.
            const audience = activeUsers.filter((u) => userCanReadWikiEntry(u, e));
            audienceCount = audience.length;
            confirmedCount = audience.filter((u) => confirmedIds.has(u._id)).length;
          }
          return {
            _id: e._id,
            slug: e.slug,
            title: e.thema,
            version: current,
            updatedAt: e.updatedAt,
            state: stateOf(mine.get(e.slug), current),
            confirmedCount,
            audienceCount,
          };
        }),
    );
  },
});

/** Policies the caller still has to confirm — for the dashboard. */
export const pendingMine = userQuery({
  args: {},
  handler: async (ctx) => {
    const caller = ctx.caller;
    const mine = await myReads(ctx, caller.user._id);
    return (await ctx.db.query("wikiEntries").collect())
      .filter((e) => e.policy && canReadWikiEntry(caller, e))
      .map((e) => ({
        _id: e._id,
        slug: e.slug,
        title: e.thema,
        updatedAt: e.updatedAt,
        state: stateOf(mine.get(e.slug), e.policyVersion ?? 1),
      }))
      .filter((p) => p.state !== "confirmed");
  },
});
