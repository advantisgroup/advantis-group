"use client";

import { type ReactNode } from "react";

import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";

export type CheckpointState = "done" | "current" | "upcoming" | "failed" | "warning" | "skipped";

export type Checkpoint = {
  key: string;
  label: string;
  /** A time or a short note under the label. */
  meta?: ReactNode;
  state: CheckpointState;
};

// the line into a step is drawn solid once the track has got that far
const REACHED = new Set<CheckpointState>(["done", "current", "failed", "warning"]);

const DOT: Record<CheckpointState, string> = {
  done: "border-foreground bg-foreground",
  current: "border-2 border-foreground bg-background",
  upcoming: "border-rule-strong bg-background",
  failed: "border-destructive bg-destructive ring-4 ring-destructive/15",
  warning: "border-warning bg-warning ring-4 ring-warning/25",
  skipped: "border-dashed border-muted-foreground/60 bg-background",
};

const LABEL: Record<CheckpointState, string> = {
  done: "text-foreground",
  current: "font-medium text-foreground",
  upcoming: "text-muted-foreground",
  failed: "font-medium text-destructive",
  warning: "font-medium text-foreground",
  skipped: "text-muted-foreground",
};

/**
 * A process drawn as a ruler: one dot per step on a hairline, the label and
 * its time underneath. Across the page from `sm` up, stacked on a phone,
 * where four labels side by side would wrap into each other.
 *
 * Whatever explains a failed or stuck step goes in `children`, which sits
 * directly under the track — use `CheckpointNote` for it.
 */
export const Checkpoints = ({
  steps,
  label,
  children,
  className,
}: {
  steps: readonly Checkpoint[];
  /** Names the list for screen readers, e.g. "Progress". */
  label: string;
  children?: ReactNode;
  className?: string;
}) => {
  const t = useTranslations("checkpoints");

  return (
    <div className={className}>
      <ol
        aria-label={label}
        className="flex flex-col sm:grid"
        style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}
      >
        {steps.map((step, index) => {
          const next = steps[index + 1];
          return (
            <li
              key={step.key}
              aria-current={step.state === "current" ? "step" : undefined}
              className="relative flex gap-3 pb-5 last:pb-0 sm:block sm:pr-4 sm:pb-0"
            >
              {next ? (
                <span
                  aria-hidden
                  className={cn(
                    "absolute top-[18px] bottom-0 left-[4.5px] w-px sm:top-[4.5px] sm:right-2 sm:bottom-auto sm:left-[18px] sm:h-px sm:w-auto",
                    REACHED.has(next.state) ? "bg-foreground" : "bg-rule-strong",
                  )}
                />
              ) : null}
              <span
                aria-hidden
                className={cn(
                  "relative mt-1 block size-2.5 shrink-0 rounded-full border sm:mt-0",
                  DOT[step.state],
                )}
              />
              <span className="block min-w-0 sm:mt-3">
                <span className={cn("block text-[13px] leading-snug", LABEL[step.state])}>
                  {step.label}
                  <span className="sr-only"> · {t(step.state)}</span>
                </span>
                {step.meta ? (
                  <span className="mt-0.5 block text-xs tabular-nums text-muted-foreground">
                    {step.meta}
                  </span>
                ) : null}
              </span>
            </li>
          );
        })}
      </ol>
      {children}
    </div>
  );
};

/**
 * The same track shrunk to its dots, for a list row that only needs to say
 * how far along something is. The step names stay readable to screen readers
 * and as a hover title.
 */
export const CheckpointDots = ({
  steps,
  label,
  className,
}: {
  steps: readonly Checkpoint[];
  label: string;
  className?: string;
}) => {
  const t = useTranslations("checkpoints");

  return (
    <ol aria-label={label} className={cn("inline-flex items-center gap-1", className)}>
      {steps.map((step, index) => (
        <li key={step.key} title={step.label} className="flex items-center gap-1">
          {index > 0 ? (
            <span
              aria-hidden
              className={cn(
                "h-px w-2.5",
                REACHED.has(step.state) ? "bg-foreground" : "bg-rule-strong",
              )}
            />
          ) : null}
          <span
            aria-hidden
            // at this size the ring and the thick "current" border would swallow the dot
            className={cn("block size-1.5 rounded-full", DOT[step.state], "border ring-0")}
          />
          <span className="sr-only">
            {step.label} · {t(step.state)}
          </span>
        </li>
      ))}
    </ol>
  );
};

const NOTE_TONE = {
  failed: "border-destructive/25 bg-destructive/[0.04]",
  warning: "border-warning/40 bg-warning/[0.08]",
  neutral: "border-rule bg-card",
} as const;

/**
 * What went wrong at a checkpoint and the one thing to do about it: a plain
 * sentence, what we already tried, and the action on the right.
 */
export const CheckpointNote = ({
  tone = "neutral",
  title,
  detail,
  action,
  children,
}: {
  tone?: keyof typeof NOTE_TONE;
  title: string;
  /** What was already tried, e.g. "Tried 2 times · last at 14:02". */
  detail?: ReactNode;
  action?: ReactNode;
  children?: ReactNode;
}) => (
  <div
    role="status"
    className={cn(
      "mt-5 flex flex-col gap-3 rounded-lg border px-4 py-3.5 sm:flex-row sm:items-start sm:justify-between sm:gap-6",
      NOTE_TONE[tone],
    )}
  >
    <div className="min-w-0">
      <p className="text-sm font-medium text-foreground">{title}</p>
      {children ? (
        <div className="mt-1 text-sm leading-relaxed text-muted-foreground">{children}</div>
      ) : null}
      {detail ? <p className="mt-2 text-xs tabular-nums text-muted-foreground">{detail}</p> : null}
    </div>
    {action ? <div className="flex shrink-0 flex-wrap gap-2">{action}</div> : null}
  </div>
);
