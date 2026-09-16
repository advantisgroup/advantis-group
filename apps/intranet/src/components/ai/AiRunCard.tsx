"use client";

import { type ReactNode } from "react";

import { AlertTriangle, Check, CircleSlash, RotateCcw, Square, Unplug } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { AiGlyph } from "./AiGlyph";
import { AiRunStats, AiThinking } from "./AiThinking";
import { type AiRunState, type AiRunView } from "./use-ai-run";

/** One colour per state, shared by the card icon and the run details. */
export const AI_STATE_ACCENT: Record<AiRunState, string> = {
  working: "var(--ai-2)",
  done: "var(--success)",
  error: "var(--destructive)",
  interrupted: "var(--warning)",
  cancelled: "var(--muted-foreground)",
};

const KNOWN_ERRORS = new Set([
  "rate_limited",
  "upstream",
  "unparsable",
  "no_content",
  "truncated",
  "interrupted",
]);

export function aiErrorKey(code: string | null): string {
  return `errors.${code && KNOWN_ERRORS.has(code) ? code : "internal"}`;
}

function StateIcon({ state }: { state: AiRunState }) {
  if (state === "working") return <AiGlyph working className="mt-0.5 size-[18px]" />;
  const Icon =
    state === "done"
      ? Check
      : state === "error"
        ? AlertTriangle
        : state === "interrupted"
          ? Unplug
          : CircleSlash;
  return (
    <Icon
      className="mt-0.5 size-[18px] shrink-0"
      style={{ color: AI_STATE_ACCENT[state] }}
      strokeWidth={state === "done" ? 2.5 : 2}
    />
  );
}
/**
 * The status of one AI run as a single glanceable card: an icon that is the
 * state, a big verdict, one line of context and the only actions that make
 * sense right now. While it works, the Claude mark turns and the status shimmers.
 */
export function AiRunCard<T>({
  view,
  titles,
  bodies,
  onRetry,
  onDismiss,
  children,
  className,
}: {
  view: AiRunView<T>;
  titles?: Partial<Record<AiRunState, string>>;
  bodies?: Partial<Record<AiRunState, ReactNode>>;
  onRetry?: () => void;
  /** Put a failed/stopped run away without retrying. */
  onDismiss?: () => void;
  /** Actions for a finished run (apply, open, review…). */
  children?: ReactNode;
  className?: string;
}) {
  const t = useTranslations("Ai");
  const { run, state } = view;
  if (!run || !state) return null;

  const body =
    bodies?.[state] ??
    (state === "working"
      ? t("keepsRunning")
      : state === "error"
        ? t(aiErrorKey(run.errorCode))
        : state === "interrupted"
          ? t("interruptedBody")
          : state === "cancelled"
            ? t("cancelledBody")
            : null);
  const settledBadly = state === "error" || state === "interrupted" || state === "cancelled";
  const canRetry = !!onRetry && settledBadly && (state !== "error" || run.retryable);
  const hasActions =
    state === "working" ||
    (settledBadly && (canRetry || !!onDismiss)) ||
    (state === "done" && !!children);

  return (
    <section
      aria-live="polite"
      data-working={state === "working"}
      className={cn("rounded-xl border border-border/70 bg-card p-4", className)}
    >
      <div className="flex items-start gap-3">
        <StateIcon state={state} />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-muted-foreground">
            <span className="ai-text">{t("eyebrow")}</span>
            <span className="text-muted-foreground"> · {t(`kind.${run.kind}`)}</span>
          </p>
          <h3 className="mt-0.5 text-[15px] font-semibold leading-snug tracking-tight text-balance">
            {titles?.[state] ?? t(`state.${state}`)}
          </h3>
          {state === "working" && (
            <AiThinking
              className="mt-1 max-w-full"
              phase={run.phase}
              elapsedSec={view.elapsedSec}
              detail={run.outputChars > 0 ? t("chars", { count: run.outputChars }) : undefined}
            />
          )}
          {body && (
            <p className="mt-1 max-w-prose text-sm leading-relaxed text-muted-foreground text-pretty">
              {body}
            </p>
          )}
          {state === "done" && <AiRunStats run={run} className="mt-1" />}
        </div>
      </div>

      {hasActions && (
        <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
          {state === "working" && (
            <Button variant="ghost" size="sm" onClick={view.cancel}>
              <Square className="fill-current" />
              {t("stop")}
            </Button>
          )}
          {settledBadly && onDismiss && (
            <Button variant="ghost" size="sm" onClick={onDismiss}>
              {t("dismiss")}
            </Button>
          )}
          {canRetry && (
            <Button variant="outline" size="sm" onClick={onRetry}>
              <RotateCcw />
              {t("retry")}
            </Button>
          )}
          {state === "done" && children}
        </div>
      )}
    </section>
  );
}
