"use client";

import * as React from "react";
import { Info } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/**
 * Small explanatory tooltip used on error/status surfaces. With no children it
 * renders a focusable info icon; wrapping children turns them into the trigger
 * (e.g. a status badge), so hovering/focusing explains what the state means.
 * Requires a `TooltipProvider` ancestor (mounted in app/providers.tsx).
 */
export function InfoTip({
  text,
  children,
  className,
  side = "top",
}: {
  text: string;
  children?: React.ReactNode;
  className?: string;
  side?: "top" | "right" | "bottom" | "left";
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {children ? (
          <span className={cn("inline-flex cursor-help", className)}>
            {children}
          </span>
        ) : (
          <button
            type="button"
            aria-label={text}
            className={cn(
              "inline-flex text-muted-foreground transition-colors hover:text-fg focus-visible:text-fg focus:outline-none",
              className
            )}
          >
            <Info className="h-3.5 w-3.5" />
          </button>
        )}
      </TooltipTrigger>
      <TooltipContent side={side} className="max-w-xs leading-relaxed">
        {text}
      </TooltipContent>
    </Tooltip>
  );
}
