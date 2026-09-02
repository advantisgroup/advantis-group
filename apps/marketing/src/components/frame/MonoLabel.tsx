import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * The mono micro-label used for spec rows and schematic captions. Not for
 * section kickers — those are gone; a heading identifies its own section.
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
