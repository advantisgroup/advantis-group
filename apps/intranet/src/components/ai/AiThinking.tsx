"use client";

import { type ReactNode } from "react";

import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";

import { AiGlyph } from "./AiGlyph";
import { type AiRunPhase } from "./use-ai-run";

/** The one waiting state for AI: a breathing glyph, a shimmering verb and a
 * quiet clock. Never a spinner, never a random joke. */
export function AiThinking({
  phase,
  label,
  detail,
  elapsedSec,
  className,
}: {
  phase?: AiRunPhase;
  label?: string;
  detail?: ReactNode;
  elapsedSec?: number;
  className?: string;
}) {
  const t = useTranslations("Ai");
  return (
    <span role="status" className={cn("inline-flex min-w-0 items-center gap-2 text-sm", className)}>
      <AiGlyph working />
      <span className="ai-shimmer truncate font-medium">
        {label ?? t(`phase.${phase ?? "reading"}`)}
      </span>
      {detail && <span className="truncate text-xs text-muted-foreground">{detail}</span>}
      {elapsedSec !== undefined && elapsedSec >= 1 && (
        <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground/70">
          {t("elapsed", { seconds: elapsedSec })}
        </span>
      )}
    </span>
  );
}
