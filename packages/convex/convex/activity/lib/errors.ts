import { ConvexError } from "convex/values";

/**
 * Structured application errors. Throwing a `ConvexError` with structured data
 * propagates `{ code, message }` to the client untouched, so the UI can map
 * `code` to a localized message (falling back to `message`).
 *
 * `code` is a stable machine string (e.g. "auth.forbidden", "notFound.device").
 * `message` is an English technical fallback — never user-facing on its own.
 */
export function appError(
  code: string,
  message: string
): ConvexError<{ code: string; message: string }> {
  return new ConvexError({ code, message });
}
