"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Trophy } from "lucide-react";

import { Button } from "@/components/ui/button";

import { useTour } from "./TourProvider";
import { TourConfetti } from "./TourConfetti";

export function TourCompletionScreen() {
  const { phase, endTour, redoTour } = useTour();
  const isComplete = phase === "complete";

  return (
    <AnimatePresence>
      {isComplete && (
        <motion.div
          className="fixed inset-0 flex flex-col items-center justify-center"
          style={{ zIndex: 60, backdropFilter: "blur(12px)", background: "rgba(0,0,0,0.82)" }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.4 }}
        >
          <TourConfetti />

          <motion.div
            className="relative z-10 flex flex-col items-center gap-6 px-6 text-center"
            initial={{ opacity: 0, y: 24, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ delay: 0.25, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="relative">
              <Trophy
                className="text-yellow-400"
                style={{
                  width: 96,
                  height: 96,
                  filter: "drop-shadow(0 0 28px oklch(85% 0.2 85 / 0.6))",
                }}
                aria-hidden
              />
            </div>

            <div>
              <h1
                className="font-display text-4xl font-bold tracking-tight text-white"
                style={{ fontFamily: "var(--font-outfit, Outfit, sans-serif)" }}
              >
                Congratulations!
              </h1>
              <p className="mt-2 text-lg text-white/70">
                You&apos;ve completed the intranet tour.
              </p>
            </div>

            <div className="flex flex-col items-center gap-2 sm:flex-row">
              <Button
                size="lg"
                onClick={endTour}
                className="min-w-36"
              >
                Get started
              </Button>
              <Button
                size="lg"
                variant="ghost"
                onClick={redoTour}
                className="text-white/70 hover:text-white hover:bg-white/10"
              >
                Redo tour
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
