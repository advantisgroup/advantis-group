"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";
import { MOTION } from "./motion-tokens";

/**
 * Mounts/unmounts `children` with a fade (+ slight rise) on BOTH enter and exit,
 * replacing bare `{cond && <…/>}` renders that pop in and then vanish abruptly.
 * Use for inline status lines, hints, and small conditional bits of UI that
 * don't need a full height animation (use <Collapse/> for those).
 */
export function Reveal({
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
          className={className}
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, y: 4 }}
          transition={{ duration: MOTION.fast, ease: MOTION.ease }}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
