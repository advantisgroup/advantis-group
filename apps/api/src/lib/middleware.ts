import { type AuthedUser } from "./clerk.js";
import { isAllowedOrigin } from "./env.js";
import { Errors } from "./errors.js";
import { getRequestContext } from "./request-context.js";

/**
 * Only let our own apps call this endpoint from a browser.
 *
 * CORS here is deliberately wide — `cors.ts` also hands
 * `allow-credentials: true` to every active tenant company domain — and Clerk
 * accepts cookie auth, so a script on a customer's own domain can otherwise
 * make credentialed calls in a signed-in employee's browser. That's fine for
 * the upload/export routes it was widened for, and not fine for anything that
 * changes or verifies a credential. Those stay on the static first-party
 * list, which no tenant can join.
 *
 * Every caller of these routes is a browser doing a cross-origin `fetch`, so
 * `Origin` is always present; a request without one isn't one of ours.
 */
export function requireFirstPartyOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  if (!origin || !isAllowedOrigin(origin)) throw Errors.forbidden();
}

/** Require a valid intranet Clerk session, or throw 401. */
export async function requireAuth(request: Request): Promise<AuthedUser> {
  const user = await getRequestContext(request).requireUser();
  if (!user) throw Errors.unauthorized();
  return user;
}

/** Guard internal endpoints with the shared Convex server key header. */
export function requireServerKey(request: Request): void {
  const provided = request.headers.get("x-convex-server-key");
  const expected = process.env.CONVEX_SERVER_KEY;
  if (!expected || provided !== expected) throw Errors.unauthorized();
}
