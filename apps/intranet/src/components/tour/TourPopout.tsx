"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft, ChevronRight, MoreHorizontal } from "lucide-react";
import { useTranslations } from "next-intl";
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
const POPOUT_HEIGHT = 160; // fallback estimate until the real height is measured
const HEADER_HEIGHT = 68; // sticky header (~h-16) the popout must clear
const MOBILE_BREAKPOINT = 768;

type Side = "top" | "bottom" | "left" | "right";

const OPPOSITE: Record<Side, Side> = {
  top: "bottom",
  bottom: "top",
  left: "right",
  right: "left",
};

function clamp(v: number, min: number, max: number): number {
  // When the target leaves no room (min > max) keep the lower bound so the
  // popout stays on-screen rather than snapping to a negative offset.
  return max < min ? min : Math.max(min, Math.min(v, max));
}

/**
 * Place the popout *beside* the highlighted target rather than on top of it.
 * We try the step's preferred side first, then its opposite, then the
 * perpendicular pair, choosing the first that has enough room for the popout
 * to clear the spotlight. Only when no side fits (a target that fills the
 * viewport) do we fall back to the side with the most room and let the clamp
 * clip the popout slightly into the highlight.
 */
function computePosition(
  targetRect: TargetRect,
  preferred: Side,
  vw: number,
  vh: number,
  size: { width: number; height: number }
): { top: number; left: number } {
  const { x, y, width, height } = targetRect;
  const GAP = 14;
  const M = 12; // viewport margin
  const headerTop = HEADER_HEIGHT + 8;
  const pw = size.width;
  const ph = size.height;

  // Free space between the target and the viewport edge on each side.
  const room: Record<Side, number> = {
    top: y - headerTop,
    bottom: vh - (y + height) - M,
    left: x - M,
    right: vw - (x + width) - M,
  };

  const fits = (s: Side) =>
    s === "top" || s === "bottom" ? room[s] >= ph + GAP : room[s] >= pw + GAP;

  const order: Side[] = [
    preferred,
    OPPOSITE[preferred],
    ...(preferred === "left" || preferred === "right"
      ? (["bottom", "top"] as Side[])
      : (["right", "left"] as Side[])),
  ];

  const chosen =
    order.find(fits) ??
    (Object.keys(room) as Side[]).sort((a, b) => room[b] - room[a])[0];

  let top = 0;
  let left = 0;

  if (chosen === "bottom") {
    top = y + height + GAP;
    left = x + width / 2 - pw / 2;
  } else if (chosen === "top") {
    top = y - ph - GAP;
    left = x + width / 2 - pw / 2;
  } else if (chosen === "right") {
    left = x + width + GAP;
    top = y + height / 2 - ph / 2;
  } else {
    left = x - pw - GAP;
    top = y + height / 2 - ph / 2;
  }

  left = clamp(left, M, vw - pw - M);
  top = clamp(top, headerTop, vh - ph - M);

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
  const tt = useTranslations("Tour");
  const skipCheckpointDialog = useTourSkipCheckpoint();
  const endTourDialog = useTourEndTour();

  const [mounted, setMounted] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({
    width: POPOUT_WIDTH,
    height: POPOUT_HEIGHT,
  });

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
    const update = () => setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  // Measure the real popout box so positioning clears the spotlight exactly —
  // the content height varies per step, so a fixed estimate would over- or
  // under-shoot and let the card drift onto the highlight.
  useLayoutEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setSize(prev =>
      Math.abs(prev.height - r.height) > 1 || Math.abs(prev.width - r.width) > 1
        ? { width: r.width, height: r.height }
        : prev
    );
  }, [currentStep?.id, isMobile]);

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
    : computePosition(targetRect, currentStep.popoutSide, vw, vh, size);

  const popout = (
    <AnimatePresence mode="wait">
      <motion.div
        ref={cardRef}
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
              {tt(`checkpoints.${currentCheckpoint.id}`)} · {stepDisplay}
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
                  {tt("skipStep")}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={skipCheckpointDialog}>
                  {tt("skipCheckpoint")}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={snooze}>
                  {tt("snooze")}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={endTourDialog}
                  className="text-destructive focus:text-destructive"
                >
                  {tt("endTour")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Content */}
          <p className="text-sm font-semibold leading-snug">
            {tt(`steps.${currentStep.id}.title`)}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            {tt(`steps.${currentStep.id}.description`)}
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
                {tt("back")}
              </Button>
            )}
            <div className="flex-1" />
            <Button size="sm" onClick={advance} className="shrink-0">
              {isLastStep && isLastCheckpoint
                ? tt("finish")
                : isLastStep
                  ? tt("nextSection")
                  : tt("next")}
              {!isLastStep && <ChevronRight />}
            </Button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );

  return createPortal(popout, document.body);
}
