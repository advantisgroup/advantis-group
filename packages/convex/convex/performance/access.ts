/**
 * What the signed-in intranet user may see in Performance — read by the
 * Performance shell to pick the dashboard and decide team view vs. own
 * page, and by apps/api before an upload. Rules in `lib/access.ts`.
 */
import { ConvexError, v } from "convex/values";

import { serverUserQuery, userQuery } from "../functions";
import { loadViewer, performanceIsLive, requireAdmin } from "./lib/access";

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
    };
  },
});

/** apps/api's upload route: only intranet admins upload, into a dashboard
 * that exists. Returns the name stamped on the upload log. */
export const apiUploadAccess = serverUserQuery({
  args: { companyId: v.id("companies") },
  handler: async (ctx, { companyId }): Promise<{ uploadedBy: string }> => {
    const viewer = await loadViewer(ctx, ctx.caller);
    requireAdmin(viewer);
    if (!viewer.dashboards.some((d) => d.companyId === companyId)) {
      throw new ConvexError({ code: "not_found", message: "Dashboard nicht gefunden." });
    }
    return { uploadedBy: viewer.name };
  },
});
