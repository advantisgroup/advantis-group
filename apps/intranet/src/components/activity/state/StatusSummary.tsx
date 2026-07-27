"use client";

import { formatDuration, nowMs } from "@/lib/activity/fmt";
import { useI18n } from "@/lib/activity/i18n";
import { describeStatus, type StatusInput, type StatusTone } from "@/lib/activity/status";
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
  since,
  size = "sm",
  className,
}: {
  status: StatusInput;
  /**
   * When the current state began (epoch ms) — renders a "since 13:42 · 26m"
   * sub-line so a manager sees not just *what* someone is doing but *since
   * when*. Suppressed while an "idle for X" line already answers that.
   */
  since?: number | null;
  size?: "sm" | "lg";
  className?: string;
}) {
  const { t, lang } = useI18n();
  const { headlineKey, tone, showIdleFor, assumed } = describeStatus(status);
  const lg = size === "lg";

  const idleFor =
    showIdleFor && status.idleSeconds != null && status.idleSeconds > 0
      ? t("state.idleFor", {
          duration: formatDuration(status.idleSeconds, lang),
        })
      : null;

  const sinceLine =
    !idleFor && since != null && since <= nowMs()
      ? t("state.sinceFor", {
          time: new Date(since).toLocaleTimeString(lang, {
            hour: "2-digit",
            minute: "2-digit",
          }),
          duration: formatDuration((nowMs() - since) / 1000, lang),
        })
      : null;
  const subLine = idleFor ?? sinceLine;

  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      {/* Static colour-coded dot — no pulse, intentionally calm. */}
      <span
        className={cn("shrink-0 rounded-full", lg ? "h-2.5 w-2.5" : "h-2 w-2", TONE_DOT[tone])}
      />
      <div className="min-w-0">
        <p
          className={cn(
            "truncate font-semibold leading-tight",
            lg ? "text-xl" : "text-sm",
            TONE_TEXT[tone],
          )}
        >
          {t(headlineKey)}
        </p>
        {subLine && (
          <p className={cn("truncate text-muted-foreground", lg ? "text-sm" : "text-xs")}>
            {subLine}
          </p>
        )}
        {/* Provisional verdicts are labelled so a manager never mistakes a
            guess for a reported fact; hover for the full explanation. */}
        {assumed && (
          <p
            title={t("state.assumedHint")}
            className={cn(
              "truncate italic text-muted-foreground/80 underline decoration-dotted underline-offset-2",
              lg ? "text-xs" : "text-[11px]",
            )}
          >
            {t("state.assumed")}
          </p>
        )}
      </div>
    </div>
  );
}
