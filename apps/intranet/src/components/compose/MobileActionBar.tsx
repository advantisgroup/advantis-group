import { type ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * A long form's actions on a phone: in the thumb zone and always in view,
 * instead of at the end of the page. It takes the bottom nav's spot while
 * it's on screen (see BottomNav) — the same trade the full-screen composers
 * make.
 */
export function MobileActionBar({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      data-mobile-action-bar
      className={cn(
        "fixed inset-x-0 bottom-0 z-40 flex items-center gap-2 border-t border-border/70 bg-background/95 px-4 pt-3 backdrop-blur-xl print:hidden md:hidden",
        className,
      )}
      style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 0.75rem)" }}
    >
      {children}
    </div>
  );
}
