"use client";

import * as React from "react";
import { Drawer } from "vaul";

import { cn } from "@/lib/utils";

/**
 * A mobile bottom-sheet drawer powered by vaul. Drag-to-dismiss, snap-back,
 * Escape key, backdrop click, and body scroll lock are all handled internally.
 * Starts at 65 vh so the top safe area is always visible. Hidden on desktop
 * (the parent Sidebar only renders this on mobile).
 */
export function MobileDrawer({
  open,
  onOpenChange,
  children,
  className,
  ariaLabel,
  "data-tour": dataTour,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
  className?: string;
  ariaLabel?: string;
  "data-tour"?: string;
}) {
  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" />
        <Drawer.Content
          aria-label={ariaLabel}
          data-tour={dataTour}
          className={cn(
            "fixed inset-x-0 bottom-0 z-50 flex h-[65vh] flex-col rounded-t-2xl border-t border-sidebar-border bg-sidebar text-sidebar-foreground shadow-2xl shadow-black/40 outline-none",
            className
          )}
        >
          {/* Visual drag handle — vaul makes the whole Content draggable */}
          <div className="flex shrink-0 items-center justify-center pb-1 pt-3">
            <span className="h-1.5 w-10 rounded-full bg-border" />
          </div>
          <div
            className="flex min-h-0 w-full flex-1 flex-col overflow-y-auto"
            style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
          >
            {children}
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
