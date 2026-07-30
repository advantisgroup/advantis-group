"use client";

import { type RefObject, useEffect, useRef } from "react";

export function clampSplit(pct: number, min = 25, max = 75): number {
  return Math.min(max, Math.max(min, pct));
}

const KEYBOARD_STEP = 2;
const KEYBOARD_STEP_LARGE = 10;

/**
 * Drag handle between two horizontally split panes (desktop only — hidden
 * below `md`, where callers fall back to a stacked layout instead). Reports
 * the left pane's width as a percentage of the container on drag, and resets
 * to 50/50 on double-click or Enter. Also keyboard-operable: focus it and use
 * the arrow keys (Shift for a bigger step) or Home/End to jump to the min/max.
 * Shared by the announcement composer's write/preview split and the
 * suggestions page's submitted/implemented split.
 */
export function SplitDivider({
  containerRef,
  value,
  onResize,
  onReset,
  min = 25,
  max = 75,
  ariaLabel = "Resize panes",
}: {
  containerRef: RefObject<HTMLDivElement | null>;
  /** The left pane's current width as a percentage — drives aria-valuenow. */
  value: number;
  onResize: (pct: number) => void;
  onReset: () => void;
  min?: number;
  max?: number;
  ariaLabel?: string;
}) {
  const draggingRef = useRef(false);

  useEffect(() => {
    function move(e: PointerEvent) {
      if (!draggingRef.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      onResize(clampSplit(((e.clientX - rect.left) / rect.width) * 100, min, max));
    }
    function up() {
      draggingRef.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    }
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [containerRef, onResize, min, max]);

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={ariaLabel}
      aria-valuenow={Math.round(value)}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      onPointerDown={(e) => {
        e.preventDefault();
        draggingRef.current = true;
        document.body.style.cursor = "col-resize";
        document.body.style.userSelect = "none";
      }}
      onDoubleClick={onReset}
      onKeyDown={(e) => {
        const step = e.shiftKey ? KEYBOARD_STEP_LARGE : KEYBOARD_STEP;
        switch (e.key) {
          case "ArrowLeft":
            e.preventDefault();
            onResize(clampSplit(value - step, min, max));
            break;
          case "ArrowRight":
            e.preventDefault();
            onResize(clampSplit(value + step, min, max));
            break;
          case "Home":
            e.preventDefault();
            onResize(min);
            break;
          case "End":
            e.preventDefault();
            onResize(max);
            break;
          case "Enter":
            e.preventDefault();
            onReset();
            break;
        }
      }}
      className="group relative hidden w-2 shrink-0 cursor-col-resize rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 md:block"
    >
      <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-border transition-colors group-hover:bg-primary/60 group-focus-visible:bg-primary" />
    </div>
  );
}
