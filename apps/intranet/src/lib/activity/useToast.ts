"use client";

import { toast as sonnerToast } from "sonner";

export type ToastVariant = "ok" | "warn" | "danger";

/** Map our semantic variants onto Sonner's typed toast helpers. */
function emit(message: string, variant: ToastVariant = "ok") {
  switch (variant) {
    case "danger":
      sonnerToast.error(message);
      break;
    case "warn":
      sonnerToast.warning(message);
      break;
    default:
      sonnerToast.success(message);
  }
}

/**
 * Toasts, backed by Sonner. The `(message, variant)` signature is unchanged from
 * the previous in-house implementation, so every call site (and the
 * `useMutationWithToast` / `useActionWithToast` helpers) works as-is. Sonner's
 * `toast` is a module-level singleton, so no provider/context is needed — only
 * the `<Toaster />` rendered once in providers.tsx.
 */
export function useToast() {
  return emit;
}
