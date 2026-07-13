import { type AuthedUser, authenticate } from "./clerk.js";
import { Errors } from "./errors.js";

/** Require a valid intranet Clerk session, or throw 401. */
export async function requireAuth(request: Request): Promise<AuthedUser> {
  const user = await authenticate(request);
  if (!user) throw Errors.unauthorized();
  return user;
}

/** Guard internal endpoints with the shared Convex server key header. */
export function requireServerKey(request: Request): void {
  const provided = request.headers.get("x-convex-server-key");
  const expected = process.env.CONVEX_SERVER_KEY;
  console.log(provided, expected)
  if (!expected || provided !== expected) throw Errors.unauthorized();
}
