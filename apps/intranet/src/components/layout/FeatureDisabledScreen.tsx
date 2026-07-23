"use client";

import { PowerOff } from "lucide-react";
import { useTranslations } from "next-intl";

import { StatusScreen } from "@/components/layout/StatusScreen";
import { Link } from "@/components/Link";
import { Button } from "@/components/ui/button";

/**
 * Shown in place of a route's content when an admin has disabled the feature
 * it belongs to (see `FeatureGate`). Distinct from `ForbiddenScreen`, which is
 * about the signed-in user's own access — this is the feature being off for
 * everyone, admins excepted so they can go flip it back.
 */
export function FeatureDisabledScreen({
  label,
  reason,
  fullScreen,
  className,
}: {
  label: string;
  /** The admin's disable reason (premade or custom) — always set once a flag has been toggled off. */
  reason?: string;
  fullScreen?: boolean;
  className?: string;
}) {
  const t = useTranslations("FeatureFlags");

  return (
    <StatusScreen
      fullScreen={fullScreen}
      className={className}
      icon={PowerOff}
      code={t("disabledScreen.code")}
      title={t("disabledScreen.title", { label })}
      description={t("disabledScreen.description")}
      action={
        <div className="flex flex-col items-center gap-3">
          {reason && (
            <p className="max-w-xs text-xs text-muted-foreground/80">
              {reason}
            </p>
          )}
          <Button asChild variant="outline">
            <Link href="/">{t("disabledScreen.backToDashboard")}</Link>
          </Button>
        </div>
      }
    />
  );
}
