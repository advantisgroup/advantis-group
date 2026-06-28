import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";

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

/**
 * A compact stat / KPI tile. Content hugs together — label + icon on one row,
 * the figure directly beneath it, then an optional sub-line — so the card is
 * only as tall as its content (no min-height, no top/bottom void). Tiles in a
 * row stay equal height because every tile shares this exact structure.
 */
export function StatCard({
  label,
  value,
  hint,
  icon,
  tone = "fg",
  live,
  className,
  valueClassName,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  tone?: Tone;
  live?: boolean;
  className?: string;
  valueClassName?: string;
}) {
  return (
    <Card
      className={cn(
        "transition-shadow duration-200 hover:shadow-card-hover",
        className,
      )}
    >
      <CardContent className="flex flex-col gap-2.5 p-5">
        <div className="flex items-center justify-between gap-2">
          <span className="kicker flex items-center gap-1.5 truncate">
            {live && <span className="signal-dot !h-1.5 !w-1.5" />}
            {label}
          </span>
          {icon && (
            <span
              className={cn(
                "grid h-8 w-8 shrink-0 place-items-center rounded-lg ring-1 ring-inset",
                TILE[tone],
              )}
            >
              {icon}
            </span>
          )}
        </div>
        <div
          className={cn(
            "text-3xl font-semibold leading-none tabular-nums tracking-tight",
            TONE[tone],
            valueClassName,
          )}
        >
          {value}
        </div>
        {hint && <p className="truncate text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}
