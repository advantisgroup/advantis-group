"use client";

import { motion } from "framer-motion";

import { useTour } from "./TourProvider";
import { TourProgressPopover } from "./TourProgressPopover";

export function TourProgressBar() {
  const { state, visibleCheckpoints } = useTour();
  if (!state) return null;

  const total = visibleCheckpoints.length;
  const done = visibleCheckpoints.filter(
    cp => state.checkpoints[cp.id]?.status === "completed"
  ).length;

  const pct = total > 0 ? (done / total) * 100 : 0;

  return (
    <div className="relative h-1 w-full bg-muted/70">
      {/* Filled portion */}
      <motion.div
        className="absolute inset-y-0 left-0 bg-primary"
        animate={{ width: `${pct}%` }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      />
      {/* Checkpoint dots */}
      {visibleCheckpoints.map((cp, i) => (
        <TourProgressPopover
          key={cp.id}
          checkpoint={cp}
          index={i}
          total={total}
        />
      ))}
    </div>
  );
}
