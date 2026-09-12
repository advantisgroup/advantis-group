"use client";

import { type ReactNode } from "react";

import { AlertTriangle, Check, CircleSlash, RotateCcw, Square, Unplug } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { AiGlyph } from "./AiGlyph";
import { AiThinking } from "./AiThinking";
import { type AiRunMeta, type AiRunPhase, type AiRunState, type AiRunView } from "./use-ai-run";

const PHASES: AiRunPhase[] = ["reading", "writing", "finishing"];

/** One accent per state, as a bare token so the wash, the meter and the
 * icon can never drift apart — same idea as the Security Standing card. */
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
  const accent = AI_STATE_ACCENT[state];
  if (state === "working") {
    return (
      <span className="ai-edge flex size-9 shrink-0 items-center justify-center rounded-xl">
        <AiGlyph working className="size-[18px]" />
      </span>
    );
  }
  const Icon =
    state === "done"
      ? Check
      : state === "error"
        ? AlertTriangle
        : state === "interrupted"
          ? Unplug
          : CircleSlash;
  return (
    <span
      className="flex size-9 shrink-0 items-center justify-center rounded-xl"
      style={{ color: accent, background: `color-mix(in oklch, ${accent} 14%, transparent)` }}
    >
      <Icon className="size-[18px]" strokeWidth={state === "done" ? 3 : 2} />
    </span>
  );
}

/** Three rungs for reading → writing → finishing. Filled to where the run
 * got; the rung it's on right now pulses in Aurora. */
function PhaseMeter({ run, state }: { run: AiRunMeta; state: AiRunState }) {
  const reached = state === "done" ? PHASES.length : PHASES.indexOf(run.phase) + 1;
  return (
    <div className="flex shrink-0 items-end gap-1.5" aria-hidden>
      {PHASES.map((phase, index) => {
        const on = index < reached;
        const live = state === "working" && index === reached - 1;
        return (
          <span
            key={phase}
            className={cn(
              "w-1.5 rounded-full transition-[background,opacity] duration-300",
              live && "animate-pulse",
            )}
            style={{
              height: `${14 + index * 7}px`,
              background: !on
                ? "var(--border)"
                : state === "working"
                  ? "linear-gradient(to top, var(--ai-1), var(--ai-3))"
                  : AI_STATE_ACCENT[state],
              opacity: on ? 1 : 0.55,
            }}
          />
        );
      })}
    </div>
  );
}

/**
 * The status of one AI run as a single glanceable card: an icon that is the
 * state, a big verdict, one line of context and the only actions that make
 * sense right now. Working runs orbit; nothing ever just spins.
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

  const accent = AI_STATE_ACCENT[state];
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
      className={cn("ai-orbit rounded-2xl border border-border/60 p-4", className)}
      style={{
        backgroundColor: "var(--card)",
        backgroundImage: `radial-gradient(30rem 12rem at 0% 0%, color-mix(in oklch, ${accent} 15%, transparent), transparent 70%)`,
      }}
    >
      <div className="flex items-start gap-3">
        <StateIcon state={state} />
        <div className="min-w-0 flex-1">
          <p className="text-[0.7rem] font-medium uppercase tracking-[0.16em]">
            <span className="ai-text">{t("eyebrow")}</span>
            <span className="text-muted-foreground"> · {t(`kind.${run.kind}`)}</span>
          </p>
          <h3 className="mt-0.5 font-display text-lg font-bold leading-snug tracking-tight text-balance">
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
        </div>
        <PhaseMeter run={run} state={state} />
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
