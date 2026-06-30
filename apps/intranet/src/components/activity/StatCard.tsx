import type { ReactNode } from "react";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type Tone = "fg" | "ok" | "warn" | "muted" | "accent";

const TONE: Record<Tone, string> = {
  fg: "text-fg",
  ok: "text-ok",
  warn: "text-warn",
  muted: "text-muted-foreground",
  accent: "text-signal",
};

const TILE: Record<Tone, string> = {
  fg: "bg-panel-2 text-muted-foreground ring-border",
  ok: "bg-ok/12 text-ok ring-ok/25",
  warn: "bg-warn/12 text-warn ring-warn/25",
  muted: "bg-panel-2 text-muted-foreground ring-border",
  accent: "bg-signal/12 text-signal ring-signal/25",
};

const BAR: Record<Tone, string> = {
  fg: "bg-foreground/70",
  ok: "bg-ok",
  warn: "bg-warn",
  muted: "bg-muted-foreground/50",
  accent: "bg-signal",
};

/**
 * A stat / KPI tile. The figure is the hero, but the body earns its height: a
 * label + icon row, the value with an optional trailing share, a slim
 * tone-tinted progress bar (when the value is part of a whole), and a hint line.
 * Pass `progress` (0–1) for the bar and `hint` for context so the card never
 * reduces to "a number floating in a box". Tiles in a row stay equal height
 * because they share this structure.
 */
export function StatCard({
  label,
  value,
  hint,
  trailing,
  progress,
  icon,
  tone = "fg",
  live,
  className,
  valueClassName,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  /** Small text shown to the right of the value (e.g. a share "33%"). */
  trailing?: ReactNode;
  /** 0–1; renders a tone-tinted bar showing this value's share of a whole. */
  progress?: number;
  icon?: ReactNode;
  tone?: Tone;
  live?: boolean;
  className?: string;
  valueClassName?: string;
}) {
  const pct =
    progress === undefined
      ? undefined
      : Math.max(0, Math.min(100, Math.round(progress * 100)));

  return (
    <Card
      className={cn(
        "transition-shadow duration-200 hover:shadow-card-hover",
        className
      )}
    >
      <CardContent className="flex flex-col gap-3 p-5">
        <div className="flex items-center justify-between gap-2">
          <span className="kicker flex items-center gap-1.5 truncate">
            {live && <span className="signal-dot !h-1.5 !w-1.5" />}
            {label}
          </span>
          {icon && (
            <span
              className={cn(
                "grid h-9 w-9 shrink-0 place-items-center rounded-lg ring-1 ring-inset",
                TILE[tone]
              )}
            >
              {icon}
            </span>
          )}
        </div>

        <div className="flex items-baseline justify-between gap-3">
          <span
            className={cn(
              "text-3xl font-semibold leading-none tabular-nums tracking-tight",
              TONE[tone],
              valueClassName
            )}
          >
            {value}
          </span>
          {trailing && (
            <span className="shrink-0 text-xs font-medium tabular-nums text-muted-foreground">
              {trailing}
            </span>
          )}
        </div>

        {pct !== undefined && (
          <div
            className="h-1.5 w-full overflow-hidden rounded-full bg-panel-2"
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className={cn(
                "h-full rounded-full transition-[width] duration-500",
                BAR[tone]
              )}
              style={{ width: `${pct}%` }}
            />
          </div>
        )}

        {hint && (
          <p className="truncate text-xs text-muted-foreground">{hint}</p>
        )}
      </CardContent>
    </Card>
  );
}
