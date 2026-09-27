"use client";

import { MessageCircle } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { cn } from "@/lib/utils";
import { activeStatusMessage, type StatusMessageValue } from "@/lib/status-message";

/**
 * Someone's status note ("Back Monday, ask Anna"), with when it ends. Renders
 * nothing once it has run out, so every place that shows a person can drop
 * it in without checking first.
 */
export function StatusMessage({
  status,
  className,
  compact = false,
}: {
  status: StatusMessageValue | null | undefined;
  className?: string;
  /** One truncated line, for cards and lists. */
  compact?: boolean;
}) {
  const t = useTranslations("Profile");
  const locale = useLocale();
  const active = activeStatusMessage(status);
  if (!active) return null;
  const until =
    active.until !== null
      ? new Date(active.until).toLocaleDateString(locale, {
          weekday: "short",
          day: "numeric",
          month: "short",
        })
      : null;
  return (
    <p
      className={cn(
        "flex items-start gap-1.5 text-sm text-foreground/80",
        compact && "items-center text-xs",
        className,
      )}
      title={compact ? active.text : undefined}
    >
      <MessageCircle
        className={cn("mt-0.5 size-3.5 shrink-0 text-muted-foreground", compact && "mt-0")}
      />
      <span className={cn("min-w-0", compact && "truncate")}>
        {active.text}
        {until && (
          <span className="text-muted-foreground"> · {t("statusUntil", { date: until })}</span>
        )}
      </span>
    </p>
  );
}
