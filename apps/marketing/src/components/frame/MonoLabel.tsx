import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * The mono micro-label used for eyebrows, spec rows, and schematic captions.
 * Replaces the old `text-xs uppercase tracking-[0.35em]` string that was
 * copy-pasted into every section with slightly different values each time.
 */
export const MonoLabel = ({
  children,
  className,
  marker = false,
  as: Tag = "span",
}: {
  children: ReactNode;
  className?: string;
  /** Prefix a small square bullet, for labels that head a block. */
  marker?: boolean;
  as?: "span" | "p" | "div";
}) => (
  <Tag
    className={cn(
      "inline-flex items-center gap-2.5 font-mono text-[11px] uppercase tracking-[0.28em] text-muted-foreground",
      className,
    )}
  >
    {marker ? <span aria-hidden className="size-1.5 shrink-0 bg-primary" /> : null}
    {children}
  </Tag>
);
