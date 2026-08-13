import { ConvexError } from "convex/values";
import * as Effect from "effect/Effect";

import { type ApiErrorCode } from "@advantis/api-contract";

import { logApiFailure } from "./logger.js";

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
  readonly code: ApiErrorCode;
  readonly detail?: string;

  constructor(status: number, code: ApiErrorCode, message: string, detail?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.detail = detail;
  }
}

export class ProviderError extends ApiError {
  readonly provider: string;
  readonly operation: string;
  readonly retryable: boolean;
  readonly providerRequestId?: string;

  constructor({
    provider,
    operation,
    status = 502,
    code = "upstream",
    detail,
    retryable = true,
    providerRequestId,
  }: {
    provider: string;
    operation: string;
    status?: number;
    code?: ApiErrorCode;
    detail: string;
    retryable?: boolean;
    providerRequestId?: string;
  }) {
    super(
      status,
      code,
      code === "rate_limited"
        ? "Please wait a moment, then try again."
        : "The connected service is unavailable. Please try again.",
      detail,
    );
    this.name = "ProviderError";
    this.provider = provider;
    this.operation = operation;
    this.retryable = retryable;
    this.providerRequestId = providerRequestId;
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
      logApiFailure(
        context,
        {
          status: failure.status,
          code: failure.code,
          detail: failure.detail ?? failure.message,
          ...(failure instanceof ProviderError
            ? {
                provider: failure.provider,
                operation: failure.operation,
                retryable: failure.retryable,
                providerRequestId: failure.providerRequestId,
              }
            : {}),
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
