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
    <>
      {/* Desktop banner */}
      <div
        className={cn(
          "hidden md:flex items-center gap-4 w-full rounded-lg border border-warning/45 bg-warning/12 px-5 py-4 text-warning-foreground",
          className
        )}
        role="alert"
      >
        <AlertTriangle
          className="h-5 w-5 shrink-0 text-warning-foreground/80"
          aria-hidden="true"
        />

        <p className="flex-1 text-sm font-medium leading-snug text-white">
          {message}
        </p>

        <div className="flex items-center gap-2 shrink-0">
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 border-warning/50 bg-background/55 text-white/80 hover:bg-warning/18 transition-colors"
            onClick={onNotifyClick}
          >
            <Bell className="h-3.5 w-3.5" />
            {t("notifyCta")}
          </Button>

          <button
            className="ml-1 rounded p-1 text-white/30 hover:text-warning-foreground transition-colors"
            aria-label={t("dismiss")}
            onClick={() => setDismissed(true)}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Mobile banner */}
      <div
        className={cn(
          "flex flex-col gap-3 md:hidden w-full rounded-lg border border-warning/45 bg-warning/12 px-4 py-4 text-warning-foreground",
          className
        )}
        role="alert"
      >
        <div className="flex items-start gap-3">
          <AlertTriangle
            className="mt-0.5 h-5 w-5 shrink-0 text-warning-foreground/80"
            aria-hidden="true"
          />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold leading-snug text-warning-foreground">
              {t("title")}
            </p>
            <p className="mt-0.5 text-xs leading-relaxed text-warning-foreground/80">
              {message}
            </p>
          </div>
          <button
            className="shrink-0 rounded p-1 text-warning-foreground/55 hover:text-warning-foreground transition-colors"
            aria-label={t("dismiss")}
            onClick={() => setDismissed(true)}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <Button
          size="sm"
          variant="outline"
          className="w-full gap-2 border-warning/50 bg-background/55 text-warning-foreground hover:bg-warning/18 hover:text-warning-foreground transition-colors"
          onClick={onNotifyClick}
        >
          <Bell className="h-4 w-4" />
          {t("notifyCta")}
        </Button>
      </div>
    </>
  );
}
