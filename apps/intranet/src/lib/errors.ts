// Centralised error parsing so the UI never shows raw Convex error strings
// (e.g. "[CONVEX M(...)] Uncaught ConvexError: [object Object]") to users.
//
// All Convex functions in this project throw `ConvexError({ code, message })`
// (see packages/convex/convex/*). On the client that surfaces as a
// `ConvexError` whose `.data` holds the structured payload. These helpers pull
// that payload out safely and fall back to a friendly message for anything
// else (network blips, unexpected exceptions, plain Errors).

import { ConvexError } from "convex/values";

/** Error codes thrown by the Convex backend. Keep in sync with the backend. */
export type ErrorCode =
  | "unauthenticated"
  | "forbidden"
  | "not_found"
  | "bad_request"
  | "conflict"
  | "rate_limited"
  | "upstream"
  | "internal"
  | "feature_disabled";

const KNOWN_CODES: readonly ErrorCode[] = [
  "unauthenticated",
  "forbidden",
  "not_found",
  "bad_request",
  "conflict",
  "rate_limited",
  "upstream",
  "internal",
  "feature_disabled",
];

export interface ParsedError {
  /** Structured code when the backend provided one, otherwise undefined. */
  code?: ErrorCode;
  /** Diagnostic text retained for logs; UI copy is always chosen locally. */
  message?: string;
  /** Correlates an API response with its server-side log entry. */
  requestId?: string;
}

interface ConvexErrorData {
  code?: unknown;
  message?: unknown;
}

interface ApiErrorData {
  code?: unknown;
  error?: unknown;
  message?: unknown;
  requestId?: unknown;
}

function isErrorCode(value: unknown): value is ErrorCode {
  return typeof value === "string" && (KNOWN_CODES as readonly string[]).includes(value);
}

function normalizeErrorCode(value: unknown): ErrorCode | undefined {
  if (isErrorCode(value)) return value;
  if (typeof value !== "string") return undefined;

  if (value.startsWith("auth.")) {
    return value === "auth.unauthenticated" ? "unauthenticated" : "forbidden";
  }
  if (value.startsWith("notFound.")) return "not_found";
  if (value.startsWith("validation.")) return "bad_request";
  if (value === "clockodo.rateLimited") return "rate_limited";
  if (value === "clockodo.upstream") return "upstream";

  return undefined;
}

/**
 * Extract a `{ code, message }` pair from any thrown value without ever
 * leaking an `[object Object]` or an internal Convex prefix into the UI.
 */
export function parseError(error: unknown): ParsedError {
  if (error instanceof ConvexError) {
    const data = error.data as unknown;

    // The structured `{ code, message }` shape the backend throws.
    if (data && typeof data === "object") {
      const { code, message } = data as ConvexErrorData;
      return {
        code: normalizeErrorCode(code),
        message: typeof message === "string" ? message : undefined,
      };
    }

    // A ConvexError thrown with a bare string payload.
    if (typeof data === "string") {
      return { message: data };
    }

    return {};
  }

  // Elysia/Eden errors retain the JSON response under `value` while a few
  // fetch helpers throw the response body itself. Both are normalized here so
  // the UI has one display policy for API and Convex failures.
  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    const payload = (
      record.value && typeof record.value === "object" ? record.value : record
    ) as ApiErrorData;
    return {
      code: normalizeErrorCode(payload.code),
      message:
        typeof payload.error === "string"
          ? payload.error
          : typeof payload.message === "string"
            ? payload.message
            : undefined,
      requestId: typeof payload.requestId === "string" ? payload.requestId : undefined,
    };
  }

  // Network errors / unexpected throws. We deliberately do NOT surface
  // `error.message` here because it tends to carry framework noise; callers
  // localise via the (absent) code instead.
  return {};
}

/**
 * Resolve a safe display string from the local fallback catalogue. This is the
 * non-React path; components should use `useErrorHandler` for localisation.
 */
export function getErrorMessage(
  error: unknown,
  fallbacks: Partial<Record<ErrorCode | "generic", string>> = {},
): string {
  const { code } = parseError(error);
  const byCode = code ? fallbacks[code] : undefined;
  return byCode ?? fallbacks.generic ?? "Something went wrong. Please try again.";
}

/** Log the original failure once while keeping implementation detail out of UI copy. */
export function reportClientError(error: unknown, source: string): ParsedError {
  const parsed = parseError(error);
  console.error(
    "[intranet:error]",
    { source, code: parsed.code ?? "unknown", requestId: parsed.requestId },
    error,
  );
  return parsed;
}
