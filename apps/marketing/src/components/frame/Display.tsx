import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Editorial display heading. Tighter tracking and leading than the global `h2`
 * rule, because at these sizes the default `-0.02em` leaves the line looking
 * loose. `size` maps to the three scales the site actually uses — anything
 * outside them is a sign the section wants a different structure, not a
 * different font size.
 */
export const Display = ({
  children,
  className,
  as: Tag = "h2",
  size = "lg",
}: {
  children: ReactNode;
  className?: string;
  as?: "h1" | "h2" | "h3" | "p";
  size?: "sm" | "md" | "lg" | "xl";
}) => {
  const scale = {
    sm: "text-2xl md:text-3xl",
    md: "text-3xl md:text-5xl",
    lg: "text-4xl md:text-6xl",
    xl: "text-5xl leading-[0.92] md:text-7xl lg:text-[5.5rem]",
  }[size];

  return (
    <Tag
      className={cn(
        "font-[family-name:var(--font-outfit)] font-bold leading-[1.02] tracking-[-0.035em] text-balance",
        scale,
        className,
      )}
    >
      {children}
    </Tag>
  );
};
