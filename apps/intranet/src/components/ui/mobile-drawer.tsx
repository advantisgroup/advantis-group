"use client";

import * as React from "react";
import { Drawer } from "vaul";

import { cn } from "@/lib/utils";

/**
 * A mobile bottom-sheet drawer powered by vaul. Drag-to-dismiss, snap-back,
 * Escape key, backdrop click, and body scroll lock are all handled internally.
 * Hidden on desktop (the parent Sidebar only renders this on mobile).
 *
 * Sized in `dvh`, not `vh`: `vh` is the large viewport, so with a phone's URL
 * bar showing the sheet would run past the bottom of the screen and take its
 * footer with it. 88% leaves the page visibly behind the sheet so it still
 * reads as a sheet rather than a page, while giving the navigation enough
 * room that its footer isn't fighting the list for space.
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
            "fixed inset-x-0 bottom-0 z-50 flex h-[88dvh] flex-col rounded-t-2xl border-t border-sidebar-border bg-sidebar text-sidebar-foreground shadow-2xl shadow-black/40 outline-none",
            className,
          )}
        >
          {/* Visual drag handle — vaul makes the whole Content draggable */}
          <div className="flex shrink-0 items-center justify-center pb-1 pt-3">
            <span className="h-1.5 w-10 rounded-full bg-border" />
          </div>
          {/* `overflow-hidden`, not `overflow-y-auto`: the children own their
              own scroll region (SidebarContent), and a second scroll container
              wrapped around it let the whole column grow instead, which is
              what squashed the footer against the bottom edge. */}
          <div
            className="flex min-h-0 w-full flex-1 flex-col overflow-hidden"
            style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
          >
            {children}
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
