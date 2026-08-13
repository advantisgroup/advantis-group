import { type AuthedUser, authenticate } from "./clerk.js";

export interface ApiRequestContext {
  requestId: string;
  method: string;
  path: string;
  requireUser: () => Promise<AuthedUser | null>;
}

const contexts = new WeakMap<Request, ApiRequestContext>();

export function getRequestContext(request: Request): ApiRequestContext {
  const existing = contexts.get(request);
  if (existing) return existing;

  let user: Promise<AuthedUser | null> | undefined;
  const context: ApiRequestContext = {
    requestId: crypto.randomUUID(),
    method: request.method,
    path: new URL(request.url).pathname,
    requireUser: () => (user ??= authenticate(request)),
  };
  contexts.set(request, context);
  return context;
}
