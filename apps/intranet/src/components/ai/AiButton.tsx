"use client";

import { type ButtonHTMLAttributes, forwardRef } from "react";

import { cn } from "@/lib/utils";

import { AiGlyph } from "./AiGlyph";

/**
 * The only way to ask for AI anywhere in the app. `pill` for labelled
 * actions, `icon` inside toolbars, `floating` over an editor surface. The
 * label shimmers while `working`, so the button that started a run also
 * tells you it's still going.
 */
export const AiButton = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & {
    working?: boolean;
    look?: "pill" | "icon" | "floating";
  }
>(function AiButton({ working = false, look = "pill", className, children, ...props }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      data-working={working}
      className={cn(
        "inline-flex shrink-0 touch-manipulation items-center justify-center gap-1.5 font-medium text-foreground outline-none transition-[box-shadow,transform,background-color] duration-150 focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50",
        look === "pill" &&
          "ai-edge h-8 rounded-full px-3 text-xs hover:shadow-[0_4px_18px_-6px_color-mix(in_oklch,var(--ai-2)_65%,transparent)]",
        look === "icon" && "size-8 rounded-md hover:bg-accent",
        look === "floating" &&
          "ai-edge size-10 rounded-full shadow-lg [--ai-ground:var(--popover)] hover:scale-105",
        className,
      )}
      {...props}
    >
      <AiGlyph working={working} className={look === "floating" ? "size-[18px]" : "size-4"} />
      {children && <span className={cn("truncate", working && "ai-shimmer")}>{children}</span>}
    </button>
  );
});
