"use client";

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { ChevronDown, X, type LucideIcon } from "lucide-react";
import { Drawer } from "vaul";

import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

/**
 * The detail view for one row of a list. On desktop it slides over the list
 * from the right, so the list stays in view and keeps its scroll position; on
 * mobile it's a bottom sheet. `accent` colours the top edge — the record's
 * state in peripheral vision, without a banner inside the panel.
 *
 * `header` holds identity and state only (number, title, status). Things you
 * change or open belong in a `SidePanelSection` further down.
 */
export function SidePanel({
  open,
  onOpenChange,
  title,
  accent,
  header,
  children,
  closeLabel,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Accessible name for the panel. */
  title: string;
  accent?: string;
  header: ReactNode;
  children: ReactNode;
  closeLabel: string;
}) {
  const isMobile = useIsMobile();
  const edge = { borderTopColor: accent ?? "var(--border)" };

  const body = (
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
      {children}
    </div>
  );

  if (isMobile) {
    return (
      <Drawer.Root open={open} onOpenChange={onOpenChange}>
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 z-50 bg-black/45 backdrop-blur-[2px]" />
          <Drawer.Content
            aria-describedby={undefined}
            style={edge}
            className="fixed inset-x-0 bottom-0 z-50 flex max-h-[92dvh] flex-col rounded-t-2xl border-t-[3px] bg-card text-card-foreground shadow-overlay outline-none"
          >
            <Drawer.Title className="sr-only">{title}</Drawer.Title>
            <div className="flex shrink-0 justify-center pb-1 pt-2.5">
              <span className="h-1.5 w-10 rounded-full bg-border" />
            </div>
            <div className="shrink-0 border-b border-border/60 px-5 pb-4 pt-1">{header}</div>
            {body}
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>
    );
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        {/* Light scrim, no blur: the list behind stays readable while the
            panel is open, which is the point of a panel over a page. */}
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/20 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          style={edge}
          className="fixed inset-y-2 right-2 z-50 flex w-[min(31rem,calc(100vw-1rem))] flex-col overflow-hidden rounded-2xl border border-t-[3px] border-border/70 bg-card text-card-foreground shadow-overlay outline-none duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:slide-out-to-right-8 data-[state=open]:slide-in-from-right-8"
        >
          <DialogPrimitive.Title className="sr-only">{title}</DialogPrimitive.Title>
          <div className="relative shrink-0 border-b border-border/60 px-5 pb-4 pt-4">
            {header}
            <DialogPrimitive.Close
              aria-label={closeLabel}
              className="absolute right-3 top-3 grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="size-[18px]" />
            </DialogPrimitive.Close>
          </div>
          {body}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export function SidePanelSection({
  title,
  action,
  children,
  className,
}: {
  title: string;
  action?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("border-b border-border/60 py-4 last:border-b-0", className)}>
      <div className={cn("flex min-h-6 items-center justify-between gap-2", children && "mb-3")}>
        <h3 className="text-xs font-semibold text-muted-foreground">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

/** Label/value rows. Values may be controls — they should look like text until hovered. */
export function SidePanelProperties({ rows }: { rows: { label: string; value: ReactNode }[] }) {
  return (
    <dl className="grid grid-cols-[7rem_minmax(0,1fr)] items-center gap-x-3 gap-y-[9px] text-[13px] sm:grid-cols-[8.5rem_minmax(0,1fr)]">
      {rows.map((row) => (
        <div key={row.label} className="contents">
          <dt className="text-muted-foreground">{row.label}</dt>
          <dd className="min-w-0 break-words">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** An inline-editable property value: plain text at rest, a chevron and fill on hover. */
export const PropertyButton = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement>
>(({ className, children, ...props }, ref) => (
  <button
    ref={ref}
    type="button"
    className={cn(
      "group/property -mx-2 -my-1 inline-flex max-w-full items-center gap-2 rounded-md px-2 py-1 text-left transition-colors max-md:py-2 hover:bg-accent focus-visible:bg-accent focus-visible:outline-none data-[state=open]:bg-accent",
      className,
    )}
    {...props}
  >
    <span className="flex min-w-0 items-center gap-2 truncate">{children}</span>
    <ChevronDown className="size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover/property:opacity-100 group-focus-visible/property:opacity-100 group-data-[state=open]/property:opacity-100 max-md:opacity-100" />
  </button>
));
PropertyButton.displayName = "PropertyButton";

/** The record's state as a tinted chip; a menu trigger when the state can be changed. */
export const StatusChip = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { accent: string; icon: LucideIcon; label: string }
>(({ accent, icon: Icon, label, className, disabled, ...props }, ref) => (
  <button
    ref={ref}
    type="button"
    disabled={disabled}
    style={{
      color: accent,
      background: `color-mix(in oklch, ${accent} 13%, transparent)`,
      borderColor: `color-mix(in oklch, ${accent} 32%, transparent)`,
    }}
    className={cn(
      "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border px-2.5 text-[12.5px] font-semibold transition-[filter] hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default disabled:hover:brightness-100 md:h-[30px]",
      className,
    )}
    {...props}
  >
    <Icon className="size-3.5" />
    {label}
    {!disabled && <ChevronDown className="size-3.5 opacity-70" />}
  </button>
));
StatusChip.displayName = "StatusChip";
