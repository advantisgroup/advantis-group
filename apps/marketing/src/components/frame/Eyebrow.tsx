import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * The small label that names a block above its heading.
 *
 * Set in the sans at reading weight, not in tracked-out uppercase mono. The
 * mono version shouted — every one of them drew as much attention as the
 * heading it was supposed to introduce, and a page with eight of them reads
 * as a spec sheet. This one is quiet enough to be skipped over, which is the
 * job.
 */
export const Eyebrow = ({
  children,
  className,
  as: Tag = "span",
}: {
  children: ReactNode;
  className?: string;
  as?: "span" | "p" | "div" | "h2";
}) => (
  <Tag className={cn("block text-[0.8125rem] font-medium text-muted-foreground", className)}>
    {children}
  </Tag>
);
