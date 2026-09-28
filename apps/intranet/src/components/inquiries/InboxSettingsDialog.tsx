"use client";

import { api } from "@advantis/convex/api";
import { useMutation, useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const AUTO_CLOSE_OPTIONS = [0, 7, 14, 30, 60, 90] as const;

/** The inbox's housekeeping, for everyone who works it: when answered inquiries close on their own. */
export function InboxSettingsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("Inquiries.settings");
  const settings = useQuery(api.marketing.automation.settings, open ? {} : "skip");
  const setAutoCloseDays = useMutation(api.marketing.automation.setAutoCloseDays);

  const current = settings?.autoCloseDays;
  const options: number[] = [...AUTO_CLOSE_OPTIONS];
  // a value set some other way still shows as itself
  if (current !== undefined && !options.includes(current)) options.push(current);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>
        <div>
          <span className="text-sm font-medium">{t("autoClose")}</span>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{t("autoCloseHint")}</p>
          <Select
            value={current === undefined ? undefined : String(current)}
            disabled={current === undefined}
            onValueChange={(value) =>
              void setAutoCloseDays({ days: Number(value) })
                .then(() => toast.success(t("saved")))
                .catch(() => toast.error(t("failed")))
            }
          >
            <SelectTrigger className="mt-3 w-full" aria-label={t("autoClose")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {options.map((days) => (
                <SelectItem key={days} value={String(days)}>
                  {days === 0 ? t("never") : t("afterDays", { days })}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </DialogContent>
    </Dialog>
  );
}
