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

const Dialog = DialogPrimitive.Root;

const DialogTrigger = DialogPrimitive.Trigger;

const DialogPortal = DialogPrimitive.Portal;

const DialogClose = DialogPrimitive.Close;

/**
 * The page behind a dialog is blurred and dimmed hard enough that it stops
 * competing — a dialog is a question, and nothing else on screen should look
 * answerable while it's open.
 */
const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-50 bg-black/45 backdrop-blur-[8px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className,
    )}
    {...props}
  />
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

type DialogContentProps = React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
  overlayClassName?: string;
  /** Confirmations have a Cancel button already; a second way out is noise. */
  hideClose?: boolean;
};

/**
 * One quiet surface: generous padding, no rules between header, body and
 * footer — spacing does that job. The close button is a bare icon in the
 * corner, not another bordered control.
 */
const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  DialogContentProps
>(({ className, children, overlayClassName, hideClose, ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay className={overlayClassName} />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        // Grid children default to `min-width: auto`, so one wide table or
        // unbroken string stretches the whole dialog past max-w-lg and the
        // page scrolls sideways. `min-w-0` lets them shrink instead; the
        // overflow-x guard catches anything that still can't.
        "fixed left-[50%] top-[50%] z-50 grid w-[calc(100%-2rem)] max-w-lg max-h-[calc(100dvh-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 overflow-y-auto overflow-x-hidden overscroll-contain break-words rounded-2xl border border-border/60 bg-card p-7 shadow-overlay duration-200 [&>*]:min-w-0 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-[0.97] data-[state=open]:zoom-in-[0.97]",
        className,
      )}
      {...props}
    >
      {children}
      {/* `data-slot` so a dialog whose top edge isn't the plain card surface
          (the profile's colour banner, say) can restyle the close button for
          contrast without re-implementing it. */}
      {!hideClose && (
        <DialogPrimitive.Close
          data-slot="dialog-close"
          className="absolute right-4 top-4 flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none"
        >
          <X className="size-[18px]" />
          <span className="sr-only">Close</span>
        </DialogPrimitive.Close>
      )}
    </DialogPrimitive.Content>
  </DialogPortal>
));
DialogContent.displayName = DialogPrimitive.Content.displayName;

/** Title and description. Right padding keeps a long title clear of the
 * corner close button. */
const DialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex flex-col gap-1.5 pr-8 text-left", className)} {...props} />
);
DialogHeader.displayName = "DialogHeader";

/** Actions, bottom-right. Put a secondary action (e.g. "Add folder") first
 * with `mr-auto` to pin it bottom-left. */
const DialogFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "mt-2 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end",
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
    className={cn(
      "font-display text-xl font-bold leading-snug tracking-tight text-balance",
      className,
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
    className={cn("text-[0.9375rem] leading-relaxed text-foreground/70 text-pretty", className)}
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
        "flex items-start gap-2 rounded-lg bg-muted/60 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground",
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
    <dl className={cn("overflow-hidden rounded-lg bg-muted/50 text-sm", className)}>
      {rows.map((row, i) => (
        <div
          key={i}
          className="flex items-start justify-between gap-4 px-3.5 py-2.5 [&+&]:border-t [&+&]:border-border/50"
        >
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
    <div className={cn(mobile ? "px-5 pb-5 pt-2" : "p-6")}>
      <div className="flex items-start gap-3">
        {destructive && (
          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-destructive/12 text-destructive">
            <AlertTriangle className="size-4" />
          </span>
        )}
        <div className="min-w-0 flex-1 pt-0.5">
          {title}
          {description}
        </div>
      </div>
      {hasBody && (
        <div className="mt-4 flex flex-col gap-3">
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
      <div
        className={cn(
          "mt-5 flex gap-2",
          mobile ? "flex-col-reverse" : "flex-row items-center justify-end",
        )}
      >
        <Button variant="secondary" size={mobile ? "default" : "sm"} onClick={onCancel}>
          {cancelLabel}
        </Button>
        <Button
          variant={destructive ? "destructive" : "default"}
          size={mobile ? "default" : "sm"}
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
  const hasBody =
    !!opts?.confirmText || !!opts?.tip || !!opts?.details?.length || !!opts?.items?.length;

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {isMobile ? (
        <Drawer.Root open={open} onOpenChange={(value) => !value && settle(false)}>
          <Drawer.Portal>
            <Drawer.Overlay className="fixed inset-0 z-[80] bg-black/45 backdrop-blur-[8px]" />
            <Drawer.Content className="fixed inset-x-0 bottom-0 z-[90] max-h-[90dvh] overflow-y-auto rounded-t-2xl bg-card pb-[env(safe-area-inset-bottom)] shadow-overlay outline-none">
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
                    <Drawer.Description className="mt-1 text-[0.9375rem] leading-relaxed text-foreground/70">
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
            hideClose
            overlayClassName="z-[80]"
            className="z-[90] max-w-md gap-0 p-0"
          >
            <ConfirmDialogPanel
              mobile={false}
              title={<DialogTitle className="text-lg font-semibold">{opts?.title}</DialogTitle>}
              description={
                opts?.description && (
                  <DialogDescription className="mt-1">{opts.description}</DialogDescription>
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
