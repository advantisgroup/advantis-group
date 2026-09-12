"use client";

import { type ReactNode } from "react";

import { AiDockButton } from "@/components/ai/AiDock";
import { useRegisterActionBar } from "@/components/layout/bottom-bars";
import { useKeyboardInset } from "@/hooks/use-keyboard-inset";
import { cn } from "@/lib/utils";

/**
 * A page's actions on a phone, down where a thumb already is instead of in a
 * header nobody reaches one-handed. `inline` sits at the bottom of a
 * full-screen composer's column; otherwise it's fixed to the screen and takes
 * the bottom nav's spot while it's there (see BottomNav). It carries the AI
 * dock either way, and steps aside while the keyboard is open — that space
 * belongs to what's being typed (and a docked formatting bar, if any).
 */
export function MobileActionBar({
  children,
  inline,
  className,
}: {
  children: ReactNode;
  inline?: boolean;
  className?: string;
}) {
  const keyboardOpen = useKeyboardInset() > 0;
  useRegisterActionBar(!keyboardOpen);
  return (
    <div
      className={cn(
        "z-40 flex items-center gap-1.5 border-t border-border/70 bg-background/95 px-3 pt-2.5 backdrop-blur-xl print:hidden md:hidden",
        inline ? "shrink-0" : "fixed inset-x-0 bottom-0",
        keyboardOpen && "hidden",
        className,
      )}
      style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 0.625rem)" }}
    >
      <AiDockButton placement="bottom" active={!keyboardOpen} />
      {children}
    </div>
  );
}
