"use client";

import { type ReactNode } from "react";
import { Drawer } from "vaul";

import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

/**
 * The "dialog on desktop, bottom sheet on mobile" shell AGENTS.md documents
 * as the house convention for small create/edit forms. Anything that needs
 * real room (editors, reviews, reports) gets its own page instead.
 *
 * `children` is the scrollable body only; `title`/`description` render in a
 * shared header (Drawer.Title/Drawer.Description on mobile so the sheet
 * stays accessible, DialogTitle/DialogDescription on desktop), and `footer`
 * is free-form so callers keep control of their own action buttons instead
 * of being locked into a fixed cancel/save pair.
 *
 * No rules between header, body and footer: the header and footer stay put
 * while the body scrolls, and spacing — not a line — separates them.
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
          <Drawer.Overlay className="fixed inset-0 z-50 bg-black/45 backdrop-blur-[8px]" />
          <Drawer.Content
            aria-describedby={description ? undefined : ""}
            className="fixed inset-x-0 bottom-0 z-50 flex max-h-[92dvh] flex-col rounded-t-2xl bg-card shadow-overlay outline-none"
          >
            <div className="flex shrink-0 items-center justify-center pb-1 pt-3">
              <span className="h-1.5 w-10 rounded-full bg-border" />
            </div>
            <div className="shrink-0 px-5 pb-1 pt-2">
              <Drawer.Title className="font-display text-xl font-bold leading-snug tracking-tight">
                {title}
              </Drawer.Title>
              {description && (
                <Drawer.Description className="mt-1 text-[0.9375rem] leading-relaxed text-foreground/70">
                  {description}
                </Drawer.Description>
              )}
            </div>
            <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 py-4">
              {children}
            </div>
            {footer && (
              <div
                className="flex shrink-0 gap-2 px-5 pt-2"
                style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 1rem)" }}
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
      {/* Column layout, not the base grid: the header and footer stay put and
          only the body scrolls. */}
      <DialogContent
        className={cn("flex max-w-md flex-col gap-0 overflow-hidden p-0", contentClassName)}
      >
        <div className="shrink-0 px-7 pb-2 pr-14 pt-7">
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription className="mt-1.5">{description}</DialogDescription>}
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-7 py-4">
          {children}
        </div>
        {/* No negative margins here: DialogContent is p-0 in this shell. */}
        {footer && (
          <div className="flex shrink-0 flex-row items-center justify-end gap-2 px-7 pb-7 pt-3">
            {footer}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
