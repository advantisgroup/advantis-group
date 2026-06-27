"use client";

import { useEffect } from "react";

import { ErrorFallback } from "@/components/ErrorFallback";

/**
 * Segment-level error boundary for the authenticated app. Catches uncaught
 * errors thrown while rendering any page in this group and shows a recoverable
 * fallback instead of the bare Next.js application-error screen. It sits below
 * the i18n/theme providers in the root layout, so it can render localised UI.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("App route error:", error);
  }, [error]);

  return <ErrorFallback fullScreen onRetry={reset} />;
}
