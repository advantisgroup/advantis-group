"use client";

import * as React from "react";
import {
  AnimatePresence,
  motion,
  useDragControls,
  useReducedMotion,
} from "framer-motion";

import { cn } from "@/lib/utils";

/**
 * A mobile bottom-sheet drawer that can be dragged down to dismiss. Drag is
 * initiated from the grab handle (so the body scrolls normally); releasing past
 * a distance/velocity threshold closes it, otherwise it springs back. Backdrop
 * click and Escape also close it. Hidden on desktop (`md:hidden`).
 */
export function MobileDrawer({
  open,
  onOpenChange,
  children,
  className,
  ariaLabel,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
  className?: string;
  ariaLabel?: string;
}) {
  const controls = useDragControls();
  const reduceMotion = useReducedMotion();

  // Lock body scroll + close on Escape while open.
  React.useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onOpenChange]);

  return (
    <AnimatePresence>
      {open && (
        <div
          className="fixed inset-0 z-50 md:hidden"
          role="dialog"
          aria-modal="true"
          aria-label={ariaLabel}
        >
          <motion.div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={() => onOpenChange(false)}
          />
          <motion.div
            className={cn(
              "absolute inset-x-0 bottom-0 flex h-[65vh] flex-col rounded-t-2xl border-t border-sidebar-border bg-sidebar text-sidebar-foreground shadow-2xl shadow-black/40",
              className
            )}
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={
              reduceMotion
                ? { duration: 0 }
                : { type: "spring", damping: 32, stiffness: 320 }
            }
            drag="y"
            dragControls={controls}
            dragListener={false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.4 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 120 || info.velocity.y > 600) {
                onOpenChange(false);
              }
            }}
          >
            {/* Grab handle — the only drag affordance, so content can scroll. */}
            <div
              onPointerDown={e => controls.start(e)}
              className="flex shrink-0 cursor-grab touch-none items-center justify-center pb-1 pt-3 active:cursor-grabbing"
            >
              <span className="h-1.5 w-10 rounded-full bg-border" />
            </div>
            <div
              className="flex min-h-0 w-full flex-1 flex-col overflow-y-auto"
              style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
            >
              {children}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
