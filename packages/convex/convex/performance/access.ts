/**
 * What the signed-in intranet user may see in Performance — read by the
 * Performance shell to pick the dashboard and decide team view vs. own
 * page, and by apps/api before an upload. Rules in `lib/access.ts`.
 */
import { ConvexError, v } from "convex/values";

import { serverUserQuery, userMutation, userQuery } from "../functions";
import { effectiveRole } from "../lib/auth";
import { displayName } from "../lib/users";
import { loadViewer, performanceIsLive, requireAdmin, viewerFor } from "./lib/access";

export const me = userQuery({
  args: {},
  handler: async (ctx) => {
    const viewer = await loadViewer(ctx, ctx.caller);
    return {
      name: viewer.name,
      isAdmin: viewer.isAdmin,
      /** False while Performance is admins-only (`PERFORMANCE_MODE`). */
      live: performanceIsLive(),
      dashboards: viewer.dashboards,
      /** The person an admin is previewing with "Ansicht als", if any. */
      viewingAs: viewer.viewingAs ?? null,
      /** Whether the "Ansicht als" control is offered (intranet admins). */
      canViewAs: ctx.caller.isAdmin,
    };
  },
});

/** apps/api's upload route: only intranet admins upload, into a dashboard
 * that exists. Returns the name stamped on the upload log. */
export const apiUploadAccess = serverUserQuery({
  args: { companyId: v.id("companies") },
  handler: async (ctx, { companyId }): Promise<{ uploadedBy: string }> => {
    const viewer = await loadViewer(ctx, ctx.caller, { ownRights: true });
    requireAdmin(viewer);
    if (!viewer.dashboards.some((d) => d.companyId === companyId)) {
      throw new ConvexError({ code: "not_found", message: "Dashboard nicht gefunden." });
    }
    return { uploadedBy: viewer.name };
  },
});

/** Everyone an admin can preview with "Ansicht als": active intranet users
 * who would see at least one dashboard once Performance is live, with what
 * they'd get on each. */
export const viewAsOptions = userQuery({
  role: "admin",
  args: {},
  handler: async (ctx) => {
    const users = await ctx.db.query("users").collect();
    const candidates = users.filter(
      (u) => u.status === "active" && !u.external && u._id !== ctx.caller.user._id,
    );
    const rows = await Promise.all(
      candidates.map(async (u) => {
        const viewer = await viewerFor(ctx, u, effectiveRole(u) === "admin", true);
        return {
          userId: u._id,
          name: displayName(u),
          isAdmin: viewer.isAdmin,
          dashboards: viewer.dashboards.map((d) => ({
            name: d.name,
            team: d.canViewTeam,
            own: d.employeeId !== null,
          })),
        };
      }),
    );
    return rows
      .filter((r) => r.dashboards.length > 0)
      .sort((a, b) => a.name.localeCompare(b.name, "de"));
  },
});

/** Starts (`userId`) or ends (`null`) the admin's "Ansicht als" preview. */
export const setViewAs = userMutation({
  role: "admin",
  args: { userId: v.union(v.id("users"), v.null()) },
  handler: async (ctx, { userId }): Promise<void> => {
    const adminUserId = ctx.caller.user._id;
    const existing = await ctx.db
      .query("performanceViewAs")
      .withIndex("by_admin", (q) => q.eq("adminUserId", adminUserId))
      .collect();
    for (const row of existing) await ctx.db.delete(row._id);
    if (userId === null) return;
    if (userId === adminUserId) return;
    const target = await ctx.db.get(userId);
    if (!target || target.status !== "active") {
      throw new ConvexError({ code: "not_found", message: "Person nicht gefunden." });
    }
    await ctx.db.insert("performanceViewAs", {
      adminUserId,
      targetUserId: userId,
      startedAt: Date.now(),
    });
  },
});
