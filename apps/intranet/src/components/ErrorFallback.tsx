"use client";

import { AlertTriangle, RotateCcw } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface ErrorFallbackProps {
  /** Called when the user clicks "Try again". Omit to hide the retry button. */
  onRetry?: () => void;
  /** Optional overrides; default to the localised generic boundary copy. */
  title?: string;
  description?: string;
  /** Center the card in the full viewport (used by route-level boundaries). */
  fullScreen?: boolean;
  className?: string;
}

/**
 * Friendly, reusable fallback shown when a render error is caught — by the
 * `ErrorBoundary` component or a Next.js `error.tsx` segment boundary. Replaces
 * the bare Next.js error overlay with branded, recoverable UI.
 */
export function ErrorFallback({
  onRetry,
  title,
  description,
  fullScreen = false,
  className,
}: ErrorFallbackProps) {
  const t = useTranslations("Errors");

  return (
    <div
      className={cn(
        "flex items-center justify-center p-6",
        fullScreen ? "min-h-screen" : "min-h-[50vh]",
        className
      )}
    >
      <div className="flex max-w-sm flex-col items-center gap-4 text-center">
        <span className="flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <AlertTriangle className="h-6 w-6" />
        </span>
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">
            {title ?? t("boundaryTitle")}
          </h2>
          <p className="text-sm text-muted-foreground">
            {description ?? t("boundaryDescription")}
          </p>
        </div>
        {onRetry && (
          <Button onClick={onRetry} variant="outline">
            <RotateCcw className="mr-2 h-4 w-4" />
            {t("retry")}
          </Button>
        )}
      </div>
    </div>
  );
}
