"use client";

import { useId } from "react";

import { cn } from "@/lib/utils";

/** The ✦ that marks AI everywhere. Filled with the Aurora gradient; `working`
 * makes it breathe. */
export function AiGlyph({ working = false, className }: { working?: boolean; className?: string }) {
  // useId returns ":r1:" — colons break url(#…) references in some browsers.
  const gradientId = `ai-glyph-${useId().replace(/:/g, "")}`;
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      data-working={working}
      className={cn("ai-glyph size-4 shrink-0", className)}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" style={{ stopColor: "var(--ai-1)" }} />
          <stop offset="55%" style={{ stopColor: "var(--ai-2)" }} />
          <stop offset="100%" style={{ stopColor: "var(--ai-3)" }} />
        </linearGradient>
      </defs>
      <path
        fill={`url(#${gradientId})`}
        d="M10.5 1.5c.7 5.6 2.4 8.3 9 9.5-6.6 1.2-8.3 3.9-9 9.5-.7-5.6-2.4-8.3-9-9.5 6.6-1.2 8.3-3.9 9-9.5Z"
      />
      <path
        fill={`url(#${gradientId})`}
        opacity={0.8}
        d="M19.5 14.5c.3 2.2 1 3.2 3 3.5-2 .3-2.7 1.3-3 3.5-.3-2.2-1-3.2-3-3.5 2-.3 2.7-1.3 3-3.5Z"
      />
    </svg>
  );
}
