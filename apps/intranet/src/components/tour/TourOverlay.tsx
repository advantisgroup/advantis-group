"use client";

import { motion, useSpring, useTransform } from "framer-motion";

import type { TargetRect } from "./tour-types";

interface Props {
  targetRect: TargetRect | null;
  visible: boolean;
  onClick: () => void;
}

const SPRING = { stiffness: 280, damping: 32 };

export function TourOverlay({ targetRect, visible, onClick }: Props) {
  const defaultRect: TargetRect = { x: -200, y: -200, width: 100, height: 50, rx: 8 };
  const r = targetRect ?? defaultRect;

  const x = useSpring(r.x, SPRING);
  const y = useSpring(r.y, SPRING);
  const w = useSpring(r.width, SPRING);
  const h = useSpring(r.height, SPRING);
  const rx = useSpring(r.rx, SPRING);

  // Update springs when rect changes
  if (targetRect) {
    x.set(targetRect.x);
    y.set(targetRect.y);
    w.set(targetRect.width);
    h.set(targetRect.height);
    rx.set(targetRect.rx);
  }

  return (
    <motion.div
      className="fixed inset-0 pointer-events-none"
      style={{ zIndex: 40 }}
      initial={{ opacity: 0 }}
      animate={{ opacity: visible ? 1 : 0 }}
      transition={{ duration: 0.3 }}
    >
      <svg
        className="absolute inset-0 w-full h-full"
        style={{ width: "100vw", height: "100vh" }}
      >
        <defs>
          <mask id="tour-mask">
            {/* Black = opaque → overlaid by dim. White = transparent → spotlight window. */}
            <rect x="0" y="0" width="100%" height="100%" fill="black" />
            <motion.rect
              style={{ x, y, width: w, height: h, rx }}
              fill="white"
            />
          </mask>
        </defs>
        {/* The dim rect with the cutout */}
        <rect
          x="0"
          y="0"
          width="100%"
          height="100%"
          fill="rgba(0,0,0,0.65)"
          mask="url(#tour-mask)"
          style={{ pointerEvents: visible ? "auto" : "none" }}
          onClick={onClick}
        />
      </svg>
    </motion.div>
  );
}
