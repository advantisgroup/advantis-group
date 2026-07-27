"use client";

import type { MouseEvent } from "react";

import { motion, useSpring } from "framer-motion";

import type { TargetRect } from "./tour-types";

interface Props {
  targetRect: TargetRect | null;
  visible: boolean;
}

const SPRING = { stiffness: 280, damping: 32 };

export function TourOverlay({ targetRect, visible }: Props) {
  const defaultRect: TargetRect = {
    x: -200,
    y: -200,
    width: 100,
    height: 50,
    rx: 8,
  };
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

  // While visible the overlay is a modal scrim: it swallows every pointer
  // event so the app underneath can't be interacted with, and clicking the
  // dimmed area does nothing (the popout is the only way forward/back).
  const block = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <motion.div
      className="fixed inset-0"
      style={{ zIndex: 40, pointerEvents: visible ? "auto" : "none" }}
      initial={{ opacity: 0 }}
      animate={{ opacity: visible ? 1 : 0 }}
      transition={{ duration: 0.3 }}
      aria-hidden
      onMouseDown={block}
      onClick={block}
    >
      <svg className="absolute inset-0 w-full h-full" style={{ width: "100vw", height: "100vh" }}>
        <defs>
          <mask id="tour-mask">
            {/* White = dim painted. Black = spotlight cutout (target stays clear). */}
            <rect x="0" y="0" width="100%" height="100%" fill="white" />
            <motion.rect style={{ x, y, width: w, height: h, rx }} fill="black" />
          </mask>
        </defs>
        {/* The dim layer; the mask punches a transparent hole over the target. */}
        <rect
          x="0"
          y="0"
          width="100%"
          height="100%"
          fill="rgba(0,0,0,0.65)"
          mask="url(#tour-mask)"
        />
      </svg>
    </motion.div>
  );
}
