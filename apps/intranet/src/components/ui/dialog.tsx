"use client";

import * as React from "react";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useRef,
  useState,
} from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Lightbulb, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * True when the current client looks resource-constrained — few logical CPU
 * cores, little memory, or an explicit reduced-motion preference. The dialog
 * uses this to drop the decorative dotted-grid animation on low-end devices so
 * it never spends frames on something purely cosmetic.
 */
function useLowEndDevice() {
  const [lowEnd, setLowEnd] = React.useState(false);

  React.useEffect(() => {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

    const evaluate = () => {
      const cores = navigator.hardwareConcurrency ?? 8;
      const memory =
        typeof (navigator as Navigator & { deviceMemory?: number })
          .deviceMemory === "number"
          ? (navigator as Navigator & { deviceMemory?: number }).deviceMemory!
          : 8;
      setLowEnd(reduceMotion.matches || cores <= 4 || memory <= 4);
    };

    evaluate();
    reduceMotion.addEventListener("change", evaluate);
    return () => reduceMotion.removeEventListener("change", evaluate);
  }, []);

  return lowEnd;
}

const Dialog = DialogPrimitive.Root;

const DialogTrigger = DialogPrimitive.Trigger;

const DialogPortal = DialogPrimitive.Portal;

const DialogClose = DialogPrimitive.Close;

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => {
  const lowEnd = useLowEndDevice();

  return (
    <DialogPrimitive.Overlay
      ref={ref}
      className={cn(
        "fixed inset-0 z-50 bg-background/40 backdrop-blur-md data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
        className
      )}
      {...props}
    >
      {/* Decorative dotted grid drifting toward the top-left. Disabled on
          low-end devices via data-animated to save resources. */}
      <span
        aria-hidden
        data-animated={lowEnd ? "false" : "true"}
        className="dialog-dot-grid pointer-events-none absolute inset-0 opacity-70"
      />
    </DialogPrimitive.Overlay>
  );
});
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        "fixed left-[50%] top-[50%] z-50 grid w-[calc(100%-2rem)] max-w-lg max-h-[calc(100dvh-2rem)] translate-x-[-50%] translate-y-[-50%] gap-5 overflow-y-auto border border-border/70 bg-card p-6 shadow-2xl shadow-black/30 duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] rounded-[calc(var(--radius)+0.25rem)]",
        className
      )}
      {...props}
    >
      {children}
      <DialogPrimitive.Close className="absolute right-4 top-4 flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground opacity-80 ring-offset-background transition-all hover:bg-accent hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none">
        <X className="h-4 w-4" />
        <span className="sr-only">Close</span>
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </DialogPortal>
));
DialogContent.displayName = DialogPrimitive.Content.displayName;

/**
 * Section 1 of the canonical dialog layout: the header. Holds the
 * `DialogTitle` (and optionally an icon).
 */
const DialogHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "-mx-6 -mt-6 flex flex-col space-y-1 border-b border-border/70 px-6 pb-4 pt-5 text-left",
      className
    )}
    {...props}
  />
);
DialogHeader.displayName = "DialogHeader";

/**
 * Section 3 of the canonical dialog layout: the interactive footer where the
 * action buttons live.
 */
const DialogFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "-mx-6 -mb-6 mt-1 flex flex-col-reverse gap-2 border-t border-border/70 px-6 pb-5 pt-4 sm:flex-row sm:items-center sm:justify-end",
      className
    )}
    {...props}
  />
);
DialogFooter.displayName = "DialogFooter";

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn(
      "font-display text-lg font-semibold leading-tight tracking-tight",
      className
    )}
    {...props}
  />
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
));
DialogDescription.displayName = DialogPrimitive.Description.displayName;

/**
 * Optional companion to `DialogDescription`: a subtle, highlighted tip that
 * sits in the description section to call out something the user should know
 * before acting.
 */
const DialogTip = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, children, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "flex items-start gap-2 rounded-md border border-border/60 bg-muted/50 px-3 py-2 text-xs text-muted-foreground",
      className
    )}
    {...props}
  >
    <Lightbulb className="mt-0.5 size-3.5 shrink-0 text-warning" />
    <span className="min-w-0">{children}</span>
  </div>
));
DialogTip.displayName = "DialogTip";

/* ──────────────────────────────────────────────────────────────────────────
   Imperative confirmation, built on the same dialog. Lives here so the app has
   a single dialog module rather than a separate confirm-dialog file.
   ────────────────────────────────────────────────────────────────────────── */

interface ConfirmOptions {
  title: string;
  description?: string;
  /** Optional highlighted tip rendered under the description. */
  tip?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
}

type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback<ConfirmFn>(options => {
    setOpts(options);
    setOpen(true);
    return new Promise<boolean>(resolve => {
      resolver.current = resolve;
    });
  }, []);

  function settle(result: boolean) {
    resolver.current?.(result);
    resolver.current = null;
    setOpen(false);
  }

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Dialog
        open={open}
        onOpenChange={o => {
          if (!o) settle(false);
        }}
      >
        <DialogContent className="max-w-md gap-0 p-0">
          <div className="px-6 pb-5 pt-6 pr-12">
            <DialogTitle className="leading-snug">{opts?.title}</DialogTitle>
            {opts?.description && (
              <DialogDescription className="mt-2 leading-relaxed">
                {opts.description}
              </DialogDescription>
            )}
            {opts?.tip && <DialogTip className="mt-4">{opts.tip}</DialogTip>}
          </div>
          <DialogFooter className="mx-0 mb-0 mt-0 px-6 py-4">
            <Button variant="ghost" onClick={() => settle(false)}>
              {opts?.cancelLabel ?? "Cancel"}
            </Button>
            <Button
              variant={opts?.destructive === false ? "default" : "destructive"}
              onClick={() => settle(true)}
              autoFocus
            >
              {opts?.confirmLabel ?? "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ConfirmContext.Provider>
  );
}

/** Imperative confirmation. `await confirm({...})` resolves to true/false. */
export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) {
    throw new Error("useConfirm must be used within a ConfirmProvider");
  }
  return ctx;
}

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogClose,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
  DialogTip,
};
