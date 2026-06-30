"use client";

import { useEffect, useState } from "react";

import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft, ChevronRight, MoreHorizontal } from "lucide-react";
import { createPortal } from "react-dom";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { useTour } from "./TourProvider";
import { useTourEndTour, useTourSkipCheckpoint } from "./TourSkipDialog";

import type { TargetRect } from "./tour-types";

const POPOUT_WIDTH = 320;
const POPOUT_HEIGHT = 140; // estimated
const HEADER_HEIGHT = 68; // sticky header (~h-16) the popout must clear
const MOBILE_BREAKPOINT = 768;

function computePosition(
  targetRect: TargetRect,
  side: "top" | "bottom" | "left" | "right",
  vw: number,
  vh: number
): { top: number; left: number } {
  const { x, y, width, height } = targetRect;
  const GAP = 14;

  let top = 0;
  let left = 0;

  if (side === "bottom") {
    top = y + height + GAP;
    left = x;
  } else if (side === "top") {
    top = y - POPOUT_HEIGHT - GAP;
    left = x;
  } else if (side === "right") {
    top = y;
    left = x + width + GAP;
  } else {
    top = y;
    left = x - POPOUT_WIDTH - GAP;
  }

  // Clamp within viewport
  left = Math.max(12, Math.min(left, vw - POPOUT_WIDTH - 12));
  top = Math.max(HEADER_HEIGHT + 8, Math.min(top, vh - POPOUT_HEIGHT - 12));

  return { top, left };
}

export function TourPopout() {
  const {
    state,
    phase,
    targetRect,
    currentCheckpoint,
    currentStep,
    visibleCheckpoints,
    advance,
    back,
    skipStep,
    snooze,
  } = useTour();
  const skipCheckpointDialog = useTourSkipCheckpoint();
  const endTourDialog = useTourEndTour();

  const [mounted, setMounted] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
    const update = () => setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  if (
    !mounted ||
    !state?.active ||
    phase !== "active" ||
    !currentStep ||
    !currentCheckpoint ||
    !targetRect
  ) {
    return null;
  }

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const checkpointIdx = visibleCheckpoints.findIndex(
    c => c.id === currentCheckpoint.id
  );
  const stepDisplay = `${state.currentStepIndex + 1} / ${currentCheckpoint.steps.length}`;
  const isFirstStep = state.currentStepIndex === 0;
  const isLastStep =
    state.currentStepIndex >= currentCheckpoint.steps.length - 1;
  const isLastCheckpoint = checkpointIdx === visibleCheckpoints.length - 1;

  const { top, left } = isMobile
    ? { top: 0, left: 0 }
    : computePosition(targetRect, currentStep.popoutSide, vw, vh);

  const popout = (
    <AnimatePresence mode="wait">
      <motion.div
        key={currentStep.id}
        initial={{ opacity: 0, y: 6, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 4, scale: 0.98 }}
        transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
        className={
          isMobile
            ? "fixed left-3 right-3 rounded-xl border border-border/70 bg-card shadow-overlay"
            : "fixed w-80 rounded-xl border border-border/70 bg-card shadow-overlay"
        }
        style={
          isMobile
            ? {
                zIndex: 42,
                bottom: `calc(env(safe-area-inset-bottom, 0px) + 76px)`,
              }
            : { zIndex: 42, top, left, width: POPOUT_WIDTH }
        }
      >
        <div className="p-4">
          {/* Header row */}
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {currentCheckpoint.label} · {stepDisplay}
            </span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="size-6 shrink-0"
                >
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="text-sm">
                <DropdownMenuItem onClick={skipStep}>
                  Skip this step
                </DropdownMenuItem>
                <DropdownMenuItem onClick={skipCheckpointDialog}>
                  Skip checkpoint
                </DropdownMenuItem>
                <DropdownMenuItem onClick={snooze}>
                  Snooze 24 h
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={endTourDialog}
                  className="text-destructive focus:text-destructive"
                >
                  End tour
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Content */}
          <p className="text-sm font-semibold leading-snug">
            {currentStep.title}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            {currentStep.description}
          </p>

          {/* Controls */}
          <div className="mt-4 flex items-center gap-2">
            {!isFirstStep && (
              <Button
                variant="outline"
                size="sm"
                onClick={back}
                className="shrink-0"
              >
                <ChevronLeft />
                Back
              </Button>
            )}
            <div className="flex-1" />
            <Button size="sm" onClick={advance} className="shrink-0">
              {isLastStep && isLastCheckpoint
                ? "Finish"
                : isLastStep
                  ? "Next section"
                  : "Next"}
              {!isLastStep && <ChevronRight />}
            </Button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );

  return createPortal(popout, document.body);
}
