import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";

import { getConvex } from "./convex.js";
import { Errors } from "./errors.js";

/**
 * Verifies the caller's Performance session token (from the
 * `Authorization: Bearer <token>` header) and requires the `upload_reports`
 * permission for their company — the multi-tenant replacement for the old
 * fixed "admin role" check, same as the reference script's `@admin_required`
 * on `/upload`. Performance auth is intentionally separate from Clerk (see
 * `packages/convex/convex/performanceAuth.ts`), so this doesn't go through
 * `requireAuth`/Clerk at all.
 *
 * A cross-company super-admin session has no `companyId` of its own — this
 * route can't infer which company they mean to act on, so it's rejected
 * here with a clear message rather than guessing. Super-admin-driven
 * uploads go through the intranet UI directly, which can pass an explicit
 * `companyId`.
 *
 * Returns the login's display identity and `companyId` so callers (the
 * upload/export routes) can stamp "who uploaded this" and scope every
 * downstream Convex call to the right tenant.
 */
export async function requirePerformanceAdmin(
  request: Request
): Promise<{ name: string; email: string; companyId: Id<"companies"> }> {
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) throw Errors.unauthorized();

  const session = await getConvex().query(api.performanceAuth.validateSession, {
    token,
  });
  if (!session.valid || !session.permissions.includes("upload_reports")) {
    throw Errors.forbidden();
  }
  if (!session.companyId) {
    // Only a super-admin session lacks companyId — see the doc comment.
    throw Errors.forbidden();
  }
  return { name: session.name, email: session.email, companyId: session.companyId };
}
