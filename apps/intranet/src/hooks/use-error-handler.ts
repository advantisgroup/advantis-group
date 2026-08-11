"use client";

import { useCallback } from "react";

import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { parseError } from "@/lib/errors";

/**
 * Returns a `handleError` callback for use in mutation/action catch blocks.
 *
 * It turns any thrown value into a friendly, localised toast:
 *  - a backend `ConvexError({ code, message })` shows its human message;
 *  - a known error code with no message falls back to a localised string;
 *  - anything else (network errors, unexpected throws) shows a generic message.
 *
 * The raw error is always logged to the console so developers keep full detail.
 */
export function useErrorHandler() {
  const t = useTranslations("Errors");

  return useCallback(
    (error: unknown, fallbackMessage?: string) => {
      // Keep the original error in the console for debugging; users never see it.
      console.error(error);

      const { code, message } = parseError(error);
      const text = message ?? (code ? t(code) : (fallbackMessage ?? t("generic")));

      toast.error(text);
    },
    [t],
  );
}
