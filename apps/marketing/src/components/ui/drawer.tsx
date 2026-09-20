"use client";

import * as React from "react";
import { Drawer as Vaul } from "vaul";

import { cn } from "@/lib/utils";

/**
 * A bottom sheet, powered by vaul — the same primitive the intranet's
 * MobileDrawer uses, so a sheet behaves identically in both apps.
 *
 * vaul owns drag-to-dismiss, the rubber-band at the top of the travel, the
 * velocity-aware snap back, Escape, backdrop click, focus trapping and the
 * body scroll lock. All of that is what a hand-rolled sheet ends up
 * reimplementing badly.
 *
 * Sized in `dvh`, not `vh`: `vh` is the large viewport, so with a phone's URL
 * bar showing, the sheet would run past the bottom of the screen and take its
 * footer with it.
 */
export const Drawer = ({
  open,
  onOpenChange,
  ariaLabel,
  className,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ariaLabel?: string;
  className?: string;
  children: React.ReactNode;
}) => (
  <Vaul.Root open={open} onOpenChange={onOpenChange}>
    <Vaul.Portal>
      <Vaul.Overlay className="fixed inset-0 z-[60] bg-foreground/25 backdrop-blur-[2px]" />
      <Vaul.Content
        aria-label={ariaLabel}
        /*
         * A definite height, not `max-h`. With `max-h` the flex column is
         * still content-sized, so the `flex-1 min-h-0` scroller inside it has
         * nothing to be bounded against — it grows to fit its children, the
         * sheet runs off the bottom of the screen, and the rows down there
         * cannot be reached because the page behind is scroll-locked.
         */
        className={cn(
          "fixed inset-x-0 bottom-0 z-[70] flex h-[88dvh] flex-col rounded-t-2xl border-t border-rule bg-background text-foreground shadow-overlay outline-none",
          className,
        )}
      >
        {/* The whole sheet is draggable; this is the affordance that says so. */}
        <div className="flex shrink-0 justify-center pb-1 pt-3">
          <span aria-hidden className="h-1 w-9 rounded-full bg-rule-strong" />
        </div>
        {children}
      </Vaul.Content>
    </Vaul.Portal>
  </Vaul.Root>
);

export const DrawerTitle = Vaul.Title;
export const DrawerDescription = Vaul.Description;
export const DrawerClose = Vaul.Close;
