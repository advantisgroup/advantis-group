"use client";

import { Mark } from "@/components/branding/ProviderMark";
import { cn } from "@/lib/utils";

/** Three clay dots taking turns — how AI shows it's working, anywhere. */
export function AiDots({ className }: { className?: string }) {
  return (
    <span aria-hidden className={cn("ai-dots", className)}>
      <span />
      <span />
      <span />
    </span>
  );
}

/** The mark for AI everywhere — the Claude logo, since that's what answers.
 * While `working` it gives way to the dots instead of moving itself. */
export function AiGlyph({ working = false, className }: { working?: boolean; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("ai-glyph inline-flex size-4 shrink-0 items-center justify-center", className)}
    >
      {working ? <AiDots /> : <Mark provider="claude" className="size-full" />}
    </span>
  );
}
