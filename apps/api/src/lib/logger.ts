import { type ErrorContext } from "./errors.js";

function errorDetails(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return { name: error.name, message: error.message, stack: error.stack };
  }
  return { value: error };
}

export function logApiFailure(
  context: ErrorContext,
  details: Record<string, unknown>,
  error: unknown,
): void {
  console.error("[api:error]", {
    requestId: context.requestId,
    method: context.method,
    path: context.path,
    ...details,
    error: errorDetails(error),
  });
}
