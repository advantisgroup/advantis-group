"use client";

import { formatDuration } from "@/lib/activity/fmt";
import { useI18n } from "@/lib/activity/i18n";
import {
  describeStatus,
  type StatusInput,
  type StatusTone,
} from "@/lib/activity/status";
import { cn } from "@/lib/utils";

/**
 * The plain-language "what are they doing right now" line — the headline answer
 * ActivityTrack exists to give. Computes the descriptor from raw signals
 * (`describeStatus`) and renders a tone-coloured dot + the written status, with
 * an optional "idle for X" sub-line. Used compactly on the Overview grid cards
 * (`size="sm"`) and as the lead hero on the device timeline (`size="lg"`).
 */

const TONE_TEXT: Record<StatusTone, string> = {
  ok: "text-ok",
  warn: "text-warn",
  info: "text-signal",
  muted: "text-muted-foreground",
};

const TONE_DOT: Record<StatusTone, string> = {
  ok: "bg-ok",
  warn: "bg-warn",
  info: "bg-signal",
  muted: "bg-muted-foreground/60",
};

export function StatusSummary({
  status,
  size = "sm",
  className,
}: {
  status: StatusInput;
  size?: "sm" | "lg";
  className?: string;
}) {
  const { t, lang } = useI18n();
  const { headlineKey, tone, live, showIdleFor } = describeStatus(status);
  const lg = size === "lg";

  const idleFor =
    showIdleFor && status.idleSeconds != null && status.idleSeconds > 0
      ? t("state.idleFor", {
          duration: formatDuration(status.idleSeconds, lang),
        })
      : null;

  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      {live ? (
        <span className={cn("signal-dot shrink-0", lg && "!h-2.5 !w-2.5")} />
      ) : (
        <span
          className={cn(
            "shrink-0 rounded-full",
            lg ? "h-2.5 w-2.5" : "h-2 w-2",
            TONE_DOT[tone]
          )}
        />
      )}
      <div className="min-w-0">
        <p
          className={cn(
            "truncate font-semibold leading-tight",
            lg ? "text-xl" : "text-sm",
            TONE_TEXT[tone]
          )}
        >
          {t(headlineKey)}
        </p>
        {idleFor && (
          <p
            className={cn(
              "truncate text-muted-foreground",
              lg ? "text-sm" : "text-xs"
            )}
          >
            {idleFor}
          </p>
        )}
      </div>
    </div>
  );
}
