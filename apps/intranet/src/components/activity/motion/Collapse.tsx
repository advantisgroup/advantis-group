"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";
import { MOTION } from "./motion-tokens";

/**
 * Smoothly expands/collapses its content by animating height + opacity, so newly
 * revealed UI *pushes the page open* instead of snapping in and shoving the
 * elements below it (the enrollment-code card was the worst offender).
 *
 * Replaces the bare `{cond && <Panel/>}` idiom for anything that grows the
 * layout. Honours prefers-reduced-motion (fades, no height animation).
 */
export function Collapse({
  show,
  children,
  className,
}: {
  show: boolean;
  children: ReactNode;
  className?: string;
}) {
  const reduce = useReducedMotion();
  return (
    <AnimatePresence initial={false}>
      {show && (
        <motion.div
          // overflow-hidden establishes a block formatting context (so child
          // margins are contained) and clips content while the height tweens.
          className={className}
          style={{ overflow: "hidden" }}
          initial={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
          animate={reduce ? { opacity: 1 } : { height: "auto", opacity: 1 }}
          exit={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
          transition={{ duration: MOTION.base, ease: MOTION.ease }}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
