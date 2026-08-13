"use client";

import * as React from "react";
import { createContext, type ReactNode, useCallback, useContext, useRef, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { AlertTriangle, CheckCircle2, CircleAlert, Lightbulb, X, XCircle } from "lucide-react";
import { Drawer } from "vaul";

import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";
import { Input } from "@/components/ui/input";
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
        typeof (navigator as Navigator & { deviceMemory?: number }).deviceMemory === "number"
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
        className,
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

type DialogContentProps = React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
  overlayClassName?: string;
};

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  DialogContentProps
>(({ className, children, overlayClassName, ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay className={overlayClassName} />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        // Grid children default to `min-width: auto`, so one wide table or
        // unbroken string stretches the whole dialog past max-w-lg and the
        // page scrolls sideways. `min-w-0` lets them shrink instead; the
        // overflow-x guard catches anything that still can't.
        "fixed left-[50%] top-[50%] z-50 grid w-[calc(100%-2rem)] max-w-lg max-h-[calc(100dvh-2rem)] translate-x-[-50%] translate-y-[-50%] gap-5 overflow-y-auto overflow-x-hidden overscroll-contain break-words [&>*]:min-w-0 border border-border/70 bg-card p-6 shadow-2xl shadow-black/30 duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] rounded-[calc(var(--radius)+0.25rem)]",
        className,
      )}
      {...props}
    >
      {children}
      <DialogPrimitive.Close className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground opacity-80 ring-offset-background transition-all hover:bg-accent hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none">
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
const DialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "-mx-6 -mt-6 flex flex-col space-y-1 border-b border-border/70 px-6 pb-4 pt-5 text-left",
      className,
    )}
    {...props}
  />
);
DialogHeader.displayName = "DialogHeader";

/**
 * Section 3 of the canonical dialog layout: the interactive footer where the
 * action buttons live.
 */
const DialogFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "-mx-6 -mb-6 mt-1 flex flex-col-reverse gap-2 border-t border-border/70 px-6 pb-5 pt-4 sm:flex-row sm:items-center sm:justify-end",
      className,
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
    className={cn("font-display text-lg font-semibold leading-tight tracking-tight", className)}
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
const DialogTip = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, children, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "flex items-start gap-2 rounded-md border border-border/60 bg-muted/50 px-3 py-2 text-xs text-muted-foreground",
        className,
      )}
      {...props}
    >
      <Lightbulb className="mt-0.5 size-3.5 shrink-0 text-warning" />
      <span className="min-w-0">{children}</span>
    </div>
  ),
);
DialogTip.displayName = "DialogTip";

/**
 * A single row in a `DialogChecklist` — a consequence of the action the
 * dialog is confirming, tagged positive/negative/neutral so the icon and
 * color communicate at a glance (see the grant/revoke Applicant Management
 * dialogs for the canonical usage).
 */
export interface ChecklistItem {
  tone: "positive" | "negative" | "neutral";
  text: ReactNode;
}

const checklistIcon: Record<ChecklistItem["tone"], typeof CheckCircle2> = {
  positive: CheckCircle2,
  negative: XCircle,
  neutral: CircleAlert,
};

const checklistColor: Record<ChecklistItem["tone"], string> = {
  positive: "text-success",
  negative: "text-destructive",
  neutral: "text-muted-foreground",
};

/**
 * Itemized list of consequences for a dialog — the ✅/❌ checklist pattern.
 * Exported standalone (not just for `useConfirm`) so any dialog can compose
 * it directly inside `DialogContent`.
 */
export function DialogChecklist({
  items,
  className,
}: {
  items: ChecklistItem[];
  className?: string;
}) {
  return (
    <ul className={cn("flex flex-col gap-2", className)}>
      {items.map((item, i) => {
        const Icon = checklistIcon[item.tone];
        return (
          <li key={i} className="flex items-start gap-2 text-sm">
            <Icon className={cn("mt-0.5 size-4 shrink-0", checklistColor[item.tone])} />
            <span className="min-w-0 text-foreground/90">{item.text}</span>
          </li>
        );
      })}
    </ul>
  );
}

export interface DetailRow {
  label: string;
  value: ReactNode;
}

/**
 * Identifying facts about whatever is being acted on — the name, the target
 * folder, when it was created. A confirmation that restates the question is
 * useless; one that shows *which* record is about to go is what actually lets
 * someone catch a misclick before they commit to it.
 */
export function DialogDetails({ rows, className }: { rows: DetailRow[]; className?: string }) {
  return (
    <dl
      className={cn(
        "divide-y divide-border/60 overflow-hidden rounded-lg border border-border/60 bg-muted/30 text-sm",
        className,
      )}
    >
      {rows.map((row, i) => (
        <div key={i} className="flex items-start justify-between gap-4 px-3 py-2">
          <dt className="shrink-0 text-muted-foreground">{row.label}</dt>
          <dd className="min-w-0 break-words text-right font-medium">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   Imperative confirmation, built on the same dialog. Lives here so the app has
   a single dialog module rather than a separate confirm-dialog file.
   ────────────────────────────────────────────────────────────────────────── */

interface ConfirmOptions {
  title: string;
  description?: string;
  /** What's being acted on, as label/value rows. Prefer this over padding the
   *  description with the same facts in prose. */
  details?: DetailRow[];
  /** Optional highlighted tip rendered under the description. */
  tip?: ReactNode;
  /** Itemized consequences of the action, rendered as a checklist. */
  items?: ChecklistItem[];
  /**
   * When set, the confirm button stays disabled until the user types
   * `target` exactly — for maximum-destructive actions (e.g. deleting an
   * applicant's full record).
   */
  confirmText?: { placeholder?: string; target: string };
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
}

type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

function ConfirmDialogPanel({
  title,
  description,
  mobile,
  destructive,
  hasBody,
  details,
  items,
  tip,
  confirmText,
  typedConfirm,
  onTypedConfirmChange,
  confirmBlocked,
  cancelLabel,
  confirmLabel,
  onCancel,
  onConfirm,
}: {
  title: ReactNode;
  description?: ReactNode;
  mobile: boolean;
  destructive: boolean;
  hasBody: boolean;
  details?: DetailRow[];
  items?: ChecklistItem[];
  tip?: ReactNode;
  confirmText?: ConfirmOptions["confirmText"];
  typedConfirm: string;
  onTypedConfirmChange: (value: string) => void;
  confirmBlocked: boolean;
  cancelLabel: string;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className={cn("px-5 pb-5 pt-3 sm:px-6 sm:pb-6 sm:pt-6", !mobile && "pr-12")}>
      <div className="flex items-start gap-3">
        {destructive && (
          <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl bg-destructive/10 text-destructive shadow-[0_8px_20px_-12px_color-mix(in_oklch,var(--destructive)_90%,transparent)]">
            <AlertTriangle className="size-4" />
          </span>
        )}
        <div className="min-w-0 flex-1">{title}</div>
      </div>
      {description}
      {hasBody && (
        <div className="mt-5 flex flex-col gap-4">
          {details && details.length > 0 && <DialogDetails rows={details} />}
          {items && items.length > 0 && <DialogChecklist items={items} />}
          {tip && <DialogTip>{tip}</DialogTip>}
          {confirmText && (
            <Input
              autoFocus
              value={typedConfirm}
              onChange={(e) => onTypedConfirmChange(e.target.value)}
              placeholder={confirmText.placeholder ?? confirmText.target}
            />
          )}
        </div>
      )}
      <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
        <Button variant="ghost" className="sm:min-w-24" onClick={onCancel}>
          {cancelLabel}
        </Button>
        <Button
          variant={destructive ? "destructive" : "default"}
          className="sm:min-w-32"
          onClick={onConfirm}
          disabled={confirmBlocked}
          autoFocus={!confirmText}
        >
          {confirmLabel}
        </Button>
      </div>
    </div>
  );
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const [typedConfirm, setTypedConfirm] = useState("");
  const resolver = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback<ConfirmFn>((options) => {
    setOpts(options);
    setTypedConfirm("");
    setOpen(true);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  function settle(result: boolean) {
    resolver.current?.(result);
    resolver.current = null;
    setOpen(false);
    setTypedConfirm("");
  }

  const confirmBlocked = !!opts?.confirmText && typedConfirm !== opts.confirmText.target;
  const destructive = opts?.destructive !== false;
  const isMobile = useIsMobile();
  // The description now sits in the header, so the body section is only worth
  // rendering (and only worth its border/padding) when something fills it.
  const hasBody =
    !!opts?.confirmText || !!opts?.tip || !!opts?.details?.length || !!opts?.items?.length;

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {isMobile ? (
        <Drawer.Root open={open} onOpenChange={(value) => !value && settle(false)}>
          <Drawer.Portal>
            <Drawer.Overlay className="fixed inset-0 z-[80] bg-black/50 backdrop-blur-sm" />
            <Drawer.Content className="fixed inset-x-0 bottom-0 z-[90] max-h-[90dvh] overflow-y-auto rounded-t-2xl border-t border-border/60 bg-card shadow-2xl shadow-black/40 outline-none">
              <div className="flex items-center justify-center pb-1 pt-3">
                <span className="h-1.5 w-10 rounded-full bg-border" />
              </div>
              <ConfirmDialogPanel
                mobile
                title={
                  <Drawer.Title className="font-display text-lg font-semibold leading-snug tracking-tight">
                    {opts?.title}
                  </Drawer.Title>
                }
                description={
                  opts?.description && (
                    <Drawer.Description className="mt-1 text-sm leading-relaxed text-muted-foreground">
                      {opts.description}
                    </Drawer.Description>
                  )
                }
                destructive={destructive}
                hasBody={hasBody}
                details={opts?.details}
                items={opts?.items}
                tip={opts?.tip}
                confirmText={opts?.confirmText}
                typedConfirm={typedConfirm}
                onTypedConfirmChange={setTypedConfirm}
                confirmBlocked={confirmBlocked}
                cancelLabel={opts?.cancelLabel ?? "Cancel"}
                confirmLabel={opts?.confirmLabel ?? "Confirm"}
                onCancel={() => settle(false)}
                onConfirm={() => settle(true)}
              />
            </Drawer.Content>
          </Drawer.Portal>
        </Drawer.Root>
      ) : (
        <Dialog open={open} onOpenChange={(value) => !value && settle(false)}>
          <DialogContent
            overlayClassName="z-[80]"
            className="z-[90] max-w-md gap-0 rounded-2xl border-border/60 bg-card p-0 shadow-2xl shadow-black/35"
          >
            <ConfirmDialogPanel
              mobile={false}
              title={<DialogTitle className="leading-snug">{opts?.title}</DialogTitle>}
              description={
                opts?.description && (
                  <DialogDescription className="mt-1 leading-relaxed">
                    {opts.description}
                  </DialogDescription>
                )
              }
              destructive={destructive}
              hasBody={hasBody}
              details={opts?.details}
              items={opts?.items}
              tip={opts?.tip}
              confirmText={opts?.confirmText}
              typedConfirm={typedConfirm}
              onTypedConfirmChange={setTypedConfirm}
              confirmBlocked={confirmBlocked}
              cancelLabel={opts?.cancelLabel ?? "Cancel"}
              confirmLabel={opts?.confirmLabel ?? "Confirm"}
              onCancel={() => settle(false)}
              onConfirm={() => settle(true)}
            />
          </DialogContent>
        </Dialog>
      )}
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
