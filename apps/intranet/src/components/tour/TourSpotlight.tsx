"use client";

import { motion, useSpring } from "framer-motion";

import type { TargetRect } from "./tour-types";

interface Props {
  targetRect: TargetRect | null;
  visible: boolean;
}

const SPRING = { stiffness: 280, damping: 32 };

export function TourSpotlight({ targetRect, visible }: Props) {
  const defaultRect: TargetRect = { x: -200, y: -200, width: 100, height: 50, rx: 8 };
  const r = targetRect ?? defaultRect;

  const x = useSpring(r.x, SPRING);
  const y = useSpring(r.y, SPRING);
  const w = useSpring(r.width, SPRING);
  const h = useSpring(r.height, SPRING);
  const rxSpring = useSpring(r.rx, SPRING);

  if (targetRect) {
    x.set(targetRect.x);
    y.set(targetRect.y);
    w.set(targetRect.width);
    h.set(targetRect.height);
    rxSpring.set(targetRect.rx);
  }

  if (!visible || !targetRect) return null;

  return (
    <motion.div
      className="fixed pointer-events-none"
      style={{
        zIndex: 41,
        x,
        y,
        width: w,
        height: h,
        borderRadius: rxSpring,
      }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
    >
      {/* Pulsating blue ring */}
      <div
        className="absolute inset-0 rounded-[inherit] ring-2 ring-blue-500/80 tour-pulse"
        style={{ borderRadius: "inherit" }}
      />
    </motion.div>
  );
}
