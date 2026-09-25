"use client";

import { Bell } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Says the forms are closed and offers the notify list. Not dismissible: it
 * is the only thing explaining why the send button is greyed out, and the
 * only way onto the notify list.
 */
export function SubmissionBanner({
  text,
  onNotifyClick,
  className,
}: {
  text?: string;
  onNotifyClick: () => void;
  className?: string;
}) {
  const t = useTranslations("contact.submissionBanner");

  return (
    <div
      role="status"
      className={cn(
        "flex flex-col gap-4 border-y border-rule py-5 sm:flex-row sm:items-center sm:justify-between sm:gap-6",
        className,
      )}
    >
      <div className="min-w-0">
        <p className="flex items-center gap-2 text-sm font-medium text-foreground">
          <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-warning" />
          {t("title")}
        </p>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
          {text || t("defaultMessage")}
        </p>
      </div>
      <Button
        size="sm"
        variant="outline"
        shape="pill"
        className="self-start sm:self-auto"
        onClick={onNotifyClick}
      >
        <Bell />
        {t("notifyCta")}
      </Button>
    </div>
  );
}
