import { type AuthedUser } from "./clerk.js";
import { Errors } from "./errors.js";
import { getRequestContext } from "./request-context.js";

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
