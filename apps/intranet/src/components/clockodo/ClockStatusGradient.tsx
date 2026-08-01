"use client";

import { cn } from "@/lib/utils";

import type { ClockStatus } from "@/lib/clockodo-clock";

const GRADIENTS: Record<ClockStatus, string> = {
  working: "from-emerald-500/35 via-emerald-500/10 to-transparent",
  break: "from-amber-500/35 via-amber-500/10 to-transparent",
  clockedOut: "from-slate-500/25 via-slate-500/5 to-transparent",
};

/**
 * Animated diagonal wash (bottom-right -> top-left, i.e. Tailwind's
 * `to-tl`) behind the clock widgets, color-coded by status. Stacks one
 * layer per status and cross-fades opacity between them rather than
 * swapping `bg-gradient-*` classes directly — gradients don't interpolate
 * reliably across browsers when transitioned, but opacity always does.
 * Render inside a `relative overflow-hidden` container with the real
 * content in a `relative z-10` wrapper on top.
 */
export function ClockStatusGradient({ status }: { status: ClockStatus | null }) {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]">
      {(Object.keys(GRADIENTS) as ClockStatus[]).map((key) => (
        <div
          key={key}
          className={cn(
            "absolute inset-0 bg-gradient-to-tl transition-opacity duration-700 ease-out",
            GRADIENTS[key],
            status === key ? "opacity-100" : "opacity-0",
          )}
        />
      ))}
    </div>
  );
}
