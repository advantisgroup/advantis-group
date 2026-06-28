"use client";

import { useI18n } from "@/lib/activity/i18n";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";

interface Props {
  open: boolean;
  heading: string;
  body?: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Destructive confirmation used by the activity admin pages. Thin wrapper around
 * the shared {@link Dialog} so it inherits the blurred/dotted backdrop, focus
 * trapping and animations rather than re-implementing them. The controlled
 * `open`/`onConfirm`/`onCancel` props are kept so existing call sites are
 * unchanged.
 */
export function ConfirmDialog({
  open,
  heading,
  body,
  confirmLabel,
  onConfirm,
  onCancel,
}: Props) {
  const { t } = useI18n();

  return (
    <Dialog
      open={open}
      onOpenChange={o => {
        if (!o) onCancel();
      }}
    >
      <DialogContent className="max-w-md gap-0 p-0">
        <div className="px-6 pb-5 pt-6 pr-12">
          <DialogTitle className="leading-snug">{heading}</DialogTitle>
          {body && (
            <DialogDescription className="mt-2 leading-relaxed">
              {body}
            </DialogDescription>
          )}
        </div>
        <DialogFooter className="mx-0 mb-0 mt-0 px-6 py-4">
          <Button variant="ghost" onClick={onCancel}>
            {t("people.cancel")}
          </Button>
          <Button variant="destructive" onClick={onConfirm} autoFocus>
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
