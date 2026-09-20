import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Editorial display heading, set in the serif at book weight.
 *
 * Tracking stays at normal. The face is drawn for reading, and tightening it
 * at display size closes the counters — which is what makes a big line look
 * cramped rather than composed. `size` maps to the four scales the site
 * actually uses; anything outside them means the section wants a different
 * structure, not a different font size.
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
    sm: "text-xl leading-[1.25] md:text-2xl",
    md: "text-[1.75rem] leading-[1.15] md:text-[2.25rem]",
    lg: "text-[2rem] leading-[1.1] md:text-[2.75rem] lg:text-5xl",
    xl: "text-[2.5rem] leading-[1.05] md:text-[3.75rem] lg:text-[4.5rem]",
  }[size];

  return (
    <Tag className={cn("font-display font-medium tracking-normal text-balance", scale, className)}>
      {children}
    </Tag>
  );
};
