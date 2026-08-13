import { ConvexError } from "convex/values";
import * as Effect from "effect/Effect";

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
  readonly detail?: string;

  constructor(status: number, code: string, message: string, detail?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.detail = detail;
  }
}

export interface ErrorContext {
  requestId: string;
  method: string;
  path: string;
}

function normalizeApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  return new ApiError(
    500,
    "internal",
    "Something went wrong",
    error instanceof Error ? error.message : String(error),
  );
}

/**
 * The single API failure path: normalize any thrown value into the stable
 * response envelope, retain diagnostic detail in the server log, and never
 * send unexpected implementation detail to the browser.
 */
export function reportApiFailure(error: unknown, context: ErrorContext): Promise<ApiError> {
  return Effect.gen(function* () {
    const failure = yield* Effect.sync(() => normalizeApiError(error));
    yield* Effect.sync(() => {
      console.error(
        "[api:error]",
        {
          requestId: context.requestId,
          method: context.method,
          path: context.path,
          status: failure.status,
          code: failure.code,
          detail: failure.detail ?? failure.message,
        },
        error,
      );
    });
    return failure;
  }).pipe(Effect.runPromise);
}

export const Errors = {
  unauthorized: (msg = "Not authenticated") => new ApiError(401, "unauthorized", msg),
  forbidden: (msg = "Forbidden") => new ApiError(403, "forbidden", msg),
  badRequest: (msg = "Bad request") => new ApiError(400, "bad_request", msg),
  notFound: (msg = "Not found") => new ApiError(404, "not_found", msg),
  rateLimited: (msg = "Too many requests") => new ApiError(429, "rate_limited", msg),
  upstream: (detail?: string) =>
    new ApiError(
      502,
      "upstream",
      "The connected service is unavailable. Please try again.",
      detail,
    ),
  internal: (detail?: string) => new ApiError(500, "internal", "Something went wrong", detail),
};
