"use client";

import { type RefObject, useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

export function clampSplit(pct: number, min = 25, max = 75): number {
  return Math.min(max, Math.max(min, pct));
}

const KEYBOARD_STEP = 2;
const KEYBOARD_STEP_LARGE = 10;

/**
 * Drag handle between two split panes (desktop only — hidden below `md`,
 * where callers fall back to a stacked layout instead). Reports the
 * first pane's size as a percentage of the container on drag, and resets to
 * 50/50 on double-click or Enter. Also keyboard-operable: focus it and use
 * the arrow keys (Shift for a bigger step) or Home/End to jump to the
 * min/max. Shared by the announcement composer's write/preview split, the
 * suggestions page's submitted/implemented split, and the Sales Cockpit flow
 * composer's tree/details split.
 *
 * `orientation="vertical"` (the default, and the only mode every existing
 * caller uses) splits panes side by side with a vertical drag bar dragged
 * horizontally. `orientation="horizontal"` stacks panes top/bottom with a
 * horizontal drag bar dragged vertically — the flow composer offers a
 * toggle between the two.
 */
export function SplitDivider({
  containerRef,
  value,
  onResize,
  onReset,
  min = 25,
  max = 75,
  ariaLabel = "Resize panes",
  orientation = "vertical",
}: {
  containerRef: RefObject<HTMLDivElement | null>;
  /** The first pane's current size as a percentage — drives aria-valuenow. */
  value: number;
  onResize: (pct: number) => void;
  onReset: () => void;
  min?: number;
  max?: number;
  ariaLabel?: string;
  /** Direction the two panes are split in — see doc comment above. */
  orientation?: "vertical" | "horizontal";
}) {
  const draggingRef = useRef(false);

  useEffect(() => {
    function move(e: PointerEvent) {
      if (!draggingRef.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const pct =
        orientation === "vertical"
          ? ((e.clientX - rect.left) / rect.width) * 100
          : ((e.clientY - rect.top) / rect.height) * 100;
      onResize(clampSplit(pct, min, max));
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
  }, [containerRef, onResize, min, max, orientation]);

  const [growKey, shrinkKey] =
    orientation === "vertical"
      ? (["ArrowRight", "ArrowLeft"] as const)
      : (["ArrowDown", "ArrowUp"] as const);

  return (
    <div
      role="separator"
      aria-orientation={orientation === "vertical" ? "vertical" : "horizontal"}
      aria-label={ariaLabel}
      aria-valuenow={Math.round(value)}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      onPointerDown={(e) => {
        e.preventDefault();
        draggingRef.current = true;
        document.body.style.cursor = orientation === "vertical" ? "col-resize" : "row-resize";
        document.body.style.userSelect = "none";
      }}
      onDoubleClick={onReset}
      onKeyDown={(e) => {
        const step = e.shiftKey ? KEYBOARD_STEP_LARGE : KEYBOARD_STEP;
        switch (e.key) {
          case growKey:
            e.preventDefault();
            onResize(clampSplit(value + step, min, max));
            break;
          case shrinkKey:
            e.preventDefault();
            onResize(clampSplit(value - step, min, max));
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
      className={cn(
        "group relative hidden shrink-0 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 md:block",
        orientation === "vertical" ? "w-2 cursor-col-resize" : "h-2 cursor-row-resize",
      )}
    >
      <div
        className={cn(
          "absolute bg-border transition-colors group-hover:bg-primary/60 group-focus-visible:bg-primary",
          orientation === "vertical"
            ? "inset-y-0 left-1/2 w-px -translate-x-1/2"
            : "inset-x-0 top-1/2 h-px -translate-y-1/2",
        )}
      />
    </div>
  );
}

/** A composer's editor/preview split, remembered in localStorage under `key`. */
export function useStoredSplit(key: string, initial: number): [number, (pct: number) => void] {
  const [pct, setPct] = useState(initial);

  useEffect(() => {
    try {
      const stored = Number(localStorage.getItem(key));
      if (Number.isFinite(stored) && stored >= 25 && stored <= 75) setPct(stored);
    } catch {
      // Storage unavailable — the default stands.
    }
  }, [key]);

  function persist(next: number) {
    setPct(next);
    try {
      localStorage.setItem(key, String(next));
    } catch {
      // Storage unavailable — the split just isn't remembered.
    }
  }

  return [pct, persist];
}
