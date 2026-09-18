"use client";

import { useTranslations } from "next-intl";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { StepUpForm, type Area, type StepMethod, type StepUpContext } from "./StepUpForm";

export function StepUpDialog({
  open,
  availableMethods,
  context,
  area,
  onVerified,
  onOpenChange,
}: {
  open: boolean;
  availableMethods: StepMethod[];
  context: StepUpContext;
  area?: Area;
  onVerified: () => void;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("StepUp");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{t("dialogTitle")}</DialogTitle>
          <DialogDescription>{t("dialogBody")}</DialogDescription>
        </DialogHeader>
        <StepUpForm
          availableMethods={availableMethods}
          context={context}
          area={area}
          onVerified={onVerified}
        />
      </DialogContent>
    </Dialog>
  );
}
