"use client";

import { type ReactNode } from "react";

import { Check, Clock3, Minus, X } from "lucide-react";
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

const MARKER: Record<CheckpointState, string> = {
  done: "bg-foreground text-background",
  current: "border-2 border-foreground bg-card text-foreground",
  upcoming: "border border-rule-strong bg-card text-muted-foreground",
  failed: "bg-destructive text-destructive-foreground",
  warning: "bg-warning text-warning-foreground",
  skipped: "border border-dashed border-rule-strong bg-card text-muted-foreground",
};

const LABEL: Record<CheckpointState, string> = {
  done: "font-medium text-foreground",
  current: "font-medium text-foreground",
  upcoming: "text-muted-foreground",
  failed: "font-medium text-destructive",
  warning: "font-medium text-foreground",
  skipped: "text-muted-foreground",
};

/** A step's circle says its state on its own: a tick, a ring, its number, a cross, a clock. */
const Marker = ({ state, index }: { state: CheckpointState; index: number }) => (
  <span
    aria-hidden
    className={cn(
      "relative z-10 flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-medium tabular-nums",
      MARKER[state],
    )}
  >
    {state === "done" ? (
      <Check className="size-3.5" strokeWidth={3} />
    ) : state === "failed" ? (
      <X className="size-3.5" strokeWidth={3} />
    ) : state === "warning" ? (
      <Clock3 className="size-3.5" strokeWidth={2.5} />
    ) : state === "skipped" ? (
      <Minus className="size-3.5" />
    ) : state === "current" ? (
      <span className="size-2 rounded-full bg-foreground" />
    ) : (
      index + 1
    )}
  </span>
);

/**
 * A process drawn as a track on a card: a marked circle per step joined by a
 * line that fills in as it moves along, each step's name and time beneath.
 * The last step sits flush right so the track spans the card. Stacked on a
 * phone, where four labels side by side would wrap into each other.
 *
 * `summary` is the one sentence of where things stand, inside the card.
 * Whatever explains a failed or stuck step goes in `children`, right below
 * the card — use `CheckpointNote` for it.
 */
export const Checkpoints = ({
  steps,
  label,
  summary,
  children,
  className,
}: {
  steps: readonly Checkpoint[];
  /** Names the list for screen readers, e.g. "Progress". */
  label: string;
  summary?: ReactNode;
  children?: ReactNode;
  className?: string;
}) => {
  const t = useTranslations("checkpoints");
  const columns = steps.length > 1 ? `repeat(${steps.length - 1}, minmax(0, 1fr)) auto` : "auto";

  return (
    <div className={className}>
      <div className="rounded-xl border border-rule bg-card px-5 py-5 sm:px-6">
        <ol
          aria-label={label}
          className="flex flex-col sm:grid"
          style={{ gridTemplateColumns: columns }}
        >
          {steps.map((step, index) => {
            const next = steps[index + 1];
            return (
              <li
                key={step.key}
                aria-current={step.state === "current" ? "step" : undefined}
                className="relative flex gap-3.5 pb-6 last:pb-0 sm:block sm:pb-0"
              >
                {next ? (
                  <span
                    aria-hidden
                    className={cn(
                      "absolute top-9 bottom-1 left-[13px] w-0.5 rounded-full sm:top-[13px] sm:right-2 sm:bottom-auto sm:left-9 sm:h-0.5 sm:w-auto",
                      REACHED.has(next.state) ? "bg-foreground" : "bg-rule-strong",
                    )}
                  />
                ) : null}
                <Marker state={step.state} index={index} />
                <span className="block min-w-0 pt-1 sm:mt-3 sm:pt-0 sm:pr-4">
                  <span className={cn("block text-sm leading-snug", LABEL[step.state])}>
                    {step.label}
                    <span className="sr-only"> · {t(step.state)}</span>
                  </span>
                  {step.meta ? (
                    <span className="mt-0.5 block text-[13px] tabular-nums text-muted-foreground">
                      {step.meta}
                    </span>
                  ) : null}
                </span>
              </li>
            );
          })}
        </ol>
        {summary ? (
          <p className="mt-5 border-t border-rule pt-4 text-[15px] leading-relaxed text-foreground">
            {summary}
          </p>
        ) : null}
      </div>
      {children}
    </div>
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
      <p className="text-[15px] font-medium text-foreground">{title}</p>
      {children ? (
        <div className="mt-1 text-[15px] leading-relaxed text-muted-foreground">{children}</div>
      ) : null}
      {detail ? (
        <p className="mt-2 text-[13px] tabular-nums text-muted-foreground">{detail}</p>
      ) : null}
    </div>
    {action ? <div className="flex shrink-0 flex-wrap gap-2">{action}</div> : null}
  </div>
);
