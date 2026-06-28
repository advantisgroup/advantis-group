"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";
import { MOTION } from "./motion-tokens";

/**
 * List container whose children animate in on mount (gently staggered) and
 * animate in/out as items are added or removed. Each child must be a
 * <StaggerItem> with a stable React `key`.
 *
 * `layout` on the items means surviving rows slide to their new position when a
 * sibling is added/removed instead of snapping — e.g. revoking an enrollment
 * code now reflows smoothly.
 */
export function Stagger({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <AnimatePresence initial>{children}</AnimatePresence>
    </div>
  );
}

export function StaggerItem({
  index = 0,
  className,
  children,
}: {
  /** Position in the list — used to cascade the entrance (capped). */
  index?: number;
  className?: string;
  children: ReactNode;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      layout
      className={className}
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={reduce ? { opacity: 0 } : { opacity: 0, y: -8 }}
      transition={{
        duration: MOTION.base,
        ease: MOTION.ease,
        delay: reduce ? 0 : Math.min(index * 0.04, 0.3),
      }}
    >
      {children}
    </motion.div>
  );
}
