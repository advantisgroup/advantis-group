import type { ReactNode } from "react";

import { Link } from "@/components/Link";
import { cn } from "@/lib/utils";

/**
 * The headline numbers of an overview as one joined strip rather than four
 * separate cards, so they read as one set. Hairlines come from the strip's
 * own background showing through a 1px gap.
 */
export function KpiStrip({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border/70 bg-border/70 lg:grid-cols-4",
        className,
      )}
    >
      {children}
    </div>
  );
}

/**
 * One number in a `KpiStrip`. `featured` inverts the cell (the Performance
 * overview's "Closed won" treatment) for the one figure the page is really
 * about; `tone` colours a figure that needs attention and gives it a top edge.
 */
export function Kpi({
  label,
  value,
  hint,
  href,
  tone = "neutral",
  featured,
  trailing,
  children,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  href?: string;
  tone?: "neutral" | "warn" | "critical";
  featured?: boolean;
  /** Beside the label, e.g. a delta chip. */
  trailing?: ReactNode;
  /** Under the value, e.g. a sparkline. */
  children?: ReactNode;
}) {
  const body = (
    <>
      <span
        className={cn(
          "flex items-center justify-between gap-2 text-xs font-medium",
          featured ? "text-background/70" : "text-muted-foreground",
        )}
      >
        <span className="truncate">{label}</span>
        {trailing}
      </span>
      <span
        className={cn(
          "text-3xl font-semibold leading-none tracking-tight tabular-nums",
          !featured && tone === "warn" && "text-warn",
          !featured && tone === "critical" && "text-destructive",
        )}
      >
        {value}
      </span>
      {children}
      {hint && (
        <span
          className={cn(
            "truncate text-xs",
            featured ? "text-background/70" : "text-muted-foreground",
          )}
        >
          {hint}
        </span>
      )}
    </>
  );

  const className = cn(
    "relative flex min-w-0 flex-col gap-2.5 px-4 py-4 transition-colors",
    featured ? "bg-foreground text-background" : "bg-card",
    !featured &&
      tone !== "neutral" &&
      "before:absolute before:inset-x-0 before:top-0 before:h-0.5 before:content-['']",
    !featured && tone === "warn" && "before:bg-warn",
    !featured && tone === "critical" && "before:bg-destructive",
    href && (featured ? "hover:bg-foreground/90" : "hover:bg-muted/40"),
  );

  return href ? (
    <Link href={href} className={className}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}
