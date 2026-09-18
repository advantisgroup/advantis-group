"use client";

import { type ReactNode } from "react";

import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";

import { DraftIndicator, DraftOfferBanner, DraftRestoredNote } from "./DraftIndicator";
import { type ReadinessCheck, ReadinessMeter, scoreReadiness } from "./Readiness";
import { type Draft } from "./use-draft";

/**
 * Every small create/edit form: the house dialog/bottom-sheet shell, plus a
 * draft that survives closing it and a footer that says what's still missing
 * instead of a submit button that's just mysteriously grey.
 */
export function FormDialog({
  open,
  onOpenChange,
  title,
  description,
  checks,
  draft,
  onStartOver,
  submitLabel,
  onSubmit,
  busy,
  contentClassName,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  checks?: ReadinessCheck[];
  draft?: Draft;
  onStartOver?: () => void;
  submitLabel: string;
  onSubmit: () => void;
  busy?: boolean;
  contentClassName?: string;
  children: ReactNode;
}) {
  const tc = useTranslations("Common");
  const canSubmit = checks ? scoreReadiness(checks).canSubmit : true;

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      contentClassName={contentClassName}
      footer={
        <>
          <div className="mr-auto hidden min-w-0 flex-col gap-0.5 sm:flex">
            {checks && <ReadinessMeter checks={checks} />}
            {draft && <DraftIndicator draft={draft} />}
          </div>
          <Button
            variant="secondary"
            size="sm"
            className="max-sm:h-10 max-sm:flex-1"
            onClick={() => onOpenChange(false)}
          >
            {tc("cancel")}
          </Button>
          <Button
            size="sm"
            className="max-sm:h-10 max-sm:flex-1"
            disabled={busy || !canSubmit}
            onClick={onSubmit}
          >
            {submitLabel}
          </Button>
        </>
      }
    >
      {draft && <DraftOfferBanner draft={draft} />}
      {draft && <DraftRestoredNote draft={draft} onStartOver={onStartOver} />}
      {checks && <ReadinessMeter checks={checks} className="sm:hidden" />}
      {children}
    </ResponsiveDialog>
  );
}

/** Small uppercase label above a field in a form dialog. */
export function FieldLabel({ children }: { children: ReactNode }) {
  return (
    <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      {children}
    </span>
  );
}
