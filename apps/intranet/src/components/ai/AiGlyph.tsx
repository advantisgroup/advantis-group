"use client";

import { Mark } from "@/components/branding/ProviderMark";
import { cn } from "@/lib/utils";

/** The mark for AI everywhere — the Claude logo, since that's what answers.
 * `working` makes it slowly turn, like it does in Claude itself. */
export function AiGlyph({ working = false, className }: { working?: boolean; className?: string }) {
  return (
    <span aria-hidden data-working={working} className="ai-glyph inline-flex shrink-0">
      <Mark provider="claude" className={cn("size-4", className)} />
    </span>
  );
}
