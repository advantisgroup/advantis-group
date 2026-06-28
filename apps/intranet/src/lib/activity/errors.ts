import { ConvexError } from "convex/values";

/**
 * Turn an unknown thrown value into a localized, human-readable message.
 *
 * The backend throws `ConvexError({ code, message })` (see backend `errors.ts`).
 * We map `code` to a localized `error.<code>` string; if there's no translation
 * we fall back to the technical `message`, then to a generic line. Plain
 * `Error`s (network drops, client bugs) get the generic message — but they are
 * never swallowed: callers also log them to the console.
 */
type Translate = (key: string, vars?: Record<string, string | number>) => string;

interface AppErrorData {
  code?: unknown;
  message?: unknown;
}

function appErrorData(err: unknown): AppErrorData | null {
  if (err instanceof ConvexError && err.data && typeof err.data === "object") {
    return err.data as AppErrorData;
  }
  // Duck-typed fallback: if `instanceof` misses (e.g. ConvexError bundled under
  // a different module identity across the client boundary), still recover the
  // structured `{ code, message }` payload from a `.data` object.
  if (
    err &&
    typeof err === "object" &&
    "data" in err &&
    typeof (err as { data: unknown }).data === "object" &&
    (err as { data: unknown }).data !== null
  ) {
    return (err as { data: AppErrorData }).data;
  }
  return null;
}

export function errorCode(err: unknown): string | null {
  const data = appErrorData(err);
  return data && typeof data.code === "string" ? data.code : null;
}

export function errorMessage(t: Translate, err: unknown): string {
  const code = errorCode(err);
  if (code) {
    const key = `error.${code}`;
    const translated = t(key);
    if (translated !== key) return translated;
  }
  const data = appErrorData(err);
  if (data && typeof data.message === "string") return data.message;
  return t("error.generic");
}
