"use client";

import { type ReactNode } from "react";
import { Drawer } from "vaul";

import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

/**
 * The "dialog on desktop, bottom sheet on mobile" shell AGENTS.md documents
 * as the house convention (see components/applicants/EntryDialogs.tsx's
 * EntryDialogShell, the original of this pattern). Extracted so every
 * primary-action dialog shares one implementation instead of each hand-
 * rolling its own `useIsMobile() ? Drawer : Dialog` branch — six-plus copies
 * of the same ~40 lines had already drifted (some missing safe-area padding
 * on the mobile sheet).
 *
 * `children` is the scrollable body only; `title`/`description` render in a
 * shared header (Drawer.Title/Drawer.Description on mobile so the sheet
 * stays accessible, DialogTitle/DialogDescription on desktop), and `footer`
 * is free-form so callers keep control of their own action buttons instead
 * of being locked into a fixed cancel/save pair.
 */
export function ResponsiveDialog({
  open,
  onOpenChange,
  title,
  description,
  footer,
  children,
  contentClassName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  /** Desktop dialog width, e.g. "max-w-lg" — defaults to max-w-md. */
  contentClassName?: string;
}) {
  const isMobile = useIsMobile();

  if (isMobile) {
    return (
      <Drawer.Root open={open} onOpenChange={onOpenChange}>
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" />
          <Drawer.Content
            aria-describedby={description ? undefined : ""}
            className="fixed inset-x-0 bottom-0 z-50 flex max-h-[92dvh] flex-col rounded-t-2xl border-t border-border/70 bg-card shadow-2xl shadow-black/40 outline-none"
          >
            <div className="flex shrink-0 items-center justify-center pb-1 pt-3">
              <span className="h-1.5 w-10 rounded-full bg-border" />
            </div>
            <div className="shrink-0 border-b border-border/70 px-5 pb-3">
              <Drawer.Title className="font-display text-lg font-semibold leading-tight tracking-tight">
                {title}
              </Drawer.Title>
              {description && (
                <Drawer.Description className="mt-1 text-sm text-muted-foreground">
                  {description}
                </Drawer.Description>
              )}
            </div>
            <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 py-4">
              {children}
            </div>
            {footer && (
              <div
                className="flex shrink-0 gap-2 border-t border-border/70 px-5 pt-3"
                style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 0.75rem)" }}
              >
                {footer}
              </div>
            )}
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn("max-w-md gap-0 p-0", contentClassName)}>
        <div className="border-b border-border/70 px-6 pb-4 pr-12 pt-6">
          <DialogTitle className="leading-snug">{title}</DialogTitle>
          {description && (
            <DialogDescription className="mt-1 leading-relaxed">{description}</DialogDescription>
          )}
        </div>
        <div className="flex flex-col gap-4 px-6 pb-5 pt-4">{children}</div>
        {footer && (
          <div className="-mx-6 -mb-6 mt-1 flex flex-col-reverse gap-2 border-t border-border/70 px-6 pb-5 pt-4 sm:flex-row sm:items-center sm:justify-end">
            {footer}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
