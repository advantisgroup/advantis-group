import { api } from "@advantis/convex/api";

import { getConvex } from "./convex.js";
import { Errors } from "./errors.js";

/**
 * Verifies the caller's Performance session token (from the
 * `Authorization: Bearer <token>` header) and requires admin role — the
 * only role allowed to upload reports, same as the reference script's
 * `@admin_required` on `/upload`. Performance auth is intentionally
 * separate from Clerk (see `packages/convex/convex/performanceAuth.ts`),
 * so this doesn't go through `requireAuth`/Clerk at all.
 */
export async function requirePerformanceAdmin(request: Request): Promise<void> {
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) throw Errors.unauthorized();

  const session = await getConvex().query(api.performanceAuth.validateSession, {
    token,
  });
  if (!session.valid || session.role !== "admin") throw Errors.forbidden();
}
