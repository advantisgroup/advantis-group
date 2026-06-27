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
  | "conflict";

const KNOWN_CODES: readonly ErrorCode[] = [
  "unauthenticated",
  "forbidden",
  "not_found",
  "bad_request",
  "conflict",
];

export interface ParsedError {
  /** Structured code when the backend provided one, otherwise undefined. */
  code?: ErrorCode;
  /**
   * A human-readable message. Prefers the backend-supplied message (already
   * user-friendly), otherwise undefined so the caller can localise by code.
   */
  message?: string;
}

interface ConvexErrorData {
  code?: unknown;
  message?: unknown;
}

function isErrorCode(value: unknown): value is ErrorCode {
  return (
    typeof value === "string" && (KNOWN_CODES as readonly string[]).includes(value)
  );
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
        code: isErrorCode(code) ? code : undefined,
        message: typeof message === "string" ? message : undefined,
      };
    }

    // A ConvexError thrown with a bare string payload.
    if (typeof data === "string") {
      return { message: data };
    }

    return {};
  }

  // Network errors / unexpected throws. We deliberately do NOT surface
  // `error.message` here because it tends to carry framework noise; callers
  // localise via the (absent) code instead.
  return {};
}

/**
 * Resolve a display string for a thrown value. Prefers the backend message,
 * then a per-code fallback from `fallbacks`, then a generic fallback. This is
 * the non-React path; components should use `useErrorHandler` for localisation.
 */
export function getErrorMessage(
  error: unknown,
  fallbacks: Partial<Record<ErrorCode | "generic", string>> = {}
): string {
  const { code, message } = parseError(error);
  if (message) return message;
  const byCode = code ? fallbacks[code] : undefined;
  return byCode ?? fallbacks.generic ?? "Something went wrong. Please try again.";
}
