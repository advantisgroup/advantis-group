"use client";

import { Hammer } from "lucide-react";
import { useTranslations } from "next-intl";

import { StatusScreen } from "@/components/layout/StatusScreen";
import { Link } from "@/components/Link";
import { Button } from "@/components/ui/button";

/**
 * Shown instead of a page that is temporarily locked for non-admins while IT
 * reviews it — see `lib/maintenance.ts`.
 */
export function MaintenanceScreen({ className }: { className?: string }) {
  const t = useTranslations("FeatureFlags");

  return (
    <StatusScreen
      className={className}
      icon={Hammer}
      code={t("maintenanceScreen.code")}
      title={t("maintenanceScreen.title")}
      description={t("maintenanceScreen.description")}
      action={
        <Button asChild variant="outline">
          <Link href="/">{t("maintenanceScreen.backToDashboard")}</Link>
        </Button>
      }
    />
  );
}
