"use client";

import { type KeyboardEvent, type PointerEvent, type ReactNode, useRef, useState } from "react";

import { ChevronsRight } from "lucide-react";

import { cn } from "@/lib/utils";

const KNOB = 48;
/** Share of the track the knob must travel before it counts. */
const THRESHOLD = 0.85;

/**
 * "Slide to confirm" for clock actions, so a stray click or tap never clocks
 * anyone in or out. Drag the knob to the right end (mouse, finger or pen);
 * with the keyboard, ArrowRight moves it and End jumps to the end. Letting go
 * early snaps it back.
 */
export function SwipeToConfirm({
  label,
  onConfirm,
  disabled,
  tone = "primary",
  icon,
}: {
  label: string;
  onConfirm: () => void;
  disabled?: boolean;
  tone?: "primary" | "emerald" | "amber";
  icon?: ReactNode;
}) {
  const track = useRef<HTMLDivElement>(null);
  const start = useRef<number | null>(null);
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);

  const max = () => Math.max(0, (track.current?.clientWidth ?? 0) - KNOB - 8);

  function finish(value: number) {
    setDragging(false);
    start.current = null;
    if (max() > 0 && value >= max() * THRESHOLD) {
      setOffset(max());
      onConfirm();
      // Ready again if the dialog stays open (e.g. the action was refused).
      window.setTimeout(() => setOffset(0), 600);
    } else {
      setOffset(0);
    }
  }

  function onPointerDown(event: PointerEvent<HTMLButtonElement>) {
    if (disabled) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    start.current = event.clientX - offset;
    setDragging(true);
  }

  function onPointerMove(event: PointerEvent<HTMLButtonElement>) {
    if (start.current === null) return;
    setOffset(Math.min(max(), Math.max(0, event.clientX - start.current)));
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (disabled) return;
    if (event.key === "ArrowRight") {
      event.preventDefault();
      const next = Math.min(max(), offset + max() / 4);
      setOffset(next);
      if (next >= max() * THRESHOLD) finish(next);
    } else if (event.key === "End") {
      event.preventDefault();
      finish(max());
    } else if (event.key === "ArrowLeft" || event.key === "Home") {
      event.preventDefault();
      setOffset(0);
    }
  }

  const progress = max() > 0 ? offset / max() : 0;

  return (
    <div
      ref={track}
      // Keep the mobile bottom sheet from treating the slide as a drag.
      data-vaul-no-drag
      className={cn(
        "relative h-14 w-full select-none overflow-hidden rounded-full border p-1 touch-none",
        tone === "emerald" && "border-emerald-500/30 bg-emerald-500/10",
        tone === "amber" && "border-amber-500/30 bg-amber-500/10",
        tone === "primary" && "border-border bg-muted",
        disabled && "opacity-60",
      )}
    >
      <div
        className={cn(
          "absolute inset-y-0 left-0 rounded-full",
          tone === "emerald" && "bg-emerald-500/20",
          tone === "amber" && "bg-amber-500/20",
          tone === "primary" && "bg-foreground/10",
        )}
        style={{ width: offset + KNOB + 8 }}
      />
      <span
        className="pointer-events-none absolute inset-0 flex items-center justify-center pl-12 text-sm font-medium text-muted-foreground"
        style={{ opacity: 1 - progress }}
      >
        {label}
      </span>
      <button
        type="button"
        role="slider"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progress * 100)}
        disabled={disabled}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={() => finish(offset)}
        onPointerCancel={() => finish(0)}
        onKeyDown={onKeyDown}
        className={cn(
          "relative z-10 grid size-12 place-items-center rounded-full text-white shadow-md outline-none focus-visible:ring-2 focus-visible:ring-ring",
          tone === "emerald" && "bg-emerald-600",
          tone === "amber" && "bg-amber-500",
          tone === "primary" && "bg-foreground text-background",
          !dragging && "transition-transform duration-300",
          disabled ? "cursor-not-allowed" : "cursor-grab active:cursor-grabbing",
        )}
        style={{ transform: `translateX(${offset}px)` }}
      >
        {icon ?? <ChevronsRight className="size-5" />}
      </button>
    </div>
  );
}
