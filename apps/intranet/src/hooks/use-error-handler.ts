"use client";

import { useCallback } from "react";

import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { type ErrorCode, reportClientError } from "@/lib/errors";

// Codes whose shared copy tells the person more than a call site's own
// "couldn't save that" fallback: they explain *why* and what to do about it.
const SELF_EXPLAINING: ReadonlySet<ErrorCode> = new Set([
  "unauthenticated",
  "forbidden",
  "rate_limited",
  "upstream",
  "feature_disabled",
]);

/**
 * Returns `(error, fallback?) => string`: logs the failure and picks the text
 * to show for it — never the raw error message. A self-explaining code
 * (signed out, no permission, slow down, service down) wins; otherwise the
 * call site's fallback, then the code's generic copy.
 */
export function useErrorText() {
  const t = useTranslations("Errors");

  return useCallback(
    (error: unknown, fallbackMessage?: string, source = "inline") => {
      const { code } = reportClientError(error, source);
      if (code && SELF_EXPLAINING.has(code)) return t(code);
      return fallbackMessage ?? (code ? t(code) : t("generic"));
    },
    [t],
  );
}

/**
 * Returns a `handleError` callback for use in mutation/action catch blocks:
 * the same text as {@link useErrorText}, shown as a toast.
 */
export function useErrorHandler() {
  const errorText = useErrorText();

  return useCallback(
    (error: unknown, fallbackMessage?: string) => {
      toast.error(errorText(error, fallbackMessage, "toast"));
    },
    [errorText],
  );
}
