"use client";

import { useEffect, useId, useRef } from "react";
import { useI18n } from "@/lib/activity/i18n";
import { Button } from "@/components/ui/button";

interface Props {
  open: boolean;
  heading: string;
  body?: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  heading,
  body,
  confirmLabel,
  onConfirm,
  onCancel,
}: Props) {
  const { t } = useI18n();
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const headingId = useId();
  const bodyId = useId();

  // Focus management + key handling while open. On open we remember what was
  // focused (the trigger), move focus into the dialog, and trap Tab within it;
  // on close we restore focus so keyboard users land back where they were.
  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    cancelRef.current?.focus();

    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onCancel();
        return;
      }
      if (e.key !== "Tab") return;
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable || focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handler);
    return () => {
      document.removeEventListener("keydown", handler);
      previouslyFocused?.focus();
    };
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm animate-fade-in"
        onClick={onCancel}
      />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={headingId}
          aria-describedby={body ? bodyId : undefined}
          className="w-full max-w-sm rounded-2xl border border-border bg-panel p-6 shadow-overlay animate-rise"
        >
          <h2
            id={headingId}
            className="font-display text-lg font-bold tracking-tightest text-fg"
          >
            {heading}
          </h2>
          {body && (
            <p id={bodyId} className="mt-1.5 text-sm text-muted-foreground">
              {body}
            </p>
          )}
          <div className="mt-6 flex justify-end gap-2">
            <Button ref={cancelRef} variant="secondary" onClick={onCancel}>
              {t("people.cancel")}
            </Button>
            <Button variant="destructive" onClick={onConfirm}>
              {confirmLabel}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
