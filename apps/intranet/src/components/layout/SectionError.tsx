"use client";

import { useEffect } from "react";

import { ErrorFallback } from "@/components/ErrorFallback";
import { getErrorMessage, reportClientError } from "@/lib/errors";

/**
 * The `error.tsx` for a section with its own layout (tabs, a record header).
 * Next renders it inside that layout, so a crash in one tab leaves the
 * section's navigation standing and "Try again" only re-renders the section.
 */
export function SectionError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    reportClientError(error, "section-route-boundary");
  }, [error]);

  return <ErrorFallback description={getErrorMessage(error)} onRetry={reset} />;
}
