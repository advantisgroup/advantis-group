"use client";

import type { ComponentType, CSSProperties, ReactNode } from "react";

import { ArrowDownRight, ArrowRight, ArrowUpRight, type LucideIcon } from "lucide-react";

import { Link } from "@/components/Link";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * Shared shell + figure pieces for the `/admin` overview.
 *
 * `Panel` is the one section container: a titled card with an optional action
 * slot in its header. Everything on the page is a Panel so the section rhythm
 * is uniform, instead of each block inventing its own heading treatment.
 */
export function Panel({
  icon,
  title,
  description,
  action,
  footer,
  className,
  bodyClassName,
  children,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  footer?: ReactNode;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
}) {
  return (
    <Card className={cn("overflow-hidden", className)}>
      <div className="flex items-start gap-3 border-b border-border/60 px-5 py-4">
        {icon && (
          <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary [&_svg]:size-4">
            {icon}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold tracking-tight">{title}</h2>
          {description && (
            <p className="mt-0.5 truncate text-xs text-muted-foreground">{description}</p>
          )}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      <div className={cn("flex-1", bodyClassName ?? "p-5")}>{children}</div>
      {footer && (
        <div className="border-t border-border/60 px-5 py-3 text-xs text-muted-foreground">
          {footer}
        </div>
      )}
    </Card>
  );
}

/**
 * Signed change against a named period. Direction and sentiment are separate
 * inputs because they come apart constantly here — more access requests is a
 * rising number and a worse week; more closed tickets is both rising and
 * better. `goodWhen` decides the colour, the arrow only reports direction.
 */
export function Delta({
  value,
  goodWhen = "up",
  className,
}: {
  value: number | null;
  goodWhen?: "up" | "down" | "neutral";
  className?: string;
}) {
  if (value === null) return null;
  const rounded = Math.round(value);
  const direction = rounded === 0 ? "flat" : rounded > 0 ? "up" : "down";
  const good =
    goodWhen === "neutral" || direction === "flat"
      ? null
      : (direction === "up") === (goodWhen === "up");
  const Icon =
    direction === "flat" ? ArrowRight : direction === "up" ? ArrowUpRight : ArrowDownRight;

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-medium tabular-nums ring-1 ring-inset",
        good === null && "bg-muted text-muted-foreground ring-border",
        good === true && "bg-ok/12 text-ok ring-ok/25",
        good === false && "bg-warn/12 text-warn ring-warn/25",
        className,
      )}
    >
      <Icon className="size-3" />
      {rounded > 0 ? "+" : ""}
      {rounded}%
    </span>
  );
}

/**
 * The vitals-row figure: label, value, optional delta chip, and a footer line
 * that says what the number means plus one line of context. Values use
 * proportional figures deliberately — `tabular-nums` makes a three-digit
 * headline look loose at this size, and nothing here aligns in a column.
 */
export function StatTile({
  label,
  value,
  delta,
  deltaGoodWhen,
  headline,
  context,
  href,
  icon: Icon,
  tone = "neutral",
}: {
  label: string;
  value: ReactNode;
  delta?: number | null;
  deltaGoodWhen?: "up" | "down" | "neutral";
  headline?: string;
  context?: string;
  href?: string;
  icon?: LucideIcon;
  tone?: "neutral" | "ok" | "warn" | "critical";
}) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <p className="flex min-w-0 items-center gap-1.5 text-xs font-medium text-muted-foreground">
          {Icon && <Icon className="size-3.5 shrink-0" />}
          <span className="truncate">{label}</span>
        </p>
        {delta !== undefined && <Delta value={delta} goodWhen={deltaGoodWhen} />}
      </div>
      <p
        className={cn(
          "mt-3 text-3xl font-semibold leading-none tracking-tight",
          tone === "ok" && "text-ok",
          tone === "warn" && "text-warn",
          tone === "critical" && "text-destructive",
        )}
      >
        {value}
      </p>
      {(headline || context) && (
        <div className="mt-3 space-y-0.5">
          {headline && <p className="truncate text-xs font-medium">{headline}</p>}
          {context && <p className="truncate text-xs text-muted-foreground">{context}</p>}
        </div>
      )}
    </>
  );

  const shell =
    "rounded-xl border border-border/70 bg-card bg-gradient-to-b from-white/[0.025] to-transparent px-4 py-4";
  if (!href) return <div className={shell}>{body}</div>;
  return (
    <Link
      href={href}
      className={cn(
        shell,
        "block transition-all hover:-translate-y-0.5 hover:border-border hover:shadow-[0_2px_4px_0_rgb(0_0_0/0.05),0_16px_36px_-18px_rgb(0_0_0/0.18)]",
      )}
    >
      {body}
    </Link>
  );
}

/**
 * Bare inline-SVG trend line for the stream tiles. Deliberately not Recharts:
 * a dozen `ResponsiveContainer`s to draw a dozen 40px polylines costs far more
 * than the markup it replaces, and none of them need axes, tooltip or legend —
 * the tile's own number and the big chart below carry that.
 *
 * `viewBox` is fixed and the element scales via CSS, so the stroke stays 2px at
 * any tile width. A flat series still draws a centred baseline rather than
 * collapsing to the bottom edge, so "no activity" reads as a line, not a gap.
 */
export function Sparkline({
  points,
  className,
  style,
  ariaLabel,
}: {
  points: number[];
  className?: string;
  style?: CSSProperties;
  ariaLabel: string;
}) {
  const width = 100;
  const height = 28;
  if (points.length === 0) return null;

  const max = Math.max(...points);
  const min = Math.min(...points);
  const span = max - min || 1;
  const step = points.length > 1 ? width / (points.length - 1) : width;
  const y = (v: number) =>
    max === min ? height / 2 : height - 2 - ((v - min) / span) * (height - 4);

  const path = points
    .map((v, i) => `${i === 0 ? "M" : "L"}${(i * step).toFixed(2)},${y(v).toFixed(2)}`)
    .join(" ");
  const area = `${path} L${width},${height} L0,${height} Z`;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={ariaLabel}
      className={cn("h-7 w-full overflow-visible", className)}
      style={style}
    >
      <path d={area} fill="currentColor" className="opacity-10" />
      <path
        d={path}
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

/** Icon + label + value row, linked. The list workhorse of the page. */
export function MetricRow({
  icon: Icon,
  label,
  sublabel,
  value,
  trailing,
  href,
  tone = "neutral",
}: {
  /** A lucide icon, or a provider `Mark` wrapper for a row about an integration. */
  icon?: ComponentType<{ className?: string }>;
  label: string;
  sublabel?: string | null;
  value?: ReactNode;
  trailing?: ReactNode;
  href?: string;
  tone?: "neutral" | "ok" | "warn" | "critical";
}) {
  const content = (
    <>
      {Icon && (
        <span
          className={cn(
            "grid size-8 shrink-0 place-items-center rounded-lg ring-1 ring-inset [&_svg]:size-4",
            tone === "neutral" && "bg-panel-2 text-muted-foreground ring-border",
            tone === "ok" && "bg-ok/12 text-ok ring-ok/25",
            tone === "warn" && "bg-warn/12 text-warn ring-warn/25",
            tone === "critical" && "bg-destructive/12 text-destructive ring-destructive/25",
          )}
        >
          <Icon className="size-4" />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium leading-tight">{label}</p>
        {sublabel && (
          <p className="truncate text-xs leading-tight text-muted-foreground">{sublabel}</p>
        )}
      </div>
      {value !== undefined && (
        <span className="shrink-0 text-sm font-semibold tabular-nums">{value}</span>
      )}
      {trailing}
    </>
  );

  if (!href) return <div className="flex items-center gap-3 px-2 py-2">{content}</div>;
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-accent"
    >
      {content}
    </Link>
  );
}

export function PanelSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-2.5">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="size-8 shrink-0 rounded-lg" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-2/5" />
            <Skeleton className="h-3 w-1/4" />
          </div>
          <Skeleton className="h-4 w-8" />
        </div>
      ))}
    </div>
  );
}

/** Proportional split bar — part-to-whole for a handful of segments, where a
 * donut would invite comparing close slices by arc length. */
export function SplitBar({
  segments,
}: {
  segments: { key: string; label: string; value: number; color: string }[];
}) {
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  if (total === 0) return null;
  const shown = segments.filter((s) => s.value > 0);

  return (
    <div className="space-y-2.5">
      {/* gap-0.5 is the 2px surface gap that separates touching segments —
          never a stroke around each one. */}
      <div className="flex h-2 gap-0.5 overflow-hidden rounded-full">
        {shown.map((s) => (
          <span
            key={s.key}
            className="first:rounded-l-full last:rounded-r-full"
            style={{ width: `${(s.value / total) * 100}%`, background: s.color }}
          />
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        {shown.map((s) => (
          <span key={s.key} className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="size-2 shrink-0 rounded-[2px]" style={{ background: s.color }} />
            {s.label}
            <span className="font-semibold tabular-nums text-foreground">{s.value}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
