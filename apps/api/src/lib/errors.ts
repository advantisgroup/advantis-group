import { ConvexError } from "convex/values";

/** True for the ConvexError a feature-gated Convex function throws (see packages/convex/convex/lib/featureGate.ts). */
export function isFeatureDisabledError(err: unknown): boolean {
  return (
    err instanceof ConvexError &&
    typeof err.data === "object" &&
    err.data !== null &&
    (err.data as { code?: unknown }).code === "feature_disabled"
  );
}

/** Application error carrying an HTTP status and a stable code. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

export const Errors = {
  unauthorized: (msg = "Not authenticated") => new ApiError(401, "unauthorized", msg),
  forbidden: (msg = "Forbidden") => new ApiError(403, "forbidden", msg),
  badRequest: (msg = "Bad request") => new ApiError(400, "bad_request", msg),
  notFound: (msg = "Not found") => new ApiError(404, "not_found", msg),
  rateLimited: (msg = "Too many requests") => new ApiError(429, "rate_limited", msg),
  upstream: (msg = "Upstream service error") => new ApiError(502, "upstream", msg),
  internal: (msg = "Something went wrong") => new ApiError(500, "internal", msg),
};
