"use client";
import React, { useState } from "react";
import { AlertTriangle, Bell, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface SubmissionBannerProps {
  text?: string;
  onNotifyClick: () => void;
  className?: string;
}

export function SubmissionBanner({
  text,
  onNotifyClick,
  className,
}: SubmissionBannerProps) {
  const t = useTranslations("contact.submissionBanner");
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  const message = text || t("defaultMessage");

  return (
    <div
      className={cn(
        "flex flex-col md:flex-row md:items-center gap-3 md:gap-4 w-full rounded-lg border border-warning/45 bg-warning/12 px-4 md:px-5 py-4 text-warning-foreground",
        className
      )}
      role="alert"
    >
      {/* Icon + Text */}
      <div className="flex items-start md:items-center gap-3 flex-1 min-w-0">
        <AlertTriangle
          className="mt-0.5 md:mt-0 h-5 w-5 shrink-0 text-warning-foreground/80"
          aria-hidden="true"
        />
        <div className="flex-1 min-w-0">
          <p className="md:hidden text-sm font-semibold leading-snug text-warning-foreground">
            {t("title")}
          </p>
          <p className="mt-0.5 md:mt-0 text-xs md:text-sm font-medium leading-relaxed md:leading-snug text-warning-foreground/80 md:text-white">
            {message}
          </p>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 md:shrink-0">
        <Button
          size="sm"
          variant="outline"
          className="flex-1 md:flex-none gap-1.5 border-warning/50 bg-background/55 text-white/80 hover:bg-warning/18 transition-colors"
          onClick={onNotifyClick}
        >
          <Bell className="h-3.5 w-3.5 md:h-3.5 md:w-3.5 h-4 w-4" />
          {t("notifyCta")}
        </Button>
        <button
          className="shrink-0 rounded p-1 text-warning-foreground/30 md:text-white/30 hover:text-warning-foreground transition-colors"
          aria-label={t("dismiss")}
          onClick={() => setDismissed(true)}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
